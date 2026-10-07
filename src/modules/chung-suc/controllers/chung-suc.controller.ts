import { Controller, Get, Post, Put, Delete, Body, Param, Query, Patch } from '@nestjs/common';
import { ChungSucService } from '../services/chung-suc.service';
import type { CreateCampaignDto, UpdateCampaignDto, JoinCampaignDto } from '../services/chung-suc.service';
import { ChungSucCampaign } from '../entities/chung-suc-campaign.entity';
import { ChungSucParticipant } from '../entities/chung-suc-participant.entity';

@Controller('v1/campaigns')
export class ChungSucController {
  constructor(private readonly chungSucService: ChungSucService) {}

  @Post()
  async createCampaign(@Body() dto: CreateCampaignDto): Promise<ChungSucCampaign> {
    return this.chungSucService.createCampaign(dto);
  }

  @Get()
  async findAllCampaigns(): Promise<ChungSucCampaign[]> {
    return this.chungSucService.findAll();
  }

  @Get('active')
  async findActiveCampaigns(): Promise<ChungSucCampaign[]> {
    return this.chungSucService.findActive();
  }

  @Get(':id')
  async findCampaignById(@Param('id') id: string): Promise<ChungSucCampaign> {
    return this.chungSucService.findById(id);
  }

  @Get('by-slug/:slug')
  async findCampaignBySlug(@Param('slug') slug: string): Promise<ChungSucCampaign> {
    return this.chungSucService.findBySlug(slug);
  }

  @Patch(':id')
  async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ): Promise<ChungSucCampaign> {
    return this.chungSucService.updateCampaign(id, dto);
  }

  @Post(':id/join')
  async joinCampaign(@Param('id') id: string, @Body() dto: JoinCampaignDto): Promise<ChungSucParticipant> {
    return this.chungSucService.joinCampaign({ ...dto, campaignId: id });
  }

  @Get(':id/participants')
  async getCampaignParticipants(@Param('id') id: string): Promise<ChungSucParticipant[]> {
    return this.chungSucService.getCampaignParticipants(id);
  }

  @Get(':id/progress')
  async getCampaignProgress(@Param('id') id: string) {
    return this.chungSucService.getCampaignProgress(id);
  }

  @Post(':id/activate')
  async activateCampaign(@Param('id') id: string): Promise<ChungSucCampaign> {
    return this.chungSucService.activateCampaign(id);
  }

  @Post(':id/pause')
  async pauseCampaign(@Param('id') id: string): Promise<ChungSucCampaign> {
    return this.chungSucService.pauseCampaign(id);
  }

  @Post(':id/end')
  async endCampaign(@Param('id') id: string): Promise<ChungSucCampaign> {
    return this.chungSucService.endCampaign(id);
  }

  @Post(':id/close')
  async closeCampaign(@Param('id') id: string): Promise<ChungSucCampaign> {
    return this.chungSucService.closeCampaign(id);
  }

  @Delete(':id')
  async deleteCampaign(@Param('id') id: string): Promise<void> {
    return this.chungSucService.deleteCampaign(id);
  }
}
