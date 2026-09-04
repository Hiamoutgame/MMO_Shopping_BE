import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import {
  CashbackConnectionLoginDto,
  CashbackListQueryDto,
  CashbackTwoFactorDto,
  CashbackVerifyEmailDto,
  CashbackWithdrawalOtpDto,
  CreateCashbackLinkDto,
  CreateCashbackPaymentAccountDto,
  CreateCashbackWithdrawalDto,
} from '../dto/cashback.dto';
import { CashbackService } from '../services/cashback.service';

@ApiTags('cashback')
@Controller('api/v1/cashback')
export class CashbackPublicController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get cashback business configuration' })
  async getConfig() {
    return createApiResponse(await this.cashbackService.getConfig());
  }
}

@ApiTags('cashback')
@Controller('api/v1/cashback')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get('connection')
  getConnection(@CurrentUser('subject') accountId: string) {
    return this.wrap(this.cashbackService.getConnection(accountId));
  }

  @Post('connection/login')
  @HttpCode(HttpStatus.OK)
  login(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CashbackConnectionLoginDto,
  ) {
    return this.wrap(this.cashbackService.login(accountId, dto));
  }

  @Post('connection/login/2fa')
  @HttpCode(HttpStatus.OK)
  twoFactor(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CashbackTwoFactorDto,
  ) {
    return this.wrap(this.cashbackService.completeTwoFactor(accountId, dto));
  }

  @Post('connection/login/2fa/resend')
  @HttpCode(HttpStatus.OK)
  resendTwoFactor(@CurrentUser('subject') accountId: string) {
    return this.wrap(this.cashbackService.resendTwoFactor(accountId));
  }

  @Post('connection/verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CashbackVerifyEmailDto,
  ) {
    return this.wrap(this.cashbackService.verifyEmail(accountId, dto));
  }

  @Post('connection/verify-email/resend')
  @HttpCode(HttpStatus.OK)
  resendVerifyEmail(@CurrentUser('subject') accountId: string) {
    return this.wrap(this.cashbackService.resendVerifyEmail(accountId));
  }

  @Delete('connection')
  unlink(@CurrentUser('subject') accountId: string) {
    return this.wrap(this.cashbackService.unlink(accountId));
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  createLink(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateCashbackLinkDto,
  ) {
    return this.wrap(this.cashbackService.createLink(accountId, dto));
  }

  @Get('account')
  getAccount(@CurrentUser('subject') accountId: string) {
    return this.wrap(this.cashbackService.getAccount(accountId));
  }

  @Get('orders')
  listOrders(
    @CurrentUser('subject') accountId: string,
    @Query() query: CashbackListQueryDto,
  ) {
    return this.wrap(this.cashbackService.listOrders(accountId, query));
  }

  @Get('orders/:id')
  getOrder(@CurrentUser('subject') accountId: string, @Param('id') id: string) {
    return this.wrap(this.cashbackService.getOrder(accountId, id));
  }

  @Get('withdrawals')
  listWithdrawals(
    @CurrentUser('subject') accountId: string,
    @Query() query: CashbackListQueryDto,
  ) {
    return this.wrap(this.cashbackService.listWithdrawals(accountId, query));
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.OK)
  createWithdrawal(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateCashbackWithdrawalDto,
  ) {
    return this.wrap(this.cashbackService.createWithdrawal(accountId, dto));
  }

  @Post('withdrawals/otp')
  @HttpCode(HttpStatus.OK)
  sendWithdrawalOtp(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CashbackWithdrawalOtpDto,
  ) {
    return this.wrap(this.cashbackService.sendWithdrawalOtp(accountId, dto));
  }

  @Get('payment-accounts')
  listPaymentAccounts(@CurrentUser('subject') accountId: string) {
    return this.wrap(this.cashbackService.listPaymentAccounts(accountId));
  }

  @Post('payment-accounts')
  @HttpCode(HttpStatus.OK)
  createPaymentAccount(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateCashbackPaymentAccountDto,
  ) {
    return this.wrap(this.cashbackService.createPaymentAccount(accountId, dto));
  }

  @Post('payment-accounts/:id/default')
  @HttpCode(HttpStatus.OK)
  setDefaultPaymentAccount(
    @CurrentUser('subject') accountId: string,
    @Param('id') id: string,
  ) {
    return this.wrap(
      this.cashbackService.setDefaultPaymentAccount(accountId, id),
    );
  }

  @Delete('payment-accounts/:id')
  deletePaymentAccount(
    @CurrentUser('subject') accountId: string,
    @Param('id') id: string,
  ) {
    return this.wrap(this.cashbackService.deletePaymentAccount(accountId, id));
  }

  @Get('referrals')
  getReferrals(
    @CurrentUser('subject') accountId: string,
    @Query() query: CashbackListQueryDto,
  ) {
    return this.wrap(this.cashbackService.getReferrals(accountId, query));
  }

  @Get('balance-logs')
  listBalanceLogs(
    @CurrentUser('subject') accountId: string,
    @Query() query: CashbackListQueryDto,
  ) {
    return this.wrap(this.cashbackService.listBalanceLogs(accountId, query));
  }

  private async wrap(value: Promise<unknown>) {
    return createApiResponse(await value);
  }
}
