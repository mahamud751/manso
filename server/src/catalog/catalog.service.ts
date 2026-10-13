import { Injectable } from '@nestjs/common';
import { BatchCutStock, Branch, PriceVersion, Product, ProductOption, ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fail } from '../common/http';

type ProductWithOptions = Product & { options: ProductOption[] };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  media(path: string | null | undefined) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const base = (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  async listBranches(q?: string) {
    const branches = await this.prisma.branch.findMany({
      where: {
        active: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { area: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { addressLine: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { zones: { where: { active: true } } },
      orderBy: { name: 'asc' },
    });
    return branches.map((branch) => this.presentBranch(branch));
  }

  async getBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, active: true },
      include: { zones: { where: { active: true } } },
    });
    if (!branch) throw fail(404, 'Branch not found.', 'BRANCH_NOT_FOUND');
    return this.presentBranch(branch);
  }

  presentBranch(branch: Branch & { zones?: { id: string; name: string; feePoisha: number }[] }) {
    return {
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      area: branch.area,
      addressLine: branch.addressLine,
      city: branch.city,
      phone: branch.phone,
      lat: branch.lat,
      lng: branch.lng,
      opensAt: branch.opensAt,
      closesAt: branch.closesAt,
      collectionOpensAt: branch.collectionOpensAt,
      deliveryStartsAt: branch.deliveryStartsAt,
      deliveryFeePoisha: branch.deliveryFeePoisha,
      minOrderPoisha: branch.minOrderPoisha,
      timezone: branch.timezone,
      imageUrl: this.media(branch.imageUrl),
      zones: (branch.zones ?? []).map((zone) => ({
        id: zone.id,
        name: zone.name,
        feePoisha: zone.feePoisha,
      })),
    };
  }

  async serviceability(area: string, branchId?: string) {
    const needle = area.trim();
    if (!needle) throw fail(400, 'Enter an area to check.', 'AREA_REQUIRED');
    const zones = await this.prisma.zone.findMany({
      where: {
        active: true,
        name: { contains: needle, mode: 'insensitive' },
        ...(branchId ? { branchId } : {}),
        branch: { active: true },
      },
      include: { branch: { include: { zones: { where: { active: true } } } } },
    });
    if (!zones.length) {
      return { serviceable: false, reason: 'NO_COVERAGE', matches: [] as unknown[] };
    }
    return {
      serviceable: true,
      reason: 'COVERED',
      matches: zones.map((zone) => ({
        zone: zone.name,
        feePoisha: zone.feePoisha,
        branch: this.presentBranch(zone.branch),
      })),
    };
  }

  async listProducts(branchId: string, q?: string, kind?: string) {
    await this.requireBranch(branchId);
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        ...(kind && kind !== 'ALL' ? { kind: kind as Product['kind'] } : {}),
        ...(q
          ? {
              OR: [
                { nameEn: { contains: q, mode: 'insensitive' } },
                { nameBn: { contains: q } },
                { descriptionEn: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { options: { orderBy: { sort: 'asc' } } },
      orderBy: { sort: 'asc' },
    });
    return Promise.all(products.map((product) => this.presentProduct(product, branchId)));
  }

  async getProduct(id: string, branchId: string) {
    await this.requireBranch(branchId);
    const product = await this.prisma.product.findFirst({
      where: { id, active: true },
      include: { options: { orderBy: { sort: 'asc' } } },
    });
    if (!product) throw fail(404, 'Product not found.', 'PRODUCT_NOT_FOUND');
    return this.presentProduct(product, branchId);
  }

  async presentProduct(product: ProductWithOptions, branchId: string) {
    const now = new Date();
    const [price, stock] = await Promise.all([
      this.currentPrice(product.id, branchId, now),
      this.currentStock(product.id, branchId),
    ]);
    const availableGrams = stock
      ? Math.max(0, stock.saleableGrams - stock.heldGrams - stock.soldGrams)
      : 0;
    return {
      id: product.id,
      slug: product.slug,
      kind: product.kind,
      name: { en: product.nameEn, bn: product.nameBn },
      description: { en: product.descriptionEn, bn: product.descriptionBn },
      boneContent: product.boneContent,
      imageUrl: this.media(product.imageUrl),
      pricePerKgPoisha: price?.pricePerKgPoisha ?? null,
      incrementGrams: product.incrementGrams,
      minGrams: product.minGrams,
      maxGrams: product.maxGrams,
      availableGrams,
      inStock: availableGrams >= product.minGrams && !!price,
      batch: stock
        ? {
            id: stock.batch.id,
            code: stock.batch.code,
            preparationDate: stock.batch.preparationDate.toISOString().slice(0, 10),
            releaseStatus: stock.batch.releaseStatus,
          }
        : null,
      options: product.options.map((option) => ({
        id: option.id,
        name: { en: option.nameEn, bn: option.nameBn },
      })),
    };
  }

  async currentPrice(productId: string, branchId: string, now = new Date()): Promise<PriceVersion | null> {
    const prices = await this.prisma.priceVersion.findMany({
      where: {
        productId,
        effectiveFrom: { lte: now },
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          { OR: [{ branchId }, { branchId: null }] },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return prices.find((price) => price.branchId === branchId) ?? prices.find((price) => !price.branchId) ?? null;
  }

  async currentStock(productId: string, branchId: string) {
    const stocks = await this.prisma.batchCutStock.findMany({
      where: {
        productId,
        batch: { branchId, releaseStatus: ReleaseStatus.RELEASED },
      },
      include: { batch: true },
      orderBy: { batch: { preparationDate: 'desc' } },
    });
    const open = stocks.find((stock) => stock.saleableGrams - stock.heldGrams - stock.soldGrams > 0);
    return open ?? stocks[0] ?? null;
  }

  async requireBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, active: true } });
    if (!branch) throw fail(404, 'Branch not found.', 'BRANCH_NOT_FOUND');
    return branch;
  }

  stockAvailable(stock: Pick<BatchCutStock, 'saleableGrams' | 'heldGrams' | 'soldGrams'>) {
    return stock.saleableGrams - stock.heldGrams - stock.soldGrams;
  }

  async getPolicy(slug: string) {
    const page = await this.prisma.policyPage.findUnique({ where: { slug } });
    if (!page) throw fail(404, 'Page not found.', 'POLICY_NOT_FOUND');
    return {
      slug: page.slug,
      title: { en: page.titleEn, bn: page.titleBn },
      body: { en: page.bodyEn, bn: page.bodyBn },
    };
  }
}
