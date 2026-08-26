import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createApiResponse } from '../../../common/utils/api-response';
import { QueryCategoryDto } from '../dto/query-category.dto';
import { QueryProductDto } from '../dto/query-product.dto';
import { CatalogService } from '../services/catalog.service';

@ApiTags('catalog')
@Controller('api/v1')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Danh sách category public' })
  async listCategories(@Query() query: QueryCategoryDto) {
    return createApiResponse(
      await this.catalogService.listPublicCategories(query),
    );
  }

  @Get('products')
  @ApiOperation({ summary: 'Danh sách sản phẩm public' })
  async listProducts(@Query() query: QueryProductDto) {
    return createApiResponse(
      await this.catalogService.listPublicProducts(query),
    );
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Chi tiết sản phẩm public' })
  async getProduct(@Param('id') id: string) {
    return createApiResponse({
      product: await this.catalogService.getPublicProduct(id),
    });
  }
}
