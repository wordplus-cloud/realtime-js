// What the cloud carries of the order update: its room and event as they are, its data sealed with the room key,
// which WordPlus Cloud never holds. The page shows it beside the update as it opened it.
import { NextResponse } from 'next/server';
import { realtime } from '@/lib/realtime';
import { currentUserId } from '@/lib/session';
import { orderOf, sameShop } from '@/lib/shop';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const order = orderOf((await params).id);
    if (!order || !sameShop(await currentUserId(), order.customer)) return NextResponse.json({ ok: false }, { status: 403 });

    const room = `order:${order.id}`;
    const data = await realtime.keys.sealJson({ id: order.id, status: order.status }, await realtime.keys.roomLabel(room));
    return NextResponse.json({ room, event: 'updated', data });
}
