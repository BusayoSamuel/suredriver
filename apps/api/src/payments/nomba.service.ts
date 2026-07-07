import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

interface NombaApiResponse<T> {
  code?: string;
  description?: string;
  errors?: string[];
  data?: T;
}

interface NombaTokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expiresAt?: string;
}

interface CachedNombaToken {
  token: string;
  refreshToken?: string;
  expiresAt: number;
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
  private cachedToken: CachedNombaToken | null = null;
  private configChecked = false;

  constructor(private config: ConfigService) {}

  /** Hackathon parent account — always sent as the `accountId` header, never the sub-account. */
  private get parentAccountId(): string {
    return (
      this.config.get<string>('NOMBA_PARENT_ACCOUNT_ID') ??
      this.config.get<string>('NOMBA_ACCOUNT_ID') ??
      ''
    );
  }

  /** Team sub-account (one per hackathon team — set via env, never created in code). */
  private get subAccountId(): string | undefined {
    return this.config.get<string>('NOMBA_SUB_ACCOUNT_ID') || undefined;
  }

  private requireParentAccountId(): string {
    this.validateAccountConfig();
    const id = this.parentAccountId;
    if (!id) throw new Error('NOMBA_PARENT_ACCOUNT_ID (or NOMBA_ACCOUNT_ID) not configured');
    return id;
  }

  private validateAccountConfig() {
    if (this.configChecked || this.mockMode) return;
    this.configChecked = true;

    const parent = this.parentAccountId;
    const sub = this.subAccountId;

    if (!parent) {
      this.logger.warn('NOMBA_PARENT_ACCOUNT_ID is not set — Nomba API calls will fail');
      return;
    }

    if (sub && parent === sub) {
      this.logger.error(
        'NOMBA_PARENT_ACCOUNT_ID and NOMBA_SUB_ACCOUNT_ID are the same — put the hackathon parent id in NOMBA_PARENT_ACCOUNT_ID and your team sub-account in NOMBA_SUB_ACCOUNT_ID (403 errors)',
      );
    }

    this.logger.log(
      `Nomba accounts: parent header=${parent.slice(0, 8)}…${sub ? `, sub=${sub.slice(0, 8)}…` : ', no sub-account'}`,
    );
  }

