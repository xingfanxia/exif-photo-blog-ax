/* eslint-disable max-len */

import { Tags } from '@/tag';

export type AiAutoGeneratedField =
  'title' |
  'caption' |
  'tags' |
  'semantic'

export const AI_AUTO_GENERATED_FIELDS_ALL: AiAutoGeneratedField[] = [
  'title',
  'caption',
  'tags',
  'semantic',
];

export const AI_AUTO_GENERATED_FIELDS_DEFAULT: AiAutoGeneratedField[] = [
  'title',
  'tags',
  'semantic',
];

export const parseAiAutoGeneratedFieldsString = (
  text = AI_AUTO_GENERATED_FIELDS_DEFAULT.join(','),
): AiAutoGeneratedField[] => {
  const textFormatted = text.trim().toLocaleLowerCase();
  if (textFormatted === 'none') {
    return [];
  } else if (textFormatted === 'all') {
    return AI_AUTO_GENERATED_FIELDS_ALL;
  } else {
    const fields = textFormatted
      .toLocaleLowerCase()
      .split(',')
      .map(field => field.trim())
      .filter(field => AI_AUTO_GENERATED_FIELDS_ALL
        .includes(field as AiAutoGeneratedField));
    return fields as AiAutoGeneratedField[];
  }
};

export type AiImageQuery =
  'title' |
  'caption' |
  'title-and-caption' |
  'tags' |
  'description-small' |
  'description' |
  'description-large' |
  'description-semantic';

export const getAiImageQuery = (
  query: AiImageQuery,
  existingTags: Tags = [],
): string => {
  switch (query) {
  case 'title': return 'You are a creative bilingual photography curator with an eye for authenticity. Create a fresh, meaningful title in both English and Chinese that captures the true essence of this moment. IMPORTANT: Avoid both clichéd poetic words (like "echoes", "whispers", "dreams", "soul") AND technical/scientific terms. Instead, focus on: the genuine mood, the distinct atmosphere, key visual elements, or the story suggested by the scene. Draw inspiration from the actual feeling, time, place, or natural elements present. Format: "English Title | 中文标题". Keep each title within 5-6 words. Each title should feel authentic to the specific image - if it could apply to any photo, start over. Do not describe or identify any people.';
  case 'caption': return 'As a photography curator with an eye for authenticity, craft a bilingual caption that reveals the true character of this scene. Focus on the distinctive visual qualities that make this moment special - the interplay of light, the mood of the colors, the texture of the environment, or the atmosphere of the moment. Avoid technical jargon and clichéd descriptions. Format: "English Caption | 中文说明". Keep each caption within 10 words but make them meaningful. If the caption could describe any similar photo, start over. Do not describe or identify any people.';
  case 'title-and-caption': return 'You are a creative bilingual photography curator who values authenticity. First, create a meaningful title that avoids both clichés (no "echoes", "whispers", "dreams", "soul") and technical jargon. Focus on the genuine mood, atmosphere, and key elements that make this image unique. Draw from the actual feeling, time, place, or natural elements present. Then write a complementary caption that deepens this authentic perspective. Format: Title: "English Title | 中文标题" Caption: "English Caption | 中文说明". Keep titles within 5-6 words and captions within 8 words. If either could apply to any photo, start over. Do not describe or identify any people.';
  case 'tags':
    const tagQuery = 'First, identify which ONE genre best describes this image from ONLY these options: portrait photography (人像摄影), landscape photography (风光摄影), animal photography (动物摄影), street photography (街拍摄影), event photography (活动摄影). Then generate exactly 5 bilingual tags with this format: "English term (中文翻译)". Your tags MUST follow this specific structure: 1) The genre you identified, 2-4) UP TO THREE key subject/theme tags - identify the most prominent or distinctive subjects or themes in the image (don\'t use generic terms like "nature" or "building"). Format your response as a simple comma-separated list. This is to generate tags for a photo, not to describe and identify people in the image. Example: "landscape photography (风光摄影), mountain ridge (山脊), morning fog (晨雾), alpine trees (高山树木)"';
    return tagQuery;
  case 'description-small': return 'Write a concise yet vivid description focusing on the key visual elements, mood, and atmosphere. Start directly with active, descriptive language. Focus on what makes this image unique or striking. Avoid generic phrases like "This image shows" or "This is a picture of".';
  case 'description': return 'Write a balanced description that covers composition, lighting, mood, and subject matter. Include notable technical aspects like depth of field, color palette, or framing. Describe the overall visual impact and any interesting details that contribute to the image\'s story.';
  case 'description-large': return 'Provide a comprehensive analysis of the image covering: 1) Technical aspects (composition, lighting, color, focus), 2) Subject matter and visual elements, 3) Mood and atmosphere, 4) Artistic choices and their impact, 5) Notable details and their contribution to the overall image. Use specific photography terminology where relevant.';
  case 'description-semantic': return 'List exactly 5 key elements or subjects in this image as a comma-separated list. Focus on concrete, visually distinct elements that define the scene. List them in order of visual prominence. Be specific but concise, using precise nouns without additional description.';
  }
};

export const parseTitleAndCaption = (text: string) => {
  const matches = text.includes('Title')
    ? text.match(/^[`'"]*Title: ["']*(.*?)["']*[ ]*Caption: ["']*(.*?)\.*["']*[`'"]*$/)
    : text.match(/^(.*?): (.*?)$/);

  return {
    title: matches?.[1] ?? '',
    caption: matches?.[2] ?? '',
  };
};

export const cleanUpAiTextResponse = (text: string) =>
  text
    .replaceAll('\n', ' ')
    .replaceAll('"', '')
    .replace(/\.$/, '');
