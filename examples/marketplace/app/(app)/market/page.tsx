import { Suspense } from 'react';
import { listings } from '@/lib/market';
import { Grid } from './grid';

export default function MarketPage() {
    return (
        <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
            <Market />
        </Suspense>
    );
}

// Every item, those still for sale first, the newest first: the page asks again whenever one is put up, reserved, sold
// or repriced (MarketLive in live.tsx).
async function Market() {
    const all = await listings();
    return (
        <Grid items={all.map((item) => ({
            id: item.id, title: item.title, price: item.price, category: item.category, area: item.area, status: item.status,
            photo: item.photos[0] ?? null, seller: item.sellerName,
        }))} />
    );
}
