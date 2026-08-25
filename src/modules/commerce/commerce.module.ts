import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { VoucherRedemption } from './entities/voucher-redemption.entity';
import { Voucher } from './entities/voucher.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Voucher, VoucherRedemption, Order, OrderItem]),
  ],
  exports: [TypeOrmModule],
})
export class CommerceModule {}
