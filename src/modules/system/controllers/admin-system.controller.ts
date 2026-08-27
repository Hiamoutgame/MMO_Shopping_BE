import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { ReportQueryDto } from '../dto/report-query.dto';
import { SystemQueryService } from '../services/system-query.service';

@ApiTags('admin')
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminSystemController {
  constructor(private readonly systemQueryService: SystemQueryService) {}

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Admin dashboard overview' })
  async getDashboardOverview() {
    return createApiResponse(
      await this.systemQueryService.getDashboardOverview(),
    );
  }

  @Get('reports/summary')
  @ApiOperation({ summary: 'Admin summary report' })
  async getSummaryReport(@Query() query: ReportQueryDto) {
    return createApiResponse(
      await this.systemQueryService.getSummaryReport(query),
    );
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Admin audit log list' })
  async listAuditLogs(@Query() query: AuditLogQueryDto) {
    return createApiResponse(
      await this.systemQueryService.listAuditLogs(query),
    );
  }
}
