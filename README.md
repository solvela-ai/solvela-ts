# @rustyclaw/sdk

TypeScript SDK for RustyClawRouter — Solana-native AI agent payment gateway.

AI agents pay for LLM API calls with USDC-SPL on Solana via the x402 protocol.

## Install

```bash
npm install @rustyclaw/sdk
```

Requires Node.js 18+.

## Quick Start

```typescript
import { RustyClawClient, ChatRequest, ChatMessage } from '@rustyclaw/sdk';

const client = new RustyClawClient({
  config: { gatewayUrl: 'http://localhost:8402' },
});

const request = new ChatRequest('gpt-4', [
  new ChatMessage('user', 'Hello!'),
]);

const response = await client.chat(request);
console.log(response.choices[0].message.content);
```

## With Wallet (Paid Requests)

```typescript
import { RustyClawClient, Wallet, KeypairSigner, ChatRequest, ChatMessage } from '@rustyclaw/sdk';

const wallet = Wallet.fromEnv('SOLANA_PRIVATE_KEY');
const signer = new KeypairSigner(wallet);

const client = new RustyClawClient({
  wallet,
  signer,
  config: { gatewayUrl: 'https://gateway.rustyclaw.com' },
});

const response = await client.chat(
  new ChatRequest('claude-sonnet-4-20250514', [
    new ChatMessage('user', 'Explain the x402 protocol.'),
  ]),
);
```

## OpenAI-Compatible Interface

```typescript
import { RustyClawClient, OpenAICompat } from '@rustyclaw/sdk';

const client = new RustyClawClient();
const openai = new OpenAICompat(client);

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Streaming

```typescript
const request = new ChatRequest('gpt-4', [
  new ChatMessage('user', 'Tell me a story.'),
]);

for await (const chunk of client.chatStream(request)) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

## Configuration

```typescript
const client = new RustyClawClient({
  config: {
    gatewayUrl: 'http://localhost:8402',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    timeout: 180,
    enableCache: true,
    enableSessions: true,
    sessionTtl: 1800,
    enableQualityCheck: true,
    maxQualityRetries: 1,
    preferEscrow: false,
    expectedRecipient: 'wallet-address',
    maxPaymentAmount: 5000000,
    freeFallbackModel: 'deepseek-chat',
  },
});
```

## License

MIT
