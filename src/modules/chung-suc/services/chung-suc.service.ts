import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { formatMoney, money } from '../../../common/utils/money';
import { ChungSucCampaign } from '../entities/chung-suc-campaign.entity';
import { ChungSucParticipant } from '../entities/chung-suc-participant.entity';
import { Product } from '../../catalog/entities/product.entity';
import { PriceEngineService } from '../../pricing/services/price-engine.service';
import { CampaignStatus } from '../enums/campaign-status.enum';
import {
  OPEN_PARTICIPANT_STATUSES,
  ParticipantStatus,
} from '../enums/participant-status.enum';
import {
  CreateCampaignDto,
  JoinCampaignDto,
  UpdateCampaignDto,
} from '../dto/campaign.dto';

type LifecycleAction = 'activate' | 'pause' | 'end' | 'close';

// Trạng thái được phép thực hiện từng action. COMPLETED và CLOSED không quay lại được.
const ALLOWED_FROM: Record<LifecycleAction, CampaignStatus[]> = {
  activate: [
    CampaignStatus.DRAFT,
    CampaignStatus.UPCOMING,
    CampaignStatus.PAUSED,
  ],
  pause: [CampaignStatus.UPCOMING, CampaignStatus.ACTIVE],
  end: [CampaignStatus.UPCOMING, CampaignStatus.ACTIVE, CampaignStatus.PAUSED],
  close: [
    CampaignStatus.DRAFT,
    CampaignStatus.UPCOMING,
    CampaignStatus.ACTIVE,
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.ENDED,
  ],
};

// Mã mời không bao giờ rời server ở dạng đầy đủ, hash hay bản mã hóa.
export interface ParticipantView {
  id: string;
  campaignId: string;
  accountId: string;
  orderId: string | null;
  inviteCodeMasked: string;
  quantity: number;
  status: ParticipantStatus;
  unitPrice: string;
  currency: string;
  joinedAt: Date;
  cancelledAt: Date | null;
}

export interface MyRequestView extends ParticipantView {
  campaign: { id: string; name: string; slug: string } | null;
}

export interface CampaignParticipantView extends ParticipantView {
  account: { id: string; email: string; name: string } | null;
}

@Injectable()
export class ChungSucService {
  private readonly logger = new Logger(ChungSucService.name);

  constructor(
    @InjectRepository(ChungSucCampaign)
    private campaignRepo: Repository<ChungSucCampaign>,
    @InjectRepository(ChungSucParticipant)
    private participantRepo: Repository<ChungSucParticipant>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    private priceEngine: PriceEngineService,
    private cryptoService: CryptoService,
  ) {}

