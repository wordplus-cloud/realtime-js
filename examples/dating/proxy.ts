import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Sends visitors who are not signed in to the sign-in page before the members' pages render. The pages check the
// session itself too: this only spares them a render.
export function proxy(request: NextRequest) {
    if (!getSessionCookie(request)) return NextResponse.redirect(new URL('/signin', request.url));
    return NextResponse.next();
}

export const config = { matcher: ['/members/:path*', '/messages', '/profile'] };
