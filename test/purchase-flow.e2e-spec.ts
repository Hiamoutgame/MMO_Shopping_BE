import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { AppModule } from '../src/app.module';
import { ProductVariant } from '../src/modules/catalog/entities/product-variant.entity';
import { Product } from '../src/modules/catalog/entities/product.entity';
import { FulfillmentType } from '../src/modules/catalog/enums/fulfillment-type.enum';
import { ProductStatus } from '../src/modules/catalog/enums/product-status.enum';
import { VariantStatus } from '../src/modules/catalog/enums/variant-status.enum';
import { CommerceService } from '../src/modules/commerce/services/commerce.service';
import { Order } from '../src/modules/commerce/entities/order.entity';
import { Voucher } from '../src/modules/commerce/entities/voucher.entity';
import { DiscountType } from '../src/modules/commerce/enums/discount-type.enum';
import { OrderStatus } from '../src/modules/commerce/enums/order-status.enum';
import { FinanceService } from '../src/modules/finance/services/finance.service';
import { Wallet } from '../src/modules/finance/entities/wallet.entity';
import { WalletTransaction } from '../src/modules/finance/entities/wallet-transaction.entity';
import { PaymentProvider } from '../src/modules/finance/enums/payment-provider.enum';
import { InventoryItem } from '../src/modules/inventory/entities/inventory-item.entity';
import { InventoryStatus } from '../src/modules/inventory/enums/inventory-status.enum';
import { Account } from '../src/modules/identity/entities/account.entity';
import { Role } from '../src/modules/identity/entities/role.entity';
import { AccountStatus } from '../src/modules/identity/enums/account-status.enum';
import { CartItem } from '../src/modules/shopping/entities/cart-item.entity';
import { Cart } from '../src/modules/shopping/entities/cart.entity';

