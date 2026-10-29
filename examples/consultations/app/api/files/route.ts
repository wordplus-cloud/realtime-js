// POST /api/files: a file for an appointment's messages, from the chat's `upload` (app/(app)/appointments/[id]/
// messages.tsx), as a form of the `file` and the chat's `room`. Kept here, for its expert and its client alone, and
// answered as the chat's message will carry it: where it opens, its name, type and size. WordPlus Cloud never sees it.
import { currentUserId } from '@/lib/auth';
import { appointmentIn, keepFile } from '@/lib/clinic';
import { realtime } from '@/lib/realtime';

/** The largest file this site keeps, as the chat says too (maxFileSize). */
const LARGEST = 10 * 1024 * 1024;
/** Pictures, PDFs, documents and text: what a visit needs, and nothing a browser would run. */
const KINDS = /^(image\/(jpeg|png|gif|webp|heic)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/;

export async function POST(request: Request) {
    const me = await currentUserId();
    const form = await request.formData().catch(() => null);
    const room = String(form?.get('room') ?? '');
    const appointment = appointmentIn(room, 'chat');
    const file = form?.get('file');
    // The room's own rule (realtime.room('chat:{id}') in lib/realtime.ts): whoever may be in the conversation may send
    // it a file.
    if (!me || !appointment || !(file instanceof File) || !(await realtime.mayJoin(room, me))) {
        return Response.json({ error: 'This file is not for this conversation.' }, { status: 403 });
    }
    if (file.size > LARGEST) return Response.json({ error: 'Larger than 10 MB.' }, { status: 413 });
    if (!KINDS.test(file.type)) return Response.json({ error: 'Pictures, PDFs, documents and text only.' }, { status: 415 });
    const kept = await keepFile(appointment, me, { name: file.name.slice(0, 200), type: file.type, data: Buffer.from(await file.arrayBuffer()) });
    return Response.json(kept, { status: 201 });
}
