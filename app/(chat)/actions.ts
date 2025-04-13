'use server';

import { generateText, Message } from 'ai';
import { cookies } from 'next/headers';

import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}) {
  try {
    // Get the user message content as a string
    const userContent = typeof message.content === 'string' 
      ? message.content 
      : JSON.stringify(message.content);
    
    // For short messages, use them directly as titles
    if (userContent.length < 30) {
      return userContent;
    }
    
    // For longer messages, create a simple title
    const words = userContent.split(/\s+/);
    if (words.length <= 6) {
      return userContent;
    }
    
    // Otherwise create a title from the first few words
    const shortTitle = words.slice(0, 5).join(' ') + '...';
    
    // Albanian titles for different message types
    if (userContent.match(/\?$/)) {
      return `Pyetje: ${shortTitle}`;
    }
    
    if (userContent.toLowerCase().includes('përshëndetje') || 
        userContent.toLowerCase().includes('pershendetje') ||
        userContent.toLowerCase().includes('tungjatjeta')) {
      return 'Bisedë e re';
    }
    
    return shortTitle;
  } catch (error) {
    console.error("Title generation failed completely:", error);
    return "Bisedë e Re";
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}
