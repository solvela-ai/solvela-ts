import { describe, it, expect, vi, afterEach } from 'vitest';
import { SolvelaClient } from '../../src/client.js';
import {
  ChatRequest,
  ChatMessage,
  PaymentAccept,
  PaymentRequired,
} from '../../src/types.js';
import { ClientError, SignerError, AmountExceedsMaxError } from '../../src/errors.js';
import type { Signer } from '../../src/signer.js';
import type { Resource } from '../../src/types.js';
import { PaymentPayload, SolanaPayload } from '../../src/types.js';
import { SOLANA_NETWORK, USDC_MINT } from '../../src/constants.js';

/**
 * Coverage for security audit fixes:
 *  - HIGH-1  parseInt NaN bypass (validatePayment + handlePaymentRequired)
 *  - NEW-HIGH validate network/asset/pay_to before signing
 *  - HIGH-2  http:// gatewayUrl rejected for non-loopback hosts
 */

class StubSigner implements Signer {
  public called = false;
  async signPayment(
    _amount: number,
    _recipient: string,
    _resource: Resource,
    accepted: PaymentAccept,
  ): Promise<PaymentPayload> {
    this.called = true;
    return new PaymentPayload(
      2,
      accepted.scheme,
      accepted.network,
      new SolanaPayload('fakeTx==', 'fakeSender'),
    );
  }
}

function pr(overrides: Partial<{
  amount: string;
  network: string;
  asset?: string;
  payTo: string;
}>): Record<string, unknown> {
  const accepted: Record<string, unknown> = {
    scheme: 'exact',
    network: overrides.network ?? SOLANA_NETWORK,
    max_amount_required: overrides.amount ?? '1000000',
    resource: 'https://example.com/v1/chat/completions',
    description: 'Chat',
    mime_type: 'application/json',
    pay_to: overrides.payTo ?? '11111111111111111111111111111111',
  };
  if (overrides.asset !== undefined) accepted.asset = overrides.asset;
  return {
    x402_version: 2,
    accepts: [accepted],
    error: 'Payment required',
  };
}

function mockFetchOnce(
  status: number,
  body: Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
    body: null,
    statusText: 'OK',
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('Security: parseAtomicAmount NaN guard', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects non-numeric maxAmountRequired', async () => {
    mockFetchOnce(402, pr({ amount: 'free' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);

    await expect(client.chat(request)).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('rejects negative amount', async () => {
    mockFetchOnce(402, pr({ amount: '-5' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);

    await expect(client.chat(request)).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('rejects zero amount', async () => {
    mockFetchOnce(402, pr({ amount: '0' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);

    await expect(client.chat(request)).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('rejects fractional amount (parseInt would silently truncate)', async () => {
    // Pre-fix: parseInt("1500000.99", 10) === 1500000, sneaking past the cap
    // and signing a smaller value than the gateway's literal string would imply.
    mockFetchOnce(402, pr({ amount: '1500000.99' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    await expect(
      client.chat(new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')])),
    ).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('rejects amount with trailing garbage', async () => {
    // Pre-fix: parseInt("1000000abc", 10) === 1000000.
    mockFetchOnce(402, pr({ amount: '1000000abc' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    await expect(
      client.chat(new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')])),
    ).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('rejects scientific notation', async () => {
    // Pre-fix: parseInt("1e6", 10) === 1.
    mockFetchOnce(402, pr({ amount: '1e6' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    await expect(
      client.chat(new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')])),
    ).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('rejects amount above Number.MAX_SAFE_INTEGER (precision loss)', async () => {
    // 2^53 + 1 — Number(...) would round and return an inexact integer.
    mockFetchOnce(402, pr({ amount: '9007199254740993' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    await expect(
      client.chat(new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')])),
    ).rejects.toThrow(SignerError);
    expect(signer.called).toBe(false);
  });

  it('enforces default maxPaymentAmount cap (10 USDC atomic)', async () => {
    // 11 USDC > 10 USDC default cap
    mockFetchOnce(402, pr({ amount: '11000000' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);

    await expect(client.chat(request)).rejects.toThrow(AmountExceedsMaxError);
    expect(signer.called).toBe(false);
  });
});

describe('Security: network/asset validation before signing', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects unexpected network', async () => {
    mockFetchOnce(402, pr({ network: 'evm:1' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);

    await expect(client.chat(request)).rejects.toThrow(ClientError);
    expect(signer.called).toBe(false);
  });

  it('rejects unexpected asset (wrong mint)', async () => {
    mockFetchOnce(402, pr({ asset: '11111111111111111111111111111111' }));

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);

    await expect(client.chat(request)).rejects.toThrow(ClientError);
    expect(signer.called).toBe(false);
  });

  it('accepts the correct USDC mint asset', async () => {
    // First fetch returns 402 with correct asset; second is the post-signature retry.
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) {
        return Promise.resolve({
          status: 402,
          json: async () => pr({ asset: USDC_MINT }),
          body: null,
          statusText: 'Payment Required',
        });
      }
      return Promise.resolve({
        status: 200,
        json: async () => ({
          id: 'c1',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        body: null,
        statusText: 'OK',
      });
    }) as unknown as typeof fetch;

    const signer = new StubSigner();
    const client = new SolvelaClient({ signer });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hi')]);
    const resp = await client.chat(request);
    expect(signer.called).toBe(true);
    expect(resp.choices[0].message.content).toBe('ok');
  });
});

describe('Security: HTTP gateway URL validation', () => {
  it('throws when constructing client with non-loopback http:// gateway', () => {
    expect(
      () => new SolvelaClient({ config: { gatewayUrl: 'http://evil.example.com' } }),
    ).toThrow();
  });

  it('allows http://localhost', () => {
    expect(
      () => new SolvelaClient({ config: { gatewayUrl: 'http://localhost:8402' } }),
    ).not.toThrow();
  });

  it('allows https:// for any host', () => {
    expect(
      () => new SolvelaClient({ config: { gatewayUrl: 'https://api.solvela.ai' } }),
    ).not.toThrow();
  });
});

describe('Security: PaymentRequired wire-format includes asset', () => {
  it('PaymentAccept.fromJSON preserves asset field', () => {
    const data = pr({ asset: USDC_MINT });
    const parsed = PaymentRequired.fromJSON(data);
    expect(parsed.accepts[0].asset).toBe(USDC_MINT);
  });

  it('PaymentAccept.toJSON omits asset when undefined', () => {
    const accept = new PaymentAccept(
      'exact',
      SOLANA_NETWORK,
      '1000',
      'r',
      'd',
      'application/json',
      '11111111111111111111111111111111',
    );
    const json = accept.toJSON();
    expect('asset' in json).toBe(false);
  });
});
