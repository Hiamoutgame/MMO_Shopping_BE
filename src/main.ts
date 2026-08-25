import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

interface SwaggerConfig {
  enabled: boolean;
  path: string;
  title: string;
  description: string;
  version: string;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = configService.getOrThrow<SwaggerConfig>('app.swagger');
  if (swaggerConfig.enabled) {
    const config = new DocumentBuilder()
      .setTitle(swaggerConfig.title)
      .setDescription(swaggerConfig.description)
      .setVersion(swaggerConfig.version)
      .addBearerAuth()
      .addTag('auth')
      .addTag('catalog')
      .addTag('shopping')
      .addTag('commerce')
      .addTag('finance')
      .addTag('automation')
      .addTag('support')
      .addTag('admin')
      .build();

    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerConfig.path, app, documentFactory, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
  console.log(`Server is running on ${port}`);
  if (swaggerConfig.enabled) {
    console.log(`Swagger docs are available at /${swaggerConfig.path}`);
  }
}

bootstrap().catch((error) => {
  console.error('Error starting the server:', error);
  process.exit(1);
});
