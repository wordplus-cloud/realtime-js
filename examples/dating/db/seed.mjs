// Ready-made people with photos, to try the site without signing up: npm run seed, with the site running (npm run dev).
// They sign up through the site's own Better Auth route, so their passwords are hashed as anyone's are. Run it again to
// put them back as they were: their profiles and photos, and no blocks among them (their messages stay).
import { readFileSync } from 'node:fs';
import pg from 'pg';

const site = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const { password, people } = JSON.parse(readFileSync(new URL('./people.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const ids = [];
for (const p of people) {
    const email = `${p.key}@people.spark.test`;
    await fetch(`${site}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: site },
        body: JSON.stringify({ name: p.name, email, password }),
    }); // answers 422 when they exist already
    const { rows } = await db.query(`select id from "user" where email = $1`, [email]);
    if (!rows[0]) throw new Error(`Could not sign up ${p.name}: is the site running at ${site}?`);
    ids.push(rows[0].id);
    const photo = readFileSync(new URL(`../public/people/${p.key}.jpg`, import.meta.url));
    await db.query(
        `insert into profile (user_id, birthday, gender, seeking, city, about, photo) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id) do update set birthday = $2, gender = $3, seeking = $4, city = $5, about = $6, photo = $7, hide_online = false`,
        [rows[0].id, p.birthday, p.gender, p.seeking, p.city, p.about, photo],
    );
}
await db.query(`delete from block where who = any($1) and whom = any($1)`, [ids]);

await db.end();
console.log(`Ready: ${people.map((p) => p.name).join(', ')}.`);
