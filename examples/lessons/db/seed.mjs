// Ready-made teachers and students with photos, to try the site without signing up: npm run seed, with the site running
// (npm run dev). They sign up through the site's own Better Auth route, so their passwords are hashed as anyone's are.
// Run it again to put them back as they were: their profiles, the teachers' courses and lessons, who is in which course
// and who follows whom.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const site = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const { password, people } = JSON.parse(readFileSync(new URL('./people.json', import.meta.url), 'utf8'));
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const ids = new Map();
for (const person of people) {
    const email = `${person.key}@people.lessons.test`;
    await fetch(`${site}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: site },
        body: JSON.stringify({ name: person.name, email, password }),
    }); // answers 422 when they exist already
    const { rows } = await db.query(`select id from "user" where email = $1`, [email]);
    if (!rows[0]) throw new Error(`Could not sign up ${person.name}: is the site running at ${site}?`);
    ids.set(person.key, rows[0].id);
    const photo = readFileSync(new URL(`../public/people/${person.key}.jpg`, import.meta.url));
    await db.query(
        `insert into profile (user_id, about, photo) values ($1, $2, $3) on conflict (user_id) do update set about = $2, photo = $3`,
        [rows[0].id, person.about, photo],
    );
}

// The teachers' courses, made again with their lessons, the first of each open to anyone.
const courses = new Map();
await db.query('delete from course where teacher = any($1)', [[...ids.values()]]);
for (const person of people.filter((one) => one.teaches)) {
    const { subject, title, about, lessons } = person.teaches;
    const { rows } = await db.query('insert into course (teacher, subject, title, about) values ($1, $2, $3, $4) returning id', [ids.get(person.key), subject, title, about]);
    courses.set(person.key, rows[0].id);
    for (const [index, lesson] of lessons.entries()) {
        await db.query('insert into lesson (course_id, position, title, open) values ($1, $2, $3, $4)', [rows[0].id, index + 1, lesson, index === 0]);
    }
}

// Who is in which course, and who follows whom.
await db.query('delete from follow where who = any($1)', [[...ids.values()]]);
for (const person of people) {
    for (const teacher of person.enrolled ?? []) {
        await db.query('insert into enrollment (course_id, user_id) values ($1, $2) on conflict do nothing', [courses.get(teacher), ids.get(person.key)]);
    }
    for (const teacher of person.follows ?? []) {
        await db.query('insert into follow (who, teacher) values ($1, $2) on conflict do nothing', [ids.get(person.key), ids.get(teacher)]);
    }
}

await db.end();
console.log(`Ready: ${people.map((person) => person.name).join(', ')}.`);
