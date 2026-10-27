// A person's photo, which the courses show to anyone: their own, or their initial on a colour when they have none.
import { personOf, photoOf } from '@/lib/lessons';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const jpeg = await photoOf(id);
    if (jpeg) {
        return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60' } });
    }
    const initial = ((await personOf(id))?.name ?? '?').trim().charAt(0).toUpperCase() || '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#ccfbf1"/>` +
        `<text x="40" y="54" font-family="sans-serif" font-size="36" text-anchor="middle" fill="#115e59">${initial.replace(/[<&>]/g, '')}</text></svg>`;
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=60' } });
}
