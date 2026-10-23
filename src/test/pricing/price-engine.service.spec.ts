import { Test, TestingModule } from '@nestjs/testing';
import { PriceEngineService } from '../../modules/pricing/services/price-engine.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../../modules/catalog/entities/product.entity';
import { Account } from '../../modules/identity/entities/account.entity';
import { PriceTier } from '../../modules/pricing/entities/price-tier.entity';
import { PriceRule } from '../../modules/pricing/entities/price-rule.entity';
import { Package } from '../../modules/packages/entities/package.entity';
import { Voucher } from '../../modules/commerce/entities/voucher.entity';
import { DiscountType } from '../../modules/commerce/enums/discount-type.enum';
import Decimal from 'decimal.js';

describe('PriceEngineService', () => {
  let service: PriceEngineService;

  const mockProduct = {
    id: 'product-1',
    basePrice: '50000.0000',
    minimumSellingPrice: '30000.0000',
  };

  const mockAccount = {
    id: 'account-1',
    role: {
      code: 'USER',
    },
  };

  const mockProductRepo = {
    findOne: jest.fn().mockResolvedValue(mockProduct),
  };

  const mockAccountRepo = {
    findOne: jest.fn().mockResolvedValue(mockAccount),
  };

  const mockPriceTierRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  };

  const mockPriceRuleRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
    find: jest.fn().mockResolvedValue([]),
  };

  const mockPackageRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockVoucherRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceEngineService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepo,
        },
        {
          provide: getRepositoryToken(Account),
          useValue: mockAccountRepo,
        },
        {
          provide: getRepositoryToken(PriceTier),
          useValue: mockPriceTierRepo,
        },
        {
          provide: getRepositoryToken(PriceRule),
          useValue: mockPriceRuleRepo,
        },
        {
          provide: getRepositoryToken(Package),
          useValue: mockPackageRepo,
        },
        {
          provide: getRepositoryToken(Voucher),
          useValue: mockVoucherRepo,
        },
      ],
    }).compile();

    service = module.get<PriceEngineService>(PriceEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculatePrice - Base Price', () => {
    it('should return base price when no discounts apply', async () => {
      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
      });

      expect(result.basePrice).toBe('50000.0000');
      expect(result.finalPrice).toBe('50000.0000');
      expect(result.totalDiscount).toBe('0.0000');
      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].step).toBe('1. Base Price');
    });
  });

  describe('calculatePrice - Role-Based Pricing', () => {
    it.each(['SELLER', 'ADMIN'])(
      'uses customer pricing for a %s account',
      async (storedRole) => {
        mockAccountRepo.findOne.mockResolvedValueOnce({
          ...mockAccount,
          role: { code: storedRole },
        });
        let selectedRole = '';
        mockPriceTierRepo.createQueryBuilder.mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockImplementation(function (
            this: unknown,
            _sql: string,
            params?: { roleCode?: string },
          ) {
            if (params?.roleCode) selectedRole = params.roleCode;
            return this;
          }),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockImplementation(() =>
            Promise.resolve({
              unitPrice: selectedRole === 'USER' ? '45000.0000' : '40000.0000',
              roleCode: selectedRole,
            }),
          ),
        });

        const result = await service.calculatePrice({
          productId: 'product-1',
          accountId: 'account-1',
          quantity: 1,
        });

        expect(result.finalPrice).toBe('45000.0000');
        expect(result.breakdown[1].step).toBe('2. USER Price');
      },
    );
  });

  describe('calculatePrice - Quantity Discount', () => {
    it('should apply quantity tier discount', async () => {
      mockPriceTierRepo.createQueryBuilder
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({
            unitPrice: '45000.0000',
            quantityFrom: 10,
          }),
        });

      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 10,
      });

      expect(result.finalPrice).toBe('45000.0000');
      expect(
        result.breakdown.some((b) => b.step === '3. Quantity Discount'),
      ).toBe(true);
    });
  });

  describe('calculatePrice - Coupon', () => {
    it('does not apply a legacy seller-only coupon to a customer', async () => {
      mockVoucherRepo.findOne.mockResolvedValueOnce({
        code: 'SELLER-ONLY',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '20.0000',
        isActive: true,
        applicableRoles: ['SELLER'],
      });
      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
        couponCode: 'SELLER-ONLY',
      });
      expect(result.finalPrice).toBe('50000.0000');
    });

    it('should apply percentage coupon', async () => {
      mockVoucherRepo.findOne.mockResolvedValueOnce({
        id: 'voucher-1',
        code: 'SALE20',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '20.0000',
        isActive: true,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-12-31'),
      });

      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
        couponCode: 'SALE20',
      });

      // 50000 - 20% = 40000
      expect(result.finalPrice).toBe('40000.0000');
      expect(result.totalDiscount).toBe('10000.0000');
      expect(
        result.breakdown.some((b) => b.step === '7. Coupon Discount'),
      ).toBe(true);
    });

    it('should apply fixed amount coupon', async () => {
      mockVoucherRepo.findOne.mockResolvedValueOnce({
        id: 'voucher-2',
        code: 'GIAM5K',
        discountType: DiscountType.FIXED_AMOUNT,
        discountValue: '5000.0000',
        isActive: true,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-12-31'),
      });

      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
        couponCode: 'GIAM5K',
      });

      // 50000 - 5000 = 45000
      expect(result.finalPrice).toBe('45000.0000');
      expect(result.totalDiscount).toBe('5000.0000');
    });

    it('should respect maximum discount cap', async () => {
      mockVoucherRepo.findOne.mockResolvedValueOnce({
        id: 'voucher-3',
        code: 'SALE50',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '50.0000',
        maximumDiscountAmount: '10000.0000',
        isActive: true,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-12-31'),
      });

      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
        couponCode: 'SALE50',
      });

      // 50% of 50000 = 25000, but capped at 10000
      // Final: 50000 - 10000 = 40000
      expect(result.finalPrice).toBe('40000.0000');
    });
  });

  describe('calculatePrice - Price Floor', () => {
    it('should enforce minimum selling price', async () => {
      mockVoucherRepo.findOne.mockResolvedValueOnce({
        id: 'voucher-4',
        code: 'MEGA90',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '90.0000',
        isActive: true,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-12-31'),
      });

      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
        couponCode: 'MEGA90',
      });

      // 90% discount would bring price to 5000
      // But minimum is 30000
      expect(result.finalPrice).toBe('30000.0000');
      expect(result.floorEnforced).toBe(true);
      expect(result.priceFloor).toBe('30000.0000');
    });
  });

  describe('calculatePrice - Sequential Discounts', () => {
    it('should apply discounts sequentially, not additively', async () => {
      // Customer tier: 40000 (20% off from 50000)
      const customerAccount = {
        ...mockAccount,
        role: { code: 'USER' },
      };

      mockAccountRepo.findOne.mockResolvedValueOnce(customerAccount);
      mockPriceTierRepo.createQueryBuilder
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({
            unitPrice: '40000.0000',
            roleCode: 'USER',
          }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(null),
        });

      // Then 10% coupon on 40000 = 36000
      mockVoucherRepo.findOne.mockResolvedValueOnce({
        id: 'voucher-5',
        code: 'EXTRA10',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10.0000',
        isActive: true,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-12-31'),
      });

      const result = await service.calculatePrice({
        productId: 'product-1',
        accountId: 'account-1',
        quantity: 1,
        couponCode: 'EXTRA10',
      });

      // Sequential: 50000 → 40000 (customer tier) → 36000 (10% coupon)
      // NOT additive: 50000 - 30% = 35000
      expect(result.finalPrice).toBe('36000.0000');
      expect(result.totalDiscount).toBe('14000.0000');
      expect(new Decimal(result.discountPercentage).toNumber()).toBeCloseTo(
        28,
        0,
      );
    });
  });
});
