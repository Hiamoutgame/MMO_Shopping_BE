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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard';
import { createApiResponse } from '../../../common/utils/api-response';
import { AddCartItemDto, UpdateCartItemDto } from '../dto/cart-item.dto';
import { CreateFavoriteDto } from '../dto/favorite.dto';
import { CreateProductViewDto } from '../dto/product-view.dto';
import { ShoppingService } from '../services/shopping.service';

@ApiTags('shopping')
@Controller('api/v1')
export class ShoppingController {
  constructor(private readonly shoppingService: ShoppingService) {}

  @Get('cart')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current cart' })
  async getCart(@CurrentUser('subject') accountId: string) {
    return createApiResponse(await this.shoppingService.getCart(accountId));
  }

  @Post('cart/items')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add cart item' })
  async addCartItem(
    @CurrentUser('subject') accountId: string,
    @Body() dto: AddCartItemDto,
  ) {
    return createApiResponse(
      await this.shoppingService.addCartItem(accountId, dto),
    );
  }

  @Patch('cart/items/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update cart item' })
  async updateCartItem(
    @CurrentUser('subject') accountId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return createApiResponse(
      await this.shoppingService.updateCartItem(accountId, id, dto),
    );
  }

  @Delete('cart/items/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove cart item' })
  async removeCartItem(
    @CurrentUser('subject') accountId: string,
    @Param('id') id: string,
  ) {
    return createApiResponse(
      await this.shoppingService.removeCartItem(accountId, id),
    );
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List favorites' })
  async listFavorites(@CurrentUser('subject') accountId: string) {
    return createApiResponse(
      await this.shoppingService.listFavorites(accountId),
    );
  }

  @Post('favorites')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add favorite' })
  async addFavorite(
    @CurrentUser('subject') accountId: string,
    @Body() dto: CreateFavoriteDto,
  ) {
    return createApiResponse(
      await this.shoppingService.addFavorite(accountId, dto),
    );
  }

  @Delete('favorites/:productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove favorite' })
  async removeFavorite(
    @CurrentUser('subject') accountId: string,
    @Param('productId') productId: string,
  ) {
    return createApiResponse(
      await this.shoppingService.removeFavorite(accountId, productId),
    );
  }

  @Post('product-views')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Record product view' })
  async recordProductView(
    @Body() dto: CreateProductViewDto,
    @CurrentUser('subject') accountId?: string,
  ) {
    return createApiResponse(
      await this.shoppingService.recordProductView(dto, accountId),
    );
  }
}
