import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

interface NombaTokenResponse {
  data?: { access_token: string; expires_in: number };
}

interface CheckoutOrderResponse {
  data?: {
    checkoutLink: string;
    orderReference: string;
  };
}

@Injectable()
export class NombaService {
  private readonly logger = new Logger(NombaService.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  get mockMode(): boolean {
    return this.config.get('NOMBA_MOCK', 'true') === 'true';
  }

  private get baseUrl() {
    return this.config.get('NOMBA_BASE_URL', 'https://sandbox.nomba.com');
  }

  async getAccessToken(): Promise<string> {
    if (this.mockMode) return 'mock-token';

    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const clientId = this.config.get<string>('NOMBA_CLIENT_ID');
    const clientSecret = this.config.get<string>('NOMBA_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new Error('Nomba credentials not configured');
    }

    const res = await fetch(`${this.baseUrl}/v1/auth/token/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });

    const json = (await res.json()) as NombaTokenResponse;
    const token = json.data?.access_token;
    if (!token) throw new Error('Failed to obtain Nomba token');

    this.cachedToken = {
      token,
      expiresAt: Date.now() + (json.data?.expires_in ?? 3600) * 1000 - 60000,
    };
    return token;
  }

  async createCheckoutOrder(params: {
    amountKobo: number;
    orderReference: string;
    customerEmail?: string;
    callbackUrl?: string;
  }) {
    if (this.mockMode) {
      const ref = params.orderReference;
      return {
        checkoutLink: `https://sandbox.nomba.com/checkout/mock/${ref}`,
        orderReference: ref,
        mock: true,
      };
    }

    const token = await this.getAccessToken();
    const accountId = this.config.get<string>('NOMBA_ACCOUNT_ID');

    const res = await fetch(`${this.baseUrl}/v1/checkout/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        accountId: accountId ?? '',
      },
      body: JSON.stringify({
        order: {
          amount: params.amountKobo / 100,
          currency: 'NGN',
          orderReference: params.orderReference,
          customerEmail: params.customerEmail ?? 'customer@suredriver.ng',
          callbackUrl: params.callbackUrl,
        },
      }),
    });

    const json = (await res.json()) as CheckoutOrderResponse;
    if (!json.data?.checkoutLink) {
      this.logger.error('Nomba checkout failed', json);
      throw new Error('Nomba checkout order failed');
    }

    return {
      checkoutLink: json.data.checkoutLink,
      orderReference: json.data.orderReference,
    };
  }

  async verifyTransaction(orderReference: string) {
    if (this.mockMode) {
      return { verified: true, transactionId: `MOCK-TXN-${orderReference}` };
    }

    const token = await this.getAccessToken();
    const accountId = this.config.get<string>('NOMBA_ACCOUNT_ID');

    const res = await fetch(`${this.baseUrl}/v1/transactions/accounts/single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        accountId: accountId ?? '',
      },
      body: JSON.stringify({ orderReference }),
    });

    const json = (await res.json()) as { data?: { status?: string; transactionId?: string } };
    return {
      verified: json.data?.status === 'SUCCESS' || json.data?.status === 'successful',
      transactionId: json.data?.transactionId,
    };
  }

  async transferToBank(params: {
    amountKobo: number;
    accountNumber: string;
    accountName: string;
    bankCode: string;
    merchantTxRef: string;
    senderName?: string;
  }) {
    if (this.mockMode) {
      return {
        success: true,
        transferId: `MOCK-TRF-${params.merchantTxRef}`,
        fee: 50,
      };
    }

    const token = await this.getAccessToken();
    const accountId = this.config.get<string>('NOMBA_ACCOUNT_ID');

    const res = await fetch(`${this.baseUrl}/v2/transfers/bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        accountId: accountId ?? '',
      },
      body: JSON.stringify({
        amount: params.amountKobo / 100,
        accountNumber: params.accountNumber,
        accountName: params.accountName,
        bankCode: params.bankCode,
        merchantTxRef: params.merchantTxRef,
        senderName: params.senderName ?? 'SureDriver',
      }),
    });

    const json = (await res.json()) as {
      data?: { id: string; status: string; fee?: number };
    };

    return {
      success: json.data?.status === 'SUCCESS',
      transferId: json.data?.id,
      fee: json.data?.fee,
    };
  }

  generateOrderReference() {
    return `SD-${randomUUID()}`;
  }
}
