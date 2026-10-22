import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import {
  CreateCampaignDto,
  JoinCampaignDto,
  UpdateCampaignDto,
} from '../dto/campaign.dto';
import { ChungSucService } from '../services/chung-suc.service';

@ApiTags('Chung Suc')
@Controller('v1/campaigns')
export class ChungSucController {
  constructor(private readonly chungSucService: ChungSucService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin tạo campaign' })
  async createCampaign(@Body() dto: CreateCampaignDto) {
    const campaign = await this.chungSucService.createCampaign(dto);
    return createApiResponse(campaign);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách campaign' })
  async findAllCampaigns() {
    const campaigns = await this.chungSucService.findAll();
    return createApiResponse(campaigns);
  }

  @Get('active')
  @ApiOperation({ summary: 'Danh sách campaign đang chạy' })
  async findActiveCampaigns() {
    const campaigns = await this.chungSucService.findActive();
    return createApiResponse(campaigns);
  }

  @Get('variants')
  @ApiOperation({ summary: 'Preset luật của các biến thể sự kiện' })
  getVariantPresets() {
    return createApiResponse(this.chungSucService.getVariantPresets());
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Chi tiết campaign theo slug' })
  async findCampaignBySlug(@Param('slug') slug: string) {
    const campaign = await this.chungSucService.findBySlug(slug);
    return createApiResponse(campaign);
  }

  @Get('requests/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yêu cầu tiếp sức của tôi' })
  async listMyRequests(@CurrentUser('subject') accountId: string) {
    const requests = await this.chungSucService.listMyRequests(accountId);
    return createApiResponse(requests);
  }

  @Post('requests/:requestId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User hủy yêu cầu đang chờ xử lý' })
  async cancelRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser('subject') accountId: string,
  ) {
    const request = await this.chungSucService.cancelRequest(
      requestId,
      accountId,
    );
    return createApiResponse(request);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết campaign' })
  async findCampaignById(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.chungSucService.findById(id);
    return createApiResponse(campaign);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin cập nhật campaign' })
  async updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    const campaign = await this.chungSucService.updateCampaign(id, dto);
    return createApiResponse(campaign);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User tham gia campaign' })
  async joinCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JoinCampaignDto,
    @CurrentUser('subject') accountId: string,
  ) {
    const participant = await this.chungSucService.joinCampaign(
      id,
      accountId,
      dto,
    );
    return createApiResponse(participant);
  }

  @Get(':id/participants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin xem người tham gia campaign' })
  async getCampaignParticipants(@Param('id', ParseUUIDPipe) id: string) {
    const participants = await this.chungSucService.getCampaignParticipants(id);
    return createApiResponse(participants);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Tiến độ campaign' })
  async getCampaignProgress(@Param('id', ParseUUIDPipe) id: string) {
    const progress = await this.chungSucService.getCampaignProgress(id);
    return createApiResponse(progress);
  }

  @Post(':id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin kích hoạt campaign' })
  async activateCampaign(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.chungSucService.activateCampaign(id);
    return createApiResponse(campaign);
  }

  @Post(':id/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin bật/tắt campaign bằng một click' })
  async toggleCampaign(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.chungSucService.toggleCampaign(id);
    return createApiResponse(campaign);
  }

  @Post(':id/pause')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin tạm dừng campaign' })
  async pauseCampaign(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.chungSucService.pauseCampaign(id);
    return createApiResponse(campaign);
  }

  @Post(':id/end')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin kết thúc campaign' })
  async endCampaign(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.chungSucService.endCampaign(id);
    return createApiResponse(campaign);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin đóng campaign' })
  async closeCampaign(@Param('id', ParseUUIDPipe) id: string) {
    const campaign = await this.chungSucService.closeCampaign(id);
    return createApiResponse(campaign);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin xoá mềm campaign' })
  async deleteCampaign(@Param('id', ParseUUIDPipe) id: string) {
    await this.chungSucService.deleteCampaign(id);
    return createApiResponse({ id });
  }
}
