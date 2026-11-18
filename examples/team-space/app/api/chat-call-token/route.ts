// GET /api/chat-call-token?to=10&type=video&name=chat:7: the token of a call in a conversation between two, which the
// chat's call buttons ask as they are pressed, or 403. Who may call whom is chatCallToken's, in lib/realtime.ts.
import { currentUserId } from '@/lib/auth';
import { chatCallToken } from '@/lib/realtime';

export async function GET(request: Request) {
    const ask = new URL(request.url).searchParams;
    const me = await currentUserId();
    const token = me && (await chatCallToken(me, ask.get('to') ?? '', ask.get('name') ?? '', ask.get('type')));
    if (!token) return new Response(null, { status: 403 });
    return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
