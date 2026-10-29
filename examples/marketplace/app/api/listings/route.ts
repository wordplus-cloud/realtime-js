// POST /api/listings: an item put up for sale, as a form of its title, price, category, about and up to four photos.
// Kept here, then every market page hears of it and shows it (realtime.to('market')).
import { currentUserId } from '@/lib/auth';
import { sell } from '@/lib/market';
import { realtime } from '@/lib/realtime';

const PHOTOS = /^image\/(jpeg|png|webp)$/;
const LARGEST = 15 * 1024 * 1024;

export async function POST(request: Request) {
    const me = await currentUserId();
    const form = await request.formData().catch(() => null);
    if (!me || !form) return Response.json({ error: 'Sign in first.' }, { status: 401 });
    const title = String(form.get('title') ?? '').trim();
    const price = Number(form.get('price'));
    const photos = form.getAll('photos').filter((file): file is File => file instanceof File).slice(0, 4);
    if (!title || !Number.isInteger(price) || price < 0 || price > 1_000_000) return Response.json({ error: 'A title and a whole price, please.' }, { status: 422 });
    if (!photos.length || photos.some((file) => !PHOTOS.test(file.type) || file.size > LARGEST)) {
        return Response.json({ error: 'One to four photos, JPEG, PNG or WebP, up to 15 MB each.' }, { status: 422 });
    }
    const id = await sell(me, {
        title,
        about: String(form.get('about') ?? ''),
        price,
        category: String(form.get('category') ?? 'Other'),
        photos: await Promise.all(photos.map(async (file) => ({ type: file.type, data: Buffer.from(await file.arrayBuffer()) }))),
    });
    await realtime.to('market').emit('changed');
    return Response.json({ id }, { status: 201 });
}
