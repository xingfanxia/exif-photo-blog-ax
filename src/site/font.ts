import fs from 'fs';
import path from 'path';
import { cwd } from 'process';

const FONT_FAMILY_IBM_PLEX_MONO = 'IBMPlexMono';
const FONT_FAMILY_NOTO_SANS = 'NotoSansSC';

const getFontData = async (fontPath: string) => {
  let data;
  if (typeof fs !== 'undefined') {
    data = fs.readFileSync(path.join(cwd(), fontPath));
  } else {
    data = await fetch(new URL(fontPath, import.meta.url))
      .then(res => res.arrayBuffer());
  }
  return data;
};

export const getIBMPlexMonoMedium = async () => {
  const [latinFont, cjkFont] = await Promise.all([
    getFontData('/public/fonts/IBMPlexMono-Medium.ttf'),
    getFontData('/public/fonts/NotoSansSC-Medium.ttf')
  ]);

  return {
    fontFamily: FONT_FAMILY_IBM_PLEX_MONO,
    fonts: [
      {
        name: FONT_FAMILY_IBM_PLEX_MONO,
        data: latinFont,
        weight: 500,
        style: 'normal',
      } as const,
      {
        name: FONT_FAMILY_NOTO_SANS,
        data: cjkFont,
        weight: 500,
        style: 'normal',
      } as const,
    ],
  };
};