  /** Parent accountId header on every authenticated Nomba request. */
  private authHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      accountId: this.requireParentAccountId(),
    };
  }

  get mockMode(): boolean {
    return this.config.get('NOMBA_MOCK', 'true') === 'true';
  }

  private get baseUrl() {
    return this.config.get('NOMBA_BASE_URL', 'https://sandbox.nomba.com');
  }

  private formatAmount(kobo: number): string {
    return (kobo / 100).toFixed(2);
  }

  private normalizeAccountNumber(accountNumber: string): string {
    return accountNumber.replace(/\D/g, '');
  }

  private nombaErrorMessage(json: NombaApiResponse<unknown>, status: number): string {
    if (json.description) return json.description;
    if (json.errors?.length) return json.errors.join('; ');
    return `Nomba API request failed (${status})`;
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

    if (this.cachedToken?.refreshToken) {
      try {
        return await this.refreshAccessToken(
          this.cachedToken.token,
          this.cachedToken.refreshToken,
        );
      } catch (err) {
        this.logger.warn('Nomba token refresh failed, re-issuing credentials', err);
      }
    }

    return this.issueAccessToken();
  }

  private cacheTokenData(data: NombaTokenData): string {
    this.cachedToken = {
      token: data.access_token,
      refreshToken: data.refresh_token ?? this.cachedToken?.refreshToken,
      expiresAt: this.tokenExpiresAt(data),
    };
    return data.access_token;
  }

  private async issueAccessToken(): Promise<string> {
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

    this.logger.debug('Nomba access token issued');
    return this.cacheTokenData(json.data!);
  }

  private async refreshAccessToken(
    currentAccessToken: string,
    refreshToken: string,
  ): Promise<string> {
    const accountId = this.requireParentAccountId();
    const res = await fetch(`${this.baseUrl}/v1/auth/token/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentAccessToken}`,
        accountId,
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const json = (await res.json()) as NombaApiResponse<NombaTokenData>;
    if (!res.ok || (json.code && json.code !== '00') || !json.data?.access_token) {
      throw new Error(json.description ?? `Nomba token refresh failed (${res.status})`);
    }

    this.logger.debug('Nomba access token refreshed');
    return this.cacheTokenData(json.data);
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

    const order: Record<string, string> = {
      amount: this.formatAmount(params.amountKobo),
      currency: 'NGN',
      orderReference: params.orderReference,
      customerEmail: params.customerEmail ?? 'customer@suredriver.ng',
    };
    if (params.callbackUrl) order.callbackUrl = params.callbackUrl;
    // Sub-account goes in the order body — never in the accountId header.
    if (this.subAccountId) order.accountId = this.subAccountId;

    const res = await fetch(`${this.baseUrl}/v1/checkout/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(token),
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

    const parentResult = await this.fetchTransaction(orderReference, false);
    if (parentResult.verified) return parentResult;

    if (this.subAccountId) {
      const subResult = await this.fetchTransaction(orderReference, true);
      if (subResult.verified) return subResult;
    }

    if (this.isSandbox) {
      return this.fetchSandboxCheckoutTransaction(orderReference, checkoutLink);
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
      const result = await this.fetchSandboxCheckoutOnce(id, idType);
      if (result.verified) return result;
    }

    return { verified: false as const };
  }

  private async fetchSandboxCheckoutOnce(id: string, idType: string) {
    const token = await this.getAccessToken();
    const url = new URL(`${this.baseUrl}/sandbox/checkout/transaction`);
    url.searchParams.set('idType', idType);
    url.searchParams.set('id', id);

    const res = await fetch(url, {
      method: 'GET',
      headers: this.authHeaders(token),
    });

    const json = (await res.json()) as NombaApiResponse<{
      success?: boolean;
      message?: string;
      order?: { orderReference?: string };
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

    if (
      idType === 'orderReference' &&
      json.data.order?.orderReference &&
      json.data.order.orderReference !== id
    ) {
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

  private transactionMatchesOrderReference(
    data: {
      orderReference?: string;
      onlineCheckoutOrderReference?: string;
      type?: string;
    },
    orderReference: string,
  ): boolean {
    return (
      data.orderReference === orderReference ||
      data.onlineCheckoutOrderReference === orderReference
    );
  }

  private parseVerifiedTransaction(
    data: {
      status?: string;
      transactionId?: string;
      id?: string;
      orderReference?: string;
      onlineCheckoutOrderReference?: string;
      type?: string;
    },
    orderReference: string,
  ) {
    if (!this.transactionMatchesOrderReference(data, orderReference)) {
      return { verified: false as const };
    }
    const transactionId = data.transactionId ?? data.id;
    const verified = this.isPaidStatus(data.status) && !!transactionId;
    return { verified, transactionId };
  }

  private async fetchTransaction(orderReference: string, useSubAccount: boolean) {
    const token = await this.getAccessToken();

    const path = useSubAccount
      ? `/v1/transactions/accounts/${this.subAccountId}/single`
      : '/v1/transactions/accounts/single';
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('orderReference', orderReference);

    const res = await fetch(url, {
      method: 'GET',
      headers: this.authHeaders(token),
    });

    const json = (await res.json()) as NombaApiResponse<{
      status?: string;
      transactionId?: string;
      id?: string;
      orderReference?: string;
      onlineCheckoutOrderReference?: string;
      type?: string;
    }>;

    if (!res.ok || json.code !== '00' || !json.data) {
      this.logger.debug(
        `Nomba verify pending (${useSubAccount ? 'sub' : 'parent'}) for ${orderReference}: ${json.description ?? res.status}`,
      );
      return { verified: false as const };
    }

    const result = this.parseVerifiedTransaction(json.data, orderReference);
    if (!result.verified) {
      this.logger.debug(
        `Nomba verify: response did not match orderReference ${orderReference} (got ${json.data.orderReference ?? json.data.onlineCheckoutOrderReference ?? 'none'})`,
      );
    }
    return result;
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

    const accountNumber = this.normalizeAccountNumber(params.accountNumber);
    if (accountNumber.length !== 10) {
      return {
        success: false,
        reason: 'Account number must be exactly 10 digits',
      };
    }

    const token = await this.getAccessToken();
    const subAccountId = this.subAccountId;
    // Sub-account in URL path; parent always in accountId header.
    const path = subAccountId
      ? `/v2/transfers/bank/${subAccountId}`
      : '/v2/transfers/bank';

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(token),
      },
      body: JSON.stringify({
        amount: this.formatAmount(params.amountKobo),
        accountNumber,
        accountName: params.accountName,
        bankCode: params.bankCode,
        merchantTxRef: params.merchantTxRef,
        senderName: params.senderName ?? 'SureDriver',
        narration: 'SureDriver trip payout',
      }),
    });

    const json = (await res.json()) as NombaApiResponse<{
      id: string;
      status: string;
      fee?: number;
    }>;

    if (!res.ok || (json.code && json.code !== '00')) {
      const reason = this.nombaErrorMessage(json, res.status);
      this.logger.error(
        `Nomba transfer failed (${res.status}) ref=${params.merchantTxRef}: ${reason}`,
      );
      return {
        success: false,
        transferId: json.data?.id,
        fee: json.data?.fee,
        status: json.data?.status,
        reason,
      };
    }

    const status = json.data?.status?.toUpperCase() ?? '';
    const success = status === 'SUCCESS' || status === 'PENDING_BILLING';

    if (!success) {
      this.logger.warn(
        `Nomba transfer rejected ref=${params.merchantTxRef} status=${status} (${json.description ?? 'no description'})`,
      );
    } else {
      this.logger.log(
        `Nomba transfer ${status} ref=${params.merchantTxRef} id=${json.data?.id ?? '—'}`,
      );
    }

    return {
      success,
      transferId: json.data?.id,
      fee: json.data?.fee,
      status,
      reason: success ? undefined : json.description,
    };
  }

  generateOrderReference() {
    return `SD-${randomUUID()}`;
  }
}
