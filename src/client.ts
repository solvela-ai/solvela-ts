import { ClientConfig, DEFAULT_CONFIG } from './config.js';
import { Transport } from './transport.js';
import { ResponseCache } from './cache.js';
import { SessionStore } from './session.js';
import { checkDegraded } from './quality.js';
import { Wallet } from './wallet.js';
import type { Signer } from './signer.js';
import {
  ChatChunk,
  ChatRequest,
  ChatMessage,
  ChatResponse,
  ModelInfo,
  PaymentRequired,
  PaymentAccept,
  Resource,
} from './types.js';
import {
  ClientError,
  PaymentRequiredError,
  RecipientMismatchError,
  AmountExceedsMaxError,
  InsufficientBalanceError,
} from './errors.js';
import { SOLANA_NETWORK } from './constants.js';

export class SolvelaClient {
  private readonly config: ClientConfig;
  private readonly wallet?: Wallet;
  private readonly signer?: Signer;
  private readonly transport: Transport;
  private readonly cache?: ResponseCache;
  private readonly sessionStore?: SessionStore;
  private lastBalance?: number;

  constructor(options?: {
    config?: Partial<ClientConfig>;
    wallet?: Wallet;
    signer?: Signer;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
    this.wallet = options?.wallet;
    this.signer = options?.signer;
    this.transport = new Transport(this.config.gatewayUrl, this.config.timeout);
    if (this.config.enableCache) this.cache = new ResponseCache();
    if (this.config.enableSessions) {
      this.sessionStore = new SessionStore(this.config.sessionTtl);
    }
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    let model = request.model;

    // Step 1: Balance guard — if balance == 0 and fallback set, swap model
    if (
      this.lastBalance !== undefined &&
      this.lastBalance === 0 &&
      this.config.freeFallbackModel
    ) {
      model = this.config.freeFallbackModel;
    }

    // Step 2: Session lookup — may override model
    let sessionId: string | undefined;
    if (this.sessionStore) {
      sessionId = SessionStore.deriveSessionId(request.messages);
      const info = this.sessionStore.getOrCreate(sessionId, model);
      if (model === request.model) {
        // Only use session model if balance guard didn't already override
        model = info.model;
      }
    }

    // Step 3: Cache check (AFTER model finalization)
    let cacheKey: string | undefined;
    if (this.cache) {
      cacheKey = ResponseCache.cacheKey(model, request.messages);
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Build effective request with finalized model
    const effectiveRequest = new ChatRequest(
      model,
      request.messages,
      request.maxTokens,
      request.temperature,
      request.topP,
      false,
      request.tools,
      request.toolChoice,
    );

    // Step 4: Send request
    let response = await this.sendWithPayment(effectiveRequest);

    // Step 5: Quality check + retry
    if (this.config.enableQualityCheck) {
      let retries = 0;
      while (retries < this.config.maxQualityRetries) {
        const content = response.choices[0]?.message?.content;
        if (!content || !checkDegraded(content)) break;
        retries++;
        response = await this.sendWithPayment(effectiveRequest, { 'X-Solvela-Retry-Reason': 'degraded' });
      }
    }

    // Step 6: Cache store
    if (this.cache && cacheKey !== undefined) {
      this.cache.put(cacheKey, response);
    }

    // Step 7: Session update
    if (this.sessionStore && sessionId) {
      const hash = ResponseCache.cacheKey(model, request.messages);
      this.sessionStore.recordRequest(sessionId, hash);
    }

    return response;
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<ChatChunk> {
    let model = request.model;

    // Step 1: Balance guard
    if (
      this.lastBalance !== undefined &&
      this.lastBalance === 0 &&
      this.config.freeFallbackModel
    ) {
      model = this.config.freeFallbackModel;
    }

    // Step 2: Session lookup
    let sessionId: string | undefined;
    if (this.sessionStore) {
      sessionId = SessionStore.deriveSessionId(request.messages);
      const info = this.sessionStore.getOrCreate(sessionId, model);
      if (model === request.model) {
        model = info.model;
      }
    }

    const effectiveRequest = new ChatRequest(
      model,
      request.messages,
      request.maxTokens,
      request.temperature,
      request.topP,
      true,
      request.tools,
      request.toolChoice,
    );

    // Step 3: Send with payment retry (mirrors chat() / sendWithPayment flow)
    try {
      yield* this.transport.sendChatStream(effectiveRequest);
    } catch (e) {
      if (e instanceof PaymentRequiredError && this.signer) {
        const signature = await this.signPaymentForRequest(effectiveRequest, e.paymentRequired);
        yield* this.transport.sendChatStream(effectiveRequest, signature);
      } else {
        throw e;
      }
    }

    // Step 4: Session update
    if (this.sessionStore && sessionId) {
      const hash = ResponseCache.cacheKey(model, request.messages);
      this.sessionStore.recordRequest(sessionId, hash);
    }
  }

  async models(): Promise<ModelInfo[]> {
    const raw = await this.transport.fetchModels();
    return raw.map((m) => ModelInfo.fromJSON(m));
  }

  async estimateCost(model: string): Promise<PaymentRequired> {
    const dummyRequest = new ChatRequest(model, [
      new ChatMessage('user', 'cost estimate'),
    ]);
    const result = await this.transport.sendChat(dummyRequest);
    if (result instanceof PaymentRequired) return result;
    throw new ClientError('Expected 402 for cost estimate but got success');
  }

  lastKnownBalance(): number | undefined {
    return this.lastBalance;
  }

  toString(): string {
    const wallet = this.wallet ? `wallet=${this.wallet.address()}` : 'no-wallet';
    return `SolvelaClient(gateway=${this.config.gatewayUrl}, ${wallet}, secret=REDACTED)`;
  }

  private async sendWithPayment(
    request: ChatRequest,
    extraHeaders?: Record<string, string>,
  ): Promise<ChatResponse> {
    const result = await this.transport.sendChat(request, undefined, extraHeaders);

    if (result instanceof PaymentRequired) {
      // Try to sign and pay if we have a signer
      if (this.signer) {
        return this.handlePaymentRequired(request, result, extraHeaders);
      }

      // Try free fallback model
      if (this.config.freeFallbackModel && request.model !== this.config.freeFallbackModel) {
        const fallbackRequest = new ChatRequest(
          this.config.freeFallbackModel,
          request.messages,
          request.maxTokens,
          request.temperature,
          request.topP,
          false,
          request.tools,
          request.toolChoice,
        );
        const fallbackResult = await this.transport.sendChat(fallbackRequest, undefined, extraHeaders);
        if (fallbackResult instanceof PaymentRequired) {
          throw new PaymentRequiredError(fallbackResult);
        }
        return fallbackResult;
      }

      throw new PaymentRequiredError(result);
    }

    return result;
  }

  private async handlePaymentRequired(
    request: ChatRequest,
    pr: PaymentRequired,
    extraHeaders?: Record<string, string>,
  ): Promise<ChatResponse> {
    const accepted = this.findCompatibleScheme(pr);
    if (!accepted) {
      throw new PaymentRequiredError(pr);
    }

    // Validate payment
    this.validatePayment(accepted);

    const amountAtomic = parseInt(accepted.maxAmountRequired, 10);

    // Balance guard
    if (this.lastBalance !== undefined && this.lastBalance < amountAtomic) {
      // Try free fallback
      if (this.config.freeFallbackModel && request.model !== this.config.freeFallbackModel) {
        const fallbackRequest = new ChatRequest(
          this.config.freeFallbackModel,
          request.messages,
          request.maxTokens,
          request.temperature,
          request.topP,
          false,
          request.tools,
          request.toolChoice,
        );
        const fallbackResult = await this.transport.sendChat(fallbackRequest, undefined, extraHeaders);
        if (fallbackResult instanceof PaymentRequired) {
          throw new InsufficientBalanceError(this.lastBalance, amountAtomic);
        }
        return fallbackResult;
      }
      throw new InsufficientBalanceError(this.lastBalance, amountAtomic);
    }

    const signature = await this.signPaymentForRequest(request, pr);
    const result = await this.transport.sendChat(request, signature, extraHeaders);
    if (result instanceof PaymentRequired) {
      throw new PaymentRequiredError(result);
    }
    return result;
  }

  /**
   * Signs a payment for the given request and PaymentRequired response.
   * Returns a base64-encoded payment payload string suitable for the
   * Payment-Signature header, usable by both chat() and chatStream().
   */
  private async signPaymentForRequest(
    _request: ChatRequest,
    pr: PaymentRequired,
  ): Promise<string> {
    const accepted = this.findCompatibleScheme(pr);
    if (!accepted) {
      throw new PaymentRequiredError(pr);
    }

    this.validatePayment(accepted);

    const amountAtomic = parseInt(accepted.maxAmountRequired, 10);

    if (this.lastBalance !== undefined && this.lastBalance < amountAtomic) {
      throw new InsufficientBalanceError(this.lastBalance, amountAtomic);
    }

    const resource = new Resource(
      accepted.resource,
      accepted.mimeType,
      accepted.description,
    );

    const payload = await this.signer!.signPayment(
      amountAtomic,
      accepted.payTo,
      resource,
      accepted,
    );

    return Buffer.from(JSON.stringify(payload.toJSON())).toString('base64');
  }

  private findCompatibleScheme(pr: PaymentRequired): PaymentAccept | undefined {
    // Prefer escrow if configured, otherwise exact
    if (this.config.preferEscrow) {
      const escrow = pr.accepts.find(
        (a) => a.scheme === 'escrow' && a.network === SOLANA_NETWORK,
      );
      if (escrow) return escrow;
    }
    return pr.accepts.find(
      (a) => a.scheme === 'exact' && a.network === SOLANA_NETWORK,
    );
  }

  private validatePayment(accepted: PaymentAccept): void {
    if (
      this.config.expectedRecipient &&
      accepted.payTo !== this.config.expectedRecipient
    ) {
      throw new RecipientMismatchError(this.config.expectedRecipient, accepted.payTo);
    }

    const amount = parseInt(accepted.maxAmountRequired, 10);
    if (this.config.maxPaymentAmount && amount > this.config.maxPaymentAmount) {
      throw new AmountExceedsMaxError(amount, this.config.maxPaymentAmount);
    }
  }
}
