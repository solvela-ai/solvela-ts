import { ChatChunk, ChatRequest, ChatResponse, PaymentRequired } from './types.js';
import { GatewayError, PaymentRequiredError, TimeoutError } from './errors.js';

export class Transport {
  constructor(
    private readonly baseUrl: string,
    private readonly timeout: number = 180,
  ) {}

  private buildUrl(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  private buildHeaders(
    paymentSignature?: string,
    extraHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (paymentSignature) headers['Payment-Signature'] = paymentSignature;
    if (extraHeaders) Object.assign(headers, extraHeaders);
    return headers;
  }

  async sendChat(
    request: ChatRequest,
    paymentSignature?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<ChatResponse | PaymentRequired> {
    const url = this.buildUrl('/v1/chat/completions');
    const headers = this.buildHeaders(paymentSignature, extraHeaders);
    const body = request.toJSON();
    body.stream = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.status === 200) {
        return ChatResponse.fromJSON(await resp.json());
      } else if (resp.status === 402) {
        return PaymentRequired.fromJSON(await resp.json());
      } else {
        const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
        throw new GatewayError(resp.status, (data.error as string) || resp.statusText);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof GatewayError || e instanceof PaymentRequiredError) throw e;
      if ((e as Error).name === 'AbortError') throw new TimeoutError(this.timeout);
      throw e;
    }
  }

  async *sendChatStream(
    request: ChatRequest,
    paymentSignature?: string,
    extraHeaders?: Record<string, string>,
  ): AsyncGenerator<ChatChunk> {
    const url = this.buildUrl('/v1/chat/completions');
    const headers = this.buildHeaders(paymentSignature, extraHeaders);
    const body = request.toJSON();
    body.stream = true;

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (resp.status === 402) {
      const pr = PaymentRequired.fromJSON(await resp.json());
      throw new PaymentRequiredError(pr);
    }
    if (resp.status !== 200) {
      const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      throw new GatewayError(resp.status, (data.error as string) || resp.statusText);
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') return;
          yield ChatChunk.fromJSON(JSON.parse(dataStr));
        }
      }
    }
  }

  async fetchModels(): Promise<Record<string, unknown>[]> {
    const url = this.buildUrl('/v1/models');
    const resp = await fetch(url);
    if (resp.status !== 200) {
      throw new GatewayError(resp.status, resp.statusText);
    }
    const data = (await resp.json()) as { data?: Record<string, unknown>[] };
    return data.data ?? [];
  }
}
