// Better Auth's routes: sign-up, sign-in, sign-out and the session, under /api/auth.
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

export const { GET, POST } = toNextJsHandler(auth);
