export interface ClientConfig {
  gatewayUrl: string;
  rpcUrl: string;
  preferEscrow: boolean;
  timeout: number;
  expectedRecipient?: string;
  maxPaymentAmount?: number;
  enableCache: boolean;
  enableSessions: boolean;
  sessionTtl: number;
  enableQualityCheck: boolean;
  maxQualityRetries: number;
  freeFallbackModel?: string;
}

export const DEFAULT_CONFIG: ClientConfig = {
  gatewayUrl: 'http://localhost:8402',
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  preferEscrow: false,
  timeout: 180,
  enableCache: false,
  enableSessions: false,
  sessionTtl: 1800,
  enableQualityCheck: false,
  maxQualityRetries: 1,
};

export class ClientBuilder {
  private config: ClientConfig = { ...DEFAULT_CONFIG };

  withGatewayUrl(url: string): ClientBuilder {
    return this.with({ gatewayUrl: url });
  }

  withRpcUrl(url: string): ClientBuilder {
    return this.with({ rpcUrl: url });
  }

  withPreferEscrow(prefer: boolean): ClientBuilder {
    return this.with({ preferEscrow: prefer });
  }

  withTimeout(seconds: number): ClientBuilder {
    return this.with({ timeout: seconds });
  }

  withExpectedRecipient(recipient: string): ClientBuilder {
    return this.with({ expectedRecipient: recipient });
  }

  withMaxPaymentAmount(amount: number): ClientBuilder {
    return this.with({ maxPaymentAmount: amount });
  }

  withEnableCache(enable: boolean): ClientBuilder {
    return this.with({ enableCache: enable });
  }

  withEnableSessions(enable: boolean): ClientBuilder {
    return this.with({ enableSessions: enable });
  }

  withSessionTtl(seconds: number): ClientBuilder {
    return this.with({ sessionTtl: seconds });
  }

  withEnableQualityCheck(enable: boolean): ClientBuilder {
    return this.with({ enableQualityCheck: enable });
  }

  withMaxQualityRetries(retries: number): ClientBuilder {
    return this.with({ maxQualityRetries: retries });
  }

  withFreeFallbackModel(model: string): ClientBuilder {
    return this.with({ freeFallbackModel: model });
  }

  build(): ClientConfig {
    return { ...this.config };
  }

  private with(partial: Partial<ClientConfig>): ClientBuilder {
    const next = new ClientBuilder();
    next.config = { ...this.config, ...partial };
    return next;
  }
}
