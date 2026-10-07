import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ChungSucCampaign } from '../entities/chung-suc-campaign.entity';
import { ChungSucParticipant } from '../entities/chung-suc-participant.entity';
import { Product } from '../../catalog/entities/product.entity';
import { Account } from '../../identity/entities/account.entity';
import { Order } from '../../commerce/entities/order.entity';
import { CampaignStatus } from '../enums/campaign-status.enum';

export interface CreateCampaignDto {
  seasonId?: string;
  productId: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  targetQuantity: number;
  startTime: Date;
  endTime: Date;
  completionConditions?: Record<string, any>;
  rewards?: Record<string, any>;
}

export interface UpdateCampaignDto {
  name?: string;
  description?: string;
  imageUrl?: string;
  targetQuantity?: number;
  startTime?: Date;
  endTime?: Date;
  status?: CampaignStatus;
  completionConditions?: Record<string, any>;
  rewards?: Record<string, any>;
}

export interface JoinCampaignDto {
  campaignId: string;
  accountId: string;
  orderId?: string;
  quantity: number;
  inviteCode?: string;
  metadata?: Record<string, any>;
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
    @InjectRepository(Account)
    private accountRepo: Repository<Account>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private dataSource: DataSource,
  ) {}

  async createCampaign(dto: CreateCampaignDto): Promise<ChungSucCampaign> {
    const product = await this.productRepo.findOne({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${dto.productId}" not found`);
    }

    const existing = await this.campaignRepo.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException(`Campaign with slug "${dto.slug}" already exists`);
    }

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (dto.targetQuantity <= 0) {
      throw new BadRequestException('Target quantity must be greater than 0');
    }

    const campaign = this.campaignRepo.create({
      ...dto,
      currentQuantity: 0,
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

  async updateCampaign(id: string, dto: UpdateCampaignDto): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);

    if (dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    if (dto.targetQuantity !== undefined && dto.targetQuantity <= 0) {
      throw new BadRequestException('Target quantity must be greater than 0');
    }

    Object.assign(campaign, dto);
    return this.campaignRepo.save(campaign);
  }

  async joinCampaign(dto: JoinCampaignDto): Promise<ChungSucParticipant> {
    return this.dataSource.transaction(async (manager) => {
      const campaign = await manager.findOne(ChungSucCampaign, {
        where: { id: dto.campaignId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!campaign) {
        throw new NotFoundException(`Campaign with ID "${dto.campaignId}" not found`);
      }

      if (campaign.status !== CampaignStatus.ACTIVE) {
        throw new BadRequestException('Campaign is not active');
      }

      const now = new Date();
      if (now < campaign.startTime || now > campaign.endTime) {
        throw new BadRequestException('Campaign is not currently running');
      }

      const account = await manager.findOne(Account, {
        where: { id: dto.accountId },
      });

      if (!account) {
        throw new NotFoundException(`Account with ID "${dto.accountId}" not found`);
      }

      if (dto.orderId) {
        const order = await manager.findOne(Order, {
          where: { id: dto.orderId },
        });

        if (!order) {
          throw new NotFoundException(`Order with ID "${dto.orderId}" not found`);
        }

        if (order.accountId !== dto.accountId) {
          throw new BadRequestException('Order does not belong to this account');
        }
      }

      const participant = manager.create(ChungSucParticipant, {
        campaignId: dto.campaignId,
        accountId: dto.accountId,
        orderId: dto.orderId,
        quantity: dto.quantity,
        inviteCode: dto.inviteCode,
        metadata: dto.metadata,
        joinedAt: new Date(),
      });

      await manager.save(ChungSucParticipant, participant);

      campaign.currentQuantity += dto.quantity;

      if (campaign.currentQuantity >= campaign.targetQuantity) {
        campaign.status = CampaignStatus.COMPLETED;
        this.logger.log(`Campaign "${campaign.name}" (${campaign.id}) reached target quantity`);
      }

      await manager.save(ChungSucCampaign, campaign);

      return participant;
    });
  }

  async getCampaignParticipants(campaignId: string): Promise<ChungSucParticipant[]> {
    return this.participantRepo.find({
      where: { campaignId },
      relations: { account: true, order: true },
      order: { joinedAt: 'DESC' },
    });
  }

  async getCampaignProgress(campaignId: string): Promise<{
    campaign: ChungSucCampaign;
    progress: number;
    participantCount: number;
    totalQuantity: number;
  }> {
    const campaign = await this.findById(campaignId);

    const participantCount = await this.participantRepo.count({
      where: { campaignId },
    });

    const progress = (campaign.currentQuantity / campaign.targetQuantity) * 100;

    return {
      campaign,
      progress: Math.min(progress, 100),
      participantCount,
      totalQuantity: campaign.currentQuantity,
    };
  }

  async activateCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    const now = new Date();

    if (now < campaign.startTime) {
      campaign.status = CampaignStatus.UPCOMING;
    } else if (now >= campaign.startTime && now <= campaign.endTime) {
      campaign.status = CampaignStatus.ACTIVE;
    } else {
      throw new BadRequestException('Cannot activate a campaign that has already ended');
    }

    return this.campaignRepo.save(campaign);
  }

  async pauseCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    campaign.status = CampaignStatus.PAUSED;
    return this.campaignRepo.save(campaign);
  }

  async endCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
    campaign.status = CampaignStatus.ENDED;
    return this.campaignRepo.save(campaign);
  }

  async closeCampaign(id: string): Promise<ChungSucCampaign> {
    const campaign = await this.findById(id);
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
        this.logger.log(`Campaign "${campaign.name}" (${campaign.id}) activated`);
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
