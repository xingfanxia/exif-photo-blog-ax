// Pure, client+server-safe custom Next.js image loader (PLOG-6).
//
// Maps a requested render width to the nearest PRE-GENERATED R2 variant
// (sm=200 / md=640 / lg=1080, all `.jpg`) and returns its ABSOLUTE URL, so
// image bytes are served straight from Cloudflare R2 (e.g. photos.xiax.xyz)
// and bypass Vercel's `/_next/image` optimizer hop (perf + egress win).
//
// MUST stay pure: next.config references this file by path and Next imports it
// in a constrained (client-included) context — no `@/` server imports here.
//
// Non-R2 srcs (QR data URIs, vercel-blob, AWS S3, icons) pass through
// unchanged — a mis-parse here silently regresses egress, so the parse is
// defensive and unit-tested (see __tests__/imageLoader.test.ts). The
// VARIANTS sizes mirror OPTIMIZED_FILE_SIZES in photo/storage; the test
// asserts they don't desync, and IMAGE_LOADER_SIZES feeds next.config's
// `imageSizes` from one place.

export const IMAGE_LOADER_VARIANTS = [
  { suffix: 'sm', size: 200 },
  { suffix: 'md', size: 640 },
  { suffix: 'lg', size: 1080 },
] as const;

export type ImageVariantSuffix =
  (typeof IMAGE_LOADER_VARIANTS)[number]['suffix'];
export type ImageVariantSize = (typeof IMAGE_LOADER_VARIANTS)[number]['size'];

// The widths Next should request (→ srcset). Consumed by next.config.
export const IMAGE_LOADER_SIZES: number[] =
  IMAGE_LOADER_VARIANTS.map(v => v.size);

// Nearest variant >= width; the largest for anything bigger.
export const suffixForWidth = (width: number): ImageVariantSuffix => {
  for (const { suffix, size } of IMAGE_LOADER_VARIANTS) {
    if (width <= size) { return suffix; }
  }
  return IMAGE_LOADER_VARIANTS[IMAGE_LOADER_VARIANTS.length - 1].suffix;
};

const r2PublicDomain = (): string =>
  (process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN ?? '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

export interface ImageLoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

export default function imageLoader({ src, width }: ImageLoaderArgs): string {
  const domain = r2PublicDomain();

  // Only rewrite R2-hosted photo URLs; everything else passes through so
  // QR/data/vercel-blob/S3/icon images are never broken by the loader.
  if (
    !domain ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    !src.includes(domain)
  ) {
    return src;
  }

  // Split `<urlBase>/<fileNameBase><.ext>` — defensive: bail to passthrough on
  // any shape we don't recognize rather than emit a broken variant URL.
  const match = src.match(/^(https?:\/\/[^?#]*)\/([^/?#]+?)(\.[^./?#]+)$/);
  if (!match) { return src; }

  const [, urlBase, fileNameBase] = match;

  // Already a variant (e.g. server-rendered srcset re-entry): leave it.
  if (/-(sm|md|lg)$/.test(fileNameBase)) { return src; }

  return `${urlBase}/${fileNameBase}-${suffixForWidth(width)}.jpg`;
}
