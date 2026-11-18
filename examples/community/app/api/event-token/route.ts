// GET /api/event-token?id=4: an event's player and its studio ask it, and again as each token runs out
// (<LiveStream tokenUrl> in app/(app)/events/[id]/page.tsx and app/(app)/studio/[id]/page.tsx). Its host goes live, in
// Full HD, and every other member watches, writes in the chat and may raise a hand to come on stage.
import { currentUserId } from '@/lib/auth';
import { eventOf, isMember } from '@/lib/club';
import { realtime } from '@/lib/realtime';

export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const me = await currentUserId();

    // An event of the club, and a member.
    const event = await eventOf(id);
    if (!event || !(await isMember(me))) return new Response(null, { status: 403 });

    // The name is built here, from the event's number: event:4. Its host goes live, everyone else watches.
    const hosts = me === event.host;
    const token = await realtime.streamToken(me, `event:${event.id}`, {
        role: hosts ? 'host' : 'viewer',
        quality: hosts ? '1080p' : undefined,
        // The same in every token for it: members on stage, and reactions.
        settings: { stage: true, reactions: true },
    });
    return Response.json({ token });
}
