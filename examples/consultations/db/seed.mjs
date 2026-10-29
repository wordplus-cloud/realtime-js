// Ready-made experts and clients with photos, and their appointments, to try the site without signing up: npm run seed,
// with the site running (npm run dev). They sign up through the site's own Better Auth route, so their passwords are
// hashed as anyone's are. Run it again to put the appointments back as they were, with their first messages: two
// visits open now, others later today and tomorrow, and two past ones with the expert's notes.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const site = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const { password, experts, clients, appointments } = JSON.parse(readFileSync(new URL('./people.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const MINUTE = 60_000;

const ids = new Map();
const people = [...experts.map((p) => ({ ...p, role: 'expert' })), ...clients.map((p) => ({ ...p, role: 'client', field: '' }))];
for (const p of people) {
    const email = `${p.key}@people.consult.test`;
    await fetch(`${site}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: site },
        body: JSON.stringify({ name: p.name, email, password }),
    }); // answers 422 when they exist already
    const { rows } = await db.query(`select id from "user" where email = $1`, [email]);
    if (!rows[0]) throw new Error(`Could not sign up ${p.name}: is the site running at ${site}?`);
    ids.set(p.key, rows[0].id);
    const photo = readFileSync(new URL(`../public/portraits/${p.key}.jpg`, import.meta.url));
    await db.query(
        `insert into profile (user_id, role, title, field, about, photo) values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id) do update set role = $2, title = $3, field = $4, about = $5, photo = $6`,
        [rows[0].id, p.role, p.title, p.field, p.about, photo],
    );
}

// One of now opened a few minutes ago, so its visit is open, and any other on the half hour nearest its minutes from now.
const startOf = (minutes) => minutes === 0
    ? Math.floor(Date.now() / (5 * MINUTE)) * 5 * MINUTE
    : Math.round((Date.now() + minutes * MINUTE) / (30 * MINUTE)) * 30 * MINUTE;

// The appointments again, with their first messages: the old ones go, with what was written and sent in them.
await db.query(`delete from appointment where expert = any($1) or client = any($1)`, [[...ids.values()]]);
await db.query(`delete from request where expert = any($1) or client = any($1)`, [[...ids.values()]]);
for (const appointment of appointments) {
    const starts = startOf(appointment.in);
    const ends = starts + 30 * MINUTE;
    const past = ends < Date.now();
    const { rows } = await db.query(
        `insert into appointment (expert, client, starts_at, ends_at, topic, admitted_at, started_at, ended_at, notes, notes_at)
         values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $7) returning id`,
        [ids.get(appointment.expert), ids.get(appointment.client), new Date(starts), new Date(ends), appointment.topic,
            past ? new Date(starts) : null, past ? new Date(ends) : null, appointment.notes ?? null],
    );
    for (const [index, [key, text, minutesAgo]] of appointment.messages.entries()) {
        await db.query(`insert into message (id, appointment_id, sender, text, at) values ($1, $2, $3, $4, $5)`, [
            `seed-${rows[0].id}-${index}`, rows[0].id, ids.get(key), text, Date.now() - minutesAgo * MINUTE,
        ]);
    }
}

await db.end();
console.log(`Ready: ${experts.map((p) => p.name).join(', ')} as experts, ${clients.map((p) => p.name).join(', ')} as clients, with ${appointments.length} appointments.`);
