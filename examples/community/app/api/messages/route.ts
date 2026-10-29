// A page of a channel's or a conversation's messages: GET /api/messages?room=channel:2, with &before=<id> for older ones.
// Only those who may write there may read it: any member for a channel, its two for a conversation.
import { currentUserId } from '@/lib/auth';
import { mayWrite, messagesPage } from '@/lib/club';

export async function GET(request: Request) {
    const url = new URL(request.url);
    const room = url.searchParams.get('room') ?? '';
    const before = url.searchParams.get('before');
    const me = await currentUserId();
    if (!(await mayWrite(me, room))) {
        return new Response(null, { status: 403 });
    }
    return Response.json(await messagesPage(room, before));
}
