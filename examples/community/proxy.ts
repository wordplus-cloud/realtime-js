import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/** The club's pages, for its members: the club, its channels, lounges, events and members, and the files shared. */
const SIGNED_IN = /^\/(club|channels|lounges|events|studio|members|files)(\/|$)/;

// Sends visitors who are not signed in to the sign-in page before the club's pages render. The pages check the session
// itself too: this only spares them a render.
export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (SIGNED_IN.test(pathname) && !getSessionCookie(request)) return NextResponse.redirect(new URL('/signin', request.url));
    const response = NextResponse.next();
    // The public demo alone (CLUB_WORLDS=1, lib/worlds.ts): search engines keep its home page and nothing else, as every
    // visitor's club has numbers no other visitor's has.
    if (process.env.CLUB_WORLDS === '1' && pathname !== '/') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

// Every address but Next's own files.
export const config = { matcher: '/((?!_next/).*)' };
