import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SellerProfile } from '../entities/seller-profile.entity';
import { SellerReferralCode } from '../entities/seller-referral-code.entity';
import { ReferralClick } from '../entities/referral-click.entity';
import { Account } from '../../identity/entities/account.entity';
import { SellerApprovalStatus } from '../enums/seller-approval-status.enum';
import { randomBytes } from 'crypto';

export interface CreateSellerProfileDto {
  accountId: string;
  businessName?: string;
  businessType?: string;
  taxId?: string;
  commissionRate?: number;
  metadata?: Record<string, any>;
}

export interface UpdateSellerProfileDto {
  businessName?: string;
  businessType?: string;
  taxId?: string;
  commissionRate?: number;
  metadata?: Record<string, any>;
}

export interface ApproveSellerDto {
  sellerId: string;
  approvedBy: string;
  commissionRate?: number;
}

export interface TrackReferralClickDto {
  code: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
}

@Injectable()
export class SellersService {
  private readonly logger = new Logger(SellersService.name);

  constructor(
    @InjectRepository(SellerProfile)
    private sellerRepo: Repository<SellerProfile>,
    @InjectRepository(SellerReferralCode)
    private referralCodeRepo: Repository<SellerReferralCode>,
    @InjectRepository(ReferralClick)
    private referralClickRepo: Repository<ReferralClick>,
    @InjectRepository(Account)
    private accountRepo: Repository<Account>,
    private dataSource: DataSource,
  ) {}

  async createProfile(dto: CreateSellerProfileDto): Promise<SellerProfile> {
    const account = await this.accountRepo.findOne({
      where: { id: dto.accountId },
      relations: { role: true },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID "${dto.accountId}" not found`);
    }

    const existing = await this.sellerRepo.findOne({
      where: { accountId: dto.accountId },
    });

    if (existing) {
      throw new BadRequestException('Seller profile already exists for this account');
    }

    if (dto.commissionRate !== undefined) {
      if (dto.commissionRate < 0 || dto.commissionRate > 100) {
        throw new BadRequestException('Commission rate must be between 0 and 100');
      }
    }

    const profile = this.sellerRepo.create({
      ...dto,
      commissionRate: dto.commissionRate?.toString(),
      approvalStatus: SellerApprovalStatus.PENDING,
    });

    return this.sellerRepo.save(profile);
  }

  async findAll(): Promise<SellerProfile[]> {
    return this.sellerRepo.find({
      relations: { account: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findByStatus(status: SellerApprovalStatus): Promise<SellerProfile[]> {
    return this.sellerRepo.find({
      where: { approvalStatus: status },
      relations: { account: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<SellerProfile> {
    const profile = await this.sellerRepo.findOne({
      where: { id },
      relations: { account: true },
    });

    if (!profile) {
      throw new NotFoundException(`Seller profile with ID "${id}" not found`);
    }

    return profile;
  }

  async findByAccountId(accountId: string): Promise<SellerProfile> {
    const profile = await this.sellerRepo.findOne({
      where: { accountId },
      relations: { account: true },
    });

    if (!profile) {
      throw new NotFoundException(`Seller profile not found for account "${accountId}"`);
    }

    return profile;
  }

  async update(id: string, dto: UpdateSellerProfileDto): Promise<SellerProfile> {
    const profile = await this.findById(id);

    if (dto.commissionRate !== undefined) {
      if (dto.commissionRate < 0 || dto.commissionRate > 100) {
        throw new BadRequestException('Commission rate must be between 0 and 100');
      }
    }

    Object.assign(profile, dto);
    return this.sellerRepo.save(profile);
  }

  async approve(dto: ApproveSellerDto): Promise<SellerProfile> {
    const profile = await this.findById(dto.sellerId);

    if (profile.approvalStatus === SellerApprovalStatus.APPROVED) {
      throw new BadRequestException('Seller is already approved');
    }

    const approver = await this.accountRepo.findOne({
      where: { id: dto.approvedBy },
    });

    if (!approver) {
      throw new NotFoundException(`Approver account with ID "${dto.approvedBy}" not found`);
    }

    profile.approvalStatus = SellerApprovalStatus.APPROVED;
    profile.approvedAt = new Date();
    profile.approvedBy = dto.approvedBy;

    if (dto.commissionRate !== undefined) {
      if (dto.commissionRate < 0 || dto.commissionRate > 100) {
        throw new BadRequestException('Commission rate must be between 0 and 100');
      }
      profile.commissionRate = dto.commissionRate.toString();
    }

    return this.sellerRepo.save(profile);
  }

  async reject(sellerId: string): Promise<SellerProfile> {
    const profile = await this.findById(sellerId);
    profile.approvalStatus = SellerApprovalStatus.REJECTED;
    return this.sellerRepo.save(profile);
  }

  async suspend(sellerId: string): Promise<SellerProfile> {
    const profile = await this.findById(sellerId);
    profile.approvalStatus = SellerApprovalStatus.SUSPENDED;
    return this.sellerRepo.save(profile);
  }

  async delete(id: string): Promise<void> {
    const profile = await this.findById(id);
    await this.sellerRepo.softRemove(profile);
  }

  async generateReferralCode(sellerId: string): Promise<SellerReferralCode> {
    const profile = await this.findById(sellerId);

    if (profile.approvalStatus !== SellerApprovalStatus.APPROVED) {
      throw new BadRequestException('Only approved sellers can generate referral codes');
    }

    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = `SELLER${randomBytes(4).toString('hex').toUpperCase()}`;
      const existing = await this.referralCodeRepo.findOne({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new BadRequestException('Failed to generate unique referral code');
    }

    const referralCode = this.referralCodeRepo.create({
      sellerId,
      code,
      isActive: true,
      usageCount: 0,
    });

    return this.referralCodeRepo.save(referralCode);
  }

  async getReferralCodes(sellerId: string): Promise<SellerReferralCode[]> {
    return this.referralCodeRepo.find({
      where: { sellerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findReferralCodeByCode(code: string): Promise<SellerReferralCode | null> {
    return this.referralCodeRepo.findOne({
      where: { code, isActive: true },
      relations: { seller: true },
    });
  }

  async trackReferralClick(dto: TrackReferralClickDto): Promise<ReferralClick> {
    const referralCode = await this.referralCodeRepo.findOne({
      where: { code: dto.code, isActive: true },
    });

    if (!referralCode) {
      throw new NotFoundException(`Active referral code "${dto.code}" not found`);
    }

    const click = this.referralClickRepo.create({
      referralCodeId: referralCode.id,
      sessionId: dto.sessionId,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
      referrer: dto.referrer,
      clickedAt: new Date(),
    });

    await this.referralClickRepo.save(click);

    referralCode.usageCount += 1;
    await this.referralCodeRepo.save(referralCode);

    return click;
  }

  async getReferralClicks(referralCodeId: string): Promise<ReferralClick[]> {
    return this.referralClickRepo.find({
      where: { referralCodeId },
      order: { clickedAt: 'DESC' },
    });
  }

  async getReferralStats(sellerId: string): Promise<{
    totalCodes: number;
    activeCodes: number;
    totalClicks: number;
    totalOrders: number;
  }> {
    const codes = await this.referralCodeRepo.find({
      where: { sellerId },
    });

    const activeCodes = codes.filter(c => c.isActive).length;
    const totalClicks = codes.reduce((sum, code) => sum + code.usageCount, 0);

    return {
      totalCodes: codes.length,
      activeCodes,
      totalClicks,
      totalOrders: 0,
    };
  }

  async deactivateReferralCode(codeId: string): Promise<SellerReferralCode> {
    const code = await this.referralCodeRepo.findOne({
      where: { id: codeId },
    });

    if (!code) {
      throw new NotFoundException(`Referral code with ID "${codeId}" not found`);
    }

    code.isActive = false;
    return this.referralCodeRepo.save(code);
  }

  async activateReferralCode(codeId: string): Promise<SellerReferralCode> {
    const code = await this.referralCodeRepo.findOne({
      where: { id: codeId },
    });

    if (!code) {
      throw new NotFoundException(`Referral code with ID "${codeId}" not found`);
    }

    code.isActive = true;
    return this.referralCodeRepo.save(code);
  }
}
