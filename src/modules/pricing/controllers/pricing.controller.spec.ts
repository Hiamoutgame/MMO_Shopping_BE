import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PriceEngineService } from '../services/price-engine.service';
import { PricingController } from './pricing.controller';

describe('Customer price HTTP contract', () => {
  let app: INestApplication<Server>;
  const accountId = '8f8f7a6e-62c7-4c2f-95bc-33d8312e7a7a';
  const productId = 'c10167bb-2b7d-4f04-961b-c9bfc5aed272';
  const calculatePrice = jest
    .fn()
    .mockResolvedValue({ finalPrice: '50000.0000' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PricingController],
      providers: [
        { provide: PriceEngineService, useValue: { calculatePrice } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest<Request>().user = {
            subject: accountId,
            id: accountId,
            email: 'customer@example.com',
            sessionId: 'session-id',
            roleCode: 'USER',
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    calculatePrice.mockClear();
  });
  afterAll(async () => {
    await app.close();
  });

  it('uses the session account even if an older client supplies another accountId', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/pricing/calculate')
      .send({
        productId,
        quantity: 1,
        accountId: productId,
      })
      .expect(201);
    expect(calculatePrice).toHaveBeenCalledWith({
      productId,
      quantity: 1,
      accountId,
    });
  });

  it('rejects sellerCode instead of applying an old seller discount', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/pricing/calculate')
      .send({
        productId,
        quantity: 1,
        sellerCode: 'LEGACY-CODE',
      })
      .expect(400);
    expect(calculatePrice).not.toHaveBeenCalled();
  });
});
