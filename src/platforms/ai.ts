import { generateText, Output, streamText, LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_SECRET_KEY } from '@/app/config';
import { AI_MODEL, AI_GATEWAY_API_KEY } from '@/app/config-fork';
import { removeBase64Prefix } from '@/utility/image';
import { cleanUpAiTextResponse } from '@/photo/ai';
import {
  normalizeAiResult,
  AiResultRaw,
} from '@/photo/ai/normalizeAiResult';
import { AI_TAGS_MIN, AI_TAGS_MAX } from '@/photo/ai/prompts';
import {
  checkRateLimitAndThrow as _checkRateLimitAndThrow,
} from '@/platforms/rate-limit';
import { z } from 'zod';

type OpenAIModel = Parameters<NonNullable<typeof openai>>[0];

// Default OpenAI model for the direct-key escape hatch (was the stale
// 'gpt-5.2'; the OPENAI_MODEL='compatible' sentinel is dropped — PLOG-9).
const MODEL_DEFAULT: OpenAIModel = 'gpt-4o';
const MODEL: OpenAIModel = OPENAI_MODEL || MODEL_DEFAULT;

const checkRateLimitAndThrow = (isBatch?: boolean) =>
  _checkRateLimitAndThrow({
    identifier: 'openai-image-query',
    ...isBatch && { tokens: 1200, duration: '1d' },
  });

const openai = OPENAI_SECRET_KEY
  ? createOpenAI({
    apiKey: OPENAI_SECRET_KEY,
    ...OPENAI_BASE_URL && { baseURL: OPENAI_BASE_URL },
  })
  : undefined;

// Provider-agnostic vision model resolver (PLOG-9 Part 2). Priority:
//   injected model (test seam / explicit) → OpenAI key (escape hatch) →
//   AI Gateway model string (AI_MODEL, resolved by the AI SDK gateway).
// A string return is a valid `LanguageModel` in AI SDK v6 (GlobalProviderModelId
// → GatewayModelId). Tests inject a MockLanguageModelV2 to run offline.
export const getVisionModel = (
  model?: LanguageModel,
): LanguageModel | undefined => {
  if (model) { return model; }
  if (openai) { return openai(MODEL); }
  if (AI_GATEWAY_API_KEY) { return AI_MODEL; }
  return undefined;
};

const getImageTextArgs = (
  imageBase64: string,
  query: string,
  model?: LanguageModel,
): (
  Parameters<typeof streamText>[0] &
  Parameters<typeof generateText>[0]
) | undefined => {
  const visionModel = getVisionModel(model);
  return visionModel ? {
  model: visionModel,
  messages: [{
    'role': 'user',
    'content': [
      {
        'type': 'text',
        'text': query,
      }, {
        'type': 'image',
        'image': removeBase64Prefix(imageBase64),
      },
    ],
  }],
  } : undefined;
};

export const streamOpenAiImageQuery = async (
  imageBase64: string,
  query: string,
  model?: LanguageModel,
) => {
  await checkRateLimitAndThrow();

  // Lazy import: @ai-sdk/rsc is RSC-only (no CJS exports), so a top-level
  // import would break Node/ts-node consumers of this module (e.g. the
  // standalone ai-backfill worker, which never streams). PLOG-10.
  const { createStreamableValue } = await import('@ai-sdk/rsc');
  const stream = createStreamableValue('');

  const args = getImageTextArgs(imageBase64, query, model);

  if (args) {
    (async () => {
      const { textStream } = streamText(args);
      for await (const delta of textStream) {
        stream.update(cleanUpAiTextResponse(delta));
      }
      stream.done();
    })();
  }

  return stream.value;
};

export const generateOpenAiImageQuery = async (
  imageBase64: string,
  query: string,
  isBatch?: boolean,
  model?: LanguageModel,
) => {
  await checkRateLimitAndThrow(isBatch);

  const args = getImageTextArgs(imageBase64, query, model);

  if (args) {
    return generateText(args)
      .then(({ text }) => cleanUpAiTextResponse(text));
  }
};

export const generateOpenAiImageObjectQuery = async <T extends z.ZodSchema>(
  imageBase64: string,
  query: string,
  schema: T,
  isBatch?: boolean,
  model?: LanguageModel,
): Promise<z.infer<T>> => {
  await checkRateLimitAndThrow(isBatch);

  const visionModel = getVisionModel(model);
  if (!visionModel) {
    throw new Error('No AI vision model (set OPENAI_SECRET_KEY or AI_GATEWAY_API_KEY)');
  }

  const run = async (q: string): Promise<z.infer<T>> => {
    const { output } = await generateText({
      model: visionModel,
      output: Output.object({ schema }),
      messages: [{
        'role': 'user',
        'content': [
          { 'type': 'text', 'text': q },
          { 'type': 'image', 'image': removeBase64Prefix(imageBase64) },
        ],
      }],
    });
    // PLOG-9: code-enforced post-processing, THEN re-validate against the
    // schema. The old `as z.infer<T>` re-cast bypassed validation entirely.
    return schema.parse(
      normalizeAiResult((output ?? {}) as AiResultRaw),
    ) as z.infer<T>;
  };

  try {
    return await run(query);
  } catch {
    // One tolerant retry with a stricter instruction on parse/shape failure.
    return run(
      `${query}\n\nRespond ONLY with valid JSON matching the schema. ` +
      `"tags" must be an array of ${AI_TAGS_MIN}-${AI_TAGS_MAX} specific, ` +
      'non-generic keywords.',
    );
  }
};

export const testOpenAiConnection = async (model?: LanguageModel) => {
  await checkRateLimitAndThrow();

  const visionModel = getVisionModel(model);
  if (visionModel) {
    return generateText({
      model: visionModel,
      messages: [{
        'role': 'user',
        'content': [
          {
            'type': 'text',
            'text': 'Test connection',
          },
        ],
      }],
    });
  }
};
