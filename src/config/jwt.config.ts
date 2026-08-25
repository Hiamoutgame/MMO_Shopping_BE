import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET as string,
  expiresIn: process.env.JWT_EXPIRES_IN as string,
  refreshExpiresInDays: parseInt(
    process.env.REFRESH_TOKEN_EXPIRES_DAYS as string,
    10,
  ),
}));
