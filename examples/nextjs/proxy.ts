// The demo in front of its pages (lib/demo.ts). A new visitor opening the start page gets their shop there and then,
// with no redirect to /demo and back, which a search engine, keeping no cookie, would follow without end.
//
// And a window as one of its shop people: /as/<token> is the shop page for the person of the token, who the page and
// its server actions then are, whatever the browser cookie says. No search engine keeps a window (noindex): each new
// shop has new tokens, so it would find new addresses without end.
import { NextResponse, type NextRequest } from 'next/server';
import { DEMO, startVisitor } from '@/lib/demo';
import { COOKIE, userOfToken } from '@/lib/session';

export function proxy(request: NextRequest) {
    const headers = new Headers(request.headers);
    if (request.nextUrl.pathname === '/') {
        if (!DEMO || request.method !== 'GET' || userOfToken(request.cookies.get(COOKIE)?.value) !== null) return NextResponse.next();
        const token = startVisitor(request.headers);
        headers.set('x-shop-token', token);
        const response = NextResponse.next({ request: { headers } });
        response.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
        return response;
    }

    headers.set('x-shop-token', request.nextUrl.pathname.slice('/as/'.length));
    const response = NextResponse.rewrite(new URL('/', request.url), { request: { headers } });
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

export const config = {
    matcher: ['/', '/as/:token'],
};
