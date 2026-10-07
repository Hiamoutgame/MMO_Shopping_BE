import { Controller, Post, Body } from '@nestjs/common';
import { PriceEngineService } from '../services/price-engine.service';
import type { CalculatePriceParams, PriceCalculationResult } from '../services/price-engine.service';

@Controller('v1/pricing')
export class PricingController {
  constructor(private readonly priceEngineService: PriceEngineService) {}

  @Post('calculate')
  async calculatePrice(@Body() params: CalculatePriceParams): Promise<PriceCalculationResult> {
    return this.priceEngineService.calculatePrice(params);
  }
}
