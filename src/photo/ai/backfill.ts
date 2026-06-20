import { createHash } from 'crypto';

// PLOG-10: idempotency for the batch AI backfill worker. A photo's AI metadata
// is re-derived only when its input changed — keyed by a sha256 over the image
// bytes + the prompt version + the model id. A second run over an unchanged
// library is a no-op (and the provider Batch API spend is near-zero).

export type MetadataStatus = 'pending' | 'done' | 'failed';

export const computeInputHash = (
  imageBytes: ArrayBuffer | Uint8Array | Buffer,
  promptVersion: string,
  model: string,
): string => {
  const hash = createHash('sha256');
  hash.update(Buffer.from(imageBytes as Uint8Array));
  hash.update('\0');
  hash.update(promptVersion);
  hash.update('\0');
  hash.update(model);
  return hash.digest('hex');
};

// Skip a photo iff it's already marked done AND its stored input hash matches
// the freshly-computed one (same image + prompt + model → same metadata).
export const shouldSkipBackfill = (
  status: MetadataStatus | null | undefined,
  storedHash: string | null | undefined,
  currentHash: string,
): boolean => status === 'done' && !!storedHash && storedHash === currentHash;
