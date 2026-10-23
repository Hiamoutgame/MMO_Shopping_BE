export const ACTIVE_ROLE_CODES = ['USER', 'ADMIN'] as const;
export type ActiveRoleCode = (typeof ACTIVE_ROLE_CODES)[number];

// Keep legacy accounts usable as customers without rewriting their stored role.
// Only an explicit ADMIN record grants administrative privileges.
export function getEffectiveRoleCode(code?: string): ActiveRoleCode {
  return code === 'ADMIN' ? 'ADMIN' : 'USER';
}
