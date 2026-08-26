import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModule } from '../finance/finance.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShoppingModule } from '../shopping/shopping.module';
import { SystemModule } from '../system/system.module';
import {
  AdminCommerceController,
  CommerceController,
} from './controllers/commerce.controller';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { VoucherRedemption } from './entities/voucher-redemption.entity';
import { Voucher } from './entities/voucher.entity';
import { CommerceService } from './services/commerce.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Voucher, VoucherRedemption, Order, OrderItem]),
    ShoppingModule,
    FinanceModule,
    IdentityModule,
    InventoryModule,
    SystemModule,
  ],
  controllers: [CommerceController, AdminCommerceController],
  providers: [CommerceService],
  exports: [TypeOrmModule, CommerceService],
})
export class CommerceModule {}
