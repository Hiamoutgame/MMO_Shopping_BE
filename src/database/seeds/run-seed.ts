import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ChungSucSeedService } from './chung-suc-seed.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const seedService = app.get(ChungSucSeedService);

  try {
    console.log('🌱 Starting CHUNG SỨC seed...');
    await seedService.seed();
    console.log('✅ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
