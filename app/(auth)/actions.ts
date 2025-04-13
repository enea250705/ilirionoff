'use server';

import { z } from 'zod';
import { hash } from 'bcrypt-ts';

import { createUser, getUser } from '@/lib/db/queries';

import { signIn } from './auth';

// Access the LOCAL_USERS object from auth.ts
// We'll define a simpler version here to avoid circular dependencies
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

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export interface LoginActionState {
  status: 'idle' | 'in_progress' | 'success' | 'failed' | 'invalid_data';
}

export const login = async (
  _: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: 'success' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    return { status: 'failed' };
  }
};

export interface RegisterActionState {
  status:
    | 'idle'
    | 'in_progress'
    | 'success'
    | 'failed'
    | 'user_exists'
    | 'invalid_data';
}

export const register = async (
  _: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    // Check in-memory users first
    if (global.LOCAL_USERS[validatedData.email]) {
      return { status: 'user_exists' } as RegisterActionState;
    }

    try {
      // Try database if available
      const [user] = await getUser(validatedData.email);
      if (user) {
        return { status: 'user_exists' } as RegisterActionState;
      }
      await createUser(validatedData.email, validatedData.password);
    } catch (dbError) {
      console.log("Database not available, creating in-memory user");
      
      // Create in-memory user instead
      const hashedPassword = await hash(validatedData.password, 10);
      global.LOCAL_USERS[validatedData.email] = {
        id: `user_${Object.keys(global.LOCAL_USERS).length + 1}`,
        email: validatedData.email,
        password: hashedPassword
      };
      console.log(`[AUTH] Registered new user: ${validatedData.email}`);
    }

    await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: 'success' };
  } catch (error) {
    console.error("Registration error:", error);
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    return { status: 'failed' };
  }
};
