// Who is signed in: the example stand-in for your sign-in (Auth.js, Clerk, your own sessions), a signed token the
// sign-in page server action keeps in a cookie, `<user>.<signature>`. On a demo, a window may be someone else: its
// address names their token (/as/<token>, which proxy.ts passes on as X-Shop-Token), and its requests to the realtime
// routes carry it as a bearer.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { person } from './shop';

const SIGNING = process.env.SESSION_SECRET || 'example-shop';
export const COOKIE = process.env.WORDPLUS_DEMO === '1' ? '__Host-shop-user' : 'shop-user';

/** The token of a user: their id and its signature. */
export const sign = (id: number) => `${id}.${createHmac('sha256', SIGNING).update(String(id)).digest('base64url')}`;

/** The user a token names, if its signature is right and they are one of the people of a shop. */
export function userOfToken(token: string | null | undefined): number | null {
    const id = Number(String(token ?? '').split('.')[0]);
    if (!person(id)) return null;
    const expected = Buffer.from(sign(id));
    const given = Buffer.from(String(token));
    return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

/** This request user: the person of the window on a demo, else that of the browser, or null. */
export async function currentUserId(): Promise<number | null> {
    const asked = await headers();
    const bearer = asked.get('authorization')?.replace(/^Bearer /, '');
    return userOfToken(asked.get('x-shop-token')) ?? userOfToken(bearer) ?? userOfToken((await cookies()).get(COOKIE)?.value);
}

/** The token this request window is signed in with, for a demo page to send on. */
export async function currentToken(): Promise<string | null> {
    const user = await currentUserId();
    return user === null ? null : sign(user);
}
