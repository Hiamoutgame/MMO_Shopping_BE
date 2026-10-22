import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CalculatePriceDto } from '../../../common/dto/chung-suc.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { PriceEngineService } from '../services/price-engine.service';

@Controller('v1/pricing')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PricingController {
  constructor(private readonly priceEngineService: PriceEngineService) {}

  @Post('calculate')
  async calculatePrice(
    @Body() params: CalculatePriceDto,
    @CurrentUser('subject') accountId: string,
  ) {
    // Ignore accountId supplied by older clients; identity comes from the session.
    const result = await this.priceEngineService.calculatePrice({
      ...params,
      accountId,
    });
    return createApiResponse(result);
  }
}
