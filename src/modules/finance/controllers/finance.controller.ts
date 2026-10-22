import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { PaymentCallbackDto } from '../dto/payment-callback.dto';
import {
  QueryPaymentWebhookEventsDto,
  ResolvePaymentWebhookEventDto,
  SyncSepayTransactionsDto,
} from '../dto/payment-webhook-event.dto';
import {
  QueryPaymentTransactionsDto,
  QueryWalletLedgersDto,
} from '../dto/query-finance.dto';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { DepositService } from '../services/deposit.service';
import { FinanceService } from '../services/finance.service';
import { SepayClientService } from '../services/sepay-client.service';

@ApiTags('finance')
@Controller('v1')
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly depositService: DepositService,
  ) {}

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet' })
  async getWallet(@CurrentUser('subject') accountId: string) {
    return createApiResponse(await this.financeService.getWallet(accountId));
  }

  @Get('deposits/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deposit limits and availability' })
  getDepositConfig() {
    return createApiResponse(this.depositService.getConfig());
  }

  @Post('deposits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create SePay bank-transfer deposit (min 10,000 VND)',
  })
  async createDeposit(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateDepositDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return createApiResponse(
      await this.depositService.createDeposit(accountId, dto, idempotencyKey),
    );
  }

  @Get('deposits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my deposits' })
  async listDeposits(
    @CurrentUser('subject') accountId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return createApiResponse(
      await this.depositService.listMyDeposits(accountId, query),
    );
  }

  @Get('deposits/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my deposit (poll for status)' })
  async getDeposit(
    @CurrentUser('subject') accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return createApiResponse(
      await this.depositService.getMyDeposit(accountId, id),
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

/**
 * Webhook SePay. Body nhận dạng object thô (không qua DTO whitelist) để SePay
 * thêm trường mới cũng không bị 400; service tự chuẩn hóa và kiểm tra.
 * Trả 200 `{ success: true }` theo yêu cầu SePay, kể cả khi giao dịch là
 * bản gửi lại hoặc cần admin xem xét — tránh SePay retry vô hạn.
 */
@ApiTags('finance')
@Controller('v1/payments/sepay')
export class SepayWebhookController {
  private readonly logger = new Logger(SepayWebhookController.name);

  constructor(
    private readonly depositService: DepositService,
    private readonly sepay: SepayClientService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'SePay transaction webhook (Authorization: Apikey)',
  })
  async webhook(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
    @Ip() ipAddress?: string,
  ) {
    if (!this.sepay.verifyWebhookAuthorization(authorization)) {
      this.logger.warn(`Rejected SePay webhook from ${ipAddress}`);
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Invalid webhook credentials.',
        errorCode: 'INVALID_SIGNATURE',
      });
    }
    const outcome = await this.depositService.ingestBankTransaction(
      this.sepay.normalizeWebhookPayload(body),
      'WEBHOOK',
    );
    return { success: true, ...outcome };
  }
}

@ApiTags('admin')
@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminFinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly depositService: DepositService,
  ) {}

  @Get('payment-webhook-events')
  @ApiOperation({ summary: 'Admin list SePay bank transaction events (trace)' })
  async listPaymentEvents(@Query() query: QueryPaymentWebhookEventsDto) {
    return createApiResponse(await this.depositService.listEvents(query));
  }

  @Get('payment-webhook-events/:id')
  @ApiOperation({ summary: 'Admin get payment event with raw payload' })
  async getPaymentEvent(@Param('id', ParseUUIDPipe) id: string) {
    return createApiResponse(await this.depositService.getEvent(id));
  }

  @Post('payment-webhook-events/:id/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin credit or ignore an event needing review' })
  async resolvePaymentEvent(
    @CurrentUser('subject') adminAccountId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePaymentWebhookEventDto,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.depositService.resolveEvent(
        adminAccountId,
        id,
        dto,
        ipAddress,
      ),
    );
  }

  @Post('payments/sepay/sync')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Pull recent SePay transactions to catch missed webhooks',
  })
  async syncSepay(@Body() dto: SyncSepayTransactionsDto) {
    return createApiResponse(
      await this.depositService.syncFromSepay(dto.sinceHours ?? 24),
    );
  }

  @Get('wallets/reconciliation')
  @ApiOperation({ summary: 'Admin reconcile wallet balances against ledger' })
  async reconcile() {
    return createApiResponse(await this.financeService.reconcile());
  }

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
