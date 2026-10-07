import { Controller, Get, Post, Put, Delete, Body, Param, Query, Patch } from '@nestjs/common';
import { SellersService } from '../services/sellers.service';
import type { CreateSellerProfileDto, UpdateSellerProfileDto, ApproveSellerDto, TrackReferralClickDto } from '../services/sellers.service';
import { SellerProfile } from '../entities/seller-profile.entity';
import { SellerReferralCode } from '../entities/seller-referral-code.entity';
import { ReferralClick } from '../entities/referral-click.entity';
import { SellerApprovalStatus } from '../enums/seller-approval-status.enum';

@Controller('v1/sellers')
export class SellersController {
  constructor(private readonly sellersService: SellersService) {}

  @Post('profiles')
  async createProfile(@Body() dto: CreateSellerProfileDto): Promise<SellerProfile> {
    return this.sellersService.createProfile(dto);
  }

  @Get('profiles')
  async findAllProfiles(@Query('status') status?: SellerApprovalStatus): Promise<SellerProfile[]> {
    if (status) {
      return this.sellersService.findByStatus(status);
    }
    return this.sellersService.findAll();
  }

  @Get('profiles/:id')
  async findProfileById(@Param('id') id: string): Promise<SellerProfile> {
    return this.sellersService.findById(id);
  }

  @Get('profiles/by-account/:accountId')
  async findProfileByAccountId(@Param('accountId') accountId: string): Promise<SellerProfile> {
    return this.sellersService.findByAccountId(accountId);
  }

  @Patch('profiles/:id')
  async updateProfile(@Param('id') id: string, @Body() dto: UpdateSellerProfileDto): Promise<SellerProfile> {
    return this.sellersService.update(id, dto);
  }

  @Post('profiles/:id/approve')
  async approveProfile(@Param('id') id: string, @Body() dto: Omit<ApproveSellerDto, 'sellerId'>): Promise<SellerProfile> {
    return this.sellersService.approve({ ...dto, sellerId: id });
  }

  @Post('profiles/:id/reject')
  async rejectProfile(@Param('id') id: string): Promise<SellerProfile> {
    return this.sellersService.reject(id);
  }

  @Post('profiles/:id/suspend')
  async suspendProfile(@Param('id') id: string): Promise<SellerProfile> {
    return this.sellersService.suspend(id);
  }

  @Delete('profiles/:id')
  async deleteProfile(@Param('id') id: string): Promise<void> {
    return this.sellersService.delete(id);
  }

  @Post('profiles/:id/referral-codes')
  async generateReferralCode(@Param('id') id: string): Promise<SellerReferralCode> {
    return this.sellersService.generateReferralCode(id);
  }

  @Get('profiles/:id/referral-codes')
  async getReferralCodes(@Param('id') id: string): Promise<SellerReferralCode[]> {
    return this.sellersService.getReferralCodes(id);
  }

  @Get('profiles/:id/stats')
  async getReferralStats(@Param('id') id: string) {
    return this.sellersService.getReferralStats(id);
  }

  @Post('referral-clicks')
  async trackReferralClick(@Body() dto: TrackReferralClickDto): Promise<ReferralClick> {
    return this.sellersService.trackReferralClick(dto);
  }

  @Get('referral-codes/:codeId/clicks')
  async getReferralClicks(@Param('codeId') codeId: string): Promise<ReferralClick[]> {
    return this.sellersService.getReferralClicks(codeId);
  }

  @Post('referral-codes/:codeId/deactivate')
  async deactivateReferralCode(@Param('codeId') codeId: string): Promise<SellerReferralCode> {
    return this.sellersService.deactivateReferralCode(codeId);
  }

  @Post('referral-codes/:codeId/activate')
  async activateReferralCode(@Param('codeId') codeId: string): Promise<SellerReferralCode> {
    return this.sellersService.activateReferralCode(codeId);
  }
}
