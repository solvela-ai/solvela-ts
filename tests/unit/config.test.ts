import { describe, it, expect } from 'vitest';
import { ClientBuilder, DEFAULT_CONFIG } from '../../src/config.js';

describe('DEFAULT_CONFIG', () => {
  it('has correct defaults', () => {
    expect(DEFAULT_CONFIG.gatewayUrl).toBe('http://localhost:8402');
    expect(DEFAULT_CONFIG.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
    expect(DEFAULT_CONFIG.preferEscrow).toBe(false);
    expect(DEFAULT_CONFIG.timeout).toBe(180);
    expect(DEFAULT_CONFIG.enableCache).toBe(false);
    expect(DEFAULT_CONFIG.enableSessions).toBe(false);
    expect(DEFAULT_CONFIG.sessionTtl).toBe(1800);
    expect(DEFAULT_CONFIG.enableQualityCheck).toBe(false);
    expect(DEFAULT_CONFIG.maxQualityRetries).toBe(1);
    expect(DEFAULT_CONFIG.expectedRecipient).toBeUndefined();
    expect(DEFAULT_CONFIG.maxPaymentAmount).toBeUndefined();
    expect(DEFAULT_CONFIG.freeFallbackModel).toBeUndefined();
  });
});

describe('ClientBuilder', () => {
  it('builds with defaults', () => {
    const config = new ClientBuilder().build();
    expect(config.gatewayUrl).toBe('http://localhost:8402');
    expect(config.timeout).toBe(180);
  });

  it('supports fluent API', () => {
    const config = new ClientBuilder()
      .withGatewayUrl('https://gw.example.com')
      .withRpcUrl('https://rpc.example.com')
      .withPreferEscrow(true)
      .withTimeout(60)
      .withExpectedRecipient('addr1')
      .withMaxPaymentAmount(5000)
      .withEnableCache(true)
      .withEnableSessions(true)
      .withSessionTtl(3600)
      .withEnableQualityCheck(true)
      .withMaxQualityRetries(3)
      .withFreeFallbackModel('free-model')
      .build();

    expect(config.gatewayUrl).toBe('https://gw.example.com');
    expect(config.rpcUrl).toBe('https://rpc.example.com');
    expect(config.preferEscrow).toBe(true);
    expect(config.timeout).toBe(60);
    expect(config.expectedRecipient).toBe('addr1');
    expect(config.maxPaymentAmount).toBe(5000);
    expect(config.enableCache).toBe(true);
    expect(config.enableSessions).toBe(true);
    expect(config.sessionTtl).toBe(3600);
    expect(config.enableQualityCheck).toBe(true);
    expect(config.maxQualityRetries).toBe(3);
    expect(config.freeFallbackModel).toBe('free-model');
  });

  it('returns a copy on build', () => {
    const builder = new ClientBuilder();
    const c1 = builder.build();
    const c2 = builder.withTimeout(999).build();
    expect(c1.timeout).toBe(180);
    expect(c2.timeout).toBe(999);
  });
});
