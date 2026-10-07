import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger documentation
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle(process.env.SWAGGER_TITLE || 'MMO Shopping API')
      .setDescription(
        process.env.SWAGGER_DESCRIPTION ||
        'MMO Shopping Backend API with CHUNG SỨC (Group Buying) System'
      )
      .setVersion(process.env.SWAGGER_VERSION || '1.0.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Seasons', 'Season/Event management')
      .addTag('Chung Suc', 'Group buying campaigns')
      .addTag('Pricing', 'Price calculation and rules')
      .addTag('Packages', 'Product bundles')
      .addTag('Sellers', 'Seller profiles and referral codes')
      .addTag('Coupons', 'Coupon validation and usage')
      .addTag('Purchase', 'Purchase batches and cost management')
      .addTag('Analytics', 'Profit tracking and test campaigns')
      .addTag('Products', 'Product catalog')
      .addTag('Orders', 'Order management')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(
      process.env.SWAGGER_PATH || 'api/docs',
      app,
      document,
      {
        swaggerOptions: {
          persistAuthorization: true,
          tagsSorter: 'alpha',
          operationsSorter: 'alpha',
        },
      },
    );

    console.log(`📚 Swagger documentation: http://localhost:${process.env.PORT || 3000}/${process.env.SWAGGER_PATH || 'api/docs'}`);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
