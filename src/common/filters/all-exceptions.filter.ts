import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
  details?: unknown;
}

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
  details?: unknown;
}

interface QueryFailedErrorLike {
  code?: string;
  detail?: string;
  message?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as HttpExceptionBody;
        message = responseObj.message || message;
        error = responseObj.error || error;
        details = responseObj.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;

      // TypeORM errors
      if (exception.name === 'QueryFailedError') {
        status = HttpStatus.BAD_REQUEST;
        error = 'Database Query Failed';

        const queryError = exception as QueryFailedErrorLike;
        if (queryError.code === '23505') {
          message = 'Duplicate entry. Record already exists.';
          details = queryError.detail;
        } else if (queryError.code === '23503') {
          message = 'Foreign key constraint violation.';
          details = queryError.detail;
        } else if (queryError.code === '23502') {
          message = 'Not null constraint violation.';
          details = queryError.detail;
        } else {
          details = queryError.message;
        }
      } else if (exception.name === 'EntityNotFoundError') {
        status = HttpStatus.NOT_FOUND;
        error = 'Entity Not Found';
        message = 'The requested resource was not found.';
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
    };

    if (details) {
      errorResponse.details = details;
    }

    // Log the error
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : exception,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`,
      );
    }

    response.status(status).json(errorResponse);
  }
}
