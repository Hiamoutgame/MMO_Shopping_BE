import {
  Body,
  Controller,
  Delete,
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
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import { QueryAdminCategoryDto } from '../dto/query-category.dto';
import { QueryAdminProductDto } from '../dto/query-product.dto';
import { CreateVariantDto, UpdateVariantDto } from '../dto/variant.dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('admin')
@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ---- Categories ----

  @Get('categories')
  @ApiOperation({ summary: 'Admin liệt kê category' })
  async listCategories(@Query() query: QueryAdminCategoryDto) {
    return createApiResponse(
      await this.catalogService.listAdminCategories(query),
    );
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin tạo category' })
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.createCategory(dto, adminAccountId, ipAddress),
    );
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Admin xem category' })
  async getCategory(@Param('id') id: string) {
    return createApiResponse(await this.catalogService.getAdminCategory(id));
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Admin cập nhật category' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.updateCategory(
        id,
        dto,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Admin xóa category' })
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.deleteCategory(id, adminAccountId, ipAddress),
    );
  }

  // ---- Products ----

  @Get('products')
  @ApiOperation({ summary: 'Admin liệt kê product' })
  async listProducts(@Query() query: QueryAdminProductDto) {
    return createApiResponse(
      await this.catalogService.listAdminProducts(query),
    );
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin tạo product' })
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.createProduct(dto, adminAccountId, ipAddress),
    );
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Admin xem product' })
  async getProduct(@Param('id') id: string) {
    return createApiResponse(await this.catalogService.getAdminProduct(id));
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Admin cập nhật product' })
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.updateProduct(
        id,
        dto,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Admin xóa product' })
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.deleteProduct(id, adminAccountId, ipAddress),
    );
  }

  @Post('products/:id/variants')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin tạo variant' })
  async createVariant(
    @Param('id') productId: string,
    @Body() dto: CreateVariantDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.createVariant(
        productId,
        dto,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  // ---- Variants ----

  @Patch('variants/:id')
  @ApiOperation({ summary: 'Admin cập nhật variant' })
  async updateVariant(
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.updateVariant(
        id,
        dto,
        adminAccountId,
        ipAddress,
      ),
    );
  }

  @Delete('variants/:id')
  @ApiOperation({ summary: 'Admin xóa variant' })
  async deleteVariant(
    @Param('id') id: string,
    @CurrentUser('subject') adminAccountId: string,
    @Ip() ipAddress: string,
  ) {
    return createApiResponse(
      await this.catalogService.deleteVariant(id, adminAccountId, ipAddress),
    );
  }
}
