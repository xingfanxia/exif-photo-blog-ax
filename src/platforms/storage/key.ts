import { z } from 'zod';

// PLOG-12: storage keys are flat object names (`photo-<id>.jpg`,
// `upload-<id>.jpg`) — safe chars only, no `..` traversal, bounded length.
// Kept in its own pure module so the presigned-URL route can validate without
// pulling the storage-backend barrel (which loads @vercel/blob → undici).
export const StorageKeySchema = z.string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9._/-]+$/, 'Invalid storage key')
  .refine(k => !k.includes('..'), 'Path traversal not allowed');