describe('Purchase flow integration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let commerceService: CommerceService;
  let financeService: FinanceService;
  let cryptoService: CryptoService;
  let role: Role;
  let admin: Account;
  let unique = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    commerceService = app.get(CommerceService);
    financeService = app.get(FinanceService);
    cryptoService = app.get(CryptoService);

    await dataSource.query(
      'TRUNCATE TABLE "idempotency_records", "admin_audit_logs", "wallet_transactions", "payment_transactions", "inventory_items", "cart_items", "carts", "voucher_redemptions", "orders", "vouchers", "product_variants", "products", "accounts", "roles" CASCADE',
    );
    role = await dataSource
      .getRepository(Role)
      .save({ code: 'USER', name: 'User' });
    const adminRole = await dataSource
      .getRepository(Role)
      .save({ code: 'ADMIN', name: 'Admin' });
    admin = await createAccount(adminRole.id, 'admin');
  });

  afterAll(async () => {
    await app.close();
  });

  it('checks out AUTO inventory once and replays without duplicate order or debit', async () => {
    const fixture = await seedCart({ balance: '250.0000', price: '100.0000' });
    const first = await commerceService.checkout(
      fixture.account.id,
      {},
      `checkout-${fixture.account.id}`,
    );
    const replay = await commerceService.checkout(
      fixture.account.id,
      {},
      `checkout-${fixture.account.id}`,
    );

    const wallet = await dataSource
      .getRepository(Wallet)
      .findOneByOrFail({ accountId: fixture.account.id });
    const orderCount = await dataSource
      .getRepository(Order)
      .count({ where: { accountId: fixture.account.id } });
    const ledgerCount = await dataSource
      .getRepository(WalletTransaction)
      .count({ where: { walletId: wallet.id } });

    expect((first as { order: { id: string } }).order.id).toBe(
      (replay as { order: { id: string } }).order.id,
    );
    expect(orderCount).toBe(1);
    expect(ledgerCount).toBe(1);
    expect(wallet.balance).toBe('150.0000');
    expect(JSON.stringify(first)).not.toContain('encryptedPayload');
  });

  it('rejects MANUAL fulfillment before changing wallet', async () => {
    const fixture = await seedCart({
      balance: '250.0000',
      price: '100.0000',
      fulfillmentType: FulfillmentType.MANUAL,
    });

    await expect(
      commerceService.checkout(
        fixture.account.id,
        {},
        `manual-${fixture.account.id}`,
      ),
    ).rejects.toThrow();

    const wallet = await dataSource
      .getRepository(Wallet)
      .findOneByOrFail({ accountId: fixture.account.id });
    const ledgerCount = await dataSource
      .getRepository(WalletTransaction)
      .count({ where: { walletId: wallet.id } });
    expect(wallet.balance).toBe('250.0000');
    expect(ledgerCount).toBe(0);
  });

  it('handles partial and full refunds without exceeding the order total', async () => {
    const fixture = await seedCart({ balance: '250.0000', price: '100.0000' });
    const checkout = await commerceService.checkout(
      fixture.account.id,
      {},
      `refund-checkout-${fixture.account.id}`,
    );
    const orderId = (checkout as { order: { id: string } }).order.id;

    const partial = await commerceService.refundOrder(
      orderId,
      { amount: '40.0000' },
      `refund-1-${orderId}`,
      admin.id,
    );
    expect((partial as { order: { status: OrderStatus } }).order.status).toBe(
      OrderStatus.PARTIALLY_REFUNDED,
    );

    const full = await commerceService.refundOrder(
      orderId,
      {},
      `refund-2-${orderId}`,
      admin.id,
    );
    expect((full as { order: { status: OrderStatus } }).order.status).toBe(
      OrderStatus.REFUNDED,
    );
    await expect(
      commerceService.refundOrder(
        orderId,
        { amount: '1.0000' },
        `refund-3-${orderId}`,
        admin.id,
      ),
    ).rejects.toThrow();
  });

  it('credits payment callbacks once when replayed', async () => {
    const account = await seedAccountWithWallet('0.0000');
    const deposit = await financeService.createDeposit(
      account.id,
      {
        amount: '125.0000',
        currency: 'VND',
        provider: PaymentProvider.BANK_TRANSFER,
      },
      `deposit-${account.id}`,
    );
    const payment = (
      deposit as { paymentTransaction: { merchantReference: string } }
    ).paymentTransaction;
    const body = {
      merchantReference: payment.merchantReference,
      providerTransactionId: `provider-${account.id}`,
      amount: '125.0000',
      currency: 'VND',
      status: 'SUCCEEDED' as const,
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const timestamp = Date.now().toString();
    const signature = cryptoService.signHmac(rawBody, timestamp);

    await financeService.handlePaymentCallback(
      PaymentProvider.BANK_TRANSFER,
      body,
      rawBody,
      timestamp,
      signature,
    );
    await financeService.handlePaymentCallback(
      PaymentProvider.BANK_TRANSFER,
      body,
      rawBody,
      timestamp,
      signature,
    );

    const wallet = await dataSource
      .getRepository(Wallet)
      .findOneByOrFail({ accountId: account.id });
    const ledgerCount = await dataSource
      .getRepository(WalletTransaction)
      .count({ where: { walletId: wallet.id } });
    expect(wallet.balance).toBe('125.0000');
    expect(ledgerCount).toBe(1);
  });

  it('prevents concurrent checkout from selling the same inventory twice', async () => {
    const fixture = await seedCart({ balance: '250.0000', price: '100.0000' });
    const results = await Promise.allSettled([
      commerceService.checkout(
        fixture.account.id,
        {},
        `race-a-${fixture.account.id}`,
      ),
      commerceService.checkout(
        fixture.account.id,
        {},
        `race-b-${fixture.account.id}`,
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await dataSource.getRepository(Order).count({
        where: { accountId: fixture.account.id },
      }),
    ).toBe(1);
    expect(
      await dataSource.getRepository(InventoryItem).count({
        where: {
          productVariantId: fixture.variant.id,
          status: InventoryStatus.SOLD,
        },
      }),
    ).toBe(1);
  });

  it('prevents concurrent debit from making the wallet negative', async () => {
    const account = await seedAccountWithWallet('100.0000');
    const results = await Promise.allSettled([
      dataSource.transaction((manager) =>
        financeService.debit(manager, {
          accountId: account.id,
          amount: '80.0000',
          currency: 'VND',
          purpose: 'TEST_DEBIT',
          idempotencyKey: `debit-a-${account.id}`,
        }),
      ),
      dataSource.transaction((manager) =>
        financeService.debit(manager, {
          accountId: account.id,
          amount: '80.0000',
          currency: 'VND',
          purpose: 'TEST_DEBIT',
          idempotencyKey: `debit-b-${account.id}`,
        }),
      ),
    ]);

    const wallet = await dataSource
      .getRepository(Wallet)
      .findOneByOrFail({ accountId: account.id });
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(wallet.balance).toBe('20.0000');
  });

  it('enforces voucher usage limits under concurrent checkout', async () => {
    const voucher = await dataSource.getRepository(Voucher).save({
      code: `LIMIT${Date.now()}`,
      name: 'Limit voucher',
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: '10.0000',
      usageLimit: 1,
      perAccountLimit: 1,
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 86400000),
      isActive: true,
    });
    const first = await seedCart({ balance: '250.0000', price: '100.0000' });
    const second = await seedCart({ balance: '250.0000', price: '100.0000' });

    const results = await Promise.allSettled([
      commerceService.checkout(
        first.account.id,
        { voucherCode: voucher.code },
        `voucher-a-${first.account.id}`,
      ),
      commerceService.checkout(
        second.account.id,
        { voucherCode: voucher.code },
        `voucher-b-${second.account.id}`,
      ),
    ]);

    const savedVoucher = await dataSource
      .getRepository(Voucher)
      .findOneByOrFail({ id: voucher.id });
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(savedVoucher.usedCount).toBe(1);
  });

  async function seedCart(input: {
    balance: string;
    price: string;
    fulfillmentType?: FulfillmentType;
  }) {
    const account = await seedAccountWithWallet(input.balance);
    const product = await dataSource.getRepository(Product).save({
      name: `Product ${unique}`,
      slug: `product-${unique}`,
      status: ProductStatus.ACTIVE,
    });
    const variant = await dataSource.getRepository(ProductVariant).save({
      productId: product.id,
      sku: `SKU-${unique}`,
      name: `Variant ${unique}`,
      price: input.price,
      fulfillmentType: input.fulfillmentType || FulfillmentType.AUTO,
      status: VariantStatus.ACTIVE,
    });
    const cart = await dataSource
      .getRepository(Cart)
      .save({ accountId: account.id });
    await dataSource.getRepository(CartItem).save({
      cartId: cart.id,
      productVariantId: variant.id,
      quantity: 1,
    });
    await dataSource.getRepository(InventoryItem).save({
      productVariantId: variant.id,
      encryptedPayload: cryptoService.encryptJson({
        account: `delivery-${unique}`,
      }),
      encryptionKeyVersion: 1,
      status: InventoryStatus.AVAILABLE,
      metadata: { seed: unique },
    });
    unique += 1;
    return { account, product, variant, cart };
  }

  async function seedAccountWithWallet(balance: string) {
    const account = await createAccount(role.id, `user-${unique}`);
    await dataSource.getRepository(Wallet).save({
      accountId: account.id,
      currency: 'VND',
      balance,
    });
    return account;
  }

  async function createAccount(roleId: string, emailPrefix: string) {
    return dataSource.getRepository(Account).save({
      roleId,
      email: `${emailPrefix}-${Date.now()}-${unique}@example.com`,
      passwordHash: 'not-used-in-e2e',
      name: emailPrefix,
      status: AccountStatus.ACTIVE,
    });
  }
});
