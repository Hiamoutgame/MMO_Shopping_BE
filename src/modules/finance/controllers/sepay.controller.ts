import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import {
  CreateSepayDepositDto,
  QuerySepayTransactionsDto,
  ResolveSepayTransactionDto,
} from '../dto/sepay.dto';
import { FinanceService } from '../services/finance.service';
import { SepayReconcileService } from '../services/sepay-reconcile.service';
import { SepayService } from '../services/sepay.service';

@ApiTags('finance')
@Controller('v1/wallet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SepayDepositController {
  constructor(private readonly sepayService: SepayService) {}

  @Get('sepay-settings')
  @ApiOperation({ summary: 'SePay deposit limits' })
  settings() {
    return createApiResponse(this.sepayService.publicSettings());
  }

  @Post('sepay-deposits')
  @ApiOperation({ summary: 'Create a SePay bank-transfer deposit' })
  async create(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateSepayDepositDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return createApiResponse(
      await this.sepayService.createDeposit(accountId, dto, idempotencyKey),
    );
  }

  @Get('sepay-deposits')
  @ApiOperation({ summary: 'List my SePay deposits' })
  async list(
    @CurrentUser('subject') accountId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return createApiResponse(
      await this.sepayService.listMyDeposits(
        accountId,
        query.page,
        query.pageSize,
      ),
    );
  }

  @Get('sepay-deposits/:id')
  @ApiOperation({ summary: 'Get my SePay deposit (poll for status)' })
  async get(
    @CurrentUser('subject') accountId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return createApiResponse(
      await this.sepayService.getMyDeposit(accountId, id),
    );
  }
}

@ApiTags('finance')
@Controller('v1/callbacks')
export class SepayWebhookController {
  constructor(private readonly sepayService: SepayService) {}

  // body để kiểu unknown: ValidationPipe bỏ qua, service tự kiểm tra, vì
  // SePay có thể thêm trường mới mà whitelist sẽ chặn.
  @Post('sepay')
  @HttpCode(200)
  @ApiOperation({ summary: 'SePay webhook (Authorization: Apikey <key>)' })
  async webhook(
    @Body() body: unknown,
    @Headers('authorization') authorization?: string,
  ) {
    return createApiResponse(
      await this.sepayService.handleWebhook(authorization, body),
    );
  }
}

@ApiTags('admin')
@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminSepayController {
  constructor(
    private readonly sepayService: SepayService,
    private readonly reconcileService: SepayReconcileService,
    private readonly financeService: FinanceService,
  ) {}

  @Get('sepay-transactions')
  @ApiOperation({ summary: 'Admin list bank transactions reported by SePay' })
  async list(@Query() query: QuerySepayTransactionsDto) {
    return createApiResponse(await this.sepayService.listTransactions(query));
  }

  @Post('sepay-transactions/:id/resolve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin credit or ignore an unmatched transaction' })
  async resolve(
    @CurrentUser('subject') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveSepayTransactionDto,
  ) {
    return createApiResponse(await this.sepayService.resolve(adminId, id, dto));
  }

  @Post('sepay/reconcile')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin pull recent transactions from SePay now' })
  async reconcile() {
    return createApiResponse(await this.reconcileService.reconcile());
  }

  @Get('wallet-audit')
  @ApiOperation({ summary: 'Admin compare wallet balances with the ledger' })
  async audit() {
    return createApiResponse(await this.financeService.auditWallets());
  }
}
