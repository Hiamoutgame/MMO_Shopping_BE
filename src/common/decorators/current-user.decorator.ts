import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface ActiveUserData {
  subject: string;
  email: string;
  role: string;
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: ActiveUserData }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
