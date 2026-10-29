// An item's photo, as the market and the item's page show it.
import { listingPhoto } from '@/lib/market';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const picture = await listingPhoto(id);
    if (!picture) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(picture.data), {
        headers: { 'Content-Type': picture.type, 'Cache-Control': 'public, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' },
    });
}
