// The public demo alone (CONSULT_WORLDS=1, as the docs' demo runs it): every visitor gets the ready-made experts and
// clients of db/people.json for a day as a world of their own, so what they do there, a booking, a message, a visit,
// is nobody else's. The worlds share one database, kept apart by Postgres (db/worlds.sql): each connection says its
// world, and sees and writes that world's rows alone, so the site's own queries are as they are without it. A world is
// the visitor's by a signed cookie, and a window without it, a private one to be a second person, gets the world its
// address used last, within the hour. A site of your own has none of it.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { cookies, headers } from 'next/headers';
import type { Pool, PoolClient } from 'pg';
import demo from '../db/people.json';

export const WORLDS = process.env.CONSULT_WORLDS === '1';

/** How long a visit may go on on the public demo, which runs on WordPlus Cloud for anyone. */
export const DEMO_VISIT_MINUTES = 10;

const COOKIE = 'consult-world';
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;
const SIGNING = process.env.BETTER_AUTH_SECRET || 'consult-worlds';

/** The world the code running now is in, when it was given one: a number, or every world for the webhooks. */
type World = number | 'all';
const current = new AsyncLocalStorage<World>();

const scope = globalThis as typeof globalThis & {
    consultWorlds?: { pool: Pool; byAddress: Map<string, { world: number; used: number }>; password?: Promise<string> };
};

