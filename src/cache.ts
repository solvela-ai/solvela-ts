import type { ChatMessage, ChatResponse } from './types.js';

interface CacheEntry {
  response: ChatResponse;
  inserted: number;
}

export class ResponseCache {
  private entries = new Map<number, CacheEntry>();

  constructor(
    private readonly maxEntries: number = 200,
    private readonly ttl: number = 600,
    private readonly dedupWindow: number = 30,
  ) {}

  static cacheKey(model: string, messages: ChatMessage[]): number {
    const raw = model + '|' + messages.map((m) => `${m.role}:${m.content ?? ''}`).join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    return hash;
  }

  get(key: number): ChatResponse | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    const now = Date.now() / 1000;
    if (now - entry.inserted > this.ttl) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.response;
  }

  put(key: number, response: ChatResponse): void {
    const now = Date.now() / 1000;

    // Dedup: if key already exists within dedup window, skip
    const existing = this.entries.get(key);
    if (existing && now - existing.inserted < this.dedupWindow) {
      return;
    }

    // Evict oldest if at capacity
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, { response, inserted: now });
  }
}
