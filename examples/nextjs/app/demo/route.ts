// A new visitor of a demo (WORDPLUS_DEMO=1, lib/demo.ts): a shop of their own, and they are its Ann.
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { DEMO, openVisitorShop } from '@/lib/demo';
import { COOKIE, sign } from '@/lib/session';

export async function GET(request: NextRequest) {
    if (!DEMO) return new NextResponse(null, { status: 404 });
    // The visitor address as the proxy in front saw it: the last of X-Forwarded-For, the one it added. The ones
    // before it are whatever the visitor sent.
    const address = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'local';
    const s = openVisitorShop(address);
    (await cookies()).set(COOKIE, sign(s * 100 + 34), { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    // To the shop, on the address the visitor came by: behind a proxy, request.url is that of the server itself.
    return new NextResponse(null, { status: 303, headers: { Location: '/' } });
}
