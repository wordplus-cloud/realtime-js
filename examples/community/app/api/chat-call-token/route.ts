// GET /api/chat-call-token?to=10&type=video&name=chat:7: a conversation's call buttons ask it before they call the other
// one (<Chat tokenUrl> in app/(app)/members/[id]/chat.tsx). The name comes from the page, so it is checked: the one
// calling and the one called both write in that conversation (mayWrite in lib/club.ts). Then a token for this call
// alone, named as the conversation, so the call shows in it. The one called answers with no token of their own.
import { currentUserId } from '@/lib/auth';
import { idIn, mayWrite } from '@/lib/club';
import { realtime } from '@/lib/realtime';

export async function GET(request: Request) {
    const ask = new URL(request.url).searchParams;
    const me = await currentUserId();
    const to = ask.get('to') ?? '';
    const name = ask.get('name') ?? '';

    // A conversation between two, and both of them in it.
    if (!me || !idIn(name, 'chat') || !(await mayWrite(me, name)) || !(await mayWrite(to, name))) {
        return new Response(null, { status: 403 });
    }

    return Response.json({ token: await realtime.callToken(me, to, { type: ask.get('type'), name }) });
}
