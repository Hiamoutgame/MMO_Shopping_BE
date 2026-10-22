import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { Cart } from '../../shopping/entities/cart.entity';
import { Wallet } from '../../finance/entities/wallet.entity';
import { CreateAccountDto } from '../dto/create-account.dto';
import { QueryAccountDto } from '../dto/query-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { Account } from '../entities/account.entity';
import { Role } from '../entities/role.entity';
import { AccountStatus } from '../enums/account-status.enum';
import { ACTIVE_ROLE_CODES } from '../../../common/auth/account-role';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: QueryAccountDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const qb = this.accountRepository
      .createQueryBuilder('account')
      .leftJoinAndSelect('account.role', 'role');

    if (query.search) {
      qb.andWhere(
        '(LOWER(account.email) LIKE LOWER(:search) OR LOWER(account.name) LIKE LOWER(:search))',
        { search: `%${query.search}%` },
      );
    }

    if (query.role) {
      if (query.role.toUpperCase() === 'USER') {
        // Legacy roles have customer permissions until explicitly reassigned.
        qb.andWhere("COALESCE(role.code, 'USER') <> :adminRole", {
          adminRole: 'ADMIN',
        });
      } else {
        qb.andWhere('role.code = :role', { role: query.role.toUpperCase() });
      }
    }

    if (query.status) {
      qb.andWhere('account.status = :status', { status: query.status });
    }

    qb.orderBy('account.createdAt', 'DESC').skip(skip).take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    const sanitizedItems = items.map((acc) => ({
      id: acc.id,
      email: acc.email,
      name: acc.name,
      phone: acc.phone,
      status: acc.status,
      lastLoginAt: acc.lastLoginAt,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      role: acc.role
        ? {
            id: acc.role.id,
            code: acc.role.code,
            name: acc.role.name,
          }
        : null,
    }));

    return {
      items: sanitizedItems,
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async findById(id: string) {
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { role: true },
    });

    if (!account) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Account không tồn tại.',
        errorCode: 'NOT_FOUND',
      });
    }

    return {
      id: account.id,
      email: account.email,
      name: account.name,
      phone: account.phone,
      status: account.status,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      role: account.role
        ? {
            id: account.role.id,
            code: account.role.code,
            name: account.role.name,
          }
        : null,
    };
  }

  async create(dto: CreateAccountDto) {
    const role = await this.resolveAssignableRole(dto.roleCode);
    const existing = await this.accountRepository.findOne({
      where: { email: dto.email.toLowerCase() },
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException({
        success: false,
        data: null,
        message: 'Email đã tồn tại.',
        errorCode: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const account = queryRunner.manager.create(Account, {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.displayName || dto.email.split('@')[0],
        phone: dto.phone || null,
        roleId: role.id,
        status: dto.status || AccountStatus.ACTIVE,
      });
      const savedAccount = await queryRunner.manager.save(Account, account);

      const cart = queryRunner.manager.create(Cart, {
        accountId: savedAccount.id,
      });
      await queryRunner.manager.save(Cart, cart);

      const wallet = queryRunner.manager.create(Wallet, {
        accountId: savedAccount.id,
        currency: 'VND',
        balance: '0',
      });
      await queryRunner.manager.save(Wallet, wallet);

      await queryRunner.commitTransaction();

      return {
        id: savedAccount.id,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, dto: UpdateAccountDto) {
    const role =
      dto.roleCode !== undefined
        ? await this.resolveAssignableRole(dto.roleCode)
        : null;
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: { role: true },
    });

    if (!account) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Account không tồn tại.',
        errorCode: 'NOT_FOUND',
      });
    }

    if (dto.email && dto.email.toLowerCase() !== account.email.toLowerCase()) {
      const existing = await this.accountRepository.findOne({
        where: { email: dto.email.toLowerCase() },
        withDeleted: true,
      });
      if (existing && existing.id !== id) {
        throw new ConflictException({
          success: false,
          data: null,
          message: 'Email đã tồn tại.',
          errorCode: 'EMAIL_ALREADY_EXISTS',
        });
      }
      account.email = dto.email.toLowerCase();
    }

    if (dto.password) {
      account.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.displayName !== undefined) {
      account.name = dto.displayName;
    }

    if (dto.phone !== undefined) {
      account.phone = dto.phone;
    }

    if (dto.status !== undefined) {
      account.status = dto.status;
    }

    if (role) {
      account.roleId = role.id;
    }

    await this.accountRepository.save(account);

    return {
      id: account.id,
    };
  }

  private async resolveAssignableRole(roleCode: string): Promise<Role> {
    const code = roleCode.toUpperCase();
    if (!ACTIVE_ROLE_CODES.some((activeCode) => activeCode === code)) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Chỉ hỗ trợ vai trò USER hoặc ADMIN.',
        errorCode: 'VALIDATION_ERROR',
      });
    }
    const role = await this.roleRepository.findOne({ where: { code } });
    if (!role) {
      throw new BadRequestException({
        success: false,
        data: null,
        message: 'Vai trò chưa được khởi tạo. Hãy chạy seed:roles.',
        errorCode: 'VALIDATION_ERROR',
      });
    }
    return role;
  }

  async softDelete(id: string) {
    const account = await this.accountRepository.findOne({
      where: { id },
    });

    if (!account) {
      throw new NotFoundException({
        success: false,
        data: null,
        message: 'Account không tồn tại.',
        errorCode: 'NOT_FOUND',
      });
    }

    await this.accountRepository.softDelete(id);

    return {
      deletedAt: new Date().toISOString(),
    };
  }
}
