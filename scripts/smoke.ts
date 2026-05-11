/**
 * Manual smoke test — exercises the real wire contract before release.
 *
 * Run before tagging a release to verify the SDK still agrees with a live
 * Solvela gateway. Catches wire-format drift that unit/integration tests
 * cannot (header names, JSON field renames, accepts-array ordering, new
 * required fields).
 *
 * Usage:
 *   SOLVELA_GATEWAY_URL=https://staging.solvela.ai \
 *   npm run smoke
 *
 * Defaults to http://localhost:8402 if SOLVELA_GATEWAY_URL is unset.
 *
 * Exit codes:
 *   0 — all assertions passed
 *   1 — an assertion failed or the gateway is unreachable
 */

import { SolvelaClient } from '../src/index.js';
import { ChatMessage, ChatRequest, type ModelInfo } from '../src/index.js';
import { ClientError, PaymentRequiredError } from '../src/index.js';

async function main(): Promise<number> {
  const gatewayUrl = process.env.SOLVELA_GATEWAY_URL ?? 'http://localhost:8402';
  console.log(`Smoke test against: ${gatewayUrl}\n`);

  let client: SolvelaClient;
  try {
    client = new SolvelaClient({ config: { gatewayUrl } });
  } catch (exc) {
    if (exc instanceof ClientError) {
      console.log(`FAIL: client construction rejected gateway URL: ${exc.message}`);
      return 1;
    }
    console.log(`FAIL: client construction raised ${(exc as Error).name}: ${(exc as Error).message}`);
    return 1;
  }

  // 1. models() reaches the gateway and parses the response.
  let models: ModelInfo[];
  try {
    models = await client.models();
  } catch (exc) {
    console.log(`FAIL: models() raised ${(exc as Error).name}: ${(exc as Error).message}`);
    return 1;
  }
  console.log(`  models()           -> ${models.length} model(s) returned`);
  if (models.length === 0) {
    console.log('FAIL: expected at least one model from the gateway');
    return 1;
  }
  const sampleModel = models[0];
  console.log(
    `  sample model       -> id=${JSON.stringify(sampleModel.id)} ctx=${sampleModel.contextWindow} in=${sampleModel.inputUsdcPerMillion}/M out=${sampleModel.outputUsdcPerMillion}/M`,
  );

  // Guard against silent ModelInfo wire drift: every prior shape change
  // surfaced as all-zero pricing / all-false capabilities. Assert at least
  // one model in the registry exposes streaming and paid input pricing.
  const anyStreaming = models.some((m) => m.supportsStreaming);
  const anyPriced = models.some((m) => m.inputUsdcPerMillion > 0);
  if (!anyStreaming) {
    console.log('FAIL: no model reports supportsStreaming=true — capabilities parsing may be drifted');
    return 1;
  }
  if (!anyPriced) {
    console.log('FAIL: no model reports inputUsdcPerMillion > 0 — pricing parsing may be drifted');
    return 1;
  }
  if (!sampleModel.displayName || !sampleModel.provider) {
    console.log('FAIL: sample model missing displayName or provider');
    return 1;
  }

  // 2. Unsigned chat returns 402 with a parseable PaymentRequired body.
  const req = new ChatRequest(sampleModel.id, [new ChatMessage('user', 'ping')]);
  try {
    await client.chat(req);
  } catch (exc) {
    if (exc instanceof PaymentRequiredError) {
      const pr = exc.paymentRequired;
      const total = pr.costBreakdown.total;
      const currency = pr.costBreakdown.currency;
      const schemes = pr.accepts.map((a) => a.scheme);
      console.log(
        `  chat() unsigned    -> 402 OK (total=${total} ${currency}, schemes=${JSON.stringify(schemes)})`,
      );
      if (pr.accepts.length === 0) {
        console.log('FAIL: 402 response had empty accepts array');
        return 1;
      }
      console.log('\nSmoke test PASSED');
      return 0;
    }
    console.log(
      `FAIL: chat() raised ${(exc as Error).name} (expected PaymentRequiredError): ${(exc as Error).message}`,
    );
    return 1;
  }

  console.log('FAIL: chat() returned a response with no signer configured (expected 402)');
  return 1;
}

main().then((code) => process.exit(code));
