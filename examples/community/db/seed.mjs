// A ready-made photography club, to try the site without signing up: npm run seed, with the site running (npm run dev).
// Its members sign up through the site's own Better Auth route, so their passwords are hashed as anyone's are. Run it
// again to put the club back as it was: its channels with their first messages and photos, its lounges and its events.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { fillClub } from './fill.mjs';

const site = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const demo = JSON.parse(readFileSync(new URL('./people.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const ids = new Map();
for (const p of demo.people) {
    const email = `${p.key}@people.club.test`;
    await fetch(`${site}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: site },
        body: JSON.stringify({ name: p.name, email, password: demo.password }),
    }); // answers 422 when they exist already
    const { rows } = await db.query(`select id from "user" where email = $1`, [email]);
    if (!rows[0]) throw new Error(`Could not sign up ${p.name}: is the site running at ${site}?`);
    ids.set(p.key, rows[0].id);
    const photo = readFileSync(new URL(`../public/portraits/${p.key}.jpg`, import.meta.url));
    await db.query(
        `insert into profile (user_id, role, title, about, photo) values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set role = $2, title = $3, about = $4, photo = $5`,
        [rows[0].id, p.role, p.title, p.about, photo],
    );
}

// The club again: the old channels, lounges and events go, with what was said and shared in them.
for (const table of ['message', 'file', 'channel', 'lounge', 'event']) await db.query(`delete from ${table}`);
await fillClub(db, ids, (name) => readFileSync(new URL(`./shared/${name}.jpg`, import.meta.url)), demo);

await db.end();
console.log(`Ready: ${demo.people.map((p) => p.name).join(', ')}, in ${demo.channels.length} channels, ${demo.lounges.length} lounges and ${demo.events.length} events.`);
