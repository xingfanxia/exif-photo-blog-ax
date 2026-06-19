import { generateText, Output, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_SECRET_KEY } from '@/app/config';
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

const MODEL_DEFAULT: OpenAIModel = 'gpt-5.2';
const MODEL_COMPATIBLE: OpenAIModel = 'gpt-4o';

const MODEL: OpenAIModel = OPENAI_MODEL === 'compatible'
  ? MODEL_COMPATIBLE
  : (OPENAI_MODEL || MODEL_DEFAULT);

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

const getImageTextArgs = (
  imageBase64: string,
  query: string,
): (
  Parameters<typeof streamText>[0] &
  Parameters<typeof generateText>[0]
) | undefined => openai ? {
  model: openai(MODEL),
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

export const streamOpenAiImageQuery = async (
  imageBase64: string,
  query: string,
) => {
  await checkRateLimitAndThrow();

  // Lazy import: @ai-sdk/rsc is RSC-only (no CJS exports), so a top-level
  // import would break Node/ts-node consumers of this module (e.g. the
  // standalone ai-backfill worker, which never streams). PLOG-10.
  const { createStreamableValue } = await import('@ai-sdk/rsc');
  const stream = createStreamableValue('');

  const args = getImageTextArgs(imageBase64, query);

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
) => {
  await checkRateLimitAndThrow(isBatch);

  const args = getImageTextArgs(imageBase64, query);

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
): Promise<z.infer<T>> => {
  await checkRateLimitAndThrow(isBatch);

  if (!openai) {
    throw new Error('No OpenAI client');
  }
  const client = openai;

  const run = async (q: string): Promise<z.infer<T>> => {
    const { output } = await generateText({
      model: client(MODEL),
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

export const testOpenAiConnection = async () => {
  await checkRateLimitAndThrow();

  if (openai) {
    return generateText({
      model: openai(MODEL),
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
