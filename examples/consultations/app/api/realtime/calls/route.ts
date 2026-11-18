// POST /api/realtime/calls: what a page does in a visit once its token let it in, for the person signed in: renew what
// it holds as the visit goes on. Each ask carries a proof only this server makes, which the package checks. Who comes
// into a visit is the site's own token route, app/api/visit-token/route.ts.
import { currentUserId } from '@/lib/auth';
import { realtime } from '@/lib/realtime';

export async function POST(request: Request) {
    // JSON only, which a page of another site can't send here.
    if (!request.headers.get('content-type')?.includes('application/json')) {
        return new Response(null, { status: 415 });
    }
    const ask = await request.json();
    const user = await currentUserId();
    const pass = await realtime.authorizeCall(ask, user);
    return Response.json(pass);
}
