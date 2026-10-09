import { Controller, Post, Body } from '@nestjs/common';
import { PriceEngineService } from '../services/price-engine.service';
import type { CalculatePriceParams } from '../services/price-engine.service';
import { createApiResponse } from '../../../common/utils/api-response';

@Controller('v1/pricing')
export class PricingController {
  constructor(private readonly priceEngineService: PriceEngineService) {}

  @Post('calculate')
  async calculatePrice(@Body() params: CalculatePriceParams) {
    const result = await this.priceEngineService.calculatePrice(params);
    return createApiResponse(result);
  }
}
