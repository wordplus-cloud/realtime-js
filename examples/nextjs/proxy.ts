// A demo window as one of its shop people (lib/demo.ts): /as/<token> is the shop page for the person of the token,
// who the page and its server actions then are, whatever the browser cookie says. No search engine keeps a window
// (noindex): each new shop has new tokens, so it would find new addresses without end.
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const token = request.nextUrl.pathname.slice('/as/'.length);
    const headers = new Headers(request.headers);
    headers.set('x-shop-token', token);
    const response = NextResponse.rewrite(new URL('/', request.url), { request: { headers } });
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

export const config = {
    matcher: '/as/:token',
};
