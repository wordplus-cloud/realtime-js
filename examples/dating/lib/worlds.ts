// The public demo alone (SPARK_WORLDS=1, as dating.docs.wordplus.cloud runs it): every visitor gets the ready-made
// people of db/people.json for a day as a world of their own, so what they do there, a chat, a call, a block, is
// nobody else's. The worlds share one database, kept apart by Postgres (db/worlds.sql): each connection says its world,
// and sees and writes that world's rows alone, so the site's own queries are as they are without it. A world is the
// visitor's by a signed cookie, and a window without it, a private one to be a second person, gets the world its
// address used last, within the hour. A site of your own has none of it.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { cookies, headers } from 'next/headers';
import type { Pool } from 'pg';
import demo from '../db/people.json';

export const WORLDS = process.env.SPARK_WORLDS === '1';

const COOKIE = 'spark-world';
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const SIGNING = process.env.BETTER_AUTH_SECRET || 'spark-worlds';

/** The world the code running now is in, when it was given one (inWorld). */
const current = new AsyncLocalStorage<number>();

const scope = globalThis as typeof globalThis & {
    sparkWorlds?: { pool: Pool; byAddress: Map<string, { world: number; used: number }>; password?: Promise<string> };
};

/** The pool, its connections each saying the world of the request it serves: by the cookie, else world 0, empty. */
export function withWorlds(pool: Pool): Pool {
    if (!scope.sparkWorlds) {
        scope.sparkWorlds = { pool, byAddress: new Map() };
        setInterval(() => endOldWorlds().catch((error) => console.error('Ending old worlds:', error)), 10 * 60 * 1000).unref();
    }

    async function connect() {
        const world = await worldNow();
        const client = await pool.connect();
        await client.query(`select set_config('spark.world', $1, false)`, [String(world)]);
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
export const inWorld = <T>(world: number, work: () => Promise<T>) => current.run(world, work);

/**
 * The visitor's world, with its people: theirs by the cookie while it lasts, else the one their address used in the
 * last hour (their second window), else a new one. The cookie then names it, for a day.
 */
export async function visitorWorld(): Promise<number> {
    const { pool, byAddress } = scope.sparkWorlds!;
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
async function worldNow(): Promise<number> {
    const given = current.getStore();
    if (given !== undefined) return given;
    try {
        const world = worldOf((await cookies()).get(COOKIE)?.value);
        if (world === null) return 0;
        scope.sparkWorlds?.byAddress.set(await addressOf(), { world, used: Date.now() });
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

/** A new world: its number, and its people as db/seed.mjs makes them on a site of your own, in one go. */
async function openWorld(): Promise<number> {
    const { pool } = scope.sparkWorlds!;
    const password = await (scope.sparkWorlds!.password ??= hashPassword(demo.password));
    const client = await pool.connect();
    try {
        await client.query('begin');
        let world: number;
        do world = randomInt(100000, 1000000);
        while (!(await client.query('insert into world (id) values ($1) on conflict do nothing', [world])).rowCount);
        await client.query(`select set_config('spark.world', $1, true)`, [String(world)]);
        for (const person of demo.people) {
            const { rows } = await client.query<{ id: number }>(
                `insert into "user" (name, email, "emailVerified") values ($1, $2, false) returning id`,
                [person.name, `${person.key}@people.spark.test`],
            );
            await client.query(
                `insert into account ("accountId", "providerId", "userId", password, "updatedAt") values ($1, 'credential', $2, $3, now())`,
                [String(rows[0].id), rows[0].id, password],
            );
            await client.query(
                'insert into profile (user_id, birthday, gender, seeking, city, about, photo) values ($1, $2, $3, $4, $5, $6, $7)',
                [rows[0].id, person.birthday, person.gender, person.seeking, person.city, person.about, readFileSync(join(process.cwd(), 'public', 'people', `${person.key}.jpg`))],
            );
        }
        await client.query('commit');
        return world;
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}

/** Every world opened more than a day ago, gone with all it held, and the addresses past their hour forgotten. */
async function endOldWorlds() {
    const { pool, byAddress } = scope.sparkWorlds!;
    for (const [address, recent] of byAddress) if (Date.now() - recent.used >= HOUR) byAddress.delete(address);
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query(`select set_config('spark.world', 'all', true)`);
        const { rows } = await client.query<{ id: number }>(`delete from world where opened < now() - interval '1 day' returning id`);
        const old = rows.map((row) => row.id);
        if (old.length) {
            // A person's profile, blocks, chat places, messages, sessions and account go with them.
            for (const table of ['"user"', 'chat', 'verification']) await client.query(`delete from ${table} where world = any($1)`, [old]);
        }
        await client.query('commit');
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
}
