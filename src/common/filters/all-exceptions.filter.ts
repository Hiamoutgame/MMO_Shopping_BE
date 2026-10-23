import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { ApiResponse } from '../utils/api-response';

interface HttpExceptionBody {
  message?: string | string[];
  errorCode?: string;
}

interface QueryFailedErrorLike {
  code?: string;
}

const STATUS_ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.GONE]: 'GONE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

// Lỗi Postgres do dữ liệu đầu vào (nhóm 22: dữ liệu sai, nhóm 23: vi phạm
// ràng buộc). Không trả chi tiết DB ra ngoài; lỗi khác vẫn là 500.
function queryError(code = ''): { status: number; message: string } | null {
  if (code === '23505') {
    return {
      status: HttpStatus.CONFLICT,
      message: 'Duplicate entry. Record already exists.',
    };
  }
  if (code.startsWith('23')) {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'The data violates a database constraint.',
    };
  }
  if (code.startsWith('22')) {
    return { status: HttpStatus.BAD_REQUEST, message: 'Invalid input value.' };
  }
  return null;
}

/**
 * Mọi lỗi đều trả cùng envelope với response thành công:
 * { success: false, data: null, message, errorCode }.
 * errorCode lấy từ exception nếu service đã đặt (VD INVITE_CODE_ALREADY_PENDING),
 * không thì suy ra từ HTTP status.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode: string | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const { message: bodyMessage, errorCode: bodyCode } =
          body as HttpExceptionBody;
        // ValidationPipe trả mảng lỗi; gộp lại để client luôn nhận string.
        if (Array.isArray(bodyMessage)) message = bodyMessage.join('; ');
        else if (bodyMessage) message = bodyMessage;
        if (typeof bodyCode === 'string') errorCode = bodyCode;
      }
    } else if (exception instanceof Error) {
      if (exception.name === 'QueryFailedError') {
        const known = queryError((exception as QueryFailedErrorLike).code);
        if (known) {
          status = known.status;
          message = known.message;
        }
      } else if (exception.name === 'EntityNotFoundError') {
        status = HttpStatus.NOT_FOUND;
        message = 'The requested resource was not found.';
      }
    }

    const body: ApiResponse<null> = {
      success: false,
      data: null,
      message,
      errorCode: errorCode ?? STATUS_ERROR_CODES[status] ?? 'INTERNAL_ERROR',
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : exception,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${message}`,
      );
    }

    response.status(status).json(body);
  }
}
