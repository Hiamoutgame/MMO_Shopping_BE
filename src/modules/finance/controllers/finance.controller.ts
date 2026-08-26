import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { PaymentCallbackDto } from '../dto/payment-callback.dto';
import {
  QueryPaymentTransactionsDto,
  QueryWalletLedgersDto,
} from '../dto/query-finance.dto';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { FinanceService } from '../services/finance.service';

@ApiTags('finance')
@Controller('api/v1')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet' })
  async getWallet(@CurrentUser('subject') accountId: string) {
    return createApiResponse(await this.financeService.getWallet(accountId));
  }

  @Post('deposits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create deposit' })
  async createDeposit(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateDepositDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return createApiResponse(
      await this.financeService.createDeposit(accountId, dto, idempotencyKey),
    );
  }

  @Post('callbacks/payment-providers/:provider')
  @ApiOperation({ summary: 'Payment provider callback' })
  async paymentCallback(
    @Param('provider') provider: PaymentProvider,
    @Body() dto: PaymentCallbackDto,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-payment-timestamp') timestamp?: string,
    @Headers('x-payment-signature') signature?: string,
  ) {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    return createApiResponse(
      await this.financeService.handlePaymentCallback(
        provider,
        dto,
        rawBody,
        timestamp,
        signature,
      ),
    );
  }

  @Get('wallet-transactions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List wallet transactions' })
  async listWalletTransactions(
    @CurrentUser('subject') accountId: string,
    @Query() query: QueryWalletLedgersDto,
  ) {
    return createApiResponse(
      await this.financeService.listWalletTransactions(accountId, query),
    );
  }
}

@ApiTags('admin')
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminFinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('payment-transactions')
  @ApiOperation({ summary: 'Admin list payment transactions' })
  async listPaymentTransactions(@Query() query: QueryPaymentTransactionsDto) {
    return createApiResponse(
      await this.financeService.listPaymentTransactions(query),
    );
  }

  @Get('payment-transactions/:id')
  @ApiOperation({ summary: 'Admin get payment transaction' })
  async getPaymentTransaction(@Param('id') id: string) {
    return createApiResponse(
      await this.financeService.getPaymentTransaction(id),
    );
  }

  @Get('wallet-ledgers')
  @ApiOperation({ summary: 'Admin list wallet ledger' })
  async listWalletLedgers(@Query() query: QueryWalletLedgersDto) {
    return createApiResponse(
      await this.financeService.listWalletLedgers(query),
    );
  }
}
