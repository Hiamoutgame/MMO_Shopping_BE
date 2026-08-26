import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoService } from '../../common/crypto/crypto.service';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { SystemModule } from '../system/system.module';
import { AdminInventoryController } from './controllers/admin-inventory.controller';
import { InventoryItem } from './entities/inventory-item.entity';
import { InventoryService } from './services/inventory.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem]),
    CatalogModule,
    IdentityModule,
    SystemModule,
  ],
  controllers: [AdminInventoryController],
  providers: [InventoryService, CryptoService],
  exports: [TypeOrmModule, InventoryService],
})
export class InventoryModule {}
