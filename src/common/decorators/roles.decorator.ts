import { SetMetadata } from '@nestjs/common';
import type { ActiveRoleCode } from '../auth/account-role';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: ActiveRoleCode[]) =>
  SetMetadata(ROLES_KEY, roles);

// Convenient role decorators
export const AdminOnly = () => Roles('ADMIN');
export const UserOnly = () => Roles('USER');
export const AllRoles = () => Roles('USER', 'ADMIN');
