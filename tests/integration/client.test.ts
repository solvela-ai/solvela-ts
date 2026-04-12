import { describe, it, expect, vi, afterEach } from 'vitest';
import { SolvelaClient } from '../../src/client.js';
import { ChatRequest, ChatMessage, PaymentRequired } from '../../src/types.js';
import { PaymentRequiredError } from '../../src/errors.js';

describe('SolvelaClient integration (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(
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

  const successResponseBody = {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 123,
    model: 'gpt-4',
    choices: [
      { index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  };

  const prBody = {
    x402_version: 2,
    accepts: [
      {
        scheme: 'exact',
        network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        max_amount_required: '1000000',
        resource: 'https://example.com/v1/chat/completions',
        description: 'Chat',
        mime_type: 'application/json',
        pay_to: '11111111111111111111111111111111',
      },
    ],
    error: 'Payment required',
  };

  it('chat returns response on success', async () => {
    mockFetch(200, successResponseBody);

    const client = new SolvelaClient();
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hello')]);
    const resp = await client.chat(request);
    expect(resp.choices[0].message.content).toBe('Hello!');
  });

  it('chat uses cache on duplicate request', async () => {
    const fetchFn = mockFetch(200, successResponseBody);

    const client = new SolvelaClient({ config: { enableCache: true } });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hello')]);

    await client.chat(request);
    await client.chat(request);

    // Should only have called fetch once (cached second time)
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('chat throws PaymentRequiredError on 402 without signer', async () => {
    mockFetch(402, prBody);

    const client = new SolvelaClient();
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hello')]);
    await expect(client.chat(request)).rejects.toThrow(PaymentRequiredError);
  });

  it('chat with quality retry retries on degraded response', async () => {
    const degradedResponse = {
      ...successResponseBody,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'I cannot assist with that request.' },
          finish_reason: 'stop',
        },
      ],
    };

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        status: 200,
        json: async () => (callCount === 1 ? degradedResponse : successResponseBody),
        statusText: 'OK',
      };
    }) as unknown as typeof fetch;

    const client = new SolvelaClient({
      config: { enableQualityCheck: true, maxQualityRetries: 1 },
    });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hello')]);
    const resp = await client.chat(request);
    expect(resp.choices[0].message.content).toBe('Hello!');
    expect(callCount).toBe(2);
  });

  it('chat falls back to free model on 402 with freeFallbackModel', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          status: 402,
          json: async () => prBody,
          statusText: 'Payment Required',
        };
      }
      return {
        status: 200,
        json: async () => ({
          ...successResponseBody,
          model: 'free-model',
        }),
        statusText: 'OK',
      };
    }) as unknown as typeof fetch;

    const client = new SolvelaClient({
      config: { freeFallbackModel: 'free-model' },
    });
    const request = new ChatRequest('gpt-4', [new ChatMessage('user', 'Hello')]);
    const resp = await client.chat(request);
    expect(resp.model).toBe('free-model');
    expect(callCount).toBe(2);
  });
});
