import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
} from '@nestjs/common';
import { CouponsService } from '../services/coupons.service';
import type {
  ValidateCouponDto,
  RecordCouponUsageDto,
} from '../services/coupons.service';
import { CouponUsage } from '../entities/coupon-usage.entity';

@Controller('v1/coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  async validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validateCoupon(dto);
  }

  @Post('usage')
  async recordUsage(@Body() dto: RecordCouponUsageDto): Promise<CouponUsage> {
    return this.couponsService.recordUsage(dto);
  }

  @Get('usage')
  async getUsageHistory(
    @Query('accountId') accountId?: string,
    @Query('voucherId') voucherId?: string,
  ): Promise<CouponUsage[]> {
    if (accountId) {
      return this.couponsService.getUserUsageHistory(accountId);
    }
    if (voucherId) {
      return this.couponsService.getCouponUsageHistory(voucherId);
    }
    return [];
  }

  @Get(':voucherId/stats')
  async getCouponStats(@Param('voucherId') voucherId: string) {
    return this.couponsService.getCouponStats(voucherId);
  }

  @Patch(':voucherId/products')
  async linkProducts(
    @Param('voucherId') voucherId: string,
    @Body('productIds') productIds: string[],
  ): Promise<void> {
    return this.couponsService.linkProductsToCoupon(voucherId, productIds);
  }

  @Patch(':voucherId/seasons')
  async linkSeasons(
    @Param('voucherId') voucherId: string,
    @Body('seasonIds') seasonIds: string[],
  ): Promise<void> {
    return this.couponsService.linkSeasonsToCoupon(voucherId, seasonIds);
  }

  @Patch(':voucherId/packages')
  async linkPackages(
    @Param('voucherId') voucherId: string,
    @Body('packageIds') packageIds: string[],
  ): Promise<void> {
    return this.couponsService.linkPackagesToCoupon(voucherId, packageIds);
  }

  @Get(':voucherId/products')
  async getCouponProducts(@Param('voucherId') voucherId: string) {
    return this.couponsService.getCouponProducts(voucherId);
  }

  @Get(':voucherId/seasons')
  async getCouponSeasons(@Param('voucherId') voucherId: string) {
    return this.couponsService.getCouponSeasons(voucherId);
  }

  @Get(':voucherId/packages')
  async getCouponPackages(@Param('voucherId') voucherId: string) {
    return this.couponsService.getCouponPackages(voucherId);
  }
}
