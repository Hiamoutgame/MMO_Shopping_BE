import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { ActiveUserData } from '../decorators/current-user.decorator';
import { AuthSession } from '../../modules/identity/entities/auth-session.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Missing or invalid token',
        errorCode: 'UNAUTHORIZED',
      });
    }

    try {
      const secret = this.configService.get<string>('jwt.secret');
      const payload = await this.jwtService.verifyAsync<ActiveUserData>(token, {
        secret,
      });
      if (!payload.subject || !payload.sessionId) {
        throw new UnauthorizedException();
      }

      const session = await this.sessionRepository.findOne({
        where: {
          id: payload.sessionId,
          accountId: payload.subject,
          revokedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        },
      });
      if (!session) {
        throw new UnauthorizedException();
      }

      request['user'] = payload;
    } catch {
      throw new UnauthorizedException({
        success: false,
        data: null,
        message: 'Invalid or expired access token',
        errorCode: 'UNAUTHORIZED',
      });
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
