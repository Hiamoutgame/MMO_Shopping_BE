import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT!, 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
      }),
  synchronize: false,
  autoLoadEntities: true,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
}));
