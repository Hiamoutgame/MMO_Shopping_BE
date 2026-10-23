import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { PriceTier } from '../entities/price-tier.entity';
import { PriceRule } from '../entities/price-rule.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Account } from '../../identity/entities/account.entity';
import { Voucher } from '../../commerce/entities/voucher.entity';
import { Package } from '../../packages/entities/package.entity';
import { PriceRuleType } from '../enums/price-rule-type.enum';
import { DiscountType } from '../../commerce/enums/discount-type.enum';

export interface CalculatePriceParams {
  productId: string;
  accountId: string;
  quantity: number;
  seasonId?: string;
  packageId?: string;
  couponCode?: string;
}

export interface PriceBreakdownItem {
  step: string;
  description: string;
  type: 'base' | 'discount' | 'floor';
  amount: string;
  discountAmount?: string;
  discountPercentage?: string;
}

export interface PriceCalculationResult {
  basePrice: string;
  finalPrice: string;
  totalDiscount: string;
  discountPercentage: string;
  breakdown: PriceBreakdownItem[];
  priceFloor?: string;
  floorEnforced: boolean;
}

@Injectable()
export class PriceEngineService {
  private readonly logger = new Logger(PriceEngineService.name);

  constructor(
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Account)
    private accountRepo: Repository<Account>,
    @InjectRepository(PriceTier)
    private priceTierRepo: Repository<PriceTier>,
    @InjectRepository(PriceRule)
    private priceRuleRepo: Repository<PriceRule>,
    @InjectRepository(Package)
    private packageRepo: Repository<Package>,
    @InjectRepository(Voucher)
    private voucherRepo: Repository<Voucher>,
  ) {}

  /**
   * CORE PRICING ENGINE
   *
   * Pipeline:
   * 1. Base Price (from Product or Package)
   * 2. Customer Pricing (USER policy for all purchasing accounts)
   * 3. Quantity Tier Discount
   * 4. Seasonal Pricing
   * 5. Package Discount
   * 7. Coupon Discount
   * 8. Price Floor Enforcement
   *
   * CRITICAL: Discounts are applied SEQUENTIALLY, not additively
   */
  async calculatePrice(
    params: CalculatePriceParams,
  ): Promise<PriceCalculationResult> {
    this.logger.log(`Calculating price for params: ${JSON.stringify(params)}`);

    const breakdown: PriceBreakdownItem[] = [];

    // Step 1: Get Product and validate
    const product = await this.productRepo.findOne({
      where: { id: params.productId },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    // Step 2: Get Account and Role
    const account = await this.accountRepo.findOne({
      where: { id: params.accountId },
      relations: { role: true },
    });

    if (!account || !account.role) {
      throw new Error('Account or role not found');
    }

    // Administrative permission does not grant a separate customer price.
    const roleCode = 'USER';

    // Step 3: Determine Base Price
    let currentPrice = new Decimal(product.basePrice || 0);

    breakdown.push({
      step: '1. Base Price',
      description: 'Product base price',
      type: 'base',
      amount: currentPrice.toFixed(4),
    });

    // Step 4: Apply Role-Based Pricing (if exists)
    const rolePriceTier = await this.findApplicablePriceTier(
      params.productId,
      roleCode,
      params.quantity,
      params.seasonId,
    );

    if (rolePriceTier) {
      const tierPrice = new Decimal(rolePriceTier.unitPrice);
      const discount = currentPrice.minus(tierPrice);
      const discountPct = discount.div(currentPrice).times(100);

      breakdown.push({
        step: `2. ${roleCode} Price`,
        description: `Role-based pricing for ${roleCode}`,
        type: 'discount',
        amount: tierPrice.toFixed(4),
        discountAmount: discount.toFixed(4),
        discountPercentage: discountPct.toFixed(2),
      });

      currentPrice = tierPrice;
    }

    // Step 5: Apply Quantity Tier Discount
    const quantityTier = await this.findQuantityTier(
      params.productId,
      params.quantity,
      roleCode,
      params.seasonId,
    );

    if (quantityTier) {
      const tierPrice = new Decimal(quantityTier.unitPrice);
      if (tierPrice.lessThan(currentPrice)) {
        const discount = currentPrice.minus(tierPrice);
        const discountPct = discount.div(currentPrice).times(100);

        breakdown.push({
          step: '3. Quantity Discount',
          description: `Quantity tier: ${params.quantity} units`,
          type: 'discount',
          amount: tierPrice.toFixed(4),
          discountAmount: discount.toFixed(4),
          discountPercentage: discountPct.toFixed(2),
        });

        currentPrice = tierPrice;
      }
    }

    // Step 6: Apply Seasonal Pricing
    if (params.seasonId) {
      const seasonalRules = await this.findApplicableRules(
        PriceRuleType.SEASONAL,
        params.productId,
        roleCode,
        params.seasonId,
      );

      for (const rule of seasonalRules) {
        currentPrice = this.applyRule(
          rule,
          currentPrice,
          breakdown,
          '4. Seasonal Discount',
        );
      }
    }

    // Step 7: Apply Package Discount
    if (params.packageId) {
      const pkg = await this.packageRepo.findOne({
        where: { id: params.packageId },
      });

      if (pkg && pkg.applicableRoles.includes(roleCode)) {
        const packageUnitPrice = new Decimal(pkg.unitPrice);
        if (packageUnitPrice.lessThan(currentPrice)) {
          const discount = currentPrice.minus(packageUnitPrice);
          const discountPct = discount.div(currentPrice).times(100);

          breakdown.push({
            step: '5. Package Discount',
            description: `Package: ${pkg.name}`,
            type: 'discount',
            amount: packageUnitPrice.toFixed(4),
            discountAmount: discount.toFixed(4),
            discountPercentage: discountPct.toFixed(2),
          });

          currentPrice = packageUnitPrice;
        }
      }
    }

    // Step 9: Apply Coupon Discount
    if (params.couponCode) {
      const coupon = await this.voucherRepo.findOne({
        where: { code: params.couponCode, isActive: true },
      });

      if (coupon && this.isCouponValid(coupon)) {
        currentPrice = this.applyCoupon(coupon, currentPrice, breakdown);
      }
    }

    // Step 10: Enforce Price Floor
    const priceFloor = product.minimumSellingPrice
      ? new Decimal(product.minimumSellingPrice)
      : null;

    let floorEnforced = false;
    if (priceFloor && currentPrice.lessThan(priceFloor)) {
      breakdown.push({
        step: 'Price Floor Enforcement',
        description: 'Price cannot go below minimum selling price',
        type: 'floor',
        amount: priceFloor.toFixed(4),
      });

      currentPrice = priceFloor;
      floorEnforced = true;
    }

    // Calculate totals
    const basePrice = new Decimal(product.basePrice || 0);
    const totalDiscount = basePrice.minus(currentPrice);
    const discountPercentage = totalDiscount.div(basePrice).times(100);

    return {
      basePrice: basePrice.toFixed(4),
      finalPrice: currentPrice.toFixed(4),
      totalDiscount: totalDiscount.toFixed(4),
      discountPercentage: discountPercentage.toFixed(2),
      breakdown,
      priceFloor: priceFloor?.toFixed(4),
      floorEnforced,
    };
  }

  private async findApplicablePriceTier(
    productId: string,
    roleCode: string,
    quantity: number,
    seasonId?: string,
  ): Promise<PriceTier | null> {
    const query = this.priceTierRepo
      .createQueryBuilder('tier')
      .where('tier.productId = :productId', { productId })
      .andWhere('tier.roleCode = :roleCode', { roleCode })
      .andWhere('tier.isActive = :isActive', { isActive: true })
      .andWhere('tier.quantityFrom <= :quantity', { quantity });

    if (seasonId) {
      query.andWhere('(tier.seasonId = :seasonId OR tier.seasonId IS NULL)', {
        seasonId,
      });
    } else {
      query.andWhere('tier.seasonId IS NULL');
    }

    query
      .andWhere('(tier.quantityTo IS NULL OR tier.quantityTo >= :quantity)', {
        quantity,
      })
      .orderBy('tier.quantityFrom', 'DESC')
      .addOrderBy('tier.createdAt', 'DESC');

    return query.getOne();
  }

  private async findQuantityTier(
    productId: string,
    quantity: number,
    roleCode: string,
    seasonId?: string,
  ): Promise<PriceTier | null> {
    // Same as findApplicablePriceTier for now
    return this.findApplicablePriceTier(
      productId,
      roleCode,
      quantity,
      seasonId,
    );
  }

  private async findApplicableRules(
    ruleType: PriceRuleType,
    productId: string,
    roleCode: string,
    seasonId?: string,
  ): Promise<PriceRule[]> {
    const query = this.priceRuleRepo
      .createQueryBuilder('rule')
      .where('rule.ruleType = :ruleType', { ruleType })
      .andWhere('rule.isActive = :isActive', { isActive: true });

    // Check date validity
    const now = new Date();
    query.andWhere('(rule.start_date IS NULL OR rule.start_date <= :now)', {
      now,
    });
    query.andWhere('(rule.end_date IS NULL OR rule.end_date >= :now)', { now });

    // Check product applicability
    query.andWhere(
      `(rule.applicableProductIds IS NULL OR
        rule.applicableProductIds @> :productIds)`,
      { productIds: JSON.stringify([productId]) },
    );

    // Check role applicability
    query.andWhere(
      `(rule.applicableRoles IS NULL OR
        rule.applicableRoles @> :roles)`,
      { roles: JSON.stringify([roleCode]) },
    );

    // Check season applicability
    if (seasonId) {
      query.andWhere(
        `(rule.applicableSeasonIds IS NULL OR
          rule.applicableSeasonIds @> :seasonIds)`,
        { seasonIds: JSON.stringify([seasonId]) },
      );
    }

    query.orderBy('rule.priority', 'DESC');

    return query.getMany();
  }

  private applyRule(
    rule: PriceRule,
    currentPrice: Decimal,
    breakdown: PriceBreakdownItem[],
    step: string,
  ): Decimal {
    let discount = new Decimal(0);

    if (rule.discountType === DiscountType.PERCENTAGE) {
      discount = currentPrice.times(new Decimal(rule.discountValue)).div(100);
    } else if (rule.discountType === DiscountType.FIXED_AMOUNT) {
      discount = new Decimal(rule.discountValue);
    }

    const newPrice = currentPrice.minus(discount);
    const discountPct = discount.div(currentPrice).times(100);

    breakdown.push({
      step,
      description: rule.name,
      type: 'discount',
      amount: newPrice.toFixed(4),
      discountAmount: discount.toFixed(4),
      discountPercentage: discountPct.toFixed(2),
    });

    return newPrice;
  }

  private applyCoupon(
    coupon: Voucher,
    currentPrice: Decimal,
    breakdown: PriceBreakdownItem[],
  ): Decimal {
    let discount = new Decimal(0);

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = currentPrice
        .times(new Decimal(coupon.discountValue || 0))
        .div(100);

      // Apply maximum discount cap if exists
      if (coupon.maximumDiscountAmount) {
        const maxDiscount = new Decimal(coupon.maximumDiscountAmount);
        if (discount.greaterThan(maxDiscount)) {
          discount = maxDiscount;
        }
      }
    } else if (coupon.discountType === DiscountType.FIXED_AMOUNT) {
      discount = new Decimal(coupon.discountValue || 0);
    }

    const newPrice = currentPrice.minus(discount);
    const discountPct = discount.div(currentPrice).times(100);

    breakdown.push({
      step: '7. Coupon Discount',
      description: `Coupon: ${coupon.code}`,
      type: 'discount',
      amount: newPrice.toFixed(4),
      discountAmount: discount.toFixed(4),
      discountPercentage: discountPct.toFixed(2),
    });

    return newPrice;
  }

  private isCouponValid(coupon: Voucher): boolean {
    const now = new Date();

    // Check if coupon is active
    if (!coupon.isActive) {
      return false;
    }

    // Legacy seller-only coupons stay inactive without changing stored data.
    if (
      coupon.applicableRoles?.length &&
      !coupon.applicableRoles.includes('USER')
    ) {
      return false;
    }

    // Check start date
    if (coupon.startsAt && coupon.startsAt > now) {
      return false;
    }

    // Check end date
    if (coupon.endsAt && coupon.endsAt < now) {
      return false;
    }

    // Check usage limit (will be checked in checkout)
    // This is just a preliminary check
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return false;
    }

    return true;
  }
}