/** The pool, its connections each saying the world of the request it serves: by the cookie, else world 0, empty. */
export function withWorlds(pool: Pool): Pool {
    if (!scope.consultWorlds) {
        scope.consultWorlds = { pool, byAddress: new Map() };
        setInterval(() => endOldWorlds().catch((error) => console.error('Ending old worlds:', error)), 10 * 60 * 1000).unref();
    }

    async function connect() {
        const world = await worldNow();
        const client = await pool.connect();
        await client.query(`select set_config('demo.world', $1, false)`, [String(world)]);
        return client;
    }

    async function query(...args: unknown[]) {
        const client = await connect();
        try {
            return await (client.query as (...a: unknown[]) => Promise<unknown>)(...args);
        } finally {
            client.release();
        }
    }

    return new Proxy(pool, {
        get(target, key) {
            if (key === 'connect') return connect;
            if (key === 'query') return query;
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

/** Runs `work` in `world`, whatever the cookie says. */
export const inWorld = <T>(world: World, work: () => Promise<T>) => current.run(world, work);

/**
 * The realtime routes, their webhooks in every world: a webhook comes with no visitor's cookie, and its events name
 * appointments by number, each of one world. A message it keeps goes into its appointment's world (db/worlds.sql). The
 * SDK checks its signature before any handler runs. In place of `realtime.route` itself, so
 * app/api/realtime/[...path]/route.ts is as on a site of your own.
 */
export function webhooksInEveryWorld(realtime: { route: (request: Request) => Promise<Response> }) {
    const route = realtime.route;
    Object.defineProperty(realtime, 'route', {
        value: (request: Request) => (new URL(request.url).pathname.endsWith('/webhook') ? inWorld('all', () => route(request)) : route(request)),
    });
}

/**
 * The visitor's world, with its people: theirs by the cookie while it lasts, else the one their address used in the
 * last hour (their second window), else a new one. The cookie then names it, for a day.
 */
export async function visitorWorld(): Promise<number> {
    const { pool, byAddress } = scope.consultWorlds!;
    const jar = await cookies();
    const signed = worldOf(jar.get(COOKIE)?.value);
    const address = await addressOf();
    const recent = byAddress.get(address);

    let world: number | null = null;
    for (const candidate of [signed, recent && Date.now() - recent.used < HOUR ? recent.world : null]) {
        if (candidate !== null && (await pool.query('select 1 from world where id = $1', [candidate])).rowCount) {
            world = candidate;
            break;
        }
    }
    world ??= await openWorld();
    byAddress.set(address, { world, used: Date.now() });
    jar.set(COOKIE, sign(world), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DAY / 1000 });
    return world;
}

/**
 * The world a request is in: the one given to the code running (inWorld), else the cookie's, else 0. A request in the
 * cookie's world makes it the one its address used last, so a second window opened hours after the first still joins it.
 */
async function worldNow(): Promise<World> {
    const given = current.getStore();
    if (given !== undefined) return given;
    try {
        const world = worldOf((await cookies()).get(COOKIE)?.value);
        if (world === null) return 0;
        scope.consultWorlds?.byAddress.set(await addressOf(), { world, used: Date.now() });
        return world;
    } catch {
        return 0; // outside a request
    }
}

/** The visitor's address as the proxy in front saw it: the last of X-Forwarded-For, the one it added. */
const addressOf = async () => (await headers()).get('x-forwarded-for')?.split(',').pop()?.trim() || 'local';

const sign = (world: number) => `${world}.${createHmac('sha256', SIGNING).update(`world:${world}`).digest('base64url')}`;

/** The world a cookie names, if its signature is right. */
function worldOf(cookie: string | undefined): number | null {
    const world = Number(cookie?.split('.')[0]);
    if (!cookie || !Number.isInteger(world) || world <= 0) return null;
    const expected = Buffer.from(sign(world));
    const given = Buffer.from(cookie);
    return given.length === expected.length && timingSafeEqual(given, expected) ? world : null;
}

/** A new world: its number, and its experts, clients and appointments as db/seed.mjs makes them on a site of your own. */
async function openWorld(): Promise<number> {
    const { pool } = scope.consultWorlds!;
    const password = await (scope.consultWorlds!.password ??= hashPassword(demo.password));
    const client = await pool.connect();
    try {
        await client.query('begin');
        let world: number;
        do world = randomInt(100000, 1000000);
        while (!(await client.query('insert into world (id) values ($1) on conflict do nothing', [world])).rowCount);
        await client.query(`select set_config('demo.world', $1, true)`, [String(world)]);
        await addPeople(client, password);
        await client.query('commit');
        return world;
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * When a ready-made appointment starts: one of now opened a few minutes ago, so its visit is open as the world opens,
 * any other on the half hour nearest its minutes from now.
 */
function startOf(minutesFromNow: number, now = Date.now()): number {
    if (minutesFromNow === 0) return Math.floor(now / (5 * MINUTE)) * 5 * MINUTE;
    return Math.round((now + minutesFromNow * MINUTE) / (30 * MINUTE)) * 30 * MINUTE;
}

/** The people of db/people.json in the world the client is in: accounts, profiles, appointments and their messages. */
async function addPeople(client: PoolClient, password: string) {
    const ids = new Map<string, number>();
    const people = [...demo.experts.map((person) => ({ ...person, role: 'expert' })), ...demo.clients.map((person) => ({ ...person, role: 'client', field: '' }))];
    for (const person of people) {
        const { rows } = await client.query<{ id: number }>(
            `insert into "user" (name, email, "emailVerified") values ($1, $2, false) returning id`,
            [person.name, `${person.key}@people.consult.test`],
        );
        const id = rows[0].id;
        ids.set(person.key, id);
        await client.query(
            `insert into account ("accountId", "providerId", "userId", password, "updatedAt") values ($1, 'credential', $2, $3, now())`,
            [String(id), id, password],
        );
        await client.query('insert into profile (user_id, role, title, field, about, photo) values ($1, $2, $3, $4, $5, $6)', [
            id, person.role, person.title, person.field, person.about, readFileSync(join(process.cwd(), 'public', 'portraits', `${person.key}.jpg`)),
        ]);
    }
    for (const appointment of demo.appointments) {
        const starts = startOf(appointment.in);
        const ends = starts + 30 * MINUTE;
        // One in the past took place, with the expert's notes.
        const past = ends < Date.now();
        const { rows } = await client.query<{ id: number }>(
            `insert into appointment (expert, client, starts_at, ends_at, topic, admitted_at, started_at, ended_at, notes, notes_at)
             values ($1, $2, $3, $4, $5, $6, $6, $7, $8, $7) returning id`,
            [ids.get(appointment.expert), ids.get(appointment.client), new Date(starts), new Date(ends), appointment.topic,
                past ? new Date(starts) : null, past ? new Date(ends) : null, appointment.notes ?? null],
        );
        for (const [index, [key, text, minutesAgo]] of appointment.messages.entries()) {
            await client.query('insert into message (id, appointment_id, sender, text, at) values ($1, $2, $3, $4, $5)', [
                `seed-${rows[0].id}-${index}`, rows[0].id, ids.get(String(key)), text, Date.now() - Number(minutesAgo) * MINUTE,
            ]);
        }
    }
}

/** Every world opened more than a day ago, gone with all it held, and the addresses past their hour forgotten. */
async function endOldWorlds() {
    const { pool, byAddress } = scope.consultWorlds!;
    for (const [address, recent] of byAddress) if (Date.now() - recent.used >= HOUR) byAddress.delete(address);
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query(`select set_config('demo.world', 'all', true)`);
        const { rows } = await client.query<{ id: number }>(`delete from world where opened < now() - interval '1 day' returning id`);
        const old = rows.map((row) => row.id);
        if (old.length) {
            // The appointments with their messages and files, the sessions asked for, then the people with their
            // profiles, sessions and accounts.
            for (const table of ['appointment', 'request', '"user"', 'verification']) await client.query(`delete from ${table} where world = any($1)`, [old]);
        }
        await client.query('commit');
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}
