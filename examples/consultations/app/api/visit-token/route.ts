// GET /api/visit-token?id=7: the visit's spot asks it before it joins (app/(app)/appointments/[id]/visit.tsx). The
// visit is a group call of two on WordPlus Cloud's media servers, encrypted end to end: each browser encrypts what it
// sends with a key this server makes, which only those with a token get, so the media servers forward what they can't
// see or hear. Its expert comes in while it is open, from ten minutes before it starts, and its client once the expert
// let them in (mayJoinVisit in lib/clinic.ts).
import { currentUserId } from '@/lib/auth';
import { mayJoinVisit } from '@/lib/clinic';
import { realtime } from '@/lib/realtime';

export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const me = await currentUserId();

    if (!me || !(await mayJoinVisit(me, id))) return new Response(null, { status: 403 });

    // The name is built here, from the appointment's number: visit:7. Encrypted, as every token for it says.
    const token = await realtime.groupCallToken(me, `visit:${id}`, { encrypt: true });
    return Response.json({ token });
}
