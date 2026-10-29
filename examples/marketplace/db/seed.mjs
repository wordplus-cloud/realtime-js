// Ready-made neighbours and their items, to try the site without signing up: npm run seed, with the site running (npm
// run dev). They sign up through the site's own Better Auth route, so their passwords are hashed as anyone's are. Run it
// again to put the market back as it was: the items with their photos, and the conversations about them.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { fillMarket } from './fill.mjs';

const site = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const demo = JSON.parse(readFileSync(new URL('./people.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const ids = new Map();
for (const p of demo.people) {
    const email = `${p.key}@people.marketplace.test`;
    await fetch(`${site}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: site },
        body: JSON.stringify({ name: p.name, email, password: demo.password }),
    }); // answers 422 when they exist already
    const { rows } = await db.query(`select id from "user" where email = $1`, [email]);
    if (!rows[0]) throw new Error(`Could not sign up ${p.name}: is the site running at ${site}?`);
    ids.set(p.key, rows[0].id);
    const portrait = readFileSync(new URL(`../public/portraits/${p.key}.jpg`, import.meta.url));
    await db.query(
        `insert into profile (user_id, area, about, photo) values ($1, $2, $3, $4)
         on conflict (user_id) do update set area = $2, about = $3, photo = $4`,
        [rows[0].id, p.area, p.about, portrait],
    );
}

// The market again: the old items go, with their photos and the conversations about them.
await db.query('delete from listing');
await fillMarket(db, ids, (name) => readFileSync(new URL(`./items/${name}.jpg`, import.meta.url)), demo);

await db.end();
console.log(`Ready: ${demo.people.map((p) => p.name).join(', ')}, with ${demo.items.length} items and ${demo.deals.length} conversations.`);
