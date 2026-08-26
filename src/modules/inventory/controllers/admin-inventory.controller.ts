import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { CreateInventoryItemDto } from '../dto/create-inventory-item.dto';
import { QueryInventoryItemsDto } from '../dto/query-inventory-items.dto';
import { UpdateInventoryItemDto } from '../dto/update-inventory-item.dto';
import { InventoryService } from '../services/inventory.service';

@ApiTags('admin')
@Controller('api/v1/admin/inventory-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Admin list inventory' })
  async findAll(@Query() query: QueryInventoryItemsDto) {
    return createApiResponse(await this.inventoryService.findAll(query));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin create inventory item' })
  async create(
    @Body() dto: CreateInventoryItemDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.inventoryService.create(dto, adminAccountId, ipAddress),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin get inventory item' })
  async findOne(@Param('id') id: string) {
    return createApiResponse(await this.inventoryService.findOne(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin update inventory item' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.inventoryService.update(id, dto, adminAccountId, ipAddress),
    );
  }
}
