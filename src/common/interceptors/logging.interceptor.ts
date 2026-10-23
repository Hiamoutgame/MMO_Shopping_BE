import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip;

    const now = Date.now();

    this.logger.log(`→ ${method} ${url} - ${ip} - ${userAgent}`);

    // Don't log sensitive data
    const sanitizedBody = this.sanitizeBody(request.body as unknown);
    if (Object.keys(sanitizedBody).length > 0) {
      this.logger.debug(`Body: ${JSON.stringify(sanitizedBody)}`);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          const { statusCode } = response;
          const duration = Date.now() - now;

          this.logger.log(`← ${method} ${url} - ${statusCode} - ${duration}ms`);
        },
        error: (error: unknown) => {
          const duration = Date.now() - now;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `← ${method} ${url} - ERROR - ${duration}ms - ${errorMessage}`,
          );
        },
      }),
    );
  }

  private sanitizeBody(body: unknown): Record<string, unknown> {
    if (!body || typeof body !== 'object') {
      return {};
    }

    const sanitized: Record<string, unknown> = {
      ...(body as Record<string, unknown>),
    };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'refreshToken',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
