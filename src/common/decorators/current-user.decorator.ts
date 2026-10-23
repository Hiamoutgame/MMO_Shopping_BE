import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface ActiveUserData {
  id: string;
  email: string;
  roleCode: string;
  subject: string;
  sessionId: string;
  role?: {
    code: string;
  };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: ActiveUserData;
  }
}

export const CurrentUser = createParamDecorator(
  (data: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
