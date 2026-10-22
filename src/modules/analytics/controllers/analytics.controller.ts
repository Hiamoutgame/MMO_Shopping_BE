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
import { AnalyticsService } from '../services/analytics.service';
import type {
  CreateProfitRecordDto,
  CreateTestCampaignDto,
  UpdateTestCampaignDto,
} from '../services/analytics.service';
import { ProfitRecord } from '../entities/profit-record.entity';
import { ProductTestCampaign } from '../entities/product-test-campaign.entity';

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('profit-records')
  async createProfitRecord(
    @Body() dto: CreateProfitRecordDto,
  ): Promise<ProfitRecord> {
    return this.analyticsService.createProfitRecord(dto);
  }

  @Get('profit-records')
  async findAllProfitRecords(
    @Query('productId') productId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('sellerId') sellerId?: string,
  ): Promise<ProfitRecord[]> {
    if (productId) {
      return this.analyticsService.findProfitRecordsByProduct(productId);
    }
    if (seasonId) {
      return this.analyticsService.findProfitRecordsBySeason(seasonId);
    }
    if (sellerId) {
      return this.analyticsService.findProfitRecordsBySeller(sellerId);
    }
    return this.analyticsService.findAllProfitRecords();
  }

  @Get('profit-summary')
  async getProfitSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.analyticsService.getProfitSummary(start, end);
  }

  @Post('test-campaigns')
  async createTestCampaign(
    @Body() dto: CreateTestCampaignDto,
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.createTestCampaign(dto);
  }

  @Get('test-campaigns')
  async findAllTestCampaigns(
    @Query('productId') productId?: string,
  ): Promise<ProductTestCampaign[]> {
    if (productId) {
      return this.analyticsService.findTestCampaignsByProduct(productId);
    }
    return this.analyticsService.findAllTestCampaigns();
  }

  @Get('test-campaigns/:id')
  async findTestCampaignById(
    @Param('id') id: string,
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.findTestCampaignById(id);
  }

  @Patch('test-campaigns/:id')
  async updateTestCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateTestCampaignDto,
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.updateTestCampaign(id, dto);
  }

  @Post('test-campaigns/:id/sales')
  async recordTestCampaignSale(
    @Param('id') id: string,
    @Body() body: { quantity: number; salePrice: string },
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.recordTestCampaignSale(
      id,
      body.quantity,
      body.salePrice,
    );
  }

  @Get('test-campaigns/:id/evaluation')
  async evaluateTestCampaign(@Param('id') id: string) {
    return this.analyticsService.evaluateTestCampaign(id);
  }

  @Post('test-campaigns/:id/mark-success')
  async markTestCampaignSuccess(
    @Param('id') id: string,
    @Body('conclusions') conclusions?: string,
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.markTestCampaignSuccess(id, conclusions);
  }

  @Post('test-campaigns/:id/mark-failed')
  async markTestCampaignFailed(
    @Param('id') id: string,
    @Body('conclusions') conclusions?: string,
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.markTestCampaignFailed(id, conclusions);
  }

  @Post('test-campaigns/:id/mark-scale')
  async markTestCampaignScale(
    @Param('id') id: string,
    @Body('conclusions') conclusions?: string,
  ): Promise<ProductTestCampaign> {
    return this.analyticsService.markTestCampaignScale(id, conclusions);
  }

  @Delete('test-campaigns/:id')
  async deleteTestCampaign(@Param('id') id: string): Promise<void> {
    return this.analyticsService.deleteTestCampaign(id);
  }
}
