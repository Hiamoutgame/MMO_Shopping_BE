import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { RoleService } from '../services/role.service';

@ApiTags('admin')
@Controller('api/v1/admin/roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminRoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @ApiOperation({ summary: 'Admin liệt kê role' })
  async findAll() {
    const roles = await this.roleService.findAll();
    const sanitizedRoles = roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
    }));
    return createApiResponse({ roles: sanitizedRoles });
  }
}
