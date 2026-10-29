// A file sent in an appointment's messages, for its expert and its client alone: anyone else, or someone not signed in,
// gets nothing, whatever address they have.
import { currentUserId } from '@/lib/auth';
import { fileOf, mayChat } from '@/lib/clinic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [me, file] = await Promise.all([currentUserId(), fileOf(id)]);
    if (!file || !(await mayChat(me, file.appointment))) return new Response(null, { status: 404 });
    // A picture shows in the page, and anything else downloads, by its own name.
    const inline = file.type.startsWith('image/');
    return new Response(new Uint8Array(file.data), {
        headers: {
            'Content-Type': file.type,
            'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            'Cache-Control': 'private, max-age=3600',
            // What it is, never what a browser guesses: no file runs as a page of this site.
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        },
    });
}
