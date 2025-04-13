import 'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { and, asc, desc, eq, gt, gte, inArray, lt, SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  Chat,
} from './schema';
import { ArtifactKind } from '@/components/artifact';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// Create a mock database for local development when no DB connection is available
let db: any;

try {
  // Only attempt to connect to the database if the URL is provided
  if (process.env.POSTGRES_URL) {
    const client = postgres(process.env.POSTGRES_URL);
    db = drizzle(client);
    console.log("Database connection established");
  } else {
    console.log("No database URL provided, using mock database");
    // Create a mock db with no-op functions for testing
    db = {
      select: () => ({ from: () => ({ where: () => [], orderBy: () => [], limit: () => [] }) }),
      insert: () => ({ values: () => [] }),
      delete: () => ({ where: () => [] }),
    };
  }
} catch (error) {
  console.error("Failed to connect to database:", error);
  // Create a mock db with no-op functions for testing
  db = {
    select: () => ({ from: () => ({ where: () => [], orderBy: () => [], limit: () => [] }) }),
    insert: () => ({ values: () => [] }),
    delete: () => ({ where: () => [] }),
  };
}

// In-memory database for local development
const inMemoryDb = {
  users: new Map<string, User>(),
  chats: new Map<string, Chat>(),
  messages: new Map<string, DBMessage[]>(),
  votes: new Map<string, any[]>(),
  documents: new Map<string, any[]>(),
  suggestions: new Map<string, any[]>(),
};

export async function getUser(email: string): Promise<Array<User>> {
  try {
    // First check in-memory data
    for (const user of inMemoryDb.users.values()) {
      if (user.email === email) {
        return [user];
      }
    }
    
    // Then try the database
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database');
    // Return empty array instead of throwing
    return [];
  }
}

export async function createUser(email: string, password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  try {
    // Store in in-memory database
    const newUser = {
      id: `user_${Date.now()}`,
      email,
      password: hash
    };
    inMemoryDb.users.set(newUser.id, newUser);
    
    // Also try to store in the regular database
    try {
      await db.insert(user).values({ email, password: hash });
    } catch (dbError) {
      console.log("Could not save to database, but user was created in memory");
    }
    
    return newUser;
  } catch (error) {
    console.error('Failed to create user in database');
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    // Create chat in memory
    const newChat = {
      id,
      userId,
      title,
      createdAt: new Date(),
      visibility: 'private' as const,
    };
    inMemoryDb.chats.set(id, newChat);
    console.log(`Created chat in memory: ${id}`);
    
    // Also try to store in the database
    try {
      await db.insert(chat).values({
        id,
        createdAt: new Date(),
        userId,
        title,
      });
    } catch (dbError) {
      console.log("Could not save chat to database, but it was created in memory");
    }
    
    return newChat;
  } catch (error) {
    console.error('Failed to save chat in database');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    // First try in-memory data
    const userChats = Array.from(inMemoryDb.chats.values())
      .filter(chat => chat.userId === id)
      .sort((a, b) => {
        // Sort by created date descending
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    
    if (userChats.length > 0) {
      const extendedLimit = limit + 1;
      let filteredChats = [];
      
      if (startingAfter) {
        const startIndex = userChats.findIndex(chat => chat.id === startingAfter);
        if (startIndex !== -1) {
          filteredChats = userChats.slice(startIndex + 1, startIndex + 1 + extendedLimit);
        }
      } else if (endingBefore) {
        const endIndex = userChats.findIndex(chat => chat.id === endingBefore);
        if (endIndex !== -1) {
          filteredChats = userChats.slice(Math.max(0, endIndex - extendedLimit), endIndex);
        }
      } else {
        filteredChats = userChats.slice(0, extendedLimit);
      }
      
      const hasMore = filteredChats.length > limit;
      
      return {
        chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
        hasMore,
      };
    }
    
    // If no in-memory data, try database
    try {
      const extendedLimit = limit + 1;

      const query = (whereCondition?: SQL<any>) =>
        db
          .select()
          .from(chat)
          .where(
            whereCondition
              ? and(whereCondition, eq(chat.userId, id))
              : eq(chat.userId, id),
          )
          .orderBy(desc(chat.createdAt))
          .limit(extendedLimit);

      let filteredChats: Array<Chat> = [];

      if (startingAfter) {
        const [selectedChat] = await db
          .select()
          .from(chat)
          .where(eq(chat.id, startingAfter))
          .limit(1);

        if (!selectedChat) {
          throw new Error(`Chat with id ${startingAfter} not found`);
        }

        filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
      } else if (endingBefore) {
        const [selectedChat] = await db
          .select()
          .from(chat)
          .where(eq(chat.id, endingBefore))
          .limit(1);

        if (!selectedChat) {
          throw new Error(`Chat with id ${endingBefore} not found`);
        }

        filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
      } else {
        filteredChats = await query();
      }

      const hasMore = filteredChats.length > limit;

      return {
        chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
        hasMore,
      };
    } catch (dbError) {
      console.log("Database error in getChatsByUserId, using empty chats list:", dbError);
      // Return empty chats if database fails
      return {
        chats: [],
        hasMore: false,
      };
    }
  } catch (error) {
    console.error('Failed to get chats by user from database', error);
    // Return empty chats instead of throwing
    return {
      chats: [],
      hasMore: false,
    };
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    // Store messages in memory
    for (const msg of messages) {
      if (!inMemoryDb.messages.has(msg.chatId)) {
        inMemoryDb.messages.set(msg.chatId, []);
      }
      
      // Check for duplicates
      const existingMsgIndex = inMemoryDb.messages.get(msg.chatId)!.findIndex(m => m.id === msg.id);
      if (existingMsgIndex >= 0) {
        // Replace existing message
        inMemoryDb.messages.get(msg.chatId)![existingMsgIndex] = msg;
      } else {
        // Add new message
        inMemoryDb.messages.get(msg.chatId)!.push(msg);
      }
    }
    
    console.log(`Saved ${messages.length} messages in memory`);
    
    // Also try to store in the database
    try {
      return await db.insert(message).values(messages);
    } catch (dbError) {
      console.log("Could not save messages to database, but they were saved in memory");
      return null;
    }
  } catch (error) {
    console.error('Failed to save messages in database', error);
    return null;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    // First try to get messages from memory
    if (inMemoryDb.messages.has(id)) {
      const messages = inMemoryDb.messages.get(id) || [];
      
      // Sort messages by creation time
      return messages.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    }
    
    // If not in memory, try the database
    try {
      return await db
        .select()
        .from(message)
        .where(eq(message.chatId, id))
        .orderBy(asc(message.createdAt));
    } catch (dbError) {
      console.log("Could not get messages from database, returning empty array");
      return [];
    }
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    // Return empty array instead of throwing
    return [];
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db.insert(document).values({
      id,
      title,
      kind,
      content,
      userId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save document in database');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}
