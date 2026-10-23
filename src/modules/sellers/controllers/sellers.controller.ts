import { All, Controller, GoneException, UseFilters } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ApiExceptionFilter } from '../../../common/filters/api-exception.filter';

// Keep the old namespace retired while its historical data remains intact.
@ApiExcludeController()
@Controller('v1/sellers')
@UseFilters(ApiExceptionFilter)
export class SellersController {
  @All(['', '*path'])
  unavailable(): never {
    throw new GoneException({
      success: false,
      data: null,
      message: 'Chức năng seller đang tạm ngừng sử dụng.',
      errorCode: 'FEATURE_RETIRED',
    });
  }
}
