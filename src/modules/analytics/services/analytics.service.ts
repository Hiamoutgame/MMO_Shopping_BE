import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ProfitRecord } from '../entities/profit-record.entity';
import { ProductTestCampaign } from '../entities/product-test-campaign.entity';
import { Product } from '../../catalog/entities/product.entity';
import { PurchaseService } from '../../purchase/services/purchase.service';
import { TestCampaignStatus } from '../enums/test-campaign-status.enum';
import Decimal from 'decimal.js';

export interface CreateProfitRecordDto {
  orderId: string;
  productId: string;
  seasonId?: string;
  sellerId?: string;
  quantity: number;
  revenue: string;
  cost: string;
}

export interface CreateTestCampaignDto {
  productId: string;
  seasonId?: string;
  name: string;
  testBudget: string;
  testQuantity: number;
  costPerUnit: string;
  startDate: Date;
}

export interface UpdateTestCampaignDto {
  name?: string;
  testBudget?: string;
  testQuantity?: number;
  costPerUnit?: string;
  soldQuantity?: number;
  revenue?: string;
  profit?: string;
  status?: TestCampaignStatus;
  endDate?: Date;
  conclusions?: string;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(ProfitRecord)
    private profitRepo: Repository<ProfitRecord>,
    @InjectRepository(ProductTestCampaign)
    private testCampaignRepo: Repository<ProductTestCampaign>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private purchaseService: PurchaseService,
  ) {}

  async createProfitRecord(dto: CreateProfitRecordDto): Promise<ProfitRecord> {
    const revenue = new Decimal(dto.revenue);
    const cost = new Decimal(dto.cost);
    const profit = revenue.minus(cost);
    const profitMargin = revenue.greaterThan(0)
      ? profit.div(revenue).times(100)
      : new Decimal(0);

    const record = this.profitRepo.create({
      ...dto,
      profit: profit.toFixed(4),
      profitMargin: profitMargin.toFixed(2),
      recordedAt: new Date(),
    });

    return this.profitRepo.save(record);
  }

  async findAllProfitRecords(): Promise<ProfitRecord[]> {
    return this.profitRepo.find({
      relations: { product: true, season: true },
      order: { recordedAt: 'DESC' },
    });
  }

  async findProfitRecordsByProduct(productId: string): Promise<ProfitRecord[]> {
    return this.profitRepo.find({
      where: { productId },
      relations: { product: true, season: true },
      order: { recordedAt: 'DESC' },
    });
  }

  async findProfitRecordsBySeason(seasonId: string): Promise<ProfitRecord[]> {
    return this.profitRepo.find({
      where: { seasonId },
      relations: { product: true, season: true },
      order: { recordedAt: 'DESC' },
    });
  }

  async findProfitRecordsBySeller(sellerId: string): Promise<ProfitRecord[]> {
    return this.profitRepo.find({
      where: { sellerId },
      relations: { product: true, season: true },
      order: { recordedAt: 'DESC' },
    });
  }

  async getProfitSummary(startDate?: Date, endDate?: Date): Promise<{
    totalRevenue: string;
    totalCost: string;
    totalProfit: string;
    averageMargin: string;
    recordCount: number;
  }> {
    const query = this.profitRepo.createQueryBuilder('record');

    if (startDate && endDate) {
      query.where('record.recordedAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      query.where('record.recordedAt >= :startDate', { startDate });
    } else if (endDate) {
      query.where('record.recordedAt <= :endDate', { endDate });
    }

    const records = await query.getMany();

    if (records.length === 0) {
      return {
        totalRevenue: '0.0000',
        totalCost: '0.0000',
        totalProfit: '0.0000',
        averageMargin: '0.00',
        recordCount: 0,
      };
    }

    const totalRevenue = records.reduce(
      (sum, r) => sum.plus(new Decimal(r.revenue)),
      new Decimal(0),
    );

    const totalCost = records.reduce(
      (sum, r) => sum.plus(new Decimal(r.cost)),
      new Decimal(0),
    );

    const totalProfit = records.reduce(
      (sum, r) => sum.plus(new Decimal(r.profit)),
      new Decimal(0),
    );

    const averageMargin = records.reduce(
      (sum, r) => sum.plus(new Decimal(r.profitMargin)),
      new Decimal(0),
    ).div(records.length);

    return {
      totalRevenue: totalRevenue.toFixed(4),
      totalCost: totalCost.toFixed(4),
      totalProfit: totalProfit.toFixed(4),
      averageMargin: averageMargin.toFixed(2),
      recordCount: records.length,
    };
  }

  async createTestCampaign(dto: CreateTestCampaignDto): Promise<ProductTestCampaign> {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${dto.productId}" not found`);
    }

    const testBudget = new Decimal(dto.testBudget);
    const costPerUnit = new Decimal(dto.costPerUnit);

    if (testBudget.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Test budget must be greater than 0');
    }

    if (costPerUnit.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Cost per unit must be greater than 0');
    }

    if (dto.testQuantity <= 0) {
      throw new BadRequestException('Test quantity must be greater than 0');
    }

    const campaign = this.testCampaignRepo.create({
      ...dto,
      soldQuantity: 0,
      revenue: '0.0000',
      profit: '0.0000',
      status: TestCampaignStatus.TESTING,
    });

    return this.testCampaignRepo.save(campaign);
  }

  async findAllTestCampaigns(): Promise<ProductTestCampaign[]> {
    return this.testCampaignRepo.find({
      relations: { product: true, season: true },
      order: { startDate: 'DESC' },
    });
  }

  async findTestCampaignsByProduct(productId: string): Promise<ProductTestCampaign[]> {
    return this.testCampaignRepo.find({
      where: { productId },
      relations: { product: true, season: true },
      order: { startDate: 'DESC' },
    });
  }

  async findTestCampaignById(id: string): Promise<ProductTestCampaign> {
    const campaign = await this.testCampaignRepo.findOne({
      where: { id },
      relations: { product: true, season: true },
    });

    if (!campaign) {
      throw new NotFoundException(`Test campaign with ID "${id}" not found`);
    }

    return campaign;
  }

  async updateTestCampaign(id: string, dto: UpdateTestCampaignDto): Promise<ProductTestCampaign> {
    const campaign = await this.findTestCampaignById(id);

    if (dto.testBudget) {
      const testBudget = new Decimal(dto.testBudget);
      if (testBudget.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Test budget must be greater than 0');
      }
    }

    if (dto.costPerUnit) {
      const costPerUnit = new Decimal(dto.costPerUnit);
      if (costPerUnit.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Cost per unit must be greater than 0');
      }
    }

    if (dto.testQuantity !== undefined && dto.testQuantity <= 0) {
      throw new BadRequestException('Test quantity must be greater than 0');
    }

    Object.assign(campaign, dto);
    return this.testCampaignRepo.save(campaign);
  }

  async recordTestCampaignSale(
    campaignId: string,
    quantity: number,
    salePrice: string,
  ): Promise<ProductTestCampaign> {
    const campaign = await this.findTestCampaignById(campaignId);

    if (campaign.status !== TestCampaignStatus.TESTING) {
      throw new BadRequestException('Campaign is not in testing status');
    }

    const revenue = new Decimal(salePrice).times(quantity);
    const costPerUnit = new Decimal(campaign.costPerUnit);
    const cost = costPerUnit.times(quantity);
    const profit = revenue.minus(cost);

    campaign.soldQuantity += quantity;
    campaign.revenue = new Decimal(campaign.revenue).plus(revenue).toFixed(4);
    campaign.profit = new Decimal(campaign.profit).plus(profit).toFixed(4);

    return this.testCampaignRepo.save(campaign);
  }

  async evaluateTestCampaign(campaignId: string): Promise<{
    campaign: ProductTestCampaign;
    performanceMetrics: {
      soldPercentage: string;
      profitMargin: string;
      roi: string;
      breakEven: boolean;
      recommendation: 'SCALE' | 'CONTINUE' | 'FAILED';
    };
  }> {
    const campaign = await this.findTestCampaignById(campaignId);

    const soldPercentage = new Decimal(campaign.soldQuantity)
      .div(campaign.testQuantity)
      .times(100);

    const revenue = new Decimal(campaign.revenue);
    const profitMargin = revenue.greaterThan(0)
      ? new Decimal(campaign.profit).div(revenue).times(100)
      : new Decimal(0);

    const testBudget = new Decimal(campaign.testBudget);
    const roi = testBudget.greaterThan(0)
      ? new Decimal(campaign.profit).div(testBudget).times(100)
      : new Decimal(0);

    const breakEven = new Decimal(campaign.profit).greaterThanOrEqualTo(0);

    let recommendation: 'SCALE' | 'CONTINUE' | 'FAILED';
    if (soldPercentage.greaterThanOrEqualTo(80) && profitMargin.greaterThanOrEqualTo(20)) {
      recommendation = 'SCALE';
    } else if (soldPercentage.greaterThanOrEqualTo(50) && breakEven) {
      recommendation = 'CONTINUE';
    } else {
      recommendation = 'FAILED';
    }

    return {
      campaign,
      performanceMetrics: {
        soldPercentage: soldPercentage.toFixed(2),
        profitMargin: profitMargin.toFixed(2),
        roi: roi.toFixed(2),
        breakEven,
        recommendation,
      },
    };
  }

  async markTestCampaignSuccess(campaignId: string, conclusions?: string): Promise<ProductTestCampaign> {
    const campaign = await this.findTestCampaignById(campaignId);
    campaign.status = TestCampaignStatus.SUCCESS;
    campaign.endDate = new Date();
    if (conclusions) {
      campaign.conclusions = conclusions;
    }
    return this.testCampaignRepo.save(campaign);
  }

  async markTestCampaignFailed(campaignId: string, conclusions?: string): Promise<ProductTestCampaign> {
    const campaign = await this.findTestCampaignById(campaignId);
    campaign.status = TestCampaignStatus.FAILED;
    campaign.endDate = new Date();
    if (conclusions) {
      campaign.conclusions = conclusions;
    }
    return this.testCampaignRepo.save(campaign);
  }

  async markTestCampaignScale(campaignId: string, conclusions?: string): Promise<ProductTestCampaign> {
    const campaign = await this.findTestCampaignById(campaignId);
    campaign.status = TestCampaignStatus.SCALE;
    campaign.endDate = new Date();
    if (conclusions) {
      campaign.conclusions = conclusions;
    }
    return this.testCampaignRepo.save(campaign);
  }

  async deleteTestCampaign(id: string): Promise<void> {
    const campaign = await this.findTestCampaignById(id);
    await this.testCampaignRepo.softRemove(campaign);
  }
}
