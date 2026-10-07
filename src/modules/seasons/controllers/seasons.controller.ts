import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ValidationPipe, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SeasonsService } from '../services/seasons.service';
import type { CreateSeasonDto, UpdateSeasonDto } from '../services/seasons.service';
import { Season } from '../entities/season.entity';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminOnly, AllRoles } from '../../../common/decorators/roles.decorator';

@ApiTags('Seasons')
@Controller('v1/seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new season (Admin only)' })
  @ApiResponse({ status: 201, description: 'Season created successfully' })
  async create(@Body(ValidationPipe) dto: CreateSeasonDto): Promise<Season> {
    return this.seasonsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all seasons' })
  @ApiResponse({ status: 200, description: 'List of all seasons' })
  async findAll(): Promise<Season[]> {
    return this.seasonsService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active seasons' })
  @ApiResponse({ status: 200, description: 'List of active seasons' })
  async findActive(): Promise<Season[]> {
    return this.seasonsService.findActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get season by ID' })
  @ApiResponse({ status: 200, description: 'Season found' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async findById(@Param('id') id: string): Promise<Season> {
    return this.seasonsService.findById(id);
  }

  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Get season by slug' })
  @ApiResponse({ status: 200, description: 'Season found' })
  @ApiResponse({ status: 404, description: 'Season not found' })
  async findBySlug(@Param('slug') slug: string): Promise<Season> {
    return this.seasonsService.findBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update season (Admin only)' })
  @ApiResponse({ status: 200, description: 'Season updated successfully' })
  async update(@Param('id') id: string, @Body(ValidationPipe) dto: UpdateSeasonDto): Promise<Season> {
    return this.seasonsService.update(id, dto);
  }

  @Post(':id/activate')
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate season (Admin only)' })
  async activate(@Param('id') id: string): Promise<Season> {
    return this.seasonsService.activate(id);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pause season (Admin only)' })
  async pause(@Param('id') id: string): Promise<Season> {
    return this.seasonsService.pause(id);
  }

  @Post(':id/end')
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End season (Admin only)' })
  async end(@Param('id') id: string): Promise<Season> {
    return this.seasonsService.end(id);
  }

  @Post(':id/archive')
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive season (Admin only)' })
  async archive(@Param('id') id: string): Promise<Season> {
    return this.seasonsService.archive(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @AdminOnly()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete season (Admin only)' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.seasonsService.delete(id);
  }
}
