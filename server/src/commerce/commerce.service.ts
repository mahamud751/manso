import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import {
  FulfilmentMode,
  HoldStatus,
  OrderStatus,
  PaymentMethod,
  PaymentState,
  Prisma,
  RefundStatus,
  ReleaseStatus,
  SupportTopic,
  User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { fail } from '../common/http';
import { lineTotalPoisha } from '../common/money';
import { addDays, dateOnly, dhakaDateString } from '../common/time';
import { parseClock, selectableSlots } from '../common/slots';

function serializationConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  const postgresCode = (error.meta as { code?: string } | undefined)?.code;
  return error.code === 'P2010' && postgresCode === '40001';
}

const ACTIVE_ORDER: OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  holdMinutes() {
    return Number(process.env.HOLD_MINUTES ?? 10);
  }

  async getBasket(user: User) {
    const basket = await this.ensureBasket(user.id);
    return this.presentBasket(basket.id);
  }

  async upsertItem(
    user: User,
    input: { branchId: string; productId: string; grams: number; optionId?: string; note?: string },
  ) {
    const branch = await this.catalog.requireBranch(input.branchId);
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, active: true },
      include: { options: true },
    });
    if (!product) throw fail(404, 'Product not found.', 'PRODUCT_NOT_FOUND');
    if (input.grams !== 0) this.assertGrams(product, input.grams);
    if (input.optionId && !product.options.some((option) => option.id === input.optionId)) {
      throw fail(400, 'That cutting option is not on this product.', 'OPTION_INVALID');
    }
    const basket = await this.ensureBasket(user.id, branch.id);
    if (basket.branchId && basket.branchId !== branch.id) {
      await this.prisma.basketItem.deleteMany({ where: { basketId: basket.id } });
      await this.prisma.basket.update({ where: { id: basket.id }, data: { branchId: branch.id } });
    } else if (!basket.branchId) {
      await this.prisma.basket.update({ where: { id: basket.id }, data: { branchId: branch.id } });
    }
    if (input.grams === 0) {
      await this.prisma.basketItem.deleteMany({ where: { basketId: basket.id, productId: product.id } });
    } else {
      await this.prisma.basketItem.upsert({
        where: { basketId_productId: { basketId: basket.id, productId: product.id } },
        update: {
          grams: input.grams,
          optionId: input.optionId ?? null,
          note: input.note?.trim().slice(0, 200) || null,
        },
        create: {
          basketId: basket.id,
          productId: product.id,
          grams: input.grams,
          optionId: input.optionId,
          note: input.note?.trim().slice(0, 200) || null,
        },
      });
    }
    return this.presentBasket(basket.id);
  }

  async clearBasket(user: User) {
    const basket = await this.ensureBasket(user.id);
    await this.prisma.basketItem.deleteMany({ where: { basketId: basket.id } });
    return this.presentBasket(basket.id);
  }

  async slots(branchId: string, modeRaw: string, date?: string) {
    const branch = await this.catalog.requireBranch(branchId);
    const mode = modeRaw === 'COLLECTION' ? FulfilmentMode.COLLECTION : FulfilmentMode.DELIVERY;
    const now = new Date();
    const today = dhakaDateString(now);
    const requested = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
    if (requested < today) throw fail(400, 'That date has passed.', 'DATE_PAST');
    const templates = await this.prisma.slotTemplate.findMany({
      where: { branchId, active: true, mode },
    });
    const deliveryStart = parseClock(branch.deliveryStartsAt);
    const booked = await this.bookedMap(branchId, [requested, addDays(requested, 1)]);
    let serviceDate = requested;
    let offered = selectableSlots({
      now,
      today,
      date: serviceDate,
      mode,
      deliveryStartMinutes: deliveryStart,
      templates,
      booked,
    });
    let movedToNextDay = false;
    if (!offered.length && serviceDate === today) {
      serviceDate = addDays(today, 1);
      movedToNextDay = true;
      offered = selectableSlots({
        now,
        today,
        date: serviceDate,
        mode,
        deliveryStartMinutes: deliveryStart,
        templates,
        booked,
      });
    }
    return {
      branchId,
      mode,
      timezone: 'Asia/Dhaka',
      serviceDate,
      movedToNextDay,
      deliveryStartsAt: branch.deliveryStartsAt,
      collectionOpensAt: branch.collectionOpensAt,
      minOrderPoisha: branch.minOrderPoisha,
      slots: offered.map((slot) => ({
        id: slot.id,
        label: slot.label,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        remaining: slot.remaining,
        mode: slot.mode,
        serviceDate: slot.serviceDate,
      })),
    };
  }

  async createQuote(
    user: User,
    input: { branchId: string; mode: 'DELIVERY' | 'COLLECTION'; slotTemplateId: string; serviceDate: string; addressId?: string },
  ) {
    const branch = await this.catalog.requireBranch(input.branchId);
    const mode = input.mode === 'COLLECTION' ? FulfilmentMode.COLLECTION : FulfilmentMode.DELIVERY;
    const today = dhakaDateString(new Date());
    if (input.serviceDate < today || input.serviceDate > addDays(today, 1)) {
      throw fail(400, 'Choose today or the next available day.', 'DATE_INVALID');
    }
    const offer = await this.slots(branch.id, mode, input.serviceDate);
    const slot = offer.slots.find((item) => item.id === input.slotTemplateId && item.serviceDate === input.serviceDate);
    if (!slot) throw fail(409, 'That slot is no longer available.', 'SLOT_UNAVAILABLE');

    let addressSnapshot: Prisma.InputJsonValue;
    let fee = 0;
    if (mode === FulfilmentMode.DELIVERY) {
      if (!input.addressId) throw fail(400, 'Choose a delivery address.', 'ADDRESS_REQUIRED');
      const address = await this.prisma.address.findFirst({ where: { id: input.addressId, userId: user.id } });
      if (!address) throw fail(404, 'Address not found.', 'ADDRESS_NOT_FOUND');
      const zone = await this.prisma.zone.findFirst({
        where: { branchId: branch.id, active: true, name: { equals: address.area, mode: 'insensitive' } },
      });
      if (!zone) throw fail(409, 'This address is outside the branch delivery area.', 'NO_COVERAGE');
      fee = zone.feePoisha;
      addressSnapshot = {
        id: address.id,
        label: address.label,
        line1: address.line1,
        line2: address.line2,
        area: address.area,
        city: address.city,
        postcode: address.postcode,
      };
    } else {
      fee = 0;
      addressSnapshot = {
        label: branch.name,
        line1: branch.addressLine,
        area: branch.area,
        city: branch.city,
        phone: branch.phone,
      };
    }

    const basket = await this.ensureBasket(user.id);
    const items = await this.prisma.basketItem.findMany({ where: { basketId: basket.id } });
    if (!items.length) throw fail(400, 'Your basket is empty.', 'BASKET_EMPTY');

    const expiresAt = new Date(Date.now() + this.holdMinutes() * 60 * 1000);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.releaseUserHolds(tx, user.id);
        const lines: Prisma.QuoteLineCreateManyQuoteInput[] = [];
        let subtotal = 0;
        for (const item of items) {
          const product = await tx.product.findFirst({
            where: { id: item.productId, active: true },
            include: { options: true },
          });
          if (!product) throw fail(409, 'A product in your basket is no longer sold.', 'PRODUCT_GONE');
          this.assertGrams(product, item.grams);
          const price = await this.catalog.currentPrice(product.id, branch.id);
          if (!price) throw fail(409, `${product.nameEn} has no current price.`, 'PRICE_MISSING');
          const stock = await tx.batchCutStock.findFirst({
            where: { productId: product.id, batch: { branchId: branch.id, releaseStatus: ReleaseStatus.RELEASED } },
            include: { batch: true },
            orderBy: { batch: { preparationDate: 'desc' } },
          });
          if (!stock) throw fail(409, `${product.nameEn} is not in a released batch.`, 'STOCK_MISSING');
          const reserved = await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE "BatchCutStock"
            SET "heldGrams" = "heldGrams" + ${item.grams}
            WHERE "id" = ${stock.id}
              AND ("saleableGrams" - "heldGrams" - "soldGrams") >= ${item.grams}
            RETURNING "id"
          `;
          if (!reserved.length) {
            throw fail(409, `Only a limited amount of ${product.nameEn} is left.`, 'STOCK_CONFLICT');
          }
          const lineTotal = lineTotalPoisha(item.grams, price.pricePerKgPoisha);
          subtotal += lineTotal;
          const option = product.options.find((entry) => entry.id === item.optionId);
          lines.push({
            productId: product.id,
            batchId: stock.batchId,
            stockId: stock.id,
            productName: product.nameEn,
            batchCode: stock.batch.code,
            imageUrl: product.imageUrl,
            grams: item.grams,
            unitPricePerKgPoisha: price.pricePerKgPoisha,
            lineTotalPoisha: lineTotal,
            optionName: option?.nameEn ?? null,
            note: item.note,
          });
        }
        if (subtotal < branch.minOrderPoisha) {
          throw fail(409, 'This order is below the branch minimum.', 'MIN_ORDER');
        }
        const occupied = await this.occupiedCount(tx, branch.id, slot.id, input.serviceDate);
        if (occupied >= (await tx.slotTemplate.findUniqueOrThrow({ where: { id: slot.id } })).capacity) {
          throw fail(409, 'That slot just filled up.', 'SLOT_FULL');
        }
        const quote = await tx.quote.create({
          data: {
            userId: user.id,
            branchId: branch.id,
            mode,
            addressSnapshot,
            slotTemplateId: slot.id,
            serviceDate: dateOnly(input.serviceDate),
            slotLabel: slot.label,
            subtotalPoisha: subtotal,
            feePoisha: fee,
            totalPoisha: subtotal + fee,
            expiresAt,
            lines: { create: lines },
            slotHold: {
              create: {
                branchId: branch.id,
                slotTemplateId: slot.id,
                serviceDate: dateOnly(input.serviceDate),
                status: HoldStatus.ACTIVE,
                expiresAt,
              },
            },
            holds: {
              create: lines.map((line) => ({
                userId: user.id,
                productId: line.productId,
                batchId: line.batchId,
                stockId: line.stockId,
                grams: line.grams,
                status: HoldStatus.ACTIVE,
                expiresAt,
              })),
            },
          },
          include: { lines: true },
        });
        return this.presentQuote(quote);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
    } catch (error) {
      if (serializationConflict(error)) {
        throw fail(409, 'Someone else is checking out this stock. Try again.', 'STOCK_CONFLICT');
      }
      throw error;
    }
  }

  async createOrder(
    user: User,
    input: { quoteId: string; method: 'BKASH' | 'CARD' | 'CASH'; termsAccepted: boolean },
    idempotencyKey?: string,
  ) {
    if (!input.termsAccepted) throw fail(400, 'Accept the terms to place the order.', 'TERMS_REQUIRED');
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_key_method_path: { userId: user.id, key: idempotencyKey, method: 'POST', path: '/v1/orders' } },
      });
      if (existing) return existing.body;
    }
    const method =
      input.method === 'CASH' ? PaymentMethod.CASH : input.method === 'CARD' ? PaymentMethod.CARD : PaymentMethod.BKASH;
    const result = await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id: input.quoteId, userId: user.id },
        include: { lines: true, holds: true, slotHold: true },
      });
      if (!quote) throw fail(404, 'Quote not found.', 'QUOTE_NOT_FOUND');
      if (quote.expiresAt.getTime() < Date.now()) throw fail(409, 'The price hold expired. Review the new total.', 'QUOTE_EXPIRED');
      if (quote.holds.some((hold) => hold.status !== HoldStatus.ACTIVE)) {
        throw fail(409, 'The stock hold is no longer active.', 'HOLD_INACTIVE');
      }
      const number = await this.nextNumber(tx);
      const cash = method === PaymentMethod.CASH;
      if (cash) {
        for (const hold of quote.holds) await this.convertHold(tx, hold.id, hold.stockId, hold.grams);
        if (quote.slotHold) {
          await tx.slotHold.update({ where: { id: quote.slotHold.id }, data: { status: HoldStatus.CONVERTED } });
        }
      }
      const order = await tx.order.create({
        data: {
          number,
          userId: user.id,
          branchId: quote.branchId,
          quoteId: quote.id,
          mode: quote.mode,
          status: OrderStatus.RECEIVED,
          paymentState: cash ? PaymentState.CASH_DUE : PaymentState.PENDING,
          paymentMethod: method,
          serviceDate: quote.serviceDate,
          slotTemplateId: quote.slotTemplateId,
          slotLabel: quote.slotLabel,
          addressSnapshot: quote.addressSnapshot ?? {},
          subtotalPoisha: quote.subtotalPoisha,
          feePoisha: quote.feePoisha,
          totalPoisha: quote.totalPoisha,
          collectionCode: quote.mode === FulfilmentMode.COLLECTION ? await this.collectionCode(tx) : null,
          lines: {
            create: quote.lines.map((line) => ({
              productId: line.productId,
              batchId: line.batchId,
              productName: line.productName,
              batchCode: line.batchCode,
              imageUrl: line.imageUrl,
              orderedGrams: line.grams,
              unitPricePerKgPoisha: line.unitPricePerKgPoisha,
              lineTotalPoisha: line.lineTotalPoisha,
              optionName: line.optionName,
              note: line.note,
            })),
          },
          payments: {
            create: {
              method,
              amountPoisha: quote.totalPoisha,
              state: cash ? PaymentState.CASH_DUE : PaymentState.PENDING,
            },
          },
          events: { create: { status: OrderStatus.RECEIVED, note: 'Order placed' } },
        },
      });
      const basket = await tx.basket.findUnique({ where: { userId: user.id } });
      if (basket) await tx.basketItem.deleteMany({ where: { basketId: basket.id } });
      await this.notify(tx, user.id, {
        type: 'ORDER_UPDATE',
        titleEn: 'Order received',
        titleBn: 'অর্ডার পেয়েছি',
        bodyEn: `Order #${order.number} is received. ${quote.slotLabel}.`,
        bodyBn: `অর্ডার #${order.number} গৃহীত হয়েছে। ${quote.slotLabel}।`,
        deepLink: `order:${order.id}`,
        dedupeKey: `order:${order.id}:RECEIVED`,
        orderId: order.id,
      });
      return this.presentOrder(await this.loadOrder(tx, order.id));
    });
    if (idempotencyKey) {
      await this.prisma.idempotencyRecord.create({
        data: {
          userId: user.id,
          key: idempotencyKey,
          method: 'POST',
          path: '/v1/orders',
          statusCode: 201,
          body: result as Prisma.InputJsonValue,
        },
      }).catch(() => undefined);
    }
    return result;
  }

  async getQuote(user: User, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId: user.id },
      include: { lines: true, order: { select: { id: true } } },
    });
    if (!quote) throw fail(404, 'Quote not found.', 'QUOTE_NOT_FOUND');
    if (quote.order) throw fail(409, 'This quote was already used.', 'QUOTE_USED');
    if (quote.expiresAt.getTime() <= Date.now()) {
      throw fail(409, 'This price hold has expired. Choose a time again.', 'QUOTE_EXPIRED');
    }
    return this.presentQuote(quote);
  }

  async listOrders(user: User, scope: 'active' | 'past' | 'all') {
    const orders = await this.prisma.order.findMany({
      where: {
        userId: user.id,
        ...(scope === 'active' ? { status: { in: ACTIVE_ORDER } } : {}),
        ...(scope === 'past'
          ? { status: { in: [OrderStatus.DELIVERED, OrderStatus.COLLECTED, OrderStatus.CANCELLED, OrderStatus.FAILED] } }
          : {}),
      },
      include: this.orderInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.presentOrder(order, false));
  }

  async getOrder(user: User, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId: user.id },
      include: this.orderInclude(),
    });
    if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
    return this.presentOrder(order, true);
  }

  async cancel(user: User, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id, userId: user.id },
        include: { lines: true, quote: { include: { holds: true } } },
      });
      if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.RECEIVED && order.status !== OrderStatus.ACCEPTED) {
        throw fail(409, 'This order can no longer be cancelled in the app.', 'FORBIDDEN_TRANSITION');
      }
      if (order.paymentState === PaymentState.PAID || order.paymentState === PaymentState.CASH_DUE) {
        for (const line of order.lines) {
          await tx.$executeRaw`
            UPDATE "BatchCutStock"
            SET "soldGrams" = "soldGrams" - ${line.orderedGrams}
            WHERE "batchId" = ${line.batchId} AND "productId" = ${line.productId} AND "soldGrams" >= ${line.orderedGrams}
          `;
        }
      } else if (order.quote) {
        for (const hold of order.quote.holds.filter((item) => item.status === HoldStatus.ACTIVE)) {
          await this.releaseHold(tx, hold.id, hold.stockId, hold.grams);
        }
      }
      if (order.paymentState === PaymentState.PAID) {
        await tx.refund.create({
          data: {
            orderId: order.id,
            amountPoisha: order.totalPoisha,
            reason: 'Cancelled by customer',
            status: RefundStatus.REQUESTED,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELLED, paymentState: PaymentState.PARTIALLY_REFUNDED, version: { increment: 1 } },
        });
      } else {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            paymentState: order.paymentState === PaymentState.CASH_DUE ? PaymentState.CANCELLED : order.paymentState,
            version: { increment: 1 },
          },
        });
      }
      await tx.fulfilmentEvent.create({
        data: { orderId: order.id, status: OrderStatus.CANCELLED, note: 'Cancelled by customer' },
      });
      return this.presentOrder(await this.loadOrder(tx, order.id), true);
    });
  }

  async reorder(user: User, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId: user.id },
      include: { lines: true },
    });
    if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
    const warnings: string[] = [];
    for (const line of order.lines) {
      const product = await this.catalog.getProduct(line.productId, order.branchId).catch(() => null);
      if (!product || !product.inStock || !product.pricePerKgPoisha) {
        warnings.push(`${line.productName} is not available today.`);
        continue;
      }
      const grams = Math.min(line.orderedGrams, product.availableGrams);
      const snapped = grams - (grams % product.incrementGrams);
      if (snapped < product.minGrams) {
        warnings.push(`${line.productName} does not have enough stock to reorder.`);
        continue;
      }
      await this.upsertItem(user, { branchId: order.branchId, productId: line.productId, grams: snapped });
    }
    return { basket: await this.getBasket(user), warnings };
  }

  async handleWebhook(raw: Buffer, signature: string | undefined) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const given = (signature ?? '').trim();
    const left = Buffer.from(expected);
    const right = Buffer.from(given);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw fail(401, 'Payment signature did not match.', 'SIGNATURE_INVALID');
    }
    const payload = JSON.parse(raw.toString('utf8')) as {
      merchant?: string;
      orderId?: string;
      transactionId?: string;
      amountPoisha?: number;
      currency?: string;
      status?: 'PAID' | 'FAILED' | 'CANCELLED';
    };
    if (payload.merchant !== (process.env.PAYMENT_MERCHANT ?? 'manso')) {
      throw fail(400, 'Merchant does not match.', 'MERCHANT_MISMATCH');
    }
    if (payload.currency !== 'BDT') throw fail(400, 'Currency must be BDT.', 'CURRENCY_MISMATCH');
    if (!payload.orderId || !payload.transactionId || !payload.status || !Number.isInteger(payload.amountPoisha)) {
      throw fail(400, 'Payment payload is incomplete.', 'PAYLOAD_INVALID');
    }
    const status = payload.status;
    const amountPoisha = payload.amountPoisha as number;
    const orderId = payload.orderId;
    const transactionId = payload.transactionId;

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.paymentAttempt.findUnique({ where: { transactionId } });
      if (duplicate) {
        return { duplicate: true, order: this.presentOrder(await this.loadOrder(tx, duplicate.orderId), true) };
      }
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { lines: true, quote: { include: { holds: true, slotHold: true } } },
      });
      if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
      if (amountPoisha !== order.totalPoisha) {
        throw fail(409, 'Amount does not match the frozen order total.', 'AMOUNT_MISMATCH');
      }
      if (order.paymentState === PaymentState.PAID || order.paymentState === PaymentState.REFUNDED) {
        if (status === 'PAID') {
          return { duplicate: true, order: this.presentOrder(await this.loadOrder(tx, order.id), true) };
        }
        throw fail(409, 'This order is already paid.', 'ALREADY_PAID');
      }
      if (status === 'PAID' && order.paymentState === PaymentState.CASH_DUE) {
        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            method: order.paymentMethod,
            amountPoisha,
            state: PaymentState.PAID,
            transactionId,
            providerRef: transactionId,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentState: PaymentState.PAID, version: { increment: 1 } },
        });
        return { duplicate: false, order: this.presentOrder(await this.loadOrder(tx, order.id), true) };
      }
      if (status === 'PAID') {
        const activeHolds = order.quote?.holds.filter((hold) => hold.status === HoldStatus.ACTIVE) ?? [];
        const holdsFresh = activeHolds.length === order.lines.length && activeHolds.every((hold) => hold.expiresAt.getTime() > Date.now());
        let committed = false;
        if (holdsFresh) {
          for (const hold of activeHolds) await this.convertHold(tx, hold.id, hold.stockId, hold.grams);
          committed = true;
        } else {
          committed = await this.revalidateAndTake(tx, order.lines);
        }
        if (order.quote?.slotHold && order.quote.slotHold.status === HoldStatus.ACTIVE) {
          await tx.slotHold.update({ where: { id: order.quote.slotHold.id }, data: { status: committed ? HoldStatus.CONVERTED : HoldStatus.RELEASED } });
        }
        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            method: order.paymentMethod,
            amountPoisha,
            state: PaymentState.PAID,
            transactionId,
            providerRef: transactionId,
          },
        });
        if (!committed) {
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CANCELLED, paymentState: PaymentState.PAID, version: { increment: 1 } },
          });
          await tx.refund.create({
            data: {
              orderId: order.id,
              amountPoisha,
              reason: 'Payment arrived after the stock hold expired',
              status: RefundStatus.UNDER_REVIEW,
            },
          });
          await tx.fulfilmentEvent.create({
            data: { orderId: order.id, status: OrderStatus.CANCELLED, note: 'Paid after hold expiry. Refund under review.' },
          });
        } else {
          await tx.order.update({
            where: { id: order.id },
            data: { paymentState: PaymentState.PAID, version: { increment: 1 } },
          });
          await tx.fulfilmentEvent.create({
            data: { orderId: order.id, status: order.status, note: 'Payment confirmed' },
          });
        }
      } else {
        if (order.quote) {
          for (const hold of order.quote.holds.filter((item) => item.status === HoldStatus.ACTIVE)) {
            await this.releaseHold(tx, hold.id, hold.stockId, hold.grams);
          }
          if (order.quote.slotHold?.status === HoldStatus.ACTIVE) {
            await tx.slotHold.update({ where: { id: order.quote.slotHold.id }, data: { status: HoldStatus.RELEASED } });
          }
        }
        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            method: order.paymentMethod,
            amountPoisha,
            state: status === 'CANCELLED' ? PaymentState.CANCELLED : PaymentState.FAILED,
            transactionId,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentState: status === 'CANCELLED' ? PaymentState.CANCELLED : PaymentState.FAILED,
            status: OrderStatus.CANCELLED,
            version: { increment: 1 },
          },
        });
        await tx.fulfilmentEvent.create({
          data: { orderId: order.id, status: OrderStatus.CANCELLED, note: `Payment ${status.toLowerCase()}` },
        });
      }
      await this.notify(tx, order.userId, {
        type: 'ORDER_UPDATE',
        titleEn: status === 'PAID' ? 'Payment update' : 'Payment was not completed',
        titleBn: status === 'PAID' ? 'পেমেন্ট আপডেট' : 'পেমেন্ট সম্পন্ন হয়নি',
        bodyEn: `Order #${order.number} payment is ${status.toLowerCase()}.`,
        bodyBn: `অর্ডার #${order.number} এর পেমেন্ট ${status === 'PAID' ? 'সম্পন্ন' : 'অসম্পূর্ণ'}।`,
        deepLink: `order:${order.id}`,
        dedupeKey: `pay:${transactionId}`,
        orderId: order.id,
      });
      return { duplicate: false, order: this.presentOrder(await this.loadOrder(tx, order.id), true) };
    });
  }

  async sandboxComplete(user: User, orderId: string, outcome: 'PAID' | 'FAILED') {
    if (process.env.PAYMENT_SANDBOX !== 'true') {
      throw fail(404, 'Sandbox payments are disabled.', 'SANDBOX_DISABLED');
    }
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId: user.id } });
    if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
    if (order.paymentMethod === PaymentMethod.CASH) {
      throw fail(409, 'Cash orders are confirmed by the branch, not the card sandbox.', 'CASH_ORDER');
    }
    const attempts = await this.prisma.paymentAttempt.count({ where: { orderId: order.id, transactionId: { not: null } } });
    const body = {
      merchant: process.env.PAYMENT_MERCHANT ?? 'manso',
      orderId: order.id,
      transactionId: `sandbox_${order.id}_${outcome}_${attempts + 1}`,
      amountPoisha: order.totalPoisha,
      currency: 'BDT',
      status: outcome,
    };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET ?? '').update(raw).digest('hex');
    return this.handleWebhook(raw, signature);
  }

  async openSupport(user: User, input: { orderId?: string; topic: SupportTopic; message: string; amountPoisha?: number }) {
    const text = input.message.trim();
    if (text.length < 3) throw fail(400, 'Tell us a little more.', 'MESSAGE_REQUIRED');
    let order = null;
    if (input.orderId) {
      order = await this.prisma.order.findFirst({ where: { id: input.orderId, userId: user.id } });
      if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
    }
    return this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.supportCase.create({
        data: {
          userId: user.id,
          orderId: order?.id,
          topic: input.topic,
          message: text.slice(0, 1000),
          messages: { create: { body: text.slice(0, 1000), fromStaff: false } },
        },
      });
      let refund = null;
      if (input.topic === SupportTopic.REFUND) {
        if (!order) throw fail(400, 'Choose an order to request a refund.', 'ORDER_REQUIRED');
        if (order.paymentState !== PaymentState.PAID && order.paymentState !== PaymentState.PARTIALLY_REFUNDED) {
          throw fail(409, 'Only a paid order can be refunded.', 'NOT_PAID');
        }
        const amount = input.amountPoisha ?? order.totalPoisha;
        if (!Number.isInteger(amount) || amount <= 0 || amount > order.totalPoisha) {
          throw fail(400, 'Refund amount is not valid for this order.', 'REFUND_AMOUNT');
        }
        refund = await tx.refund.create({
          data: {
            orderId: order.id,
            amountPoisha: amount,
            reason: text.slice(0, 300),
            status: RefundStatus.UNDER_REVIEW,
            supportCaseId: supportCase.id,
          },
        });
        await tx.supportCase.update({ where: { id: supportCase.id }, data: { status: 'REVIEWING' } });
      }
      return {
        id: supportCase.id,
        topic: supportCase.topic,
        status: input.topic === SupportTopic.REFUND ? 'REVIEWING' : supportCase.status,
        message: supportCase.message,
        refund: refund
          ? { id: refund.id, amountPoisha: refund.amountPoisha, status: refund.status, createdAt: refund.createdAt }
          : null,
      };
    });
  }

  async expireHolds() {
    const now = new Date();
    const holds = await this.prisma.stockHold.findMany({
      where: { status: HoldStatus.ACTIVE, expiresAt: { lt: now } },
      take: 40,
    });
    for (const hold of holds) {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.stockHold.findUnique({ where: { id: hold.id } });
        if (!current || current.status !== HoldStatus.ACTIVE) return;
        await this.releaseHold(tx, current.id, current.stockId, current.grams);
        await tx.slotHold.updateMany({
          where: { quoteId: current.quoteId, status: HoldStatus.ACTIVE },
          data: { status: HoldStatus.EXPIRED },
        });
      });
    }
    if (holds.length) this.logger.log(`Expired ${holds.length} stock holds`);
  }

  private async presentBasket(basketId: string) {
    const basket = await this.prisma.basket.findUniqueOrThrow({
      where: { id: basketId },
      include: { items: true },
    });
    const items = [];
    let subtotal = 0;
    for (const item of basket.items) {
      const product = basket.branchId
        ? await this.catalog.getProduct(item.productId, basket.branchId).catch(() => null)
        : null;
      const option = product?.options.find((entry) => entry.id === item.optionId);
      const line = product?.pricePerKgPoisha ? lineTotalPoisha(item.grams, product.pricePerKgPoisha) : 0;
      if (product?.inStock) subtotal += line;
      items.push({
        productId: item.productId,
        grams: item.grams,
        optionId: item.optionId,
        optionName: option?.name ?? null,
        note: item.note,
        lineTotalPoisha: line,
        available: !!product?.inStock && item.grams <= (product?.availableGrams ?? 0),
        product,
      });
    }
    return { id: basket.id, branchId: basket.branchId, items, estimatedSubtotalPoisha: subtotal };
  }

  private presentQuote(quote: {
    id: string;
    mode: FulfilmentMode;
    serviceDate: Date;
    slotLabel: string;
    subtotalPoisha: number;
    feePoisha: number;
    totalPoisha: number;
    currency: string;
    expiresAt: Date;
    addressSnapshot: Prisma.JsonValue;
    lines: Array<{
      productId: string;
      productName: string;
      batchCode: string;
      imageUrl: string;
      grams: number;
      unitPricePerKgPoisha: number;
      lineTotalPoisha: number;
      optionName: string | null;
      note: string | null;
    }>;
  }) {
    return {
      id: quote.id,
      mode: quote.mode,
      serviceDate: quote.serviceDate.toISOString().slice(0, 10),
      slotLabel: quote.slotLabel,
      subtotalPoisha: quote.subtotalPoisha,
      feePoisha: quote.feePoisha,
      totalPoisha: quote.totalPoisha,
      currency: quote.currency,
      expiresAt: quote.expiresAt,
      holdMinutes: this.holdMinutes(),
      address: quote.addressSnapshot,
      lines: quote.lines.map((line) => ({
        ...line,
        imageUrl: this.catalog.media(line.imageUrl),
      })),
    };
  }

  presentOrder(
    order: {
      id: string;
      number: number;
      branchId: string;
      mode: FulfilmentMode;
      status: OrderStatus;
      paymentState: PaymentState;
      paymentMethod: PaymentMethod;
      serviceDate: Date;
      slotLabel: string;
      addressSnapshot: Prisma.JsonValue;
      subtotalPoisha: number;
      feePoisha: number;
      totalPoisha: number;
      currency: string;
      collectionCode: string | null;
      version: number;
      createdAt: Date;
      branch?: { name: string; area: string; addressLine: string; phone: string; lat: number; lng: number };
      lines: Array<{
        productId: string;
        productName: string;
        batchCode: string;
        imageUrl: string;
        orderedGrams: number;
        unitPricePerKgPoisha: number;
        lineTotalPoisha: number;
        optionName: string | null;
        note: string | null;
      }>;
      events?: Array<{ status: OrderStatus; note: string | null; createdAt: Date }>;
      payments?: Array<{ id: string; method: PaymentMethod; amountPoisha: number; state: PaymentState; transactionId: string | null; createdAt: Date }>;
      refunds?: Array<{ id: string; amountPoisha: number; reason: string; status: RefundStatus; createdAt: Date }>;
      assignment?: { id: string; driverId: string; status: string; driver?: { name: string; phone: string | null } } | null;
    },
    detail = true,
  ) {
    return {
      id: order.id,
      number: order.number,
      branchId: order.branchId,
      branch: order.branch
        ? {
            name: order.branch.name,
            area: order.branch.area,
            addressLine: order.branch.addressLine,
            phone: order.branch.phone,
            lat: order.branch.lat,
            lng: order.branch.lng,
          }
        : undefined,
      mode: order.mode,
      status: order.status,
      paymentState: order.paymentState,
      paymentMethod: order.paymentMethod,
      serviceDate: order.serviceDate.toISOString().slice(0, 10),
      slotLabel: order.slotLabel,
      address: order.addressSnapshot,
      subtotalPoisha: order.subtotalPoisha,
      feePoisha: order.feePoisha,
      totalPoisha: order.totalPoisha,
      currency: order.currency,
      collectionCode: detail && order.mode === FulfilmentMode.COLLECTION ? order.collectionCode : undefined,
      version: order.version,
      createdAt: order.createdAt,
      lines: order.lines.map((line) => ({ ...line, imageUrl: this.catalog.media(line.imageUrl) })),
      events: order.events ?? [],
      payments: detail ? order.payments ?? [] : undefined,
      refunds: detail ? order.refunds ?? [] : undefined,
      driver: detail && order.assignment
        ? { assignmentId: order.assignment.id, name: order.assignment.driver?.name, phone: order.assignment.driver?.phone, status: order.assignment.status }
        : undefined,
    };
  }

  private orderInclude() {
    return {
      lines: true,
      events: { orderBy: { createdAt: 'asc' as const } },
      payments: { orderBy: { createdAt: 'asc' as const } },
      refunds: { orderBy: { createdAt: 'asc' as const } },
      branch: true,
      assignment: { include: { driver: true } },
    };
  }

  private async loadOrder(tx: Prisma.TransactionClient, id: string) {
    return tx.order.findUniqueOrThrow({ where: { id }, include: this.orderInclude() });
  }

  private async ensureBasket(userId: string, branchId?: string) {
    return this.prisma.basket.upsert({
      where: { userId },
      update: {},
      create: { userId, branchId },
    });
  }

  private assertGrams(product: { nameEn: string; minGrams: number; maxGrams: number; incrementGrams: number }, grams: number) {
    if (grams < product.minGrams || grams > product.maxGrams || grams % product.incrementGrams !== 0) {
      throw fail(400, `${product.nameEn} is sold in ${product.incrementGrams} g steps.`, 'QUANTITY_INVALID');
    }
  }

  private async bookedMap(branchId: string, dates: string[]) {
    const map: Record<string, number> = {};
    for (const date of dates) {
      const orders = await this.prisma.order.groupBy({
        by: ['slotTemplateId'],
        where: {
          branchId,
          serviceDate: dateOnly(date),
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.FAILED] },
        },
        _count: true,
      });
      for (const row of orders) map[`${row.slotTemplateId}|${date}`] = row._count;
      const holds = await this.prisma.slotHold.groupBy({
        by: ['slotTemplateId'],
        where: { branchId, serviceDate: dateOnly(date), status: HoldStatus.ACTIVE, expiresAt: { gt: new Date() } },
        _count: true,
      });
      for (const row of holds) {
        const key = `${row.slotTemplateId}|${date}`;
        map[key] = (map[key] ?? 0) + row._count;
      }
    }
    return map;
  }

  private async occupiedCount(tx: Prisma.TransactionClient, branchId: string, slotTemplateId: string, serviceDate: string) {
    const orders = await tx.order.count({
      where: {
        branchId,
        slotTemplateId,
        serviceDate: dateOnly(serviceDate),
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.FAILED] },
      },
    });
    const holds = await tx.slotHold.count({
      where: {
        branchId,
        slotTemplateId,
        serviceDate: dateOnly(serviceDate),
        status: HoldStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    });
    return orders + holds;
  }

  private async releaseUserHolds(tx: Prisma.TransactionClient, userId: string) {
    const holds = await tx.stockHold.findMany({ where: { userId, status: HoldStatus.ACTIVE } });
    for (const hold of holds) await this.releaseHold(tx, hold.id, hold.stockId, hold.grams);
    const quoteIds = [...new Set(holds.map((hold) => hold.quoteId))];
    if (quoteIds.length) {
      await tx.slotHold.updateMany({
        where: { quoteId: { in: quoteIds }, status: HoldStatus.ACTIVE },
        data: { status: HoldStatus.RELEASED },
      });
    }
  }

  private async releaseHold(tx: Prisma.TransactionClient, holdId: string, stockId: string, grams: number) {
    await tx.$executeRaw`
      UPDATE "BatchCutStock"
      SET "heldGrams" = "heldGrams" - ${grams}
      WHERE "id" = ${stockId} AND "heldGrams" >= ${grams}
    `;
    await tx.stockHold.update({ where: { id: holdId }, data: { status: HoldStatus.RELEASED } });
  }

  private async convertHold(tx: Prisma.TransactionClient, holdId: string, stockId: string, grams: number) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "BatchCutStock"
      SET "soldGrams" = "soldGrams" + ${grams},
          "heldGrams" = "heldGrams" - ${grams}
      WHERE "id" = ${stockId} AND "heldGrams" >= ${grams}
      RETURNING "id"
    `;
    if (!rows.length) throw fail(409, 'Stock hold could not be confirmed.', 'STOCK_CONFLICT');
    await tx.stockHold.update({ where: { id: holdId }, data: { status: HoldStatus.CONVERTED } });
  }

  private async revalidateAndTake(
    tx: Prisma.TransactionClient,
    lines: Array<{ productId: string; batchId: string; orderedGrams: number }>,
  ) {
    for (const line of lines) {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "BatchCutStock"
        SET "soldGrams" = "soldGrams" + ${line.orderedGrams}
        WHERE "batchId" = ${line.batchId}
          AND "productId" = ${line.productId}
          AND ("saleableGrams" - "heldGrams" - "soldGrams") >= ${line.orderedGrams}
        RETURNING "id"
      `;
      if (!rows.length) return false;
    }
    return true;
  }

  private async nextNumber(tx: Prisma.TransactionClient) {
    const counter = await tx.counter.update({
      where: { id: 'order_number' },
      data: { value: { increment: 1 } },
    });
    return counter.value;
  }

  private async collectionCode(tx: Prisma.TransactionClient) {
    for (let i = 0; i < 8; i += 1) {
      const code = randomInt(0, 10000).toString().padStart(4, '0');
      const clash = await tx.order.findFirst({
        where: { collectionCode: code, status: { in: [OrderStatus.RECEIVED, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY] } },
      });
      if (!clash) return code;
    }
    throw fail(500, 'Could not allocate a collection code.', 'CODE_EXHAUSTED');
  }

  private async notify(
    tx: Prisma.TransactionClient,
    userId: string,
    input: {
      type: string;
      titleEn: string;
      titleBn: string;
      bodyEn: string;
      bodyBn: string;
      deepLink: string;
      dedupeKey: string;
      orderId?: string;
      sessionId?: string;
    },
  ) {
    const consent = await tx.consent.findUnique({ where: { userId } });
    if (input.type === 'ORDER_UPDATE' && consent && !consent.orderUpdates) return;
    if (input.type === 'GO_LIVE' && !consent?.liveAlerts) return;
    const existing = await tx.notificationEvent.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: input.dedupeKey } },
    });
    if (!existing) await tx.notificationEvent.create({ data: { userId, ...input } });
  }
}
