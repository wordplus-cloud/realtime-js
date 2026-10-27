import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/** The members' pages: /members and a member's, /messages, /profile. */
const MEMBERS = /^\/(members(\/|$)|messages$|profile$)/;

// Sends visitors who are not signed in to the sign-in page before the members' pages render. The pages check the
// session itself too: this only spares them a render.
export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (MEMBERS.test(pathname) && !getSessionCookie(request)) return NextResponse.redirect(new URL('/signin', request.url));
    const response = NextResponse.next();
    // The public demo alone (SPARK_WORLDS=1, lib/worlds.ts): search engines keep its home page and nothing else, as
    // every visitor's people are their own, at numbers no other visitor's have.
    if (process.env.SPARK_WORLDS === '1' && pathname !== '/') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

// Every address but Next's own files.
export const config = { matcher: '/((?!_next/).*)' };
