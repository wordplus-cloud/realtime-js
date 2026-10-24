// A member's photo, for signed-in members only: their own upload, or their initial on a colour when they have none.
import { currentUserId } from '@/lib/auth';
import { nameOf, photo } from '@/lib/dating';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!(await currentUserId())) return new Response(null, { status: 401 });
    const { id } = await params;
    const jpeg = await photo(id);
    if (jpeg) {
        return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60' } });
    }
    const initial = ((await nameOf(id)) ?? '?').trim().charAt(0).toUpperCase() || '?';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#fbcfe8"/>` +
        `<text x="40" y="62" font-family="sans-serif" font-size="40" text-anchor="middle" fill="#9d174d">${initial.replace(/[<&>]/g, '')}</text></svg>`;
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=60' } });
}
