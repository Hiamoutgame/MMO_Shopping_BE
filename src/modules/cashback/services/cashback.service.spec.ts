import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CashbackConnection } from '../entities/cashback-connection.entity';
import { CashbackConnectionStatus } from '../enums/cashback-connection-status.enum';
import { CashbackService } from './cashback.service';
import {
  HoanPhiClientService,
  HoanPhiProviderError,
} from './hoanphi-client.service';
import { IntegrationCredentialService } from './integration-credential.service';

describe('CashbackService', () => {
  const findOne = jest.fn();
  const save = jest.fn();
  const request = jest.fn();
  const decrypt = jest.fn().mockReturnValue('provider-token');
  const encrypt = jest.fn();
  const repository = {
    findOne,
    save,
  } as unknown as Repository<CashbackConnection>;
  const client = { request } as unknown as HoanPhiClientService;
  const credentials = {
    decrypt,
    encrypt,
  } as unknown as IntegrationCredentialService;
  const service = new CashbackService(repository, client, credentials);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('isolates provider credentials by MMO account id', async () => {
    const connection = {
      accountId: 'account-a',
      status: CashbackConnectionStatus.CONNECTED,
      encryptedAccessToken: 'encrypted',
    } as CashbackConnection;
    findOne.mockResolvedValue(connection);
    request.mockResolvedValue({ balance: 1000 });
    save.mockResolvedValue(connection);

    await expect(service.getAccount('account-a')).resolves.toEqual({
      balance: '1000',
    });
    expect(findOne).toHaveBeenCalledWith({ where: { accountId: 'account-a' } });
    expect(request).toHaveBeenCalledWith(
      'GET',
      '/account',
      expect.objectContaining({ token: 'provider-token' }) as object,
    );
  });

  it('turns provider 401 into re-auth conflict without logging out MMO session', async () => {
    const connection = {
      accountId: 'account-a',
      status: CashbackConnectionStatus.CONNECTED,
      encryptedAccessToken: 'encrypted',
    } as CashbackConnection;
    findOne.mockResolvedValue(connection);
    request.mockRejectedValue(
      new HoanPhiProviderError(401, 'Expired', 'UNAUTHENTICATED'),
    );
    save.mockResolvedValue(connection);

    await expect(service.getAccount('account-a')).rejects.toMatchObject<
      Partial<ConflictException>
    >({
      status: 409,
    });
    expect(connection.status).toBe(CashbackConnectionStatus.REAUTH_REQUIRED);
    expect(connection.encryptedAccessToken).toBeNull();
    expect(save).toHaveBeenCalledWith(connection);
  });
});
