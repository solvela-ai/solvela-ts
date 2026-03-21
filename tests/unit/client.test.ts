import { describe, it, expect } from 'vitest';
import { RustyClawClient } from '../../src/client.js';
import { Wallet } from '../../src/wallet.js';

describe('RustyClawClient', () => {
  it('creates without wallet', () => {
    const client = new RustyClawClient();
    expect(client).toBeDefined();
  });

  it('creates with wallet', () => {
    const [wallet] = Wallet.create();
    const client = new RustyClawClient({ wallet });
    expect(client).toBeDefined();
  });

  it('lastKnownBalance is undefined initially', () => {
    const client = new RustyClawClient();
    expect(client.lastKnownBalance()).toBeUndefined();
  });

  it('creates with custom config', () => {
    const client = new RustyClawClient({
      config: {
        gatewayUrl: 'https://custom.example.com',
        timeout: 60,
        enableCache: true,
      },
    });
    expect(client).toBeDefined();
  });

  it('toString redacts sensitive info', () => {
    const [wallet] = Wallet.create();
    const client = new RustyClawClient({ wallet });
    const str = client.toString();
    expect(str).toContain('RustyClawClient');
    expect(str).not.toContain(wallet.toKeypairB58());
  });
});
