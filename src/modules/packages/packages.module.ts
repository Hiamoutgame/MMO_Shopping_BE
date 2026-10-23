import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package } from './entities/package.entity';
import { PackageProduct } from './entities/package-product.entity';
import { PackagesService } from './services/packages.service';
import { PackagesController } from './controllers/packages.controller';
import { Product } from '../catalog/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Package, PackageProduct, Product])],
  providers: [PackagesService],
  controllers: [PackagesController],
  exports: [PackagesService],
})
export class PackagesModule {}
