/* eslint-disable max-len */

export type AiAutoGeneratedField =
  'title' |
  'caption' |
  'tags' |
  'semantic'

export const ALL_AI_AUTO_GENERATED_FIELDS: AiAutoGeneratedField[] = [
  'title',
  'caption',
  'tags',
  'semantic',
];

export const parseAiAutoGeneratedFieldsText = (
  text = 'all',
): AiAutoGeneratedField[] => {
  const textFormatted = text.trim().toLocaleLowerCase();
  if (textFormatted === 'none') {
    return [];
  } else if (textFormatted === 'all') {
    return ALL_AI_AUTO_GENERATED_FIELDS;
  } else {
    const fields = textFormatted
      .toLocaleLowerCase()
      .split(',')
      .map(field => field.trim())
      .filter(field => ALL_AI_AUTO_GENERATED_FIELDS
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

export const AI_IMAGE_QUERIES: Record<AiImageQuery, string> = {
  'title': 'Create two poetic titles (each 2-3 words) that capture the mood, emotion, or essence of this image - one in English and one in Chinese (with only chinese characters). Draw from poetry, literature, famous quotes, or cultural sayings that resonate with the image\'s theme. The titles should explore various perspectives: temporal, emotional, metaphysical, natural, abstract, or sensory. They don\'t need to be direct translations but should both connect to the image\'s essence.',
  
  'caption': 'Write two artistic captions (6-12 words each) that capture the soul of this moment - one in English and one in Chinese (with only chinese characters). Draw from poetry, literature, famous quotes, or cultural sayings that reflect the image\'s theme. Use different poetic devices and emotional tones while considering cultural perspectives. The captions don\'t need to be direct translations but should both relate to the image\'s essence.',
  
  'title-and-caption': 'Create a poetic title (2-3 words) and caption (6-12 words) in both English and Chinese that capture this image\'s essence. Draw from poetry, literature, famous quotes, or cultural sayings that reflect the image\'s theme. Use different poetic devices and emotional tones while considering cultural perspectives. The responses don\'t need to be direct translations but should both relate to the image\'s essence.',
  
  'tags': 'Analyze this image and provide bilingual tags. Start with English tags (3-5 tags: primary genre first [must be exactly one of: landscape, portraiture, animal, street, cars, event], followed by subjects, colors, actions, emotions), then Chinese equivalent tags.',
  
  'description-small': 'Provide a concise but evocative description that captures the soul and atmosphere of this image in both English and Chinese. Focus on the emotional resonance, mood, and artistic impact while noting key visual elements that contribute to its poetic quality.',
  
  'description': 'Create a detailed analysis of this image that weaves together both artistic and emotional elements in English and Chinese. Explore the interplay of light, composition, and moment that creates its unique atmosphere. Describe how technical choices enhance the image\'s emotional impact and poetic narrative.',
  
  'description-large': 'Provide an in-depth poetic analysis of this image in both English and Chinese. Include: 1) The emotional atmosphere and mood it evokes 2) How light, color, and composition create artistic impact 3) The deeper narrative or metaphorical elements suggested 4) The way technical choices support the emotional story 5) The unique artistic voice or perspective expressed through this image.',
  
  'description-semantic': 'List 5 highly specific key elements, focusing on unique details, actions, or features that distinguish this particular image. Include precise descriptions of subjects, notable visual elements, and distinctive characteristics.'
};

interface BilingualResponse {
  english: string;
  chinese: string;
}

interface TitleAndCaptionResponse {
  title: BilingualResponse;
  caption: BilingualResponse;
}

interface TagsResponse {
  genre: string;
  english_tags: string[];
  chinese_tags: string[];
}

const validateBilingualResponse = (response: BilingualResponse): boolean => {
  const { english, chinese } = response;
  
  console.log('Validating bilingual response:', { english, chinese });
  
  // Check for empty or whitespace-only responses
  if (!english?.trim() || !chinese?.trim()) {
    console.log('Failed: empty or whitespace-only response');
    return false;
  }

  // Check for Chinese characters in Chinese response
  const chineseRegex = /[\u4e00-\u9fa5]/;
  if (!chineseRegex.test(chinese)) {
    console.log('Failed: no Chinese characters in Chinese response');
    return false;
  }

  // Check for English characters in English response
  const englishRegex = /[a-zA-Z]/;
  if (!englishRegex.test(english)) {
    console.log('Failed: no English characters in English response');
    return false;
  }

  console.log('Bilingual response validation passed');
  return true;
};

const validateTitleAndCaption = (response: TitleAndCaptionResponse): boolean => {
  console.log('Validating title and caption:', response);
  
  // Validate title and caption exist
  if (!response.title || !response.caption) {
    console.log('Failed: missing title or caption');
    return false;
  }

  // Validate both parts
  console.log('Validating title bilingual response');
  if (!validateBilingualResponse(response.title)) {
    console.log('Failed: invalid title bilingual response');
    return false;
  }

  console.log('Validating caption bilingual response');
  if (!validateBilingualResponse(response.caption)) {
    console.log('Failed: invalid caption bilingual response');
    return false;
  }

  // Validate title length (2-3 words for English, 2-4 characters for Chinese)
  const englishTitleWords = response.title.english.trim().split(/\s+/).length;
  const chineseTitleChars = response.title.chinese.trim().length;
  console.log('Title length validation:', { englishTitleWords, chineseTitleChars });
  
  if (englishTitleWords < 2 || englishTitleWords > 3 || chineseTitleChars < 2 || chineseTitleChars > 4) {
    console.log('Failed: title length validation');
    return false;
  }

  // Validate caption length (4-12 words for English, 4-15 characters for Chinese)
  const englishCaptionWords = response.caption.english.trim().split(/\s+/).length;
  const chineseCaptionChars = response.caption.chinese.trim().length;
  console.log('Caption length validation:', { englishCaptionWords, chineseCaptionChars });
  
  if (englishCaptionWords < 4 || englishCaptionWords > 12 || chineseCaptionChars < 4 || chineseCaptionChars > 15) {
    console.log('Failed: caption length validation');
    return false;
  }

  console.log('Title and caption validation passed');
  return true;
};

const validateTags = (response: TagsResponse): boolean => {
  console.log('Validating tags:', response);
  const validGenres = ['landscape', 'portraiture', 'animal', 'street', 'cars', 'event'];
  
  // Validate genre
  if (!response.genre || !validGenres.includes(response.genre.toLowerCase())) {
    console.log('Failed: invalid genre');
    return false;
  }

  // Validate English tags
  if (!Array.isArray(response.english_tags) || 
      response.english_tags.length < 3 || 
      response.english_tags.length > 5 ||
      !response.english_tags.every(tag => typeof tag === 'string' && tag.trim().length > 0)) {
    console.log('Failed: invalid English tags');
    return false;
  }

  // Validate Chinese tags
  if (!Array.isArray(response.chinese_tags) || 
      response.chinese_tags.length < 3 || 
      response.chinese_tags.length > 5 ||
      !response.chinese_tags.every(tag => typeof tag === 'string' && tag.trim().length > 0)) {
    console.log('Failed: invalid Chinese tags');
    return false;
  }

  // Validate Chinese characters in Chinese tags
  const chineseRegex = /[\u4e00-\u9fa5]/;
  if (!response.chinese_tags.every(tag => chineseRegex.test(tag))) {
    console.log('Failed: Chinese tags missing Chinese characters');
    return false;
  }

  console.log('Tags validation passed');
  return true;
};

export const parseBilingualResponse = (jsonStr: string): string => {
  try {
    console.log('Parsing bilingual response, input:', jsonStr);
    const response = JSON.parse(jsonStr) as BilingualResponse;
    console.log('Parsed bilingual response:', response);
    const result = {
      english: response.english.trim(),
      chinese: response.chinese.trim()
    };
    console.log('Processed bilingual result:', result);

    if (!validateBilingualResponse(result)) {
      console.log('Validation failed for bilingual response:', result);
      throw new Error('Invalid bilingual response format');
    }

    return `${result.english} | ${result.chinese}`;
  } catch (e) {
    console.error('Failed to parse bilingual response:', e);
    console.error('Original input:', jsonStr);
    return jsonStr;
  }
};

export const parseTitleAndCaption = (jsonStr: string): { title: string, caption: string } => {
  try {
    console.log('Parsing title and caption, input:', jsonStr);
    const response = JSON.parse(jsonStr) as TitleAndCaptionResponse;
    console.log('Parsed title and caption:', response);
    const result = {
      title: {
        english: response.title.english.trim(),
        chinese: response.title.chinese.trim()
      },
      caption: {
        english: response.caption.english.trim(),
        chinese: response.caption.chinese.trim()
      }
    };
    console.log('Processed title and caption result:', result);

    if (!validateTitleAndCaption(result)) {
      console.log('Validation failed for title and caption:', result);
      throw new Error('Invalid title and caption format');
    }

    return {
      title: `${result.title.english} | ${result.title.chinese}`,
      caption: `${result.caption.english} | ${result.caption.chinese}`
    };
  } catch (e) {
    console.error('Failed to parse title and caption:', e);
    console.error('Original input:', jsonStr);
    return {
      title: '',
      caption: ''
    };
  }
};

export const parseTags = (jsonStr: string): string => {
  try {
    console.log('Parsing tags, input:', jsonStr);
    const response = JSON.parse(jsonStr) as TagsResponse;
    console.log('Parsed tags:', response);
    
    if (!validateTags(response)) {
      console.log('Validation failed for tags:', response);
      throw new Error('Invalid tags format');
    }

    const tags = [
      response.genre.toLowerCase(),
      ...response.english_tags.map(tag => tag.toLowerCase().trim()),
      ...response.chinese_tags.map(tag => tag.trim())
    ];
    console.log('Processed tags result:', tags);

    return tags.join(',');
  } catch (e) {
    console.error('Failed to parse tags:', e);
    console.error('Original input:', jsonStr);
    return '';
  }
};

export const cleanUpAiTextResponse = (text: string) =>
  text
    .replaceAll('\n', ' ')
    .replaceAll('"', '')
    .replace(/\.$/, '')
    .trim();
