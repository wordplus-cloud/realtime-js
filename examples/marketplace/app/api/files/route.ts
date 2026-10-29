// POST /api/files: a photo for a conversation, from the chat's `upload`, as a form of the `file` and the chat's `room`.
// Kept here, for its seller and its buyer alone, and answered as the chat's message will carry it. WordPlus Cloud never
// sees it.
import { currentUserId } from '@/lib/auth';
import { idIn, keepFile } from '@/lib/market';
import { realtime } from '@/lib/realtime';

/** The largest photo this site keeps, as the chat says too (maxFileSize). */
const LARGEST = 15 * 1024 * 1024;
/** Photos only: nothing a browser would run, so no SVG. */
const KINDS = /^image\/(jpeg|png|webp|gif)$/;

export async function POST(request: Request) {
    const me = await currentUserId();
    const form = await request.formData().catch(() => null);
    const room = String(form?.get('room') ?? '');
    const deal = idIn(room, 'deal');
    const file = form?.get('file');
    // The room's own rule (lib/realtime.ts): the seller and the buyer may send their conversation a photo.
    if (!me || !deal || !(file instanceof File) || !(await realtime.mayJoin(room, me))) {
        return Response.json({ error: 'This photo is not for this conversation.' }, { status: 403 });
    }
    if (file.size > LARGEST) return Response.json({ error: 'Larger than 15 MB.' }, { status: 413 });
    if (!KINDS.test(file.type)) return Response.json({ error: 'Photos only: JPEG, PNG, WebP or GIF.' }, { status: 415 });
    const kept = await keepFile(deal, me, { name: file.name.slice(0, 200), type: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return Response.json(kept, { status: 201 });
}
