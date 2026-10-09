import { test as base } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import {
  createAccountWithRole,
  loginAdmin,
  registerUser,
  type Session,
} from '../helpers/auth';

interface Fixtures {
  /** Client without Authorization header. */
  anon: ApiClient;
  /** Fresh admin session (seeded admin from .env.test). */
  admin: Session;
  /** Fresh SELLER account created through the admin API. */
  seller: Session;
  /** Fresh USER accounts registered through the public API. */
  userA: Session;
  userB: Session;
}

// Fixtures are test-scoped on purpose: access tokens live 15 minutes and the
// suite talks to a remote database, so worker-scoped tokens could expire.
export const test = base.extend<Fixtures>({
  anon: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
  admin: async ({ anon }, use) => {
    await use(await loginAdmin(anon));
  },
  seller: async ({ anon, admin }, use) => {
    await use(await createAccountWithRole(anon, admin.api, 'SELLER'));
  },
  userA: async ({ anon }, use) => {
    await use(await registerUser(anon, 'usera'));
  },
  userB: async ({ anon }, use) => {
    await use(await registerUser(anon, 'userb'));
  },
});

export { expect } from '@playwright/test';
