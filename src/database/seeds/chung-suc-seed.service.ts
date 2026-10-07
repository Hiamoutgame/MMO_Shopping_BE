import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Season } from '../../modules/seasons/entities/season.entity';
import { ChungSucCampaign } from '../../modules/chung-suc/entities/chung-suc-campaign.entity';
import { Package } from '../../modules/packages/entities/package.entity';
import { PackageProduct } from '../../modules/packages/entities/package-product.entity';
import { PriceTier } from '../../modules/pricing/entities/price-tier.entity';
import { PriceRule } from '../../modules/pricing/entities/price-rule.entity';
import { Voucher } from '../../modules/commerce/entities/voucher.entity';
import { Product } from '../../modules/catalog/entities/product.entity';
import { Account } from '../../modules/identity/entities/account.entity';
import { Role } from '../../modules/identity/entities/role.entity';
import { SellerProfile } from '../../modules/sellers/entities/seller-profile.entity';
import { SellerReferralCode } from '../../modules/sellers/entities/seller-referral-code.entity';
import { SeasonStatus } from '../../modules/seasons/enums/season-status.enum';
import { CampaignStatus } from '../../modules/chung-suc/enums/campaign-status.enum';
import { PriceRuleType } from '../../modules/pricing/enums/price-rule-type.enum';
import { DiscountType } from '../../modules/commerce/enums/discount-type.enum';
import { SellerApprovalStatus } from '../../modules/sellers/enums/seller-approval-status.enum';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ChungSucSeedService {
  private readonly logger = new Logger(ChungSucSeedService.name);

  constructor(
    @InjectRepository(Season)
    private seasonRepo: Repository<Season>,
    @InjectRepository(ChungSucCampaign)
    private campaignRepo: Repository<ChungSucCampaign>,
    @InjectRepository(Package)
    private packageRepo: Repository<Package>,
    @InjectRepository(PackageProduct)
    private packageProductRepo: Repository<PackageProduct>,
    @InjectRepository(PriceTier)
    private priceTierRepo: Repository<PriceTier>,
    @InjectRepository(PriceRule)
    private priceRuleRepo: Repository<PriceRule>,
    @InjectRepository(Voucher)
    private voucherRepo: Repository<Voucher>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Account)
    private accountRepo: Repository<Account>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(SellerProfile)
    private sellerRepo: Repository<SellerProfile>,
    @InjectRepository(SellerReferralCode)
    private sellerCodeRepo: Repository<SellerReferralCode>,
    private dataSource: DataSource,
  ) {}

  async seed(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      this.logger.log('Starting CHUNG SỨC system seed...');

      // 1. Create roles if not exists
      let userRole = await manager.findOne(Role, { where: { code: 'USER' } });
      if (!userRole) {
        userRole = manager.create(Role, {
          code: 'USER',
          name: 'User',
          description: 'Regular user',
        });
        await manager.save(Role, userRole);
      }

      let sellerRole = await manager.findOne(Role, { where: { code: 'SELLER' } });
      if (!sellerRole) {
        sellerRole = manager.create(Role, {
          code: 'SELLER',
          name: 'Seller',
          description: 'Seller with referral capabilities',
        });
        await manager.save(Role, sellerRole);
      }

      let adminRole = await manager.findOne(Role, { where: { code: 'ADMIN' } });
      if (!adminRole) {
        adminRole = manager.create(Role, {
          code: 'ADMIN',
          name: 'Admin',
          description: 'System administrator',
        });
        await manager.save(Role, adminRole);
      }

      // 2. Create demo accounts
      const hashedPassword = await bcrypt.hash('Demo@123456', 10);

      let demoUser = await manager.findOne(Account, { where: { email: 'user@demo.com' } });
      if (!demoUser) {
        demoUser = manager.create(Account, {
          email: 'user@demo.com',
          password: hashedPassword,
          fullName: 'Demo User',
          roleId: userRole.id,
          isActive: true,
        });
        await manager.save(Account, demoUser);
      }

      let demoSeller = await manager.findOne(Account, { where: { email: 'seller@demo.com' } });
      if (!demoSeller) {
        demoSeller = manager.create(Account, {
          email: 'seller@demo.com',
          password: hashedPassword,
          fullName: 'Demo Seller',
          roleId: sellerRole.id,
          isActive: true,
        });
        await manager.save(Account, demoSeller);

        // Create seller profile
        const sellerProfile = manager.create(SellerProfile, {
          accountId: demoSeller.id,
          businessName: 'Demo Seller Business',
          businessType: 'Individual',
          approvalStatus: SellerApprovalStatus.APPROVED,
          approvedAt: new Date(),
          commissionRate: '5.00',
        });
        await manager.save(SellerProfile, sellerProfile);

        // Create referral code
        const referralCode = manager.create(SellerReferralCode, {
          sellerId: sellerProfile.id,
          code: 'DEMOSELLER2024',
          isActive: true,
          usageCount: 0,
        });
        await manager.save(SellerReferralCode, referralCode);
      }

      // 3. Create demo products
      const products: Product[] = [];
      const productNames = [
        'Facebook Account - 2015',
        'Gmail Account - Aged',
        'Instagram Account - 10K Followers',
        'TikTok Account - Verified',
        'Twitter Account - Premium',
      ];

      for (const name of productNames) {
        let product = await manager.findOne(Product, { where: { name } });
        if (!product) {
          product = manager.create(Product, {
            name,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            description: `High-quality ${name} for your business needs`,
            basePrice: '50000.0000',
            minimumSellingPrice: '30000.0000',
            isActive: true,
          });
          await manager.save(Product, product);
        }
        products.push(product);
      }

      // 4. Create Season
      const now = new Date();
      const seasonStart = new Date(now);
      seasonStart.setDate(1);
      const seasonEnd = new Date(now);
      seasonEnd.setMonth(seasonEnd.getMonth() + 1);
      seasonEnd.setDate(0);

      let season = await manager.findOne(Season, { where: { slug: 'tet-2024' } });
      if (!season) {
        season = manager.create(Season, {
          name: 'Tết Nguyên Đán 2024',
          slug: 'tet-2024',
          description: 'Mùa mua sắm Tết với giảm giá cực sốc',
          bannerUrl: 'https://example.com/tet-banner.jpg',
          startDate: seasonStart,
          endDate: seasonEnd,
          status: SeasonStatus.ACTIVE,
        });
        await manager.save(Season, season);
      }

      // 5. Create Price Tiers (Role-based pricing)
      for (const product of products) {
        // USER price
        const userTierExists = await manager.findOne(PriceTier, {
          where: { productId: product.id, roleCode: 'USER' },
        });
        if (!userTierExists) {
          const userTier = manager.create(PriceTier, {
            productId: product.id,
            seasonId: season.id,
            roleCode: 'USER',
            quantityFrom: 1,
            quantityTo: null,
            unitPrice: '50000.0000',
            isActive: true,
          });
          await manager.save(PriceTier, userTier);
        }

        // SELLER price (discounted)
        const sellerTierExists = await manager.findOne(PriceTier, {
          where: { productId: product.id, roleCode: 'SELLER' },
        });
        if (!sellerTierExists) {
          const sellerTier = manager.create(PriceTier, {
            productId: product.id,
            seasonId: season.id,
            roleCode: 'SELLER',
            quantityFrom: 1,
            quantityTo: null,
            unitPrice: '40000.0000',
            isActive: true,
          });
          await manager.save(PriceTier, sellerTier);
        }

        // Quantity tier: 10+
        const qty10Exists = await manager.findOne(PriceTier, {
          where: { productId: product.id, roleCode: 'USER', quantityFrom: 10 },
        });
        if (!qty10Exists) {
          const qty10Tier = manager.create(PriceTier, {
            productId: product.id,
            seasonId: season.id,
            roleCode: 'USER',
            quantityFrom: 10,
            quantityTo: 49,
            unitPrice: '45000.0000',
            isActive: true,
          });
          await manager.save(PriceTier, qty10Tier);
        }

        // Quantity tier: 50+
        const qty50Exists = await manager.findOne(PriceTier, {
          where: { productId: product.id, roleCode: 'USER', quantityFrom: 50 },
        });
        if (!qty50Exists) {
          const qty50Tier = manager.create(PriceTier, {
            productId: product.id,
            seasonId: season.id,
            roleCode: 'USER',
            quantityFrom: 50,
            quantityTo: null,
            unitPrice: '40000.0000',
            isActive: true,
          });
          await manager.save(PriceTier, qty50Tier);
        }
      }

      // 6. Create Seasonal Price Rule
      const seasonalRuleExists = await manager.findOne(PriceRule, {
        where: { name: 'Tết Sale 10%' },
      });
      if (!seasonalRuleExists) {
        const seasonalRule = manager.create(PriceRule, {
          name: 'Tết Sale 10%',
          description: 'Giảm giá 10% cho tất cả sản phẩm trong mùa Tết',
          ruleType: PriceRuleType.SEASONAL,
          priority: 100,
          isStackable: true,
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10.0000',
          applicableSeasonIds: [season.id],
          startDate: seasonStart,
          endDate: seasonEnd,
          isActive: true,
        });
        await manager.save(PriceRule, seasonalRule);
      }

      // 7. Create CHUNG SỨC Campaign
      const campaignStart = new Date(now);
      const campaignEnd = new Date(now);
      campaignEnd.setDate(campaignEnd.getDate() + 7);

      let campaign = await manager.findOne(ChungSucCampaign, {
        where: { slug: 'facebook-acc-chung-suc' },
      });
      if (!campaign) {
        campaign = manager.create(ChungSucCampaign, {
          seasonId: season.id,
          productId: products[0].id,
          name: 'Chung Sức Mua Facebook Account',
          slug: 'facebook-acc-chung-suc',
          description: 'Mua chung 100 account Facebook giá cực tốt!',
          imageUrl: 'https://example.com/facebook-campaign.jpg',
          targetQuantity: 100,
          currentQuantity: 0,
          startTime: campaignStart,
          endTime: campaignEnd,
          status: CampaignStatus.ACTIVE,
          rewards: {
            milestone50: 'Tặng thêm 5 account miễn phí',
            milestone100: 'Giảm thêm 5% cho đơn hàng tiếp theo',
          },
        });
        await manager.save(ChungSucCampaign, campaign);
      }

      // 8. Create Packages
      const packageData = [
        {
          name: 'Gói Starter',
          slug: 'goi-starter',
          quantity: 5,
          displayPrice: '250000.0000',
          unitPrice: '45000.0000',
          products: [{ productId: products[0].id, quantity: 5 }],
        },
        {
          name: 'Gói Pro',
          slug: 'goi-pro',
          quantity: 20,
          displayPrice: '900000.0000',
          unitPrice: '42000.0000',
          products: [{ productId: products[0].id, quantity: 20 }],
        },
        {
          name: 'Gói Premium',
          slug: 'goi-premium',
          quantity: 50,
          displayPrice: '2000000.0000',
          unitPrice: '38000.0000',
          products: [{ productId: products[0].id, quantity: 50 }],
        },
      ];

      for (const pkgData of packageData) {
        let pkg = await manager.findOne(Package, { where: { slug: pkgData.slug } });
        if (!pkg) {
          pkg = manager.create(Package, {
            seasonId: season.id,
            name: pkgData.name,
            slug: pkgData.slug,
            description: `${pkgData.name} - Tiết kiệm hơn khi mua gói`,
            quantity: pkgData.quantity,
            displayPrice: pkgData.displayPrice,
            unitPrice: pkgData.unitPrice,
            applicableRoles: ['USER', 'SELLER'],
            sortOrder: 0,
            isActive: true,
          });
          await manager.save(Package, pkg);

          for (const productLink of pkgData.products) {
            const pkgProduct = manager.create(PackageProduct, {
              packageId: pkg.id,
              productId: productLink.productId,
              quantity: productLink.quantity,
            });
            await manager.save(PackageProduct, pkgProduct);
          }
        }
      }

      // 9. Create Vouchers
      const voucherData = [
        {
          code: 'TET2024',
          name: 'Mã giảm giá Tết',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '15.0000',
          minimumPurchaseAmount: '100000.0000',
          maximumDiscount: '50000.0000',
          usageLimit: 100,
          usagePerUser: 1,
          stackable: true,
          priority: 10,
        },
        {
          code: 'GIAMGIA50K',
          name: 'Giảm 50K cho đơn từ 500K',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: '50000.0000',
          minimumPurchaseAmount: '500000.0000',
          usageLimit: 50,
          usagePerUser: 1,
          stackable: false,
          priority: 20,
        },
      ];

      for (const voucherInfo of voucherData) {
        let voucher = await manager.findOne(Voucher, { where: { code: voucherInfo.code } });
        if (!voucher) {
          voucher = manager.create(Voucher, {
            ...voucherInfo,
            startDate: seasonStart,
            endDate: seasonEnd,
            isActive: true,
            currentUsage: 0,
            applicableRoles: ['USER', 'SELLER'],
          });
          await manager.save(Voucher, voucher);
        }
      }

      this.logger.log('✅ CHUNG SỨC system seed completed!');
      this.logger.log('Demo accounts:');
      this.logger.log('  - User: user@demo.com / Demo@123456');
      this.logger.log('  - Seller: seller@demo.com / Demo@123456');
      this.logger.log('  - Seller Code: DEMOSELLER2024');
      this.logger.log(`  - Season: ${season.name}`);
      this.logger.log(`  - Campaign: ${campaign.name}`);
      this.logger.log('  - 3 Packages created');
      this.logger.log('  - 2 Vouchers created');
    });
  }
}
