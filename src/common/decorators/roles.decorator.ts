import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// Convenient role decorators
export const AdminOnly = () => Roles('ADMIN');
export const SellerOnly = () => Roles('SELLER');
export const UserOnly = () => Roles('USER');
export const SellerOrAdmin = () => Roles('SELLER', 'ADMIN');
export const AllRoles = () => Roles('USER', 'SELLER', 'ADMIN');
