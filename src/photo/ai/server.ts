import { generateOpenAiImageQuery } from '@/services/openai';
import {
  AI_IMAGE_QUERIES,
  AiAutoGeneratedField,
  AiImageQuery,
  parseTitleAndCaption,
  parseBilingualResponse,
  parseTags,
} from '.';

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateWithRetry = async (
  imageBase64: string,
  query: AiImageQuery,
  maxRetries = MAX_RETRIES,
  retryDelay = RETRY_DELAY
): Promise<string | undefined> => {
  let lastError: Error | undefined;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const response = await generateOpenAiImageQuery(imageBase64, query);
      if (response) return response;
    } catch (e: any) {
      lastError = e;
      if (i < maxRetries) {
        console.warn(`Retry ${i + 1}/${maxRetries} for ${query} due to:`, e.message);
        await sleep(retryDelay * (i + 1)); // Exponential backoff
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  return undefined;
};

export const generateAiImageQueries = async (
  imageBase64?: string,
  textFieldsToGenerate: AiAutoGeneratedField[] = [],
): Promise<{
  title?: { english: string; chinese: string }
  caption?: { english: string; chinese: string }
  tags?: string[]
  semanticDescription?: { english: string; chinese: string }
  error?: string
}> => {
  let title: { english: string; chinese: string } | undefined;
  let caption: { english: string; chinese: string } | undefined;
  let tags: string[] | undefined;
  let semanticDescription: { english: string; chinese: string } | undefined;
  let error: string | undefined;

  try {
    console.log('Starting AI image queries with fields:', textFieldsToGenerate);
    
    if (imageBase64) {
      if (
        textFieldsToGenerate.includes('title') &&
        textFieldsToGenerate.includes('caption')
      ) {
        console.log('Generating title and caption together');
        const titleAndCaption = await generateWithRetry(
          imageBase64,
          'title-and-caption'
        );
        console.log('Received title and caption response:', titleAndCaption);
        
        if (titleAndCaption) {
          const parsed = parseTitleAndCaption(titleAndCaption);
          console.log('Parsed title and caption:', parsed);
          title = parsed.title;
          caption = parsed.caption;
        }
      } else {
        if (textFieldsToGenerate.includes('title')) {
          console.log('Generating title only');
          const titleResponse = await generateWithRetry(
            imageBase64,
            'title'
          );
          console.log('Received title response:', titleResponse);
          
          if (titleResponse) {
            title = parseBilingualResponse(titleResponse);
            console.log('Parsed title:', title);
          }
        }
        if (textFieldsToGenerate.includes('caption')) {
          console.log('Generating caption only');
          const captionResponse = await generateWithRetry(
            imageBase64,
            'caption'
          );
          console.log('Received caption response:', captionResponse);
          
          if (captionResponse) {
            caption = parseBilingualResponse(captionResponse);
            console.log('Parsed caption:', caption);
          }
        }
      }
  
      if (textFieldsToGenerate.includes('tags')) {
        console.log('Generating tags');
        const tagsResponse = await generateWithRetry(
          imageBase64,
          'tags'
        );
        console.log('Received tags response:', tagsResponse);
        
        if (tagsResponse) {
          tags = parseTags(tagsResponse);
          console.log('Parsed tags:', tags);
        }
      }
  
      if (textFieldsToGenerate.includes('semantic')) {
        console.log('Generating semantic description');
        const semanticResponse = await generateWithRetry(
          imageBase64,
          'description-small'
        );
        console.log('Received semantic response:', semanticResponse);
        
        if (semanticResponse) {
          semanticDescription = parseBilingualResponse(semanticResponse);
          console.log('Parsed semantic description:', semanticDescription);
        }
      }
    }
  } catch (e: any) {
    error = e.message;
    console.error('Error generating AI image text:', e);
    console.error('Error details:', {
      textFieldsToGenerate,
      hasImageBase64: !!imageBase64,
      currentTitle: title,
      currentCaption: caption,
      currentTags: tags,
      currentSemanticDescription: semanticDescription
    });
  }

  const result = {
    title,
    caption,
    tags,
    semanticDescription,
    error,
  };
  console.log('Final result:', result);
  return result;
};
