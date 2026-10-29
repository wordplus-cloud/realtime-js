// The market of db/people.json, its neighbours aside: their items with their photos, and the conversations about them,
// their messages and an offer waiting for an answer. npm run seed fills a site of your own with it (db/seed.mjs), and
// the public demo each visitor's world (lib/worlds.ts).
import { randomUUID } from 'node:crypto';

const MINUTE = 60_000;

/**
 * Fills the market: `db` a Postgres client or pool, `ids` the neighbours by key, `photo( name )` the bytes of a photo of
 * db/items, and `demo` db/people.json.
 */
export async function fillMarket(db, ids, photo, demo, now = Date.now()) {
    const listings = new Map();
    for (const [index, item] of demo.items.entries()) {
        const seller = ids.get(item.seller);
        const { rows: [{ area }] } = await db.query('select area from profile where user_id = $1', [seller]);
        const { rows } = await db.query(
            `insert into listing (seller, title, about, price, category, area, status, buyer, created_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
            // Put up a few hours apart, the first the newest.
            [seller, item.title, item.about, item.price, item.category, area, item.status ?? 'available', item.buyer ? ids.get(item.buyer) : null,
                new Date(now - (index + 1) * 95 * MINUTE)],
        );
        listings.set(item.photo, rows[0].id);
        await db.query('insert into listing_photo (id, listing_id, position, type, data) values ($1, $2, 0, $3, $4)', [
            randomUUID(), rows[0].id, 'image/jpeg', photo(item.photo),
        ]);
    }
    for (const deal of demo.deals) {
        const { rows } = await db.query('insert into deal (listing_id, buyer) values ($1, $2) returning id', [listings.get(deal.item), ids.get(deal.buyer)]);
        for (const [index, [key, text, minutesAgo]] of deal.messages.entries()) {
            await db.query('insert into message (id, deal_id, sender, text, at) values ($1, $2, $3, $4, $5)', [
                `seed-${rows[0].id}-${index}`, rows[0].id, ids.get(key), text, now - minutesAgo * MINUTE,
            ]);
        }
        if (deal.offer) await db.query('insert into offer (deal_id, amount) values ($1, $2)', [rows[0].id, deal.offer]);
    }
}
