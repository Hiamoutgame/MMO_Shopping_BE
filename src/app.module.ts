import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import { validate } from './config/env.validation';
import { AutomationModule } from './modules/automation/automation.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { FinanceModule } from './modules/finance/finance.module';
import { IdentityModule } from './modules/identity/identity.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ShoppingModule } from './modules/shopping/shopping.module';
import { SupportModule } from './modules/support/support.module';
import { SystemModule } from './modules/system/system.module';
import { CashbackModule } from './modules/cashback/cashback.module';
import { SeasonsModule } from './modules/seasons/seasons.module';
import { ChungSucModule } from './modules/chung-suc/chung-suc.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PackagesModule } from './modules/packages/packages.module';
import { SellersModule } from './modules/sellers/sellers.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { PurchaseModule } from './modules/purchase/purchase.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SeedModule } from './database/seeds/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
      load: [appConfig, databaseConfig, jwtConfig],
      validate,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        configService.get('database')!,
      inject: [ConfigService],
    }),
    IdentityModule,
    CatalogModule,
    InventoryModule,
    ShoppingModule,
    CommerceModule,
    FinanceModule,
    IntegrationModule,
    AutomationModule,
    SupportModule,
    SystemModule,
    CashbackModule,
    SeasonsModule,
    ChungSucModule,
    PricingModule,
    PackagesModule,
    SellersModule,
    CouponsModule,
    PurchaseModule,
    AnalyticsModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService, ApiExceptionFilter],
})
export class AppModule {}
