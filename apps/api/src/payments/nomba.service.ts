import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

interface NombaApiResponse<T> {
  code?: string;
  description?: string;
  data?: T;
}

interface NombaTokenData {
  access_token: string;
  expires_in?: number;
  expiresAt?: string;
}

interface CheckoutOrderResponse {
  checkoutLink: string;
  orderReference: string;
}

export interface NombaWebhookPayload {
  event_type?: string;
  requestId?: string;
  data?: {
    merchant?: { userId?: string; walletId?: string };
    order?: { orderReference?: string };
    transaction?: {
      transactionId?: string;
      type?: string;
      time?: string;
      responseCode?: string;
    };
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

  /** Parent account ID — required on every Nomba API call (accountId header). */
  private get parentAccountId(): string {
    return (
      this.config.get<string>('NOMBA_PARENT_ACCOUNT_ID') ??
      this.config.get<string>('NOMBA_ACCOUNT_ID') ??
      ''
    );
  }

  /** Sub-account ID — credits checkout funds to the hackathon sub-account. */
  private get subAccountId(): string | undefined {
    return this.config.get<string>('NOMBA_SUB_ACCOUNT_ID') || undefined;
  }

  private requireParentAccountId(): string {
    const id = this.parentAccountId;
    if (!id) throw new Error('NOMBA_PARENT_ACCOUNT_ID (or NOMBA_ACCOUNT_ID) not configured');
    return id;
  }

  private formatAmount(kobo: number): string {
    return (kobo / 100).toFixed(2);
  }

  private async parseResponse<T>(res: Response): Promise<NombaApiResponse<T>> {
    const json = (await res.json()) as NombaApiResponse<T>;
    if (!res.ok || (json.code && json.code !== '00')) {
      this.logger.error(`Nomba API error (${res.status})`, json);
      throw new Error(json.description ?? `Nomba API request failed (${res.status})`);
    }
    return json;
  }

  private tokenExpiresAt(data: NombaTokenData): number {
    if (data.expiresAt) {
      return new Date(data.expiresAt).getTime() - 60_000;
    }
    return Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
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

    const accountId = this.requireParentAccountId();
    const res = await fetch(`${this.baseUrl}/v1/auth/token/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accountId,
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const json = await this.parseResponse<NombaTokenData>(res);
    const token = json.data?.access_token;
    if (!token) throw new Error('Failed to obtain Nomba token');

    this.cachedToken = { token, expiresAt: this.tokenExpiresAt(json.data!) };
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
    const accountId = this.requireParentAccountId();

    const order: Record<string, string> = {
      amount: this.formatAmount(params.amountKobo),
      currency: 'NGN',
      orderReference: params.orderReference,
      customerEmail: params.customerEmail ?? 'customer@suredriver.ng',
    };
    if (params.callbackUrl) order.callbackUrl = params.callbackUrl;
    if (this.subAccountId) order.accountId = this.subAccountId;

    const res = await fetch(`${this.baseUrl}/v1/checkout/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        accountId,
      },
      body: JSON.stringify({ order }),
    });

    const json = await this.parseResponse<CheckoutOrderResponse>(res);
    if (!json.data?.checkoutLink) {
      throw new Error('Nomba checkout order failed: no checkout link');
    }

