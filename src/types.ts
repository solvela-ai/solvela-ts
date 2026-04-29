// ── Role ──

export type Role = 'system' | 'user' | 'assistant' | 'tool' | 'developer';

// ── Tool types ──

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

export interface FunctionCallDelta {
  name?: string;
  arguments?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: FunctionCallDelta;
}

export interface FunctionDefinitionInner {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinitionInner;
}

// ── Helper: omit undefined keys ──

function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

// ── ChatMessage ──

export class ChatMessage {
  constructor(
    public readonly role: Role,
    public readonly content: string | null,
    public readonly name?: string,
    public readonly toolCalls?: ToolCall[],
    public readonly toolCallId?: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      role: this.role,
      content: this.content,
      name: this.name,
      tool_calls: this.toolCalls,
      tool_call_id: this.toolCallId,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatMessage {
    return new ChatMessage(
      data.role,
      data.content ?? null,
      data.name,
      data.tool_calls,
      data.tool_call_id,
    );
  }
}

// ── ChatRequest ──

export class ChatRequest {
  constructor(
    public readonly model: string,
    public readonly messages: ChatMessage[],
    public readonly maxTokens?: number,
    public readonly temperature?: number,
    public readonly topP?: number,
    public readonly stream: boolean = false,
    public readonly tools?: ToolDefinition[],
    public readonly toolChoice?: string | Record<string, unknown>,
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      model: this.model,
      messages: this.messages.map((m) => m.toJSON()),
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      top_p: this.topP,
      stream: this.stream,
      tools: this.tools,
      tool_choice: this.toolChoice,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatRequest {
    return new ChatRequest(
      data.model,
      (data.messages ?? []).map((m: unknown) => ChatMessage.fromJSON(m)),
      data.max_tokens,
      data.temperature,
      data.top_p,
      data.stream ?? false,
      data.tools,
      data.tool_choice,
    );
  }
}

// ── Usage ──

export class Usage {
  constructor(
    public readonly promptTokens: number,
    public readonly completionTokens: number,
    public readonly totalTokens: number,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      prompt_tokens: this.promptTokens,
      completion_tokens: this.completionTokens,
      total_tokens: this.totalTokens,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): Usage {
    return new Usage(
      data.prompt_tokens,
      data.completion_tokens,
      data.total_tokens,
    );
  }
}

// ── ChatChoice ──

export class ChatChoice {
  constructor(
    public readonly index: number,
    public readonly message: ChatMessage,
    public readonly finishReason?: string | null,
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      index: this.index,
      message: this.message.toJSON(),
      finish_reason: this.finishReason,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatChoice {
    return new ChatChoice(
      data.index,
      ChatMessage.fromJSON(data.message),
      data.finish_reason,
    );
  }
}

// ── ChatResponse ──

export class ChatResponse {
  constructor(
    public readonly id: string,
    public readonly object: string,
    public readonly created: number,
    public readonly model: string,
    public readonly choices: ChatChoice[],
    public readonly usage?: Usage,
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      id: this.id,
      object: this.object,
      created: this.created,
      model: this.model,
      choices: this.choices.map((c) => c.toJSON()),
      usage: this.usage?.toJSON(),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatResponse {
    return new ChatResponse(
      data.id,
      data.object,
      data.created,
      data.model,
      (data.choices ?? []).map((c: unknown) => ChatChoice.fromJSON(c)),
      data.usage ? Usage.fromJSON(data.usage) : undefined,
    );
  }
}

// ── Streaming types ──

export class ChatDelta {
  constructor(
    public readonly role?: Role,
    public readonly content?: string | null,
    public readonly toolCalls?: ToolCallDelta[],
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      role: this.role,
      content: this.content,
      tool_calls: this.toolCalls,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatDelta {
    return new ChatDelta(data.role, data.content, data.tool_calls);
  }
}

export class ChatChunkChoice {
  constructor(
    public readonly index: number,
    public readonly delta: ChatDelta,
    public readonly finishReason: string | null,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      index: this.index,
      delta: this.delta.toJSON(),
      finish_reason: this.finishReason,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatChunkChoice {
    return new ChatChunkChoice(
      data.index,
      ChatDelta.fromJSON(data.delta),
      data.finish_reason ?? null,
    );
  }
}

export class ChatChunk {
  constructor(
    public readonly id: string,
    public readonly object: string,
    public readonly created: number,
    public readonly model: string,
    public readonly choices: ChatChunkChoice[],
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      object: this.object,
      created: this.created,
      model: this.model,
      choices: this.choices.map((c) => c.toJSON()),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ChatChunk {
    return new ChatChunk(
      data.id,
      data.object,
      data.created,
      data.model,
      (data.choices ?? []).map((c: unknown) => ChatChunkChoice.fromJSON(c)),
    );
  }
}

// ── Payment types ──

export class Resource {
  constructor(
    public readonly url: string,
    public readonly mimeType: string,
    public readonly description: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      url: this.url,
      mime_type: this.mimeType,
      description: this.description,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): Resource {
    return new Resource(data.url, data.mime_type, data.description);
  }
}

export class PaymentAccept {
  constructor(
    public readonly scheme: string,
    public readonly network: string,
    public readonly maxAmountRequired: string,
    public readonly resource: string,
    public readonly description: string,
    public readonly mimeType: string,
    public readonly payTo: string,
    public readonly extra: Record<string, unknown> = {},
    public readonly asset?: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      scheme: this.scheme,
      network: this.network,
      max_amount_required: this.maxAmountRequired,
      resource: this.resource,
      description: this.description,
      mime_type: this.mimeType,
      pay_to: this.payTo,
      extra: this.extra,
      asset: this.asset,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): PaymentAccept {
    return new PaymentAccept(
      data.scheme,
      data.network,
      data.max_amount_required,
      data.resource,
      data.description,
      data.mime_type,
      data.pay_to,
      data.extra ?? {},
      data.asset,
    );
  }
}

export class CostBreakdown {
  constructor(
    public readonly modelCostUsd: string,
    public readonly platformFeeUsd: string,
    public readonly totalUsd: string,
    public readonly totalAtomic: string,
    public readonly inputTokens: number,
    public readonly estimatedOutputTokens: number,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      model_cost_usd: this.modelCostUsd,
      platform_fee_usd: this.platformFeeUsd,
      total_usd: this.totalUsd,
      total_atomic: this.totalAtomic,
      input_tokens: this.inputTokens,
      estimated_output_tokens: this.estimatedOutputTokens,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): CostBreakdown {
    return new CostBreakdown(
      data.model_cost_usd,
      data.platform_fee_usd,
      data.total_usd,
      data.total_atomic,
      data.input_tokens,
      data.estimated_output_tokens,
    );
  }
}

export class PaymentRequired {
  constructor(
    public readonly x402Version: number,
    public readonly accepts: PaymentAccept[],
    public readonly error: string,
    public readonly costBreakdown?: CostBreakdown,
  ) {}

