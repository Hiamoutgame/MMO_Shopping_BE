import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ActiveUserData } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: ActiveUserData }>();
    if (!user || !user.role) {
      throw new ForbiddenException({
        success: false,
        data: null,
        message: 'Forbidden resource',
        errorCode: 'FORBIDDEN',
      });
    }

    const hasRole = requiredRoles.some(
      (role) => role.toUpperCase() === user.role.toUpperCase(),
    );
    if (!hasRole) {
      throw new ForbiddenException({
        success: false,
        data: null,
        message: 'Forbidden resource',
        errorCode: 'FORBIDDEN',
      });
    }

    return true;
  }
}
