import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/** The pages of signed-in people: the experts and the appointments, and the files sent in them. */
const SIGNED_IN = /^\/(experts|appointments|files)(\/|$)/;

// Sends visitors who are not signed in to the sign-in page before the pages of signed-in people render. The pages check
// the session itself too: this only spares them a render.
export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (SIGNED_IN.test(pathname) && !getSessionCookie(request)) return NextResponse.redirect(new URL('/signin', request.url));
    const response = NextResponse.next();
    // The public demo alone (CONSULT_WORLDS=1, lib/worlds.ts): search engines keep its home page and nothing else, as
    // every visitor's experts, clients and appointments have numbers no other visitor's have.
    if (process.env.CONSULT_WORLDS === '1' && pathname !== '/') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

// Every address but Next's own files.
export const config = { matcher: '/((?!_next/).*)' };
