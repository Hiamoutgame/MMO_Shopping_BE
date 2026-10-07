import { Controller, Get, Post, Put, Delete, Body, Param, Query, Patch } from '@nestjs/common';
import { PackagesService } from '../services/packages.service';
import type { CreatePackageDto, UpdatePackageDto } from '../services/packages.service';
import { Package } from '../entities/package.entity';

@Controller('v1/packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  async create(@Body() dto: CreatePackageDto): Promise<Package> {
    return this.packagesService.create(dto);
  }

  @Get()
  async findAll(): Promise<Package[]> {
    return this.packagesService.findAll();
  }

  @Get('active')
  async findActive(@Query('roleCode') roleCode?: string): Promise<Package[]> {
    return this.packagesService.findActive(roleCode);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Package> {
    return this.packagesService.findById(id);
  }

  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<Package> {
    return this.packagesService.findBySlug(slug);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePackageDto): Promise<Package> {
    return this.packagesService.update(id, dto);
  }

  @Patch(':id/products')
  async updateProducts(
    @Param('id') id: string,
    @Body() products: Array<{ productId: string; quantity: number }>,
  ): Promise<Package> {
    return this.packagesService.updateProducts(id, products);
  }

  @Post(':id/activate')
  async activate(@Param('id') id: string): Promise<Package> {
    return this.packagesService.activate(id);
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string): Promise<Package> {
    return this.packagesService.deactivate(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return this.packagesService.delete(id);
  }
}
