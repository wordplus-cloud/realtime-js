// GET /api/lesson-token?id=7: the token of lesson 7's stream for whoever asks, signed in or not, or 403. The player and
// the studio ask it as they open, and again as each token runs out, so someone who left the course is turned away then.
// What they may do in the stream is lessonToken's, in lib/realtime.ts.
import { currentUserId } from '@/lib/auth';
import { lessonToken } from '@/lib/realtime';

export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    const token = await lessonToken(await currentUserId(), id);
    if (!token) return new Response(null, { status: 403 });
    return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}
