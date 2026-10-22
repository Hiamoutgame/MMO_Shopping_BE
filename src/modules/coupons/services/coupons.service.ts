import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CouponUsage } from '../entities/coupon-usage.entity';
import { CouponProduct } from '../entities/coupon-product.entity';
import { CouponSeason } from '../entities/coupon-season.entity';
import { CouponPackage } from '../entities/coupon-package.entity';
import { Voucher } from '../../commerce/entities/voucher.entity';
import { Account } from '../../identity/entities/account.entity';
import { Order } from '../../commerce/entities/order.entity';
import Decimal from 'decimal.js';

export interface ValidateCouponDto {
  code: string;
  accountId: string;
  roleCode: string;
  productIds?: string[];
  seasonId?: string;
  packageId?: string;
  orderTotal: string;
}

export interface RecordCouponUsageDto {
  voucherId: string;
  accountId: string;
  orderId: string;
  discountAmount: string;
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    @InjectRepository(CouponUsage)
    private usageRepo: Repository<CouponUsage>,
    @InjectRepository(CouponProduct)
    private couponProductRepo: Repository<CouponProduct>,
    @InjectRepository(CouponSeason)
    private couponSeasonRepo: Repository<CouponSeason>,
    @InjectRepository(CouponPackage)
    private couponPackageRepo: Repository<CouponPackage>,
    @InjectRepository(Voucher)
    private voucherRepo: Repository<Voucher>,
    @InjectRepository(Account)
    private accountRepo: Repository<Account>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private dataSource: DataSource,
  ) {}

  async validateCoupon(dto: ValidateCouponDto): Promise<{
    valid: boolean;
    voucher?: Voucher;
    reason?: string;
  }> {
    const voucher = await this.voucherRepo.findOne({
      where: { code: dto.code, isActive: true },
    });

    if (!voucher) {
      return { valid: false, reason: 'Coupon not found or inactive' };
    }

    if (
      voucher.applicableRoles?.length &&
      !voucher.applicableRoles.includes('USER')
    ) {
      return { valid: false, reason: 'Coupon is not available to customers' };
    }

    const now = new Date();

    if (voucher.startsAt && voucher.startsAt > now) {
      return { valid: false, reason: 'Coupon not yet valid' };
    }

    if (voucher.endsAt && voucher.endsAt < now) {
      return { valid: false, reason: 'Coupon has expired' };
    }

    if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
      return { valid: false, reason: 'Coupon usage limit reached' };
    }

    if (voucher.perAccountLimit) {
      const userUsageCount = await this.usageRepo.count({
        where: {
          voucherId: voucher.id,
          accountId: dto.accountId,
        },
      });

      if (userUsageCount >= voucher.perAccountLimit) {
        return {
          valid: false,
          reason: 'User usage limit reached for this coupon',
        };
      }
    }

    if (voucher.minimumOrderAmount) {
      const orderTotal = new Decimal(dto.orderTotal);
      const minPurchase = new Decimal(voucher.minimumOrderAmount);
      if (orderTotal.lessThan(minPurchase)) {
        return {
          valid: false,
          reason: `Minimum purchase amount of ${minPurchase.toString()} required`,
        };
      }
    }

    if (dto.productIds && dto.productIds.length > 0) {
      const couponProducts = await this.couponProductRepo.find({
        where: { voucherId: voucher.id },
      });

      if (couponProducts.length > 0) {
        const applicableProductIds = couponProducts.map((cp) => cp.productId);
        const hasApplicableProduct = dto.productIds.some((pid) =>
          applicableProductIds.includes(pid),
        );

        if (!hasApplicableProduct) {
          return {
            valid: false,
            reason: 'Coupon not applicable to any products in cart',
          };
        }
      }
    }

    if (dto.seasonId) {
      const couponSeasons = await this.couponSeasonRepo.find({
        where: { voucherId: voucher.id },
      });

      if (couponSeasons.length > 0) {
        const applicableSeasonIds = couponSeasons.map((cs) => cs.seasonId);
        if (!applicableSeasonIds.includes(dto.seasonId)) {
          return {
            valid: false,
            reason: 'Coupon not applicable to this season',
          };
        }
      }
    }

    if (dto.packageId) {
      const couponPackages = await this.couponPackageRepo.find({
        where: { voucherId: voucher.id },
      });

      if (couponPackages.length > 0) {
        const applicablePackageIds = couponPackages.map((cp) => cp.packageId);
        if (!applicablePackageIds.includes(dto.packageId)) {
          return {
            valid: false,
            reason: 'Coupon not applicable to this package',
          };
        }
      }
    }

    return { valid: true, voucher };
  }

  async recordUsage(dto: RecordCouponUsageDto): Promise<CouponUsage> {
    return this.dataSource.transaction(async (manager) => {
      const voucher = await manager.findOne(Voucher, {
        where: { id: dto.voucherId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!voucher) {
        throw new NotFoundException(
          `Voucher with ID "${dto.voucherId}" not found`,
        );
      }

      if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) {
        throw new BadRequestException('Voucher usage limit reached');
      }

      const account = await manager.findOne(Account, {
        where: { id: dto.accountId },
      });

      if (!account) {
        throw new NotFoundException(
          `Account with ID "${dto.accountId}" not found`,
        );
      }

      const order = await manager.findOne(Order, {
        where: { id: dto.orderId },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID "${dto.orderId}" not found`);
      }

      const usage = manager.create(CouponUsage, {
        voucherId: dto.voucherId,
        accountId: dto.accountId,
        orderId: dto.orderId,
        discountAmount: dto.discountAmount,
        usedAt: new Date(),
      });

      await manager.save(CouponUsage, usage);

      voucher.usedCount = (voucher.usedCount || 0) + 1;
      await manager.save(Voucher, voucher);

      this.logger.log(
        `Coupon ${voucher.code} used by account ${dto.accountId} for order ${dto.orderId}`,
      );

      return usage;
    });
  }

  async getUserUsageHistory(accountId: string): Promise<CouponUsage[]> {
    return this.usageRepo.find({
      where: { accountId },
      relations: { voucher: true, order: true },
      order: { usedAt: 'DESC' },
    });
  }

  async getCouponUsageHistory(voucherId: string): Promise<CouponUsage[]> {
    return this.usageRepo.find({
      where: { voucherId },
      relations: { account: true, order: true },
      order: { usedAt: 'DESC' },
    });
  }

  async getCouponStats(voucherId: string): Promise<{
    totalUsage: number;
    uniqueUsers: number;
    totalDiscount: string;
    averageDiscount: string;
  }> {
    const usages = await this.usageRepo.find({
      where: { voucherId },
    });

    const uniqueUserIds = new Set(usages.map((u) => u.accountId));
    const totalDiscount = usages.reduce(
      (sum, u) => sum.plus(new Decimal(u.discountAmount)),
      new Decimal(0),
    );

    const avgDiscount =
      usages.length > 0 ? totalDiscount.div(usages.length) : new Decimal(0);

    return {
      totalUsage: usages.length,
      uniqueUsers: uniqueUserIds.size,
      totalDiscount: totalDiscount.toFixed(4),
      averageDiscount: avgDiscount.toFixed(4),
    };
  }

  async linkProductsToCoupon(
    voucherId: string,
    productIds: string[],
  ): Promise<void> {
    const voucher = await this.voucherRepo.findOne({
      where: { id: voucherId },
    });

    if (!voucher) {
      throw new NotFoundException(`Voucher with ID "${voucherId}" not found`);
    }

    await this.couponProductRepo.delete({ voucherId });

    for (const productId of productIds) {
      const link = this.couponProductRepo.create({
        voucherId,
        productId,
      });
      await this.couponProductRepo.save(link);
    }
  }

  async linkSeasonsToCoupon(
    voucherId: string,
    seasonIds: string[],
  ): Promise<void> {
    const voucher = await this.voucherRepo.findOne({
      where: { id: voucherId },
    });

    if (!voucher) {
      throw new NotFoundException(`Voucher with ID "${voucherId}" not found`);
    }

    await this.couponSeasonRepo.delete({ voucherId });

    for (const seasonId of seasonIds) {
      const link = this.couponSeasonRepo.create({
        voucherId,
        seasonId,
      });
      await this.couponSeasonRepo.save(link);
    }
  }

  async linkPackagesToCoupon(
    voucherId: string,
    packageIds: string[],
  ): Promise<void> {
    const voucher = await this.voucherRepo.findOne({
      where: { id: voucherId },
    });

    if (!voucher) {
      throw new NotFoundException(`Voucher with ID "${voucherId}" not found`);
    }

    await this.couponPackageRepo.delete({ voucherId });

    for (const packageId of packageIds) {
      const link = this.couponPackageRepo.create({
        voucherId,
        packageId,
      });
      await this.couponPackageRepo.save(link);
    }
  }

  async getCouponProducts(voucherId: string): Promise<CouponProduct[]> {
    return this.couponProductRepo.find({
      where: { voucherId },
      relations: { product: true },
    });
  }

  async getCouponSeasons(voucherId: string): Promise<CouponSeason[]> {
    return this.couponSeasonRepo.find({
      where: { voucherId },
      relations: { season: true },
    });
  }

  async getCouponPackages(voucherId: string): Promise<CouponPackage[]> {
    return this.couponPackageRepo.find({
      where: { voucherId },
      relations: { package: true },
    });
  }
}
