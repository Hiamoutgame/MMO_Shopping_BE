import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter';
import { SellersController } from './sellers.controller';

describe('Retired seller HTTP namespace', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SellersController],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['get', ''],
    ['post', '/profiles'],
    ['get', '/profiles'],
    ['get', '/profiles/id'],
    ['get', '/profiles/by-account/account'],
    ['patch', '/profiles/id'],
    ['delete', '/profiles/id'],
    ['post', '/profiles/id/approve'],
    ['post', '/profiles/id/reject'],
    ['post', '/profiles/id/suspend'],
    ['post', '/profiles/id/referral-codes'],
    ['get', '/profiles/id/referral-codes'],
    ['get', '/profiles/id/stats'],
    ['post', '/referral-clicks'],
    ['get', '/referral-codes/code/clicks'],
    ['post', '/referral-codes/code/deactivate'],
    ['post', '/referral-codes/code/activate'],
  ])(
    '%s %s returns 410 without loading any seller repository',
    async (method, path) => {
      const client = request(app.getHttpServer());
      const url = `/api/v1/sellers${path}`;
      const response = await (method === 'post'
        ? client.post(url)
        : method === 'patch'
          ? client.patch(url)
          : method === 'delete'
            ? client.delete(url)
            : client.get(url));
      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        success: false,
        data: null,
        message: 'Chức năng seller đang tạm ngừng sử dụng.',
        errorCode: 'FEATURE_RETIRED',
      });
    },
  );
});
