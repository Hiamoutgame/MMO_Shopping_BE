import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AuthSession } from '../../modules/identity/entities/auth-session.entity';
import { ActiveUserData } from '../decorators/current-user.decorator';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync<ActiveUserData>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });
      if (!payload.subject || !payload.sessionId) {
        return true;
      }
      const session = await this.sessionRepository.findOne({
        where: {
          id: payload.sessionId,
          accountId: payload.subject,
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      });
      if (session) {
        request['user'] = payload;
      }
    } catch {
      return true;
    }
    return true;
  }
}
