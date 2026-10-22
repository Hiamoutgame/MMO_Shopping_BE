import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseBatch } from '../entities/purchase-batch.entity';
import { CostTier } from '../entities/cost-tier.entity';
import { Product } from '../../catalog/entities/product.entity';
import Decimal from 'decimal.js';

export interface CreatePurchaseBatchDto {
  productId: string;
  seasonId?: string;
  batchNumber: string;
  quantity: number;
  costPerUnit: string;
  supplier?: string;
  purchaseDate: Date;
  notes?: string;
}

export interface UpdatePurchaseBatchDto {
  batchNumber?: string;
  quantity?: number;
  costPerUnit?: string;
  supplier?: string;
  purchaseDate?: Date;
  notes?: string;
}

export interface CreateCostTierDto {
  productId: string;
  quantityFrom: number;
  quantityTo?: number;
  costPerUnit: string;
}

export interface UpdateCostTierDto {
  quantityFrom?: number;
  quantityTo?: number;
  costPerUnit?: string;
  isActive?: boolean;
}

@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    @InjectRepository(PurchaseBatch)
    private batchRepo: Repository<PurchaseBatch>,
    @InjectRepository(CostTier)
    private costTierRepo: Repository<CostTier>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
  ) {}

  async createBatch(dto: CreatePurchaseBatchDto): Promise<PurchaseBatch> {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException(
        `Product with ID "${dto.productId}" not found`,
      );
    }

    const costPerUnit = new Decimal(dto.costPerUnit);
    if (costPerUnit.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Cost per unit must be greater than 0');
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    const totalCost = costPerUnit.times(dto.quantity);

    const batch = this.batchRepo.create({
      ...dto,
      totalCost: totalCost.toFixed(4),
    });

    return this.batchRepo.save(batch);
  }

  async findAllBatches(): Promise<PurchaseBatch[]> {
    return this.batchRepo.find({
      relations: { product: true, season: true },
      order: { purchaseDate: 'DESC' },
    });
  }

  async findBatchesByProduct(productId: string): Promise<PurchaseBatch[]> {
    return this.batchRepo.find({
      where: { productId },
      relations: { product: true, season: true },
      order: { purchaseDate: 'DESC' },
    });
  }

  async findBatchesBySeason(seasonId: string): Promise<PurchaseBatch[]> {
    return this.batchRepo.find({
      where: { seasonId },
      relations: { product: true, season: true },
      order: { purchaseDate: 'DESC' },
    });
  }

  async findBatchById(id: string): Promise<PurchaseBatch> {
    const batch = await this.batchRepo.findOne({
      where: { id },
      relations: { product: true, season: true },
    });

    if (!batch) {
      throw new NotFoundException(`Purchase batch with ID "${id}" not found`);
    }

    return batch;
  }

  async updateBatch(
    id: string,
    dto: UpdatePurchaseBatchDto,
  ): Promise<PurchaseBatch> {
    const batch = await this.findBatchById(id);

    if (dto.costPerUnit) {
      const costPerUnit = new Decimal(dto.costPerUnit);
      if (costPerUnit.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Cost per unit must be greater than 0');
      }

      const quantity =
        dto.quantity !== undefined ? dto.quantity : batch.quantity;
      const totalCost = costPerUnit.times(quantity);
      batch.totalCost = totalCost.toFixed(4);
    }

    if (dto.quantity !== undefined) {
      if (dto.quantity <= 0) {
        throw new BadRequestException('Quantity must be greater than 0');
      }

      const costPerUnit = dto.costPerUnit
        ? new Decimal(dto.costPerUnit)
        : new Decimal(batch.costPerUnit);
      const totalCost = costPerUnit.times(dto.quantity);
      batch.totalCost = totalCost.toFixed(4);
    }

    Object.assign(batch, dto);
    return this.batchRepo.save(batch);
  }

  async deleteBatch(id: string): Promise<void> {
    const batch = await this.findBatchById(id);
    await this.batchRepo.softRemove(batch);
  }

  async createCostTier(dto: CreateCostTierDto): Promise<CostTier> {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException(
        `Product with ID "${dto.productId}" not found`,
      );
    }

    const costPerUnit = new Decimal(dto.costPerUnit);
    if (costPerUnit.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Cost per unit must be greater than 0');
    }

    if (dto.quantityFrom <= 0) {
      throw new BadRequestException('Quantity from must be greater than 0');
    }

    if (dto.quantityTo !== undefined && dto.quantityTo <= dto.quantityFrom) {
      throw new BadRequestException(
        'Quantity to must be greater than quantity from',
      );
    }

    const tier = this.costTierRepo.create({
      ...dto,
      isActive: true,
    });

    return this.costTierRepo.save(tier);
  }

  async findAllCostTiers(): Promise<CostTier[]> {
    return this.costTierRepo.find({
      relations: { product: true },
      order: { quantityFrom: 'ASC' },
    });
  }

  async findCostTiersByProduct(productId: string): Promise<CostTier[]> {
    return this.costTierRepo.find({
      where: { productId, isActive: true },
      order: { quantityFrom: 'ASC' },
    });
  }

  async findCostTierById(id: string): Promise<CostTier> {
    const tier = await this.costTierRepo.findOne({
      where: { id },
      relations: { product: true },
    });

    if (!tier) {
      throw new NotFoundException(`Cost tier with ID "${id}" not found`);
    }

    return tier;
  }

  async updateCostTier(id: string, dto: UpdateCostTierDto): Promise<CostTier> {
    const tier = await this.findCostTierById(id);

    if (dto.costPerUnit) {
      const costPerUnit = new Decimal(dto.costPerUnit);
      if (costPerUnit.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Cost per unit must be greater than 0');
      }
    }

    if (dto.quantityFrom !== undefined && dto.quantityFrom <= 0) {
      throw new BadRequestException('Quantity from must be greater than 0');
    }

    const quantityFrom =
      dto.quantityFrom !== undefined ? dto.quantityFrom : tier.quantityFrom;
    const quantityTo =
      dto.quantityTo !== undefined ? dto.quantityTo : tier.quantityTo;

    if (
      quantityTo !== null &&
      quantityTo !== undefined &&
      quantityTo <= quantityFrom
    ) {
      throw new BadRequestException(
        'Quantity to must be greater than quantity from',
      );
    }

    Object.assign(tier, dto);
    return this.costTierRepo.save(tier);
  }

  async deleteCostTier(id: string): Promise<void> {
    const tier = await this.findCostTierById(id);
    await this.costTierRepo.softRemove(tier);
  }

  async getCostForQuantity(
    productId: string,
    quantity: number,
  ): Promise<Decimal> {
    const tier = await this.costTierRepo
      .createQueryBuilder('tier')
      .where('tier.productId = :productId', { productId })
      .andWhere('tier.isActive = :isActive', { isActive: true })
      .andWhere('tier.quantityFrom <= :quantity', { quantity })
      .andWhere('(tier.quantityTo IS NULL OR tier.quantityTo >= :quantity)', {
        quantity,
      })
      .orderBy('tier.quantityFrom', 'DESC')
      .getOne();

    if (tier) {
      return new Decimal(tier.costPerUnit);
    }

    const lowestTier = await this.costTierRepo
      .createQueryBuilder('tier')
      .where('tier.productId = :productId', { productId })
      .andWhere('tier.isActive = :isActive', { isActive: true })
      .orderBy('tier.quantityFrom', 'ASC')
      .getOne();

    if (lowestTier) {
      return new Decimal(lowestTier.costPerUnit);
    }

    const latestBatch = await this.batchRepo
      .createQueryBuilder('batch')
      .where('batch.productId = :productId', { productId })
      .orderBy('batch.purchaseDate', 'DESC')
      .getOne();

    if (latestBatch) {
      return new Decimal(latestBatch.costPerUnit);
    }

    throw new NotFoundException(
      `No cost information found for product "${productId}"`,
    );
  }

  async calculateAverageCost(productId: string): Promise<string> {
    const batches = await this.batchRepo.find({
      where: { productId },
      order: { purchaseDate: 'DESC' },
      take: 10,
    });

    if (batches.length === 0) {
      return '0.0000';
    }

    const totalCost = batches.reduce(
      (sum, batch) => sum.plus(new Decimal(batch.costPerUnit)),
      new Decimal(0),
    );

    return totalCost.div(batches.length).toFixed(4);
  }
}
