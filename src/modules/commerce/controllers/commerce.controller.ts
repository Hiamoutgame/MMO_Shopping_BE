import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { CheckoutDto, ValidateVoucherDto } from '../dto/checkout.dto';
import {
  QueryOrdersDto,
  RefundOrderDto,
  UpdateOrderStatusDto,
} from '../dto/order.dto';
import { CreateVoucherDto, UpdateVoucherDto } from '../dto/voucher.dto';
import { CommerceService } from '../services/commerce.service';

@ApiTags('commerce')
@Controller('api/v1')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Post('vouchers/validate')
  @ApiOperation({ summary: 'Validate voucher' })
  async validateVoucher(
    @CurrentUser('subject') accountId: string,
    @Body() dto: ValidateVoucherDto,
  ) {
    return createApiResponse(
      await this.commerceService.validateVoucher(accountId, dto),
    );
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout cart' })
  async checkout(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return createApiResponse(
      await this.commerceService.checkout(accountId, dto, idempotencyKey),
    );
  }

  @Get('orders')
  @ApiOperation({ summary: 'List current account orders' })
  async listOrders(
    @CurrentUser('subject') accountId: string,
    @Query() query: QueryOrdersDto,
  ) {
    return createApiResponse(
      await this.commerceService.listOrders(accountId, query),
    );
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get current account order' })
  async getOrder(
    @CurrentUser('subject') accountId: string,
    @Param('id') id: string,
  ) {
    return createApiResponse(
      await this.commerceService.getOrder(accountId, id),
    );
  }
}

@ApiTags('admin')
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminCommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Get('orders')
  @ApiOperation({ summary: 'Admin list orders' })
  async listOrders(@Query() query: QueryOrdersDto) {
    return createApiResponse(await this.commerceService.listAdminOrders(query));
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Admin get order' })
  async getOrder(@Param('id') id: string) {
    return createApiResponse(await this.commerceService.getAdminOrder(id));
  }

  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Admin update order status' })
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.commerceService.updateOrderStatus(
        id,
        dto.status,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  @Post('orders/:id/refund')
  @ApiOperation({ summary: 'Admin refund order' })
  async refundOrder(
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.commerceService.refundOrder(
        id,
        dto,
        idempotencyKey,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  @Get('vouchers')
  @ApiOperation({ summary: 'Admin list vouchers' })
  async listVouchers(@Query() query: QueryOrdersDto) {
    return createApiResponse(await this.commerceService.listVouchers(query));
  }

  @Post('vouchers')
  @ApiOperation({ summary: 'Admin create voucher' })
  async createVoucher(
    @Body() dto: CreateVoucherDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.commerceService.createVoucher(dto, adminAccountId, ipAddress),
    );
  }

  @Get('vouchers/:id')
  @ApiOperation({ summary: 'Admin get voucher' })
  async getVoucher(@Param('id') id: string) {
    return createApiResponse(await this.commerceService.getVoucher(id));
  }

  @Patch('vouchers/:id')
  @ApiOperation({ summary: 'Admin update voucher' })
  async updateVoucher(
    @Param('id') id: string,
    @Body() dto: UpdateVoucherDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.commerceService.updateVoucher(
        id,
        dto,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  @Delete('vouchers/:id')
  @ApiOperation({ summary: 'Admin delete voucher' })
  async deleteVoucher(
    @Param('id') id: string,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.commerceService.deleteVoucher(id, adminAccountId, ipAddress),
    );
  }
}
