import { compare, hash } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getUser } from '@/lib/db/queries';

import { authConfig } from './auth.config';

interface ExtendedSession extends Session {
  user: User;
}

// In-memory users for local testing
interface LocalUser {
  id: string;
  email: string;
  password: string;
}

declare global {
  var LOCAL_USERS: Record<string, LocalUser>;
}

// Initialize the global if it doesn't exist
if (!global.LOCAL_USERS) {
  global.LOCAL_USERS = {};
}

// Register a demo user for testing
async function addDemoUser(email: string, plainPassword: string) {
  if (!global.LOCAL_USERS[email]) {
    const hashedPassword = await hash(plainPassword, 10);
    global.LOCAL_USERS[email] = {
      id: `user_${Object.keys(global.LOCAL_USERS).length + 1}`,
      email,
      password: hashedPassword
    };
    console.log(`[AUTH] Added demo user: ${email}`);
  }
}

// Add demo accounts
(async () => {
  await addDemoUser('demo@ilirion.ai', 'Ilirion2024!');
  await addDemoUser('enea@ilirion.ai', 'Albania2024!');
  await addDemoUser('admin@ilirion.ai', 'Admin1234!');
})();

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        try {
          // First try the in-memory users (for local testing)
          if (global.LOCAL_USERS[email]) {
            const user = global.LOCAL_USERS[email];
            const passwordsMatch = await compare(password, user.password);
            if (passwordsMatch) {
              return { id: user.id, email: user.email } as any;
            }
          }

          // If not found in memory, try the database (for production)
          try {
            const users = await getUser(email);
            if (users.length === 0) return null;
            // biome-ignore lint: Forbidden non-null assertion.
            const passwordsMatch = await compare(password, users[0].password!);
            if (!passwordsMatch) return null;
            return users[0] as any;
          } catch (dbError) {
            console.log("Database not available, using in-memory authentication only");
            return null;
          }
        } catch (error) {
          console.error("Authentication error:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },
    async session({
      session,
      token,
    }: {
      session: ExtendedSession;
      token: any;
    }) {
      if (session.user) {
        session.user.id = token.id as string;
      }

      return session;
    },
  },
});
