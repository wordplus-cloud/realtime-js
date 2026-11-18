// A new visitor of a demo (WORDPLUS_DEMO=1, lib/demo.ts), sent here by /login or by a cookie of a shop that ended: a
// shop of their own, and they are its Ann. One opening the start page with no cookie gets theirs there (proxy.ts).
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { DEMO, startVisitor } from '@/lib/demo';
import { COOKIE } from '@/lib/session';

export async function GET(request: NextRequest) {
    if (!DEMO) return new NextResponse(null, { status: 404 });
    (await cookies()).set(COOKIE, startVisitor(request.headers), { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    // To the shop, on the address the visitor came by: behind a proxy, request.url is that of the server itself.
    return new NextResponse(null, { status: 303, headers: { Location: '/' } });
}