  async createCampaign(dto: CreateCampaignDto): Promise<ChungSucCampaign> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException(
        `Product with ID "${dto.productId}" not found`,
      );
    }

    const existing = await this.campaignRepo.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException(
        `Campaign with slug "${dto.slug}" already exists`,
      );
    }

    const campaign = this.campaignRepo.create({
      seasonId: dto.seasonId,
      productId: dto.productId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      targetQuantity: dto.targetQuantity,
      startTime,
      endTime,
      completionConditions: dto.completionConditions,
      rewards: dto.rewards,
      status: CampaignStatus.DRAFT,
    });

    return this.campaignRepo.save(campaign);
  }

  async findAll(): Promise<ChungSucCampaign[]> {
    return this.campaignRepo.find({
      relations: { product: true, season: true },
      order: { startTime: 'DESC' },
    });
  }

  async findActive(): Promise<ChungSucCampaign[]> {
    const now = new Date();
    return this.campaignRepo
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.product', 'product')
      .leftJoinAndSelect('campaign.season', 'season')
      .where('campaign.status = :status', { status: CampaignStatus.ACTIVE })
      .andWhere('campaign.startTime <= :now', { now })
      .andWhere('campaign.endTime >= :now', { now })
      .orderBy('campaign.startTime', 'DESC')
      .getMany();
  }

  async findById(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.campaignRepo.findOne({
      where: { id },
      relations: { product: true, season: true },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${id}" not found`);
    }

    return campaign;
  }

  async findBySlug(slug: string): Promise<ChungSucCampaign> {
    const campaign = await this.campaignRepo.findOne({
      where: { slug },
      relations: { product: true, season: true },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with slug "${slug}" not found`);
    }

    return campaign;
  }

  async updateCampaign(
    id: string,
    dto: UpdateCampaignDto,
  ): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);

    const startTime = dto.startTime
      ? new Date(dto.startTime)
      : campaign.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : campaign.endTime;

    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.description !== undefined) campaign.description = dto.description;
    if (dto.imageUrl !== undefined) campaign.imageUrl = dto.imageUrl;
    if (dto.targetQuantity !== undefined)
      campaign.targetQuantity = dto.targetQuantity;
    if (dto.completionConditions !== undefined) {
      campaign.completionConditions = dto.completionConditions;
    }
    if (dto.rewards !== undefined) campaign.rewards = dto.rewards;
    campaign.startTime = startTime;
    campaign.endTime = endTime;

    return this.campaignRepo.save(campaign);
  }

  async joinCampaign(
    campaignId: string,
    accountId: string,
    dto: JoinCampaignDto,
  ): Promise<ParticipantView> {
    if (dto.accountId && dto.accountId !== accountId) {
      throw new ForbiddenException(
        'Cannot join a campaign on behalf of another account',
      );
    }

    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${campaignId}" not found`);
    }

    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException('Campaign is not active');
    }

    const now = new Date();
    if (now < campaign.startTime || now > campaign.endTime) {
      throw new BadRequestException('Campaign is not currently running');
    }

    if (dto.quantity > campaign.targetQuantity) {
      throw new BadRequestException(
        `Quantity exceeds the maximum of ${campaign.targetQuantity} per invite code`,
      );
    }

    const codeHash = this.cryptoService.hashLookup(dto.inviteCode);
    await this.assertCodeNotOpen(campaignId, codeHash);

    const price = await this.priceEngine.calculatePrice({
      productId: campaign.productId,
      accountId,
      quantity: dto.quantity,
      seasonId: campaign.seasonId ?? undefined,
    });
    if (money(price.finalPrice).lte(0)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Chiến dịch chưa được cấu hình giá.',
        errorCode: 'CAMPAIGN_PRICE_NOT_SET',
      });
    }

    try {
      const participant = await this.participantRepo.save(
        this.participantRepo.create({
          campaignId,
          accountId,
          codeHash,
          encryptedCode: this.cryptoService.encryptJson(dto.inviteCode),
          quantity: dto.quantity,
          status: ParticipantStatus.PENDING,
          unitPrice: formatMoney(price.finalPrice),
          currency: 'VND',
          joinedAt: now,
        }),
      );
      return this.toParticipantView(participant);
    } catch (error) {
      // Hai request cùng mã chạy song song: unique index chặn request đến sau.
      if (this.isUniqueViolation(error)) {
        throw this.codeAlreadyOpen();
      }
      throw error;
    }
  }

  async listMyRequests(accountId: string): Promise<MyRequestView[]> {
    const participants = await this.participantRepo.find({
      where: { accountId },
      relations: { campaign: true },
      order: { joinedAt: 'DESC' },
      take: 50,
    });

    return participants.map((participant) => ({
      ...this.toParticipantView(participant),
      campaign: participant.campaign
        ? {
            id: participant.campaign.id,
            name: participant.campaign.name,
            slug: participant.campaign.slug,
          }
        : null,
    }));
  }

  async cancelRequest(
    requestId: string,
    accountId: string,
  ): Promise<ParticipantView> {
    // Update có điều kiện để không hủy đè lên một yêu cầu vừa được xử lý.
    const result = await this.participantRepo.update(
      { id: requestId, accountId, status: ParticipantStatus.PENDING },
      { status: ParticipantStatus.CANCELLED, cancelledAt: new Date() },
    );

    const participant = await this.participantRepo.findOne({
      where: { id: requestId, accountId },
    });
    if (!participant) {
      throw new NotFoundException(`Request with ID "${requestId}" not found`);
    }
    if (!result.affected) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Chỉ hủy được yêu cầu đang chờ xử lý.',
        errorCode: 'REQUEST_NOT_CANCELLABLE',
      });
    }

    return this.toParticipantView(participant);
  }

  async getCampaignParticipants(
    campaignId: string,
  ): Promise<CampaignParticipantView[]> {
    await this.findById(campaignId);

    const participants = await this.participantRepo.find({
      where: { campaignId },
      relations: { account: true },
      order: { joinedAt: 'DESC' },
    });

    // Không trả nguyên entity Account (có passwordHash).
    return participants.map((participant) => ({
      ...this.toParticipantView(participant),
      account: participant.account
        ? {
            id: participant.account.id,
            email: participant.account.email,
            name: participant.account.name,
          }
        : null,
    }));
  }

  async getCampaignProgress(campaignId: string): Promise<{
    campaign: ChungSucCampaign;
    participantCount: number;
    totalQuantity: number;
  }> {
    const campaign = await this.findById(campaignId);

    const active = { campaignId, status: Not(ParticipantStatus.CANCELLED) };
    const participantCount = await this.participantRepo.count({
      where: active,
    });
    const totalQuantity = await this.participantRepo.sum('quantity', active);

    return {
      campaign,
      participantCount,
      totalQuantity: totalQuantity ?? 0,
    };
  }

  private async assertCodeNotOpen(
    campaignId: string,
    codeHash: string,
  ): Promise<void> {
    const open = await this.participantRepo.findOne({
      where: { campaignId, codeHash, status: In(OPEN_PARTICIPANT_STATUSES) },
    });
    if (open) {
      throw this.codeAlreadyOpen();
    }
  }

  private codeAlreadyOpen(): ConflictException {
    return new ConflictException({
      success: false,
      data: null,
      message: 'Mã mời này đang có một yêu cầu chưa hoàn tất.',
      errorCode: 'INVITE_CODE_ALREADY_PENDING',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    const candidate = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return (
      candidate?.code === '23505' || candidate?.driverError?.code === '23505'
    );
  }

  private toParticipantView(participant: ChungSucParticipant): ParticipantView {
    const code = this.cryptoService.decryptJson<string>(
      participant.encryptedCode,
    );
    return {
      id: participant.id,
      campaignId: participant.campaignId,
      accountId: participant.accountId,
      orderId: participant.orderId ?? null,
      inviteCodeMasked: `••••${code.length > 4 ? code.slice(-4) : ''}`,
      quantity: participant.quantity,
      status: participant.status,
      unitPrice: participant.unitPrice,
      currency: participant.currency,
      joinedAt: participant.joinedAt,
      cancelledAt: participant.cancelledAt ?? null,
    };
  }

  private assertTransition(
    campaign: ChungSucCampaign,
    action: LifecycleAction,
  ): void {
    if (!ALLOWED_FROM[action].includes(campaign.status)) {
      throw new BadRequestException(
        `Cannot ${action} a campaign in status ${campaign.status}`,
      );
    }
  }

  async activateCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    this.assertTransition(campaign, 'activate');
    const now = new Date();

    if (now < campaign.startTime) {
      campaign.status = CampaignStatus.UPCOMING;
    } else if (now >= campaign.startTime && now <= campaign.endTime) {
      campaign.status = CampaignStatus.ACTIVE;
    } else {
      throw new BadRequestException(
        'Cannot activate a campaign that has already ended',
      );
    }

    return this.campaignRepo.save(campaign);
  }

  async pauseCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    this.assertTransition(campaign, 'pause');
    campaign.status = CampaignStatus.PAUSED;
    return this.campaignRepo.save(campaign);
  }

  async endCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    this.assertTransition(campaign, 'end');
    campaign.status = CampaignStatus.ENDED;
    return this.campaignRepo.save(campaign);
  }

  async closeCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    this.assertTransition(campaign, 'close');
    campaign.status = CampaignStatus.CLOSED;
    return this.campaignRepo.save(campaign);
  }

  async deleteCampaign(id: string): Promise<void> {
    const campaign = await this.findById(id);
    await this.campaignRepo.softRemove(campaign);
  }

  async checkAndUpdateStatuses(): Promise<void> {
    const now = new Date();

    const upcomingCampaigns = await this.campaignRepo
      .createQueryBuilder('campaign')
      .where('campaign.status = :status', { status: CampaignStatus.UPCOMING })
      .andWhere('campaign.startTime <= :now', { now })
      .getMany();

    for (const campaign of upcomingCampaigns) {
      if (now <= campaign.endTime) {
        campaign.status = CampaignStatus.ACTIVE;
        await this.campaignRepo.save(campaign);
        this.logger.log(
          `Campaign "${campaign.name}" (${campaign.id}) activated`,
        );
      }
    }

    const activeCampaigns = await this.campaignRepo
      .createQueryBuilder('campaign')
      .where('campaign.status = :status', { status: CampaignStatus.ACTIVE })
      .andWhere('campaign.endTime < :now', { now })
      .getMany();

    for (const campaign of activeCampaigns) {
      campaign.status = CampaignStatus.ENDED;
      await this.campaignRepo.save(campaign);
      this.logger.log(`Campaign "${campaign.name}" (${campaign.id}) ended`);
    }
  }
}