  toJSON(): Record<string, unknown> {
    return omitUndefined({
      x402_version: this.x402Version,
      accepts: this.accepts.map((a) => a.toJSON()),
      error: this.error,
      cost_breakdown: this.costBreakdown?.toJSON(),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): PaymentRequired {
    return new PaymentRequired(
      data.x402_version,
      (data.accepts ?? []).map((a: unknown) => PaymentAccept.fromJSON(a)),
      data.error,
      data.cost_breakdown ? CostBreakdown.fromJSON(data.cost_breakdown) : undefined,
    );
  }
}

export class SolanaPayload {
  constructor(
    public readonly transactionSignature: string,
    public readonly sender: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      transaction_signature: this.transactionSignature,
      sender: this.sender,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): SolanaPayload {
    return new SolanaPayload(data.transaction_signature, data.sender);
  }
}

export class EscrowPayload {
  constructor(
    public readonly transactionSignature: string,
    public readonly sender: string,
    public readonly escrowAccount: string,
    public readonly serviceId: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      transaction_signature: this.transactionSignature,
      sender: this.sender,
      escrow_account: this.escrowAccount,
      service_id: this.serviceId,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): EscrowPayload {
    return new EscrowPayload(
      data.transaction_signature,
      data.sender,
      data.escrow_account,
      data.service_id,
    );
  }
}

export class PaymentPayload {
  constructor(
    public readonly x402Version: number,
    public readonly scheme: string,
    public readonly network: string,
    public readonly payload: SolanaPayload | EscrowPayload,
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      x402_version: this.x402Version,
      scheme: this.scheme,
      network: this.network,
      payload: this.payload.toJSON(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): PaymentPayload {
    const payloadData = data.payload;
    const payload = payloadData.escrow_account
      ? EscrowPayload.fromJSON(payloadData)
      : SolanaPayload.fromJSON(payloadData);
    return new PaymentPayload(
      data.x402_version,
      data.scheme,
      data.network,
      payload,
    );
  }
}

// ── ModelInfo ──

export class ModelInfo {
  constructor(
    public readonly id: string,
    public readonly provider: string,
    public readonly displayName: string,
    public readonly inputPricePerToken: number,
    public readonly outputPricePerToken: number,
    public readonly maxInputTokens: number,
    public readonly maxOutputTokens: number,
    public readonly supportsStreaming: boolean = true,
    public readonly supportsTools: boolean = false,
    public readonly supportsVision: boolean = false,
    public readonly aliases: string[] = [],
  ) {}

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      provider: this.provider,
      display_name: this.displayName,
      input_price_per_token: this.inputPricePerToken,
      output_price_per_token: this.outputPricePerToken,
      max_input_tokens: this.maxInputTokens,
      max_output_tokens: this.maxOutputTokens,
      supports_streaming: this.supportsStreaming,
      supports_tools: this.supportsTools,
      supports_vision: this.supportsVision,
      aliases: this.aliases,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: any): ModelInfo {
    return new ModelInfo(
      data.id,
      data.provider,
      data.display_name,
      data.input_price_per_token,
      data.output_price_per_token,
      data.max_input_tokens,
      data.max_output_tokens,
      data.supports_streaming ?? true,
      data.supports_tools ?? false,
      data.supports_vision ?? false,
      data.aliases ?? [],
    );
  }
}
