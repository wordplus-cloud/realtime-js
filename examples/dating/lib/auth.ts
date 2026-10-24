import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { db } from './db';

// Sign-up and sign-in with an email and a password. Better Auth keeps its tables (user, session, account) in our
// database: `npx auth migrate` makes them.
export const auth = betterAuth({
    database: db,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // Members numbered 1, 2, 3 … by the database, so their ids and their pages (/members/2) read plainly.
    advanced: { database: { generateId: 'serial' } },
    plugins: [nextCookies()], // lets server actions sign people in and out
});

/** The id of the signed-in user, as text ('2'), or null. */
export async function currentUserId(): Promise<string | null> {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user.id ?? null;
}
