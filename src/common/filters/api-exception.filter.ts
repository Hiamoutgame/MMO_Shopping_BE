import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    if (typeof body === 'object' && body !== null && 'success' in body) {
      response.status(status).json(body);
      return;
    }

    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? body['message']
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    response.status(status).json({
      success: false,
      data: null,
      message,
      errorCode: this.errorCode(status),
    });
  }

  private errorCode(status: number) {
    const errorCodes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
    };
    return errorCodes[status] || 'INTERNAL_ERROR';
  }
}
