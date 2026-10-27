import { NextResponse, type NextRequest } from 'next/server';

// The public demo alone (LESSONS_WORLDS=1, lib/worlds.ts): search engines keep its home page and nothing else. Every
// visitor's teachers, courses, lessons and photos are their own, at numbers no other visitor's have, so a crawler would
// find new addresses without end: every other one answers noindex. A site of your own has none of it.
export function proxy(request: NextRequest) {
    const response = NextResponse.next();
    if (process.env.LESSONS_WORLDS === '1' && request.nextUrl.pathname !== '/') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

// Every address but Next's own files.
export const config = { matcher: '/((?!_next/).*)' };
