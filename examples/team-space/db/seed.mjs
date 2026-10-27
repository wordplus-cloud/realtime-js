// Ready-made colleagues with photos, their teams and channels, to try the site without signing up: npm run seed, with the
// site running (npm run dev). They sign up through the site's own Better Auth route, so their passwords are hashed as
// anyone's are. Run it again to put the teams back as they were, their channels with their first messages.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const site = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const { password, people, teams } = JSON.parse(readFileSync(new URL('./people.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const ids = new Map();
for (const p of people) {
    const email = `${p.key}@people.team.test`;
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
        `insert into profile (user_id, title, about, photo) values ($1, $2, $3, $4)
         on conflict (user_id) do update set title = $2, about = $3, photo = $4`,
        [rows[0].id, p.title, p.about, photo],
    );
}

// The teams again, with their channels and first messages: the old ones go, with what was written in them.
await db.query(`delete from team where name = any($1)`, [teams.map((team) => team.name)]);
for (const team of teams) {
    const { rows } = await db.query(`insert into team (name, about, lead) values ($1, $2, $3) returning id`, [team.name, team.about, ids.get(team.lead)]);
    for (const key of team.members) await db.query(`insert into team_member (team_id, user_id) values ($1, $2)`, [rows[0].id, ids.get(key)]);
    for (const channel of team.channels) {
        const chat = await db.query(`insert into chat (team_id, name) values ($1, $2) returning id`, [rows[0].id, channel.name]);
        for (const [index, [key, text, minutesAgo]] of channel.messages.entries()) {
            await db.query(`insert into message (id, chat_id, sender, text, at) values ($1, $2, $3, $4, $5)`, [
                `seed-${chat.rows[0].id}-${index}`, chat.rows[0].id, ids.get(key), text, Date.now() - minutesAgo * 60_000,
            ]);
        }
    }
}

await db.end();
console.log(`Ready: ${people.map((p) => p.name).join(', ')}, in ${teams.map((team) => team.name).join(', ')}.`);
