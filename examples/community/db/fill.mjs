// The club of db/people.json, its members aside: the channels with their first messages and the photos shared in them,
// the lounges, and the events with who is going. npm run seed fills a site of your own with it (db/seed.mjs), and the
// public demo each visitor's world (lib/worlds.ts).
import { randomUUID } from 'node:crypto';

const MINUTE = 60_000;

/** When an event starts: one of now opened a minute ago, any other on the half hour nearest its minutes from now. */
export function startOf(minutes, now = Date.now()) {
    if (minutes === 0) return Math.floor(now / MINUTE) * MINUTE - MINUTE;
    return Math.round((now + minutes * MINUTE) / (30 * MINUTE)) * 30 * MINUTE;
}

/**
 * Fills the club: `db` a Postgres client or pool, `ids` the members by key, `photo( name )` the bytes of a photo of
 * db/shared, and `demo` db/people.json.
 */
export async function fillClub(db, ids, photo, demo, now = Date.now()) {
    for (const [position, channel] of demo.channels.entries()) {
        const { rows } = await db.query('insert into channel (name, about, position) values ($1, $2, $3) returning id', [channel.name, channel.about, position]);
        const room = `channel:${rows[0].id}`;
        for (const [index, [key, text, minutesAgo, shared]] of channel.messages.entries()) {
            const files = [];
            if (shared) {
                // A photo shared in the channel: kept as one sent there is, and carried by its message.
                const id = randomUUID();
                const data = photo(shared);
                const name = `${shared}.jpg`;
                await db.query('insert into file (id, room, owner, name, type, size, data) values ($1, $2, $3, $4, $5, $6, $7)', [
                    id, room, ids.get(key), name, 'image/jpeg', data.length, data,
                ]);
                files.push({ id, url: `/files/${id}`, name, type: 'image/jpeg', size: data.length });
            }
            await db.query('insert into message (id, room, sender, text, files, at) values ($1, $2, $3, $4, $5, $6)', [
                `seed-${room}-${index}`, room, ids.get(key), text, JSON.stringify(files), now - minutesAgo * MINUTE,
            ]);
        }
    }
    for (const lounge of demo.lounges) {
        await db.query('insert into lounge (name, about, kind) values ($1, $2, $3)', [lounge.name, lounge.about, lounge.kind]);
    }
    for (const event of demo.events) {
        const { rows } = await db.query('insert into event (title, about, host, starts_at) values ($1, $2, $3, $4) returning id', [
            event.title, event.about, ids.get(event.host), new Date(startOf(event.in, now)),
        ]);
        for (const key of demo.going[event.title] ?? []) await db.query('insert into going (event_id, user_id) values ($1, $2)', [rows[0].id, ids.get(key)]);
    }
}
