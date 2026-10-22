import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/api/test' }),
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter();
  jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  filter.catch(exception, host);

  return {
    status: (status.mock.calls[0] as unknown[])[0],
    body: (json.mock.calls[0] as unknown[])[0] as Record<string, unknown>,
  };
}

describe('AllExceptionsFilter', () => {
  it('maps HTTP status to a default errorCode', () => {
    expect(run(new NotFoundException('Order not found'))).toEqual({
      status: 404,
      body: {
        success: false,
        data: null,
        message: 'Order not found',
        errorCode: 'NOT_FOUND',
      },
    });
    expect(run(new ForbiddenException()).body.errorCode).toBe('FORBIDDEN');
  });

  it('keeps the domain errorCode set by a service', () => {
    const result = run(
      new ConflictException({
        success: false,
        data: null,
        message: 'Mã mời này đang có một yêu cầu chưa hoàn tất.',
        errorCode: 'INVITE_CODE_ALREADY_PENDING',
      }),
    );
    expect(result.status).toBe(409);
    expect(result.body).toEqual({
      success: false,
      data: null,
      message: 'Mã mời này đang có một yêu cầu chưa hoàn tất.',
      errorCode: 'INVITE_CODE_ALREADY_PENDING',
    });
  });

  it('joins validation messages into one string', () => {
    const result = run(
      new BadRequestException(['email must be an email', 'password is empty']),
    );
    expect(result.body).toMatchObject({
      message: 'email must be an email; password is empty',
      errorCode: 'BAD_REQUEST',
    });
  });

  it('maps 410 to GONE', () => {
    expect(run(new GoneException()).body.errorCode).toBe('GONE');
  });

  it('does not leak database details', () => {
    const driverError = Object.assign(
      new Error('invalid input syntax for type uuid: "abc"'),
      { code: '22P02' },
    );
    const result = run(
      new QueryFailedError('SELECT * FROM orders', [], driverError),
    );
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).not.toMatch(/syntax|SELECT|uuid/);
  });

  it('maps constraint violations to 400 and duplicates to 409', () => {
    const query = (code: string) =>
      new QueryFailedError(
        'INSERT INTO vouchers',
        [],
        Object.assign(new Error('violates check constraint'), { code }),
      );
    expect(run(query('23514')).status).toBe(400);
    expect(run(query('23505')).status).toBe(409);
    expect(run(query('42P01')).status).toBe(500);
  });

  it('hides the message of unexpected errors', () => {
    const result = run(new Error('connection string postgres://secret'));
    expect(result).toEqual({
      status: 500,
      body: {
        success: false,
        data: null,
        message: 'Internal server error',
        errorCode: 'INTERNAL_ERROR',
      },
    });
  });
});
