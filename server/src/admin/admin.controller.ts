import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { OrderStatus, StreamStatus, User, UserRole } from '@prisma/client';
import { JwtAuthGuard, Roles, RolesGuard, assertBranchAccess, fail } from '../common/http';
import { PrismaService } from '../prisma/prisma.service';
import { LiveService } from '../live/live.service';

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: [OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  ACCEPTED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY],
  READY: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.COLLECTED],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.FAILED],
  DELIVERED: [],
  COLLECTED: [],
  CANCELLED: [],
  FAILED: [],
};

class TransitionDto {
  @ApiProperty({ enum: Object.values(OrderStatus) })
  @IsString()
  status!: OrderStatus;

  @ApiProperty({ description: 'Current order version. Stale versions are rejected.' })
  @IsInt()
  version!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

class VerifyDto {
  @ApiProperty({ example: 1025 })
  @IsInt()
  orderNumber!: number;

  @ApiProperty({ example: '4826' })
  @IsString()
  @MinLength(4)
  code!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;
}

class CompleteDto {
  @ApiProperty({ required: false, example: 'Handed to the customer' })
  @IsOptional()
  @IsString()
  proofNote?: string;

  @ApiProperty({ required: false, description: 'Cash collected, in poisha. Must match the order total to mark it paid.' })
  @IsOptional()
  @IsInt()
  cashCollectedPoisha?: number;
}

@ApiTags('Admin')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveService,
  ) {}

  @Post('admin/streams/:id/start')
  @Roles(UserRole.OWNER, UserRole.FACILITY_OPERATOR, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Mark a session live and notify opted-in customers once' })
  async start(@Param('id') id: string, @Req() req: { user: User }) {
    const session = await this.prisma.streamSession.findUnique({ where: { id } });
    if (!session) throw fail(404, 'Session not found.', 'SESSION_NOT_FOUND');
    assertBranchAccess(req.user, session.branchId);
    const now = new Date();
    const updated = await this.prisma.streamSession.update({
      where: { id },
      data: { status: StreamStatus.LIVE, startedAt: session.startedAt ?? now, heartbeatAt: now, endedAt: null },
      include: { batch: true },
    });
    await this.notifyLive(updated.id, updated.branchId, updated.titleEn);
    await this.audit(req.user.id, 'STREAM_START', updated.id);
    return this.live.present(updated, false);
  }

  @Post('admin/streams/:id/stop')
  @Roles(UserRole.OWNER, UserRole.FACILITY_OPERATOR, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'End a session. Live status is removed immediately.' })
  async stop(@Param('id') id: string, @Req() req: { user: User }) {
    const session = await this.prisma.streamSession.findUnique({ where: { id }, include: { batch: true } });
    if (!session) throw fail(404, 'Session not found.', 'SESSION_NOT_FOUND');
    assertBranchAccess(req.user, session.branchId);
    const updated = await this.prisma.streamSession.update({
      where: { id },
      data: { status: StreamStatus.ENDED, endedAt: new Date() },
      include: { batch: true },
    });
    await this.audit(req.user.id, 'STREAM_STOP', id);
    return this.live.present(updated, false);
  }

  @Post('admin/streams/:id/heartbeat')
  @Roles(UserRole.OWNER, UserRole.FACILITY_OPERATOR, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Operator heartbeat. Viewers see Reconnecting, then Offline, if this stops.' })
  async heartbeat(@Param('id') id: string, @Req() req: { user: User }) {
    const session = await this.prisma.streamSession.findUnique({ where: { id } });
    if (!session) throw fail(404, 'Session not found.', 'SESSION_NOT_FOUND');
    assertBranchAccess(req.user, session.branchId);
    const updated = await this.prisma.streamSession.update({
      where: { id },
      data: { heartbeatAt: new Date() },
      include: { batch: true },
    });
    return this.live.present(updated, false);
  }

  @Post('admin/orders/:id/transition')
  @Roles(UserRole.OWNER, UserRole.BRANCH_MANAGER, UserRole.PACKER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Move an order to an allowed next status' })
  async transition(@Param('id') id: string, @Body() body: TransitionDto, @Req() req: { user: User }) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
    assertBranchAccess(req.user, order.branchId);
    if (order.version !== body.version) throw fail(409, 'This order changed. Refresh and try again.', 'STALE_VERSION');
    if (!NEXT[order.status].includes(body.status)) {
      throw fail(409, `${order.status} cannot move to ${body.status}.`, 'FORBIDDEN_TRANSITION');
    }
    if (body.status === OrderStatus.OUT_FOR_DELIVERY && order.mode !== 'DELIVERY') {
      throw fail(409, 'Collection orders are not dispatched.', 'FORBIDDEN_TRANSITION');
    }
    if (body.status === OrderStatus.COLLECTED && order.mode !== 'COLLECTION') {
      throw fail(409, 'Use delivery completion for this order.', 'FORBIDDEN_TRANSITION');
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: body.status, version: { increment: 1 }, events: { create: { status: body.status, note: body.note } } },
    });
    await this.prisma.notificationEvent.create({
      data: {
        userId: order.userId,
        type: 'ORDER_UPDATE',
        titleEn: 'Order update',
        titleBn: 'অর্ডার আপডেট',
        bodyEn: `Order #${order.number} is now ${body.status.replaceAll('_', ' ').toLowerCase()}.`,
        bodyBn: `অর্ডার #${order.number} এখন ${body.status}.`,
        deepLink: `order:${order.id}`,
        orderId: order.id,
        dedupeKey: `order:${order.id}:${body.status}`,
      },
    }).catch(() => undefined);
    await this.audit(req.user.id, 'ORDER_TRANSITION', id);
    return updated;
  }

  @Post('collection/verify')
  @Roles(UserRole.OWNER, UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Check a collection code and complete pickup' })
  async verify(@Body() body: VerifyDto, @Req() req: { user: User }) {
    assertBranchAccess(req.user, body.branchId);
    const order = await this.prisma.order.findUnique({ where: { number: body.orderNumber } });
    if (!order) throw fail(404, 'Order not found.', 'ORDER_NOT_FOUND');
    if (order.branchId !== body.branchId) throw fail(403, 'This code belongs to another branch.', 'WRONG_BRANCH');
    if (order.status === OrderStatus.COLLECTED) throw fail(409, 'This order was already collected.', 'ALREADY_COLLECTED');
    if (order.mode !== 'COLLECTION' || order.status !== OrderStatus.READY) {
      throw fail(409, 'This order is not ready for collection.', 'NOT_READY');
    }
    if (order.collectionCode !== body.code) throw fail(400, 'That collection code is not correct.', 'CODE_INVALID');
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.COLLECTED,
        version: { increment: 1 },
        events: { create: { status: OrderStatus.COLLECTED, note: 'Collected at branch' } },
      },
    });
    await this.audit(req.user.id, 'COLLECTION_VERIFY', order.id);
    return { collected: true, orderId: updated.id, number: updated.number, status: updated.status };
  }

  @Get('driver/assignments')
  @Roles(UserRole.DRIVER, UserRole.OWNER)
  @ApiOperation({ summary: 'Deliveries assigned to the signed-in driver' })
  async assignments(@Req() req: { user: User }) {
    const rows = await this.prisma.driverAssignment.findMany({
      where: req.user.role === UserRole.OWNER ? {} : { driverId: req.user.id },
      include: { order: { include: { lines: true, branch: true, user: true } }, driver: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      orderId: row.orderId,
      number: row.order.number,
      slotLabel: row.order.slotLabel,
      paymentState: row.order.paymentState,
      totalPoisha: row.order.totalPoisha,
      address: row.order.addressSnapshot,
      customerPhone: row.order.user.phone,
      lines: row.order.lines.map((line) => ({ name: line.productName, grams: line.orderedGrams })),
    }));
  }

  @Post('driver/assignments/:id/complete')
  @Roles(UserRole.DRIVER, UserRole.OWNER)
  @ApiOperation({ summary: 'Complete an assigned delivery. Cash can be recorded but prices cannot change.' })
  async complete(@Param('id') id: string, @Body() body: CompleteDto, @Req() req: { user: User }) {
    const assignment = await this.prisma.driverAssignment.findUnique({ where: { id }, include: { order: true } });
    if (!assignment) throw fail(404, 'Assignment not found.', 'ASSIGNMENT_NOT_FOUND');
    if (req.user.role === UserRole.DRIVER && assignment.driverId !== req.user.id) {
      throw fail(403, 'This delivery is not assigned to you.', 'NOT_ASSIGNED');
    }
    if (assignment.order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw fail(409, 'This delivery is not out for delivery.', 'FORBIDDEN_TRANSITION');
    }
    if (
      body.cashCollectedPoisha !== undefined &&
      body.cashCollectedPoisha !== assignment.order.totalPoisha
    ) {
      await this.prisma.driverAssignment.update({
        where: { id },
        data: { proofNote: `Cash discrepancy ${body.cashCollectedPoisha}` },
      });
      throw fail(409, 'Collected cash does not match the order total.', 'CASH_MISMATCH');
    }
    await this.prisma.order.update({
      where: { id: assignment.orderId },
      data: {
        status: OrderStatus.DELIVERED,
        paymentState:
          assignment.order.paymentState === 'CASH_DUE' && body.cashCollectedPoisha === assignment.order.totalPoisha
            ? 'PAID'
            : assignment.order.paymentState,
        version: { increment: 1 },
        events: { create: { status: OrderStatus.DELIVERED, note: body.proofNote ?? 'Delivered' } },
      },
    });
    await this.prisma.driverAssignment.update({
      where: { id },
      data: { status: 'COMPLETED', proofNote: body.proofNote, completedAt: new Date() },
    });
    return { completed: true };
  }

  @Get('admin/reconciliation')
  @Roles(UserRole.OWNER, UserRole.FINANCE)
  @ApiOperation({ summary: 'Payment totals for reconciliation' })
  async reconciliation() {
    const payments = await this.prisma.paymentAttempt.groupBy({
      by: ['state', 'method'],
      _sum: { amountPoisha: true },
      _count: true,
    });
    const refunds = await this.prisma.refund.groupBy({
      by: ['status'],
      _sum: { amountPoisha: true },
      _count: true,
    });
    return { payments, refunds };
  }

  private async notifyLive(sessionId: string, branchId: string, title: string) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: UserRole.CUSTOMER,
        consent: { liveAlerts: true },
        OR: [{ preferredBranchId: branchId }, { preferredBranchId: null }],
      },
    });
    for (const user of users) {
      await this.prisma.notificationEvent.create({
        data: {
          userId: user.id,
          type: 'GO_LIVE',
          sessionId,
          titleEn: 'Manso is live now',
          titleBn: 'ম্যানসো এখন লাইভ',
          bodyEn: `${title}. Watch today’s preparation and order for delivery from 2 pm.`,
          bodyBn: `${title}. আজকের প্রস্তুতি দেখুন এবং দুপুর ২টা থেকে ডেলিভারির জন্য অর্ডার করুন।`,
          deepLink: `live:${sessionId}`,
          dedupeKey: `live:${sessionId}:GO_LIVE`,
        },
      }).catch(() => undefined);
    }
  }

  private audit(actorId: string, action: string, entityId: string) {
    return this.prisma.auditEvent.create({
      data: { actorId, action, entity: action, entityId },
    });
  }
}
