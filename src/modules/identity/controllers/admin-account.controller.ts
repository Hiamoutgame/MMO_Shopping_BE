import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { CreateAccountDto } from '../dto/create-account.dto';
import { QueryAccountDto } from '../dto/query-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { AccountService } from '../services/account.service';

@ApiTags('admin')
@Controller('api/v1/admin/accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminAccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Admin liệt kê account' })
  async findAll(@Query() query: QueryAccountDto) {
    const data = await this.accountService.findAll(query);
    return createApiResponse(data);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin tạo account' })
  async create(@Body() dto: CreateAccountDto) {
    const account = await this.accountService.create(dto);
    return createApiResponse({ account });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin xem account' })
  async findOne(@Param('id') id: string) {
    const account = await this.accountService.findById(id);
    return createApiResponse({ account });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin cập nhật account' })
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    const account = await this.accountService.update(id, dto);
    return createApiResponse({ account });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Admin xóa mềm account' })
  async remove(@Param('id') id: string) {
    const result = await this.accountService.softDelete(id);
    return createApiResponse(result);
  }
}
