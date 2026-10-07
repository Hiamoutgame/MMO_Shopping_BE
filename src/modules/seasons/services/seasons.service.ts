import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Season } from '../entities/season.entity';
import { SeasonStatus } from '../enums/season-status.enum';

export interface CreateSeasonDto {
  name: string;
  slug: string;
  description?: string;
  bannerUrl?: string;
  startDate: Date;
  endDate: Date;
  status?: SeasonStatus;
  metadata?: Record<string, any>;
}

export interface UpdateSeasonDto {
  name?: string;
  description?: string;
  bannerUrl?: string;
  startDate?: Date;
  endDate?: Date;
  status?: SeasonStatus;
  metadata?: Record<string, any>;
}

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    @InjectRepository(Season)
    private seasonRepo: Repository<Season>,
  ) {}

  async create(dto: CreateSeasonDto): Promise<Season> {
    const existing = await this.seasonRepo.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException(`Season with slug "${dto.slug}" already exists`);
    }

    if (dto.startDate >= dto.endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    const season = this.seasonRepo.create({
      ...dto,
      status: dto.status || SeasonStatus.DRAFT,
    });

    return this.seasonRepo.save(season);
  }

  async findAll(): Promise<Season[]> {
    return this.seasonRepo.find({
      order: { startDate: 'DESC' },
    });
  }

  async findActive(): Promise<Season[]> {
    const now = new Date();
    return this.seasonRepo
      .createQueryBuilder('season')
      .where('season.status = :status', { status: SeasonStatus.ACTIVE })
      .andWhere('season.startDate <= :now', { now })
      .andWhere('season.endDate >= :now', { now })
      .orderBy('season.startDate', 'DESC')
      .getMany();
  }

  async findById(id: string): Promise<Season> {
    const season = await this.seasonRepo.findOne({ where: { id } });
    if (!season) {
      throw new NotFoundException(`Season with ID "${id}" not found`);
    }
    return season;
  }

  async findBySlug(slug: string): Promise<Season> {
    const season = await this.seasonRepo.findOne({ where: { slug } });
    if (!season) {
      throw new NotFoundException(`Season with slug "${slug}" not found`);
    }
    return season;
  }

  async update(id: string, dto: UpdateSeasonDto): Promise<Season> {
    const season = await this.findById(id);

    if (dto.startDate && dto.endDate && dto.startDate >= dto.endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    Object.assign(season, dto);
    return this.seasonRepo.save(season);
  }

  async activate(id: string): Promise<Season> {
    const season = await this.findById(id);
    const now = new Date();

    if (now < season.startDate) {
      season.status = SeasonStatus.UPCOMING;
    } else if (now >= season.startDate && now <= season.endDate) {
      season.status = SeasonStatus.ACTIVE;
    } else {
      throw new BadRequestException('Cannot activate a season that has already ended');
    }

    return this.seasonRepo.save(season);
  }

  async pause(id: string): Promise<Season> {
    const season = await this.findById(id);
    season.status = SeasonStatus.PAUSED;
    return this.seasonRepo.save(season);
  }

  async end(id: string): Promise<Season> {
    const season = await this.findById(id);
    season.status = SeasonStatus.ENDED;
    return this.seasonRepo.save(season);
  }

  async archive(id: string): Promise<Season> {
    const season = await this.findById(id);
    season.status = SeasonStatus.ARCHIVED;
    return this.seasonRepo.save(season);
  }

  async delete(id: string): Promise<void> {
    const season = await this.findById(id);
    await this.seasonRepo.softRemove(season);
  }

  async checkAndUpdateStatuses(): Promise<void> {
    const now = new Date();

    const upcomingSeasons = await this.seasonRepo
      .createQueryBuilder('season')
      .where('season.status = :status', { status: SeasonStatus.UPCOMING })
      .andWhere('season.startDate <= :now', { now })
      .getMany();

    for (const season of upcomingSeasons) {
      if (now <= season.endDate) {
        season.status = SeasonStatus.ACTIVE;
        await this.seasonRepo.save(season);
        this.logger.log(`Season "${season.name}" (${season.id}) activated`);
      }
    }

    const activeSeasons = await this.seasonRepo
      .createQueryBuilder('season')
      .where('season.status = :status', { status: SeasonStatus.ACTIVE })
      .andWhere('season.endDate < :now', { now })
      .getMany();

    for (const season of activeSeasons) {
      season.status = SeasonStatus.ENDED;
      await this.seasonRepo.save(season);
      this.logger.log(`Season "${season.name}" (${season.id}) ended`);
    }
  }
}
