import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Patch,
} from '@nestjs/common';
import { PurchaseService } from '../services/purchase.service';
import type {
  CreatePurchaseBatchDto,
  UpdatePurchaseBatchDto,
  CreateCostTierDto,
  UpdateCostTierDto,
} from '../services/purchase.service';
import { PurchaseBatch } from '../entities/purchase-batch.entity';
import { CostTier } from '../entities/cost-tier.entity';

@Controller('v1/purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post('batches')
  async createBatch(
    @Body() dto: CreatePurchaseBatchDto,
  ): Promise<PurchaseBatch> {
    return this.purchaseService.createBatch(dto);
  }

  @Get('batches')
  async findAllBatches(
    @Query('productId') productId?: string,
    @Query('seasonId') seasonId?: string,
  ): Promise<PurchaseBatch[]> {
    if (productId) {
      return this.purchaseService.findBatchesByProduct(productId);
    }
    if (seasonId) {
      return this.purchaseService.findBatchesBySeason(seasonId);
    }
    return this.purchaseService.findAllBatches();
  }

  @Get('batches/:id')
  async findBatchById(@Param('id') id: string): Promise<PurchaseBatch> {
    return this.purchaseService.findBatchById(id);
  }

  @Patch('batches/:id')
  async updateBatch(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseBatchDto,
  ): Promise<PurchaseBatch> {
    return this.purchaseService.updateBatch(id, dto);
  }

  @Delete('batches/:id')
  async deleteBatch(@Param('id') id: string): Promise<void> {
    return this.purchaseService.deleteBatch(id);
  }

  @Post('cost-tiers')
  async createCostTier(@Body() dto: CreateCostTierDto): Promise<CostTier> {
    return this.purchaseService.createCostTier(dto);
  }

  @Get('cost-tiers')
  async findAllCostTiers(
    @Query('productId') productId?: string,
  ): Promise<CostTier[]> {
    if (productId) {
      return this.purchaseService.findCostTiersByProduct(productId);
    }
    return this.purchaseService.findAllCostTiers();
  }

  @Get('cost-tiers/:id')
  async findCostTierById(@Param('id') id: string): Promise<CostTier> {
    return this.purchaseService.findCostTierById(id);
  }

  @Patch('cost-tiers/:id')
  async updateCostTier(
    @Param('id') id: string,
    @Body() dto: UpdateCostTierDto,
  ): Promise<CostTier> {
    return this.purchaseService.updateCostTier(id, dto);
  }

  @Delete('cost-tiers/:id')
  async deleteCostTier(@Param('id') id: string): Promise<void> {
    return this.purchaseService.deleteCostTier(id);
  }

  @Get('cost-calculations')
  async getCostForQuantity(
    @Query('productId') productId: string,
    @Query('quantity') quantity: string,
  ) {
    const cost = await this.purchaseService.getCostForQuantity(
      productId,
      parseInt(quantity, 10),
    );
    return { cost: cost.toFixed(4) };
  }

  @Get('products/:productId/average-cost')
  async calculateAverageCost(@Param('productId') productId: string) {
    const avgCost = await this.purchaseService.calculateAverageCost(productId);
    return { averageCost: avgCost };
  }
}
