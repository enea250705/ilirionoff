import type { DataStream } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';

const GenerateImageSchema = z.object({
  prompt: z.string().min(1),
});

type GenerateImageProps = {
  session: Session | null;
  dataStream: DataStream<unknown>;
};

export function generateImage({ session, dataStream }: GenerateImageProps) {
  // Create a tool object with name and description to make it compatible with AI SDK
  return {
    name: 'generateImage',
    description: 'Generate an image based on an Albanian text prompt',
    execute: async (input: unknown) => {
      if (!session?.user) {
        throw new Error('Unauthorized');
      }

      const { prompt } = GenerateImageSchema.parse(input);

      // Check if the prompt is in Albanian
      // This is a simple check - ideally you'd use a more sophisticated language detection method
      const nonAlbanianKeywords = ['the', 'and', 'or', 'of', 'in', 'create', 'generate', 'hello', 'good', 'what'];
      const containsNonAlbanianWords = nonAlbanianKeywords.some(word => 
        prompt.toLowerCase().includes(` ${word} `) || 
        prompt.toLowerCase().startsWith(`${word} `) || 
        prompt.toLowerCase().endsWith(` ${word}`));

      if (containsNonAlbanianWords) {
        throw new Error('Më vjen keq, mund të gjeneroj imazhe vetëm nga përshkrimet në gjuhën shqipe.');
      }

      try {
        // Log the Albanian prompt for debugging
        console.log('Generating image from Albanian prompt:', prompt);
        
        // For now, return a placeholder image URL with Albanian colors
        const imageUrl = `https://placehold.co/512x512/E31212/FFFFFF/png?text=${encodeURIComponent(prompt)}`;
        
        // Send markdown with image to the chat
        dataStream.append({
          type: 'text',
          text: `Imazhi u gjenerua me sukses! \n\n![${prompt}](${imageUrl})`,
        });

        return {
          message: 'Imazhi u gjenerua me sukses!',
          url: imageUrl,
        };
      } catch (error) {
        console.error('Failed to generate image:', error);
        throw new Error('Ndodhi një gabim gjatë gjenerimit të imazhit. Ju lutemi provoni përsëri.');
      }
    }
  };
} 