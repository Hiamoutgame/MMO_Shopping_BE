import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { ACTIVE_ROLE_CODES } from '../../../common/auth/account-role';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find({
      where: { code: In([...ACTIVE_ROLE_CODES]) },
      order: { code: 'ASC' },
    });
  }

  async findByCode(code: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { code: code.toUpperCase() },
    });
  }
}