    return {
      checkoutLink: json.data.checkoutLink,
      orderReference: json.data.orderReference,
    };
  }

  private buildWebhookHashingPayload(
    payload: NombaWebhookPayload,
    timestamp: string,
  ): string {
    const merchant = payload.data?.merchant;
    const transaction = payload.data?.transaction;
    let responseCode = transaction?.responseCode ?? '';
    if (responseCode === 'null') responseCode = '';

    return [
      payload.event_type ?? '',
      payload.requestId ?? '',
      merchant?.userId ?? '',
      merchant?.walletId ?? '',
      transaction?.transactionId ?? '',
      transaction?.type ?? '',
      transaction?.time ?? '',
      responseCode,
      timestamp,
    ].join(':');
  }

  /**
   * Verify `nomba-signature` per Nomba docs:
   * https://developer.nomba.com/docs/api-basics/webhook
   */
  verifyWebhookSignature(
    payload: NombaWebhookPayload,
    signature: string | undefined,
    timestamp: string | undefined,
  ): boolean {
    const secret = this.config.get<string>('NOMBA_WEBHOOK_SECRET');
    if (!secret) {
      if (this.mockMode) return true;
      this.logger.error('NOMBA_WEBHOOK_SECRET not set — rejecting webhook');
      return false;
    }
    if (!signature?.trim() || !timestamp?.trim()) {
      this.logger.warn('Nomba webhook missing nomba-signature or nomba-timestamp header');
      return false;
    }

    const hashingPayload = this.buildWebhookHashingPayload(payload, timestamp.trim());
    const expected = createHmac('sha256', secret).update(hashingPayload).digest('base64');
    const received = signature.trim();

    // Nomba sample code compares signatures case-insensitively.
    const match =
      expected.length === received.length &&
      timingSafeEqual(
        Buffer.from(expected.toLowerCase()),
        Buffer.from(received.toLowerCase()),
      );

    if (!match) {
      this.logger.warn(
        `Nomba webhook signature mismatch for order ${payload.data?.order?.orderReference ?? '?'}`,
      );
      this.logger.debug(`Nomba webhook hash input: [${hashingPayload}]`);
    }

    return match;
  }

  private get isSandbox(): boolean {
    return this.baseUrl.includes('sandbox.nomba.com');
  }

  private isPaidStatus(status?: string): boolean {
    const s = status?.toUpperCase() ?? '';
    return (
      s === 'SUCCESS' ||
      s === 'SUCCESSFUL' ||
      s === 'COMPLETED' ||
      s.includes('PAYMENT SUCCESSFUL')
    );
  }

  async verifyTransaction(orderReference: string, checkoutLink?: string | null) {
    if (this.mockMode) {
      return { verified: true, transactionId: `MOCK-TXN-${orderReference}` };
    }

    if (this.isSandbox) {
      const sandboxResult = await this.fetchSandboxCheckoutTransaction(
        orderReference,
        checkoutLink,
      );
      if (sandboxResult.verified) return sandboxResult;
    }

    const parentResult = await this.fetchTransaction(orderReference, false);
    if (parentResult.verified) return parentResult;

    if (this.subAccountId) {
      return this.fetchTransaction(orderReference, true);
    }

    return parentResult;
  }

  private extractCheckoutOrderId(checkoutLink?: string | null): string | null {
    if (!checkoutLink) return null;
    try {
      const segment = new URL(checkoutLink).pathname.split('/').filter(Boolean).pop();
      return segment || null;
    } catch {
      return null;
    }
  }

  /** Sandbox checkout uses GET /sandbox/checkout/transaction (not v1/checkout/transaction). */
  private async fetchSandboxCheckoutTransaction(
    orderReference: string,
    checkoutLink?: string | null,
  ) {
    const accountId = this.requireParentAccountId();
    const lookups: Array<{ idType: string; id: string }> = [
      { idType: 'orderReference', id: orderReference },
    ];

    const checkoutOrderId = this.extractCheckoutOrderId(checkoutLink);
    if (checkoutOrderId) {
      lookups.push({ idType: 'orderId', id: checkoutOrderId });
      lookups.push({ idType: 'ORDER_ID', id: checkoutOrderId });
    }

    for (const { idType, id } of lookups) {
      const result = await this.fetchSandboxCheckoutOnce(id, accountId, idType);
      if (result.verified) return result;
    }

    return { verified: false as const };
  }

  private async fetchSandboxCheckoutOnce(
    id: string,
    accountId: string,
    idType: string,
  ) {
    const token = await this.getAccessToken();
    const url = new URL(`${this.baseUrl}/sandbox/checkout/transaction`);
    url.searchParams.set('idType', idType);
    url.searchParams.set('id', id);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        accountId,
      },
    });

    const json = (await res.json()) as NombaApiResponse<{
      success?: boolean;
      message?: string;
      transactionDetails?: {
        paymentReference?: string;
        statusCode?: string;
        transactionId?: string;
        status?: string;
      };
      transactionId?: string;
      status?: string;
    }>;
    if (!res.ok || json.code !== '00' || !json.data) {
      if (json.code !== '404') {
        this.logger.debug(
          `Nomba sandbox verify (${idType}) for ${id}: ${json.description ?? res.status}`,
        );
      }
      return { verified: false as const };
    }

    const details = json.data.transactionDetails;
    const transactionId =
      details?.paymentReference ??
      details?.transactionId ??
      json.data.transactionId;
    const status =
      details?.statusCode ?? details?.status ?? json.data.status ?? json.data.message;

    if (json.data.success === true) {
      return {
        verified: true as const,
        transactionId: transactionId ?? `WEB-SANDBOX-${id}`,
      };
    }

    const verified = this.isPaidStatus(status) && !!transactionId;
    return { verified, transactionId };
  }

  private async fetchTransaction(orderReference: string, useSubAccount: boolean) {
    const token = await this.getAccessToken();
    const accountId = this.requireParentAccountId();

    const path = useSubAccount
      ? `/v1/transactions/accounts/${this.subAccountId}/single`
      : '/v1/transactions/accounts/single';
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('orderReference', orderReference);

    let res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        accountId,
      },
    });

    let json = (await res.json()) as NombaApiResponse<{
      status?: string;
      transactionId?: string;
    }>;
    if ((!res.ok || json.code !== '00' || !json.data) && !useSubAccount) {
      const byRef = new URL(`${this.baseUrl}/v1/transactions/accounts/single`);
      byRef.searchParams.set('transactionRef', orderReference);
      res = await fetch(byRef, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, accountId },
      });
      json = (await res.json()) as NombaApiResponse<{
        status?: string;
        transactionId?: string;
      }>;
    }

    if (!res.ok || json.code !== '00' || !json.data) {
      this.logger.debug(
        `Nomba verify pending (${useSubAccount ? 'sub' : 'parent'}) for ${orderReference}: ${json.description ?? res.status}`,
      );
      return { verified: false as const };
    }

    const status = json.data.status;
    const transactionId = json.data.transactionId;
    const verified = this.isPaidStatus(status) && !!transactionId;
    return { verified, transactionId };
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
    const accountId = this.requireParentAccountId();

    const res = await fetch(`${this.baseUrl}/v2/transfers/bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        accountId,
      },
      body: JSON.stringify({
        amount: this.formatAmount(params.amountKobo),
        accountNumber: params.accountNumber,
        accountName: params.accountName,
        bankCode: params.bankCode,
        merchantTxRef: params.merchantTxRef,
        senderName: params.senderName ?? 'SureDriver',
      }),
    });

    const json = await this.parseResponse<{ id: string; status: string; fee?: number }>(res);
    const status = json.data?.status?.toUpperCase();

    return {
      success: status === 'SUCCESS',
      transferId: json.data?.id,
      fee: json.data?.fee,
    };
  }

  generateOrderReference() {
    return `SD-${randomUUID()}`;
  }
}
