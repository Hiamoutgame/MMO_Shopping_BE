import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
    path: process.env.SWAGGER_PATH || 'api/docs',
    title: process.env.SWAGGER_TITLE || 'MMO Shopping API',
    description:
      process.env.SWAGGER_DESCRIPTION ||
      'API documentation for MMO Shopping backend',
    version: process.env.SWAGGER_VERSION || '1.0.0',
  },
}));
