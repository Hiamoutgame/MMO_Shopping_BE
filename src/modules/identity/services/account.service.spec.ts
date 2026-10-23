import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { Account } from '../entities/account.entity';
import { Role } from '../entities/role.entity';
import { AccountService } from './account.service';

describe('Supported account roles', () => {
  it.each(['SELLER', 'OWNER', ''])(
    'rejects role %s in both account DTOs',
    async (roleCode) => {
      const create = plainToInstance(CreateAccountDto, {
        email: 'customer@example.com',
        password: 'secret123',
        roleCode,
      });
      const update = plainToInstance(UpdateAccountDto, { roleCode });
      for (const dto of [create, update]) {
        expect(
          (await validate(dto)).some((error) => error.property === 'roleCode'),
        ).toBe(true);
      }
    },
  );

  it.each(['USER', 'ADMIN', 'user'])(
    'accepts supported role %s',
    async (roleCode) => {
      const dto = plainToInstance(CreateAccountDto, {
        email: 'customer@example.com',
        password: 'secret123',
        roleCode,
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it('rejects unsupported role assignment before any account or role mutation', async () => {
    const accounts = { findOne: jest.fn(), save: jest.fn() };
    const roles = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const db = { createQueryRunner: jest.fn() };
    const service = new AccountService(
      accounts as unknown as Repository<Account>,
      roles as unknown as Repository<Role>,
      db as unknown as DataSource,
    );

    await expect(
      service.create({
        email: 'new@example.com',
        password: 'secret123',
        roleCode: 'SELLER',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update('existing-account', { roleCode: 'SELLER' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(accounts.findOne).not.toHaveBeenCalled();
    expect(accounts.save).not.toHaveBeenCalled();
    expect(roles.findOne).not.toHaveBeenCalled();
    expect(roles.save).not.toHaveBeenCalled();
    expect(db.createQueryRunner).not.toHaveBeenCalled();
  });
});
