import imageLoader, {
  IMAGE_LOADER_VARIANTS,
  IMAGE_LOADER_SIZES,
  suffixForWidth,
} from '@/photo/imageLoader';

const R2 = 'photos.xiax.xyz';
const ORIGINAL = `https://${R2}/photo-abc123.jpg`;

describe('imageLoader (PLOG-6)', () => {
  const prev = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN = `https://${R2}`;
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN = prev;
  });

  it('pins the variant contract (must mirror OPTIMIZED_FILE_SIZES in storage)', () => {
    // photo/storage's OPTIMIZED_FILE_SIZES can't be imported here (its barrel
    // pulls @vercel/blob→undici, which crashes under jsdom). Both files carry a
    // cross-reference comment; this asserts the loader side of the contract.
    expect(IMAGE_LOADER_VARIANTS).toEqual([
      { suffix: 'sm', size: 200 },
      { suffix: 'md', size: 640 },
      { suffix: 'lg', size: 1080 },
    ]);
    expect(IMAGE_LOADER_SIZES).toEqual([200, 640, 1080]);
  });

  it('maps a width to the nearest variant suffix (>= width)', () => {
    expect(suffixForWidth(50)).toBe('sm');
    expect(suffixForWidth(200)).toBe('sm');
    expect(suffixForWidth(201)).toBe('md');
    expect(suffixForWidth(640)).toBe('md');
    expect(suffixForWidth(641)).toBe('lg');
    expect(suffixForWidth(4000)).toBe('lg'); // larger than any → largest
  });

  it('rewrites an R2 photo URL to the absolute variant URL', () => {
    expect(imageLoader({ src: ORIGINAL, width: 200 }))
      .toBe(`https://${R2}/photo-abc123-sm.jpg`);
    expect(imageLoader({ src: ORIGINAL, width: 800 }))
      .toBe(`https://${R2}/photo-abc123-lg.jpg`);
    // jpg output regardless of original extension
    expect(imageLoader({ src: `https://${R2}/photo-x.png`, width: 300 }))
      .toBe(`https://${R2}/photo-x-md.jpg`);
  });

  it('passes through non-R2 / data / blob / already-variant srcs unchanged', () => {
    expect(imageLoader({ src: 'data:image/png;base64,AAAA', width: 200 }))
      .toBe('data:image/png;base64,AAAA');
    expect(imageLoader({ src: 'https://blob.vercel-storage.com/x.jpg', width: 200 }))
      .toBe('https://blob.vercel-storage.com/x.jpg');
    expect(imageLoader({ src: 'https://example.com/qr.svg', width: 200 }))
      .toBe('https://example.com/qr.svg');
    // already a variant → not double-suffixed
    expect(imageLoader({ src: `https://${R2}/photo-abc123-md.jpg`, width: 1080 }))
      .toBe(`https://${R2}/photo-abc123-md.jpg`);
  });

  it('passes through when the R2 domain is not configured', () => {
    process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN = '';
    expect(imageLoader({ src: ORIGINAL, width: 200 })).toBe(ORIGINAL);
    process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN = `https://${R2}`;
  });
});
