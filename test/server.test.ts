import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRealtime, HELD, MAX_HISTORY_DAYS, Patterns, Realtime, RealtimeError, streamGrant } from '../src/server/index.js';
import { aeadSeal, base64url, hex, hmac, sha256Hex, unbase64url } from '../src/server/crypto.js';
import { dayOf, Keys, labelUser } from '../src/server/keys.js';

// The server part against the conformance vectors PHP wrote (spec/vectors.json, scripts/vectors.php), and as the
// browser uses its routes, on protocol 3's rooms.

const V = JSON.parse(readFileSync(new URL('../spec/vectors.json', import.meta.url), 'utf8'));

afterEach(() => {
    HELD.RECORDING_AVAILABLE = false;
    vi.useRealTimers();
});

function app(extra: Partial<Parameters<typeof createRealtime>[0]> = {}): Realtime {
    return createRealtime({
        site: V.site,
        secret: V.secret,
        localKey: V.local_key,
        profile: (user) => ({ name: 'User ' + user, avatar: 'https://example.com/' + user + '.png' }),
        ...extra,
    });
}

/** A token's claims, after checking its signature with the key it should be signed with. */
async function claimsOf(token: string, label: string): Promise<Record<string, any>> {
    const [header, payload, signature] = token.split('.');
    expect(base64url(await hmac(await hmac(V.secret, label), header + '.' + payload))).toBe(signature);
    return JSON.parse(new TextDecoder().decode(unbase64url(payload)!));
}

/** An app whose requests to the realtime server are kept, each answered as `answer` says. */
function recorder(answer: (path: string, body: any) => unknown = () => ({ ok: true, ids: {} })) {
    const sent: { method: string; path: string; body: any }[] = [];
    const realtime = app({
        api: 'https://rest.example.test/',
        fetch: async (url, init) => {
            const u = new URL(url as string);
            const body = init?.body ? JSON.parse(String(init.body)) : undefined;
            sent.push({ method: String(init?.method), path: u.pathname + u.search, body });
            return Response.json(answer(u.pathname + u.search, body));
        },
    });
    return { realtime, sent };
}

describe('the conformance vectors', () => {
    it('derive the token, calls, publish and webhook keys from the secret, and every label key from the local key', async () => {
        expect(hex(await hmac(V.secret, 'wordplus-realtime channels v1'))).toBe(V.derived.channels);
        expect(hex(await hmac(V.secret, 'wordplus-realtime calls v1'))).toBe(V.derived.calls);
        expect(hex(await hmac(V.secret, 'wordplus-realtime publish v1'))).toBe(V.derived.publish);
        expect(hex(await hmac(V.secret, 'wordplus-realtime webhook v1'))).toBe(V.derived.webhook);

        const keys = new Keys(V.local_key, null);
        for (const { label, entry } of V.keys) expect(await keys.entry(label)).toBe(entry);
        expect(hex(await keys.key('profile-hash'))).toBe(V.profile_hash_key);
    });

    it('make a call\'s key from the local key, and sign a token and an emit as PHP does', async () => {
        expect(await app().callKey(V.call_key.id, V.call_key.caller, V.call_key.callee)).toBe(V.call_key.key);
        expect(base64url(await hmac(await hmac(V.secret, 'wordplus-realtime channels v1'), V.jwt.input))).toBe(V.jwt.signature);

        vi.useFakeTimers({ now: Number(V.emit.timestamp) * 1000 });
        const sent: Request[] = [];
        const realtime = app({ fetch: async (url, init) => (sent.push(new Request(url, init)), Response.json({ ok: true, ids: {} })) });
        realtime.room('orders', { public: true });
        await realtime.to('orders').emit('updated', { status: 'paid' });

        expect(sent).toHaveLength(1);
        expect(new URL(sent[0].url).pathname).toBe(V.emit.path);
        expect(await sent[0].text()).toBe(V.emit.body);
        expect(sent[0].headers.get('X-WordPlus-Site')).toBe(V.site);
        expect(sent[0].headers.get('X-WordPlus-Timestamp')).toBe(V.emit.timestamp);
        expect(sent[0].headers.get('X-WordPlus-Signature')).toBe(V.emit.signature);
    });

    it('seal as libsodium does, and open what it sealed', async () => {
        const keys = new Keys(V.local_key, null);

        for (const { label, plain, nonce_hex, sealed } of V.sealed) {
            const nonce = Uint8Array.from(nonce_hex.match(/../g).map((b: string) => parseInt(b, 16)));
            expect(label + ':1.' + base64url(aeadSeal(await keys.key(label), new TextEncoder().encode(plain), label, nonce))).toBe(sealed);
            expect(await keys.open(sealed)).toBe(plain);
        }

        // Moved under another label, or changed on the way, it doesn't open.
        const [first] = V.sealed;
        expect(await keys.open(first.sealed.replace(first.label, 'ch:order:43:1'))).toBeNull();
        expect(await keys.open(first.sealed.slice(0, -2) + (first.sealed.endsWith('A') ? 'BB' : 'AA'))).toBeNull();
        expect(await new Keys('0'.repeat(64), null).open(first.sealed)).toBeNull();
    });

    it('refuse a local key that isn\'t 64 hex characters, and a missing site or secret, as they are first used', async () => {
        expect(() => app({ localKey: 'short' }).keys).toThrow(/64 hex/);
        // Made with nothing set, as `next build` loads the routes: the first use says what is missing.
        const bare = createRealtime({ site: '', secret: '', localKey: V.local_key });
        bare.room('order:{id}', () => true);
        await expect(bare.config(42)).rejects.toThrow(/WORDPLUS_SITE and WORDPLUS_SECRET/);
        expect(() => createRealtime({ site: 's1', secret: V.secret, localKey: '' }).keys).toThrow(/64 hex/);
    });
});

describe('the app\'s settings', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('come from the environment when they aren\'t passed', async () => {
        vi.stubEnv('WORDPLUS_SITE', V.site);
        vi.stubEnv('WORDPLUS_SECRET', V.secret);
        vi.stubEnv('WORDPLUS_LOCAL_KEY', V.local_key);

        const realtime = createRealtime({ profile: (user) => ({ name: 'User ' + user }) });
        realtime.room('order:{id}', () => true);

        const { site, keys } = await realtime.config(42);
        expect(site).toBe(V.site);
        expect(keys.identity?.token).toBeTruthy();
        expect(await createRealtime().keysAnswer([], null)).toEqual({ keys: [], app: V.site });
    });

    it('name the app `app`, and still `site`, over the environment', async () => {
        vi.stubEnv('WORDPLUS_SITE', 's-from-the-environment');

        expect((await createRealtime({ app: 's-app', secret: V.secret, localKey: V.local_key }).config(null)).site).toBe('s-app');
        expect((await createRealtime({ site: 's-site', secret: V.secret, localKey: V.local_key }).config(null)).site).toBe('s-site');
    });

    it('say what is missing as they are first used, not as the app loads', async () => {
        vi.stubEnv('WORDPLUS_SITE', '');
        vi.stubEnv('WORDPLUS_SECRET', '');

        const realtime = createRealtime({ localKey: V.local_key });
        realtime.room('order:{id}', () => true);

        await expect(realtime.config(42)).rejects.toThrow(/WORDPLUS_SITE and WORDPLUS_SECRET/);
    });
});

describe('a room\'s rule', () => {
    const roomOptions = async (realtime: Realtime, room: string) => {
        const grant = await realtime.authorize([room], 42);
        return (await claimsOf(grant.token!, 'wordplus-realtime channels v1')).r[room];
    };

    it('comes before its options, as every other rule does and in every language', async () => {
        const rule = vi.fn(() => true);
        const realtime = app().room('order:{id}', rule, { history: 20, emit: ['message'] });

        expect(await roomOptions(realtime, 'order:1')).toMatchObject({ h: [20, MAX_HISTORY_DAYS], e: ['message'] });
        expect(rule).toHaveBeenCalledWith(42, { id: '1' }, 'order:1');
    });

    it('still takes the options first, as it did', async () => {
        const rule = vi.fn(() => true);
        const realtime = app().room('order:{id}', { history: 20 }, rule);

        expect(await roomOptions(realtime, 'order:1')).toMatchObject({ h: [20, MAX_HISTORY_DAYS] });
        expect(rule).toHaveBeenCalled();
    });

    it('may be left out of a public room, however it is written, and of no other', () => {
        expect(() => app().room('news:{id}', { public: true })).not.toThrow();
        expect(() => app().room('news:{id}', null, { public: true })).not.toThrow();
        expect(() => app().room('news:{id}', undefined, { public: true })).not.toThrow();
        expect(() => app().room('news:{id}', { presence: true })).toThrow(/needs a rule/);
        expect(() => app().room('news:{id}')).toThrow(/needs a rule/);
    });

    it('keeps history for the seconds it names, within the cloud\'s five minutes', async () => {
        const realtime = app()
            .room('a:{id}', () => true, { history: { last: 50, seconds: 120 } })
            .room('b:{id}', () => true, { history: { last: 50, seconds: 3600 } })
            .room('c:{id}', () => true, { history: { last: 50, seconds: 0 } })
            .room('d:{id}', () => true, { history: { last: 50, days: 0.001 } });

        expect((await roomOptions(realtime, 'a:1')).h).toEqual([50, 120 / 86_400]);
        expect((await roomOptions(realtime, 'b:1')).h).toEqual([50, MAX_HISTORY_DAYS]);
        expect((await roomOptions(realtime, 'c:1')).h).toEqual([50, MAX_HISTORY_DAYS]);
        expect((await roomOptions(realtime, 'd:1')).h).toEqual([50, 0.001]);
    });
});

describe('patterns', () => {
    it('match a room\'s parts, the rule with the most of its own characters deciding, the first on a tie', () => {
        const p = new Patterns<string>();
        p.add('chat:{a}:{b}', 'chat');
        p.add('chat:{a}:support', 'support');
        p.add('order:{id}', 'order');
        p.add('order.{id}', 'laravel');
        p.add('{any}', 'fallback');

        expect(p.match('chat:34:42')).toEqual({ pattern: 'chat:{a}:{b}', value: 'chat', params: { a: '34', b: '42' } });
        expect(p.match('chat:34:support')?.value).toBe('support');
        expect(p.match('order:42')?.params).toEqual({ id: '42' });
        expect(p.match('order.42')?.value).toBe('laravel');
        expect(p.match('order:42:x')).toBeNull();
        expect(p.match('news')?.value).toBe('fallback');
        expect(() => p.add('bad pattern', 'x')).toThrow(/not a pattern/);
    });

    it('take {pair} as the two people a name holds, weighing what {a}:{b} weighs', () => {
        const p = new Patterns<string>();
        p.add('chat:{pair}', 'pair');
        p.add('chat:{a}:{b}', 'parts');
        p.add('chat:{id}', 'one');

        expect(p.match('chat:34:42')).toEqual({ pattern: 'chat:{pair}', value: 'pair', params: { pair: '34:42' } });
        expect(p.match('chat:7')?.value).toBe('one');
        expect(p.match('chat:34:42:56')).toBeNull();
        expect(() => p.add('x:{pair}:{pair}', 'x')).toThrow(/one pair/);
    });
});

describe('{pair} in a room\'s pattern', () => {
    it('lets in the two people its name holds, with no rule to write, and nobody else', async () => {
        const realtime = app().room('chat:{pair}', { history: 50, emit: ['message'] });

        expect(await realtime.mayJoin('chat:34:42', 34)).toBe(true);
        expect(await realtime.mayJoin('chat:34:42', '42')).toBe(true);
        expect(await realtime.mayJoin('chat:34:42', 7)).toBe(false);
        expect(await realtime.mayJoin('chat:34:42', null)).toBe(false);
        expect(await realtime.mayJoin('chat:42:42', 42)).toBe(false);

        const grant = await realtime.authorize(['chat:34:42'], 42);
        expect((await claimsOf(grant.token!, 'wordplus-realtime channels v1')).r['chat:34:42']).toMatchObject({ h: [50, MAX_HISTORY_DAYS], e: ['message'] });
    });

    it('needs no options either, and id strings work as numbers do', async () => {
        const realtime = app();
        expect(realtime.room('chat:{pair}')).toBe(realtime);
        expect(await realtime.mayJoin('chat:user_2abc:user_9xyz', 'user_9xyz')).toBe(true);
    });

    it('asks a rule of the app\'s only about the two, told who the other is', async () => {
        const rule = vi.fn((_user: unknown, { other }: Record<string, string>) => other !== '34');
        const realtime = app().room('chat:{pair}', rule, { presence: true });

        expect(await realtime.mayJoin('chat:34:42', 7)).toBe(false);
        expect(rule).not.toHaveBeenCalled();

        expect(await realtime.mayJoin('chat:34:42', 42)).toBe(false);
        expect(rule).toHaveBeenCalledWith(42, { pair: '34:42', other: '34' }, 'chat:34:42');
        expect(await realtime.mayJoin('chat:34:42', 34)).toBe(true);
    });

    it('is refused where it means nothing', () => {
        expect(() => app().room('chat:{pair}', { public: true })).toThrow(/take `\{pair\}` off/);
        expect(() => app().groupCalls('team:{pair}', () => true)).toThrow(/not a group call/);
        expect(() => app().streams('show:{pair}', () => 'host')).toThrow(/not a live stream/);
    });
});

describe('callToken()', () => {
    const opened = (token: string) => JSON.parse(new TextDecoder().decode(unbase64url(token)!));
    const CALLS = 'wordplus-realtime calls v1';

    it('signs the call for the two people it names, keeping from the realtime server what is the page\'s alone', async () => {
        const realtime = app();
        const made = opened(await realtime.callToken(42, 34));
        const claims = await claimsOf(made.token, CALLS);

        expect(claims).toMatchObject({ iss: V.site, aud: 'wordplus-realtime call', call: 'call:' + made.id, id: made.id, sub: 42, role: 'caller', type: 'video', to: 34 });
        expect(claims.exp - claims.iat).toBe(6 * 3600);
        expect(made).toMatchObject({ call: 'call:' + made.id, to: 34, type: 'video', pair: [42, 34], exp: claims.exp });
        expect(made.key).toBe(await realtime.callKey(made.id, 42, 34));
        expect(made.member).toBeTruthy();
        expect(made.media_key).toBeTruthy();

        // What the realtime server sees: no key, and the proof sealed inside the caller's info.
        const seen = JSON.stringify(claims);
        for (const secret of [made.key, made.media_key, made.member]) expect(seen).not.toContain(secret);
        expect(seen).not.toContain('_ring');
        expect(seen).not.toContain('User 42');
    });

    it('takes a type, a name and what the person called is told', async () => {
        const made = opened(await app({ seal: false }).callToken('user_2abc', 34, { type: 'audio', name: 'support:17', info: { name: 'Ann' } }));
        const claims = await claimsOf(made.token, CALLS);

        expect(claims).toMatchObject({ call: 'support:17', sub: 'user_2abc', type: 'audio', info: { name: 'Ann' } });
        expect(typeof claims.info._ring).toBe('string');
        expect(made).toMatchObject({ call: 'support:17', type: 'audio', pair: ['user_2abc', 34] });
    });

    it('tells the person called about the caller from the app\'s profile, by default', async () => {
        const made = opened(await app({ seal: false }).callToken(42, 34));
        expect((await claimsOf(made.token, CALLS)).info).toMatchObject({ name: 'User 42', avatar: 'https://example.com/42.png' });
    });

    it('gives each call its own id', async () => {
        const realtime = app();
        expect(opened(await realtime.callToken(42, 34)).id).not.toBe(opened(await realtime.callToken(42, 34)).id);
    });

    it('lets the person rung answer with the proof the ring brought, with no rule, and the keys the caller has', async () => {
        const realtime = app({ seal: false });
        const made = opened(await realtime.callToken(42, 34));
        const { _ring: ring } = (await claimsOf(made.token, CALLS)).info;

        const answer = await realtime.authorizeCall({ call: made.call, id: made.id, role: 'callee', from: 42, type: 'video', ring }, 34);

        expect(await claimsOf(answer.token!, CALLS)).toMatchObject({ aud: 'wordplus-realtime call', call: made.call, id: made.id, sub: 34, role: 'callee', info: { name: 'User 34' } });
        expect(answer.key).toBe(made.key);
        expect(answer.media_key).toBe(made.media_key);
        expect(answer.pair).toEqual([42, 34]);
        expect(answer.member).toBeTruthy();
    });

    it('refuses a made-up proof, and someone else holding the real one', async () => {
        const realtime = app({ seal: false });
        const made = opened(await realtime.callToken(42, 34));
        const { _ring: ring } = (await claimsOf(made.token, CALLS)).info;
        const answering = { call: made.call, id: made.id, role: 'callee', type: 'video' };

        expect(await realtime.authorizeCall({ ...answering, from: 42, ring: 'A'.repeat(43) }, 34)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...answering, from: 42, ring }, 56)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...answering, from: 56, ring }, 34)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...answering, id: 'anotherCall123', from: 42, ring }, 34)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...answering, from: 42 }, 34)).toEqual({ denied: 'forbidden' });
    });

    it('starts nothing through the SDK\'s own route with no rule, so nobody goes around the app', async () => {
        const realtime = app();
        expect(await realtime.authorizeCall({ call: 'call:anything', id: 'abcDEF123_-xyz', role: 'caller', to: 56, type: 'video' }, 42)).toEqual({ denied: 'forbidden' });
    });

    it('renews a token for its holder\'s proof of being in the call, for them alone', async () => {
        const realtime = app();
        const made = opened(await realtime.callToken(42, 34));
        const renewing = { call: made.call, id: made.id, role: 'caller', to: 34, type: 'video', member: made.member };

        const renewed = await realtime.authorizeCall(renewing, 42);
        expect(await claimsOf(renewed.token!, CALLS)).toMatchObject({ id: made.id, sub: 42, role: 'caller', to: 34 });
        expect(renewed.media_key).toBe(made.media_key);

        expect(await realtime.authorizeCall(renewing, 56)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...renewing, to: 56 }, 42)).toEqual({ denied: 'forbidden' });
    });

    it('never lets a proof of being in a call bring someone new into it', async () => {
        const realtime = app();
        const made = opened(await realtime.callToken(42, 34));

        expect(await realtime.authorizeCall({ call: made.call, id: 'anotherAttempt1', role: 'caller', to: 56, type: 'video', group: made.id, pair: made.pair, member: made.member }, 42)).toEqual({ denied: 'forbidden' });
    });

    it('leaves a rule that owns the name to decide, as ever', async () => {
        const realtime = app({ seal: false }).calls('support:{id}', () => false);
        const made = opened(await realtime.callToken(42, 34, { name: 'support:17' }));
        const { _ring: ring } = (await claimsOf(made.token, CALLS)).info;

        expect(await realtime.authorizeCall({ call: made.call, id: made.id, role: 'callee', from: 42, type: 'video', ring }, 34)).toEqual({ denied: 'forbidden' });
    });

    it('refuses what can\'t be a call', async () => {
        const realtime = app();
        await expect(realtime.callToken(42, 42)).rejects.toThrow(/two different users/);
        await expect(realtime.callToken(42, 'has a space')).rejects.toThrow(/two different users/);
        await expect(realtime.callToken(42, 34, { name: 'has a space' })).rejects.toThrow(/not a name/);
    });

    describe('with into, ringing someone into a call', () => {
        const refOf = (made: any) => base64url(JSON.stringify({ id: made.id, name: made.call, type: made.type, pair: made.pair, member: made.member }));

        it('signs the ring for a user in the call, and the person rung answers with its proof', async () => {
            const realtime = app();
            const first = opened(await realtime.callToken(42, 34, { type: 'audio' }));
            const made = opened(await realtime.callToken(42, 56, { into: refOf(first) }));

            expect(await claimsOf(made.token, CALLS)).toMatchObject({ aud: 'wordplus-realtime call', call: first.call, sub: 42, role: 'caller', to: 56, type: 'audio', group: first.id });
            expect(made).toMatchObject({ call: first.call, to: 56, group: first.id, pair: [42, 34] });
            expect(made.id).not.toBe(first.id);

            const answer = await realtime.authorizeCall({ call: first.call, id: made.id, role: 'callee', from: 42, type: 'audio', group: first.id, pair: [42, 34], ring: made.ring }, 56);
            expect(await claimsOf(answer.token!, CALLS)).toMatchObject({ sub: 56, role: 'callee', group: first.id });
            expect(answer.media_key).toBe(first.media_key);
        });

        it('lets the other person in the call add someone too, with their own proof', async () => {
            const realtime = app({ seal: false });
            const first = opened(await realtime.callToken(42, 34));
            const { _ring: ring } = (await claimsOf(first.token, CALLS)).info;
            const answered = await realtime.authorizeCall({ call: first.call, id: first.id, role: 'callee', from: 42, type: 'video', ring }, 34);

            const made = opened(await realtime.callToken(34, 56, { into: refOf({ ...first, member: answered.member }) }));
            expect(await claimsOf(made.token, CALLS)).toMatchObject({ sub: 34, to: 56, group: first.id });
        });

        it('refuses someone not in the call, a made-up ref, and what is no ref at all', async () => {
            const realtime = app();
            const first = opened(await realtime.callToken(42, 34));

            await expect(realtime.callToken(77, 56, { into: refOf(first) })).rejects.toThrow(/call this user is in/);
            await expect(realtime.callToken(42, 56, { into: refOf({ ...first, member: 'A'.repeat(43) }) })).rejects.toThrow(/call this user is in/);
            await expect(realtime.callToken(42, 56, { into: refOf({ ...first, id: 'anotherCall123' }) })).rejects.toThrow(/call this user is in/);
            await expect(realtime.callToken(42, 56, { into: 'nothing' })).rejects.toThrow(/call this user is in/);
        });
    });
});

describe('groupCallToken()', () => {
    const opened = (token: string) => JSON.parse(new TextDecoder().decode(unbase64url(token)!));
    const CALLS = 'wordplus-realtime calls v1';

    it('signs a place in the call, what they may do as asked, with no rule anywhere', async () => {
        const made = opened(await app().groupCallToken(42, 'class:7', { type: 'audio', publish: false, hidden: true }));

        expect(await claimsOf(made.token, CALLS)).toMatchObject({ aud: 'wordplus-realtime room', room: 'class:7', sub: 42, type: 'audio', publish: false, subscribe: true, admin: false, hidden: true });
        expect(made).toMatchObject({ room: 'class:7', type: 'audio', user: 42 });
        expect(made.media_key).toBeUndefined();
        expect(made.host).toBeUndefined();
        expect(made.recorder).toBeUndefined();
    });

    it('lets everyone send and see by default, on video, as the app\'s profile', async () => {
        const made = opened(await app({ seal: false }).groupCallToken(42, 'meeting:7'));
        expect(await claimsOf(made.token, CALLS)).toMatchObject({ type: 'video', publish: true, subscribe: true, admin: false, hidden: false, info: { name: 'User 42' } });
    });

    it('gives everyone the same key when asked to encrypt, and keeps it from the realtime server', async () => {
        const realtime = app();
        const [ann, ben] = [opened(await realtime.groupCallToken(42, 'meeting:7', { encrypt: true })), opened(await realtime.groupCallToken(34, 'meeting:7', { encrypt: true }))];

        expect(ann.media_key).toBeTruthy();
        expect(ann.media_key).toBe(ben.media_key);
        expect(JSON.stringify(await claimsOf(ann.token, CALLS))).not.toContain(ann.media_key);
    });

    it('lets a host act through the SDK\'s route with its proof, and nobody else', async () => {
        const { realtime, sent } = recorder(() => ({ ok: true, muted: true, changed: true }));
        const host = opened(await realtime.groupCallToken(42, 'class:7', { admin: true }));
        const ask = { moderate: 'class:7', act: 'mute', user: 34 };

        expect(await realtime.authorizeCall({ ...ask, host: host.host }, 42)).toEqual({ done: true });
        expect(sent.at(-1)!.path).toContain('/calls/class%3A7/');

        // Someone else with the proof, another call, a made-up one, none, and one past its time.
        const before = sent.length;
        expect(await realtime.authorizeCall({ ...ask, user: 42, host: host.host }, 34)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...ask, moderate: 'class:8', host: host.host }, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...ask, host: { until: host.host.until, proof: 'A'.repeat(43) } }, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall(ask, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ ...ask, host: { ...host.host, until: 1000 } }, 42)).toEqual({ denied: 'forbidden' });
        expect(sent.length).toBe(before);

        vi.useFakeTimers();
        vi.setSystemTime((host.host.until + 1) * 1000);
        expect(await realtime.authorizeCall({ ...ask, host: host.host }, 42)).toEqual({ denied: 'forbidden' });
    });

    it('gives a host the proof to record, unless told no, and someone else only when told', async () => {
        const realtime = app();
        // Held: no proof while recording is unavailable, whoever asks.
        expect(opened(await realtime.groupCallToken(42, 'class:7', { admin: true })).recorder).toBeUndefined();
        expect(opened(await realtime.groupCallToken(34, 'class:7', { record: true })).recorder).toBeUndefined();
        // The switch on gives the old answer.
        HELD.RECORDING_AVAILABLE = true;
        expect(opened(await realtime.groupCallToken(42, 'class:7', { admin: true })).recorder).toBeTruthy();
        expect(opened(await realtime.groupCallToken(42, 'class:7', { admin: true, record: false })).recorder).toBeUndefined();
        expect(opened(await realtime.groupCallToken(34, 'class:7', { record: true })).recorder).toBeTruthy();
    });

    it('records with the proof, and refuses without it', async () => {
        HELD.RECORDING_AVAILABLE = true;
        const { realtime } = recorder(() => ({ ok: true, recording: { id: 'rec123456', state: 'recording' }, id: 'rec123456', state: 'recording' }));
        const host = opened(await realtime.groupCallToken(42, 'class:7', { admin: true }));

        expect(await realtime.authorizeCall({ call: 'class:7', record: 'start' }, 42)).toEqual({ denied: 'forbidden' });
        expect((await realtime.authorizeCall({ call: 'class:7', record: 'start', recorder: host.recorder }, 42)).recording).toBeTruthy();
        expect(await realtime.authorizeCall({ call: 'class:7', record: 'start', recorder: host.recorder }, 34)).toEqual({ denied: 'forbidden' });
    });

    it('leaves a rule that owns the name to decide, as ever, whatever proof a page holds', async () => {
        const realtime = app().groupCalls('class:{id}', () => true);
        const host = opened(await realtime.groupCallToken(42, 'class:7', { admin: true }));
        expect(await realtime.authorizeCall({ moderate: 'class:7', act: 'mute', user: 34, host: host.host }, 42)).toEqual({ denied: 'forbidden' });
    });

    it('starts nothing through the SDK\'s own route with no rule, so nobody goes around the app', async () => {
        expect(await app().authorizeCall({ room: 'class:7', type: 'video' }, 42)).toEqual({ denied: 'forbidden' });
    });

    it('refuses what can\'t be a place in a call', async () => {
        const realtime = app();
        await expect(realtime.groupCallToken('has a space', 'class:7')).rejects.toThrow(/needs a user/);
        await expect(realtime.groupCallToken(42, 'has a space')).rejects.toThrow(/not a name/);
    });
});

describe('streamToken()', () => {
    const opened = (token: string) => JSON.parse(new TextDecoder().decode(unbase64url(token)!));
    const claimsOfGrant = (token: string) => JSON.parse(new TextDecoder().decode(unbase64url(token.split('.')[1])!));

    it('signs who they are in the stream as asked, and lasts ten minutes', async () => {
        const made = opened(await app().streamToken(42, 'show:7', { role: 'host', src: ['camera'], quality: '720p', settings: { reactions: true, people: 'all', stage: false, chat: { offline: 'closed', links: false, fresh: true } } }));
        const claims = claimsOfGrant(made.token);

        expect(made.name).toBe('show:7');
        expect(claims).toMatchObject({ str: 'show:7', role: 'host', sub: '42', name: 'User 42', src: ['camera'], q: '720p', reactions: true, people: 'all', stage: false, offline: 'closed', links: false, fresh: true });
        expect(claims.exp - claims.iat).toBe(600);
    });

    it('makes a viewer by default, of a visitor too, with no rule anywhere', async () => {
        const realtime = app();
        expect(claimsOfGrant(opened(await realtime.streamToken(42, 'show:7')).token)).toMatchObject({ role: 'viewer', sub: '42' });
        const visitor = claimsOfGrant(opened(await realtime.streamToken(null, 'show:7')).token);
        expect(visitor.role).toBe('viewer');
        expect(visitor.sub).toBeUndefined();
    });

    it('takes a moderator and what they may do in the chat', async () => {
        expect(claimsOfGrant(opened(await app().streamToken(42, 'show:7', { mod: true, chat: 'read', info: { name: 'Ann' } })).token)).toMatchObject({ mod: true, chat: 'read', name: 'Ann' });
    });

    it('refuses more than a viewer\'s place to a visitor, and what can\'t be a stream', async () => {
        const realtime = app();
        await expect(realtime.streamToken(null, 'show:7', { role: 'host' })).rejects.toThrow(/can only be a viewer/);
        await expect(realtime.streamToken(42, 'has_underscore')).rejects.toThrow(/not a name/);
    });

    it('starts nothing through the SDK\'s own route with no rule, so nobody goes around the app', async () => {
        expect(await app().authorizeCall({ stream: 'show:7' }, 42)).toEqual({ denied: 'forbidden' });
    });
});

describe('{pair} in a call\'s pattern', () => {
    const ask = (from: number | string, to: number | string, name = 'support:34:42') => ({ call: name, id: 'abcDEF123_-xyz', role: 'caller' as const, to, type: 'video' as const, from });

    it('lets the two people its name holds call each other, with no rule to write, and nobody else', async () => {
        const realtime = app().calls('support:{pair}');

        expect((await realtime.authorizeCall(ask(42, 34), 42)).token).toBeTruthy();
        expect((await realtime.authorizeCall(ask(34, 42), 34)).token).toBeTruthy();
        expect((await realtime.authorizeCall({ call: 'support:34:42', id: 'abcDEF123_-xyz', role: 'callee', from: 34 }, 42)).token).toBeTruthy();

        // Someone else calling either of them, and either of them calling someone else, as a third person added would.
        expect(await realtime.authorizeCall(ask(7, 34), 7)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall(ask(42, 7), 42)).toEqual({ denied: 'forbidden' });
    });

    it('asks a rule of the app\'s only about the two', async () => {
        const rule = vi.fn((user: unknown) => user === 42);
        const realtime = app().calls('support:{pair}', rule);

        expect(await realtime.authorizeCall(ask(7, 34), 7)).toEqual({ denied: 'forbidden' });
        expect(rule).not.toHaveBeenCalled();

        expect((await realtime.authorizeCall(ask(42, 34), 42)).token).toBeTruthy();
        expect(rule).toHaveBeenCalledWith(42, 34, { pair: '34:42' }, 'support:34:42', { role: 'caller' });
        expect(await realtime.authorizeCall(ask(34, 42), 34)).toEqual({ denied: 'forbidden' });
    });

    it('takes no people to add, being only ever those two, and any other call still needs its rule', () => {
        expect(() => (app() as any).calls('support:{pair}', () => true, { people: () => [] })).toThrow(/only ever those two/);
        expect(() => (app() as any).calls('support:{id}')).toThrow(/needs a rule/);
    });
});

describe('the auth route', () => {
    it('takes a room\'s history as the other packages do: a part of a day kept, and the cloud\'s limit when days is missing or not above 0', async () => {
        // The realtime server refuses a room whose history keeps 0 days, which this package let through.
        const realtime = app();
        realtime.room('a:{id}', { history: { last: 30, days: 0.002 } }, () => true);
        realtime.room('b:{id}', { history: { last: 30, days: '0.002' as unknown as number } }, () => true);
        realtime.room('c:{id}', { history: { last: 30 } }, () => true);
        realtime.room('d:{id}', { history: { last: 30, days: 0 } }, () => true);
        realtime.room('e:{id}', { history: { last: 30, days: -1 } }, () => true);
        realtime.room('f:{id}', { history: 20.9 }, () => true);

        const claims = await claimsOf((await realtime.authorize(['a:1', 'b:1', 'c:1', 'd:1', 'e:1', 'f:1'], 42)).token!, 'wordplus-realtime channels v1');
        expect(claims.r).toEqual({
            'a:1': { h: [30, 0.002] },
            'b:1': { h: [30, 0.002] },
            'c:1': { h: [30, MAX_HISTORY_DAYS] },
            'd:1': { h: [30, MAX_HISTORY_DAYS] },
            'e:1': { h: [30, MAX_HISTORY_DAYS] },
            'f:1': { h: [20, MAX_HISTORY_DAYS] },
        });
    });

    it('signs one token for the rooms the rules allow, each with its options, their keys, and says why each other was refused', async () => {
        const realtime = app();
        realtime.room('order:{id}', { history: 20 }, (user, { id }) => user === 42 && id === '42');
        realtime.room('chat:{a}:{b}', { presence: true, history: { last: 500, days: 7 }, emit: ['message', 'typing'], webhook: ['message'] }, (user, { a, b }) =>
            [a, b].includes(String(user)) ? { info: { name: 'Ben', role: 'Customer' } } : false,
        );
        realtime.room('news', { public: true, count: true });
        realtime.room('board:{id}', { emit: '*' }, (user) => (user === 42 ? { readOnly: true } : true));
        const keys = new Keys(V.local_key, null);

        const grant = await realtime.authorize(['order:42', 'chat:34:42', 'news', 'board:1', 'order:43', 'nobody:1', 'bad room', 'order:42'], 42);
        expect(grant.denied).toEqual({ 'order:43': 'forbidden', 'nobody:1': 'no_rule', 'bad room': 'bad_room' });

        const claims = await claimsOf(grant.token!, 'wordplus-realtime channels v1');
        expect(claims).toMatchObject({ iss: V.site, aud: 'wordplus-realtime', sub: '42' });
        expect(claims.r).toEqual({
            'order:42': { h: [20, MAX_HISTORY_DAYS] },
            'chat:34:42': { p: 1, h: [500, MAX_HISTORY_DAYS], e: ['message', 'typing'], w: ['message'] },
            news: { c: 1 },
            'board:1': { e: '*', ro: 1 },
        });
        expect(claims.exp - claims.iat).toBe(21_600);
        expect(JSON.parse((await keys.open(claims.infos['chat:34:42']))!)).toEqual({ name: 'Ben', role: 'Customer' });

        // The sealed rooms' keys come with the token; a public room is not sealed.
        expect(grant.keys).toEqual([await keys.entry('ch:order:42:1'), await keys.entry('ch:chat:34:42:1'), await keys.entry('ch:board:1:1')]);
    });

    it('lets nobody into presence, a public room in without a rule, at most 100 rooms, and keeps info plain when sealing is off', async () => {
        const realtime = app({ seal: false });
        realtime.room('lobby', { presence: true }, () => true);
        realtime.room('product:{id}', { public: true, count: true });

        expect((await realtime.authorize(['lobby'], null)).denied).toEqual({ lobby: 'forbidden' });
        const open = await realtime.authorize(['product:7'], null);
        expect((await claimsOf(open.token!, 'wordplus-realtime channels v1')).sub).toBeUndefined();

        const many = await realtime.authorize(Array.from({ length: 101 }, (_, i) => 'product:' + i), 7);
        expect(many.denied).toEqual({ 'product:100': 'too_many' });

        const plain = await claimsOf((await realtime.authorize(['lobby'], 7)).token!, 'wordplus-realtime channels v1');
        expect(plain.info).toEqual({ name: 'User 7', avatar: 'https://example.com/7.png' });
        expect(plain.infos).toBeUndefined();
        expect((await realtime.authorize(['lobby'], 7)).keys).toBeUndefined();
    });

    it('refuses a rule that isn\'t one, and a public room with members', () => {
        const realtime = app();
        expect(() => realtime.room('order:{id}')).toThrow(/needs a rule/);
        expect(() => realtime.room('lobby', { public: true, presence: true })).toThrow(/public room/);
    });

    it('gives every page a grant for the public rooms, made once and again before it runs out', async () => {
        vi.useFakeTimers({ now: Date.UTC(2026, 9, 11), toFake: ['Date'] });
        const realtime = app();
        realtime.room('product:{id}', { public: true, count: true });
        realtime.room('scores', { public: true, history: 10 });
        realtime.room('order:{id}', () => true);

        const [grant] = await realtime.publicGrants();
        expect(grant.rooms).toEqual(['product:{id}', 'scores']);
        const claims = await claimsOf(grant.token, 'wordplus-realtime channels v1');
        expect(claims.r).toEqual({ 'product:{id}': { c: 1 }, scores: { h: [10, MAX_HISTORY_DAYS] } });
        expect(claims.sub).toBeUndefined();
        expect((await realtime.publicGrants())[0].token).toBe(grant.token);
        expect((await realtime.config(null)).grants).toEqual([grant]);

        vi.setSystemTime(Date.UTC(2026, 9, 11) + 5.5 * 3600_000);
        expect((await realtime.publicGrants())[0].token).not.toBe(grant.token);
        expect(await app().publicGrants()).toEqual([]);
    });
});

describe('the calls route', () => {
    it('signs a line, each side of a call with its key, and a place in a group call, the info sealed with the day\'s key', async () => {
        const realtime = app();
        realtime.calls('support:{a}:{b}', (user, withUser, { a }) => a === String(user) || a === String(withUser));
        realtime.groupCalls('meeting:{id}', (user) => ({ admin: user === 1, info: { name: 'Agent' } }));
        const keys = new Keys(V.local_key, null);

        const line = await realtime.authorizeCall({ line: true }, 42);
        expect(await claimsOf(line.token!, 'wordplus-realtime calls v1')).toMatchObject({ iss: V.site, aud: 'wordplus-realtime line', sub: 42 });

        const caller = await realtime.authorizeCall({ call: 'support:42:34', id: 'abcDEF123_-xyz', role: 'caller', to: 34, type: 'audio' }, 42);
        const callerClaims = await claimsOf(caller.token!, 'wordplus-realtime calls v1');
        expect(callerClaims).toMatchObject({ aud: 'wordplus-realtime call', call: 'support:42:34', id: 'abcDEF123_-xyz', sub: 42, role: 'caller', to: 34, type: 'audio' });
        expect(JSON.parse((await keys.open(callerClaims.info))!)).toEqual({ name: 'User 42', avatar: 'https://example.com/42.png' });
        expect(caller.key).toBe(V.call_key.key);

        // The callee's key is the same call's, whichever side asks.
        const callee = await realtime.authorizeCall({ call: 'support:42:34', id: 'abcDEF123_-xyz', role: 'callee', from: '42' }, '34');
        expect(callee.key).toBe(V.call_key.key);

        const room = await realtime.authorizeCall({ room: 'meeting:daily', type: 'video' }, 1);
        const roomClaims = await claimsOf(room.token!, 'wordplus-realtime calls v1');
        expect(roomClaims).toMatchObject({ aud: 'wordplus-realtime room', room: 'meeting:daily', sub: 1, publish: true, subscribe: true, admin: true, hidden: false });
        expect(JSON.parse((await keys.open(roomClaims.info))!)).toEqual({ name: 'Agent' });
        expect(roomClaims.info.startsWith('d:' + dayOf() + ':1.')).toBe(true);
        expect(room.media_key).toBeUndefined();
    });

    it('refuses nobody, an id with a space, a call or group call nobody owns, and requests that aren\'t one', async () => {
        const realtime = app();
        realtime.calls('support:{id}', () => true);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(await realtime.authorizeCall({ line: true }, null)).toEqual({ denied: 'no_user' });
        expect(await realtime.authorizeCall({ line: true }, 'ann smith')).toEqual({ denied: 'no_user' });
        expect(await realtime.authorizeCall({ line: true }, 'a'.repeat(65))).toEqual({ denied: 'no_user' });
        expect(warn).toHaveBeenCalledTimes(1);
        // An id of text is a user like any other, and one of digits a number.
        expect(await claimsOf((await realtime.authorizeCall({ line: true }, 'user_2abc')).token!, 'wordplus-realtime calls v1')).toMatchObject({ sub: 'user_2abc' });
        expect(await claimsOf((await realtime.authorizeCall({ line: true }, '42')).token!, 'wordplus-realtime calls v1')).toMatchObject({ sub: 42 });
        expect(await realtime.authorizeCall({ call: 'sales:1', id: 'abcdefgh', role: 'caller', to: 2 }, 1)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ room: 'support:1' }, 1)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ call: 'support:1', id: 'short', role: 'caller', to: 2 }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ call: 'support:1', id: 'abcdefgh', role: 'caller', to: 1 }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ room: 'bad room' }, 1)).toEqual({ denied: 'bad_request' });

        warn.mockRestore();
    });

    it('tells the rule which side asks, so a user may answer calls they may not place', async () => {
        // Pro members place calls, anyone answers them (an SDK review, 2026-10-14).
        const pro = new Set(['user_ann']);
        const asked: unknown[] = [];
        const realtime = app();
        realtime.calls('dm:{a}:{b}', (user, withUser, params, call, side) => {
            asked.push([user, side.role]);
            return side.role === 'callee' || pro.has(String(user));
        });

        expect((await realtime.authorizeCall({ call: 'dm:user_ann:user_cara', id: 'abcdefgh', role: 'caller', to: 'user_cara' }, 'user_ann')).token).toBeTypeOf('string');
        expect((await realtime.authorizeCall({ call: 'dm:user_ann:user_cara', id: 'abcdefgh', role: 'callee', from: 'user_ann' }, 'user_cara')).token).toBeTypeOf('string');
        expect(await realtime.authorizeCall({ call: 'dm:user_ann:user_cara', id: 'ijklmnop', role: 'caller', to: 'user_ann' }, 'user_cara')).toEqual({ denied: 'forbidden' });
        expect(asked).toEqual([['user_ann', 'caller'], ['user_cara', 'callee'], ['user_cara', 'caller']]);
    });

    it('makes a group call\'s media key and a call\'s proofs from the local key, as PHP does', async () => {
        const keys = new Keys(V.local_key, null);
        for (const { what, key } of V.media) expect(await keys.media(what)).toBe(key);
        for (const { what, proof } of V.proofs) expect(await keys.proof(what)).toBe(proof);
    });

    it('rings someone into the group call a call became for a proof of being in it, and lets them answer with the proof they were rung', async () => {
        const realtime = app();
        realtime.calls('support-{id}', () => true);
        const caller = await realtime.authorizeCall({ call: 'support-42', id: 'abcDEF123_-xyz', role: 'caller', to: 34 }, 42);
        expect(caller.media_key).toBe(V.media[0].key);
        expect(caller.member).toBe(V.proofs[0].proof);
        const group = { call: 'support-42', group: 'abcDEF123_-xyz', pair: caller.pair };

        const ring = await realtime.authorizeCall({ ...group, id: 'ringCara0001', role: 'caller', to: 56, member: caller.member }, 42);
        expect(await claimsOf(ring.token!, 'wordplus-realtime calls v1')).toMatchObject({ id: 'ringCara0001', sub: 42, to: 56, group: 'abcDEF123_-xyz' });
        expect(ring.ring).toBe(V.proofs[1].proof);

        const answer = await realtime.authorizeCall({ ...group, id: 'ringCara0001', role: 'callee', from: 42, ring: ring.ring }, 56);
        expect(answer.media_key).toBe(caller.media_key);
        expect(await realtime.authorizeCall({ ...group, id: 'ringCara0002', role: 'caller', to: 78, member: caller.member }, 34)).toEqual({ denied: 'forbidden' });
    });

    it('calls between users whose ids are text, their keys and proofs never the same for two pairs', async () => {
        const realtime = app();
        realtime.calls('support-{id}', () => true);
        const keys = new Keys(V.local_key, null);

        // Ann, an id of Clerk, calls Ben, of Auth0, whose id holds the `|` keys are joined with: escaped there.
        const caller = await realtime.authorizeCall({ call: 'support-1', id: 'abcDEF123_-xyz', role: 'caller', to: 'auth0|5f7c' }, 'user_2abc');
        expect(await claimsOf(caller.token!, 'wordplus-realtime calls v1')).toMatchObject({ sub: 'user_2abc', to: 'auth0|5f7c' });
        expect(caller.pair).toEqual(['user_2abc', 'auth0|5f7c']);
        expect(caller.media_key).toBe(await keys.media('call|support-1|abcDEF123_-xyz|user_2abc|auth0%7C5f7c'));

        // Another pair that would join to the same string unescaped: another key, and the proof of one is not that of the other.
        const other = await realtime.authorizeCall({ call: 'support-1', id: 'abcDEF123_-xyz', role: 'caller', to: '5f7c' }, 'user_2abc|auth0');
        expect(other.media_key).not.toBe(caller.media_key);
        const ring = { call: 'support-1', group: 'abcDEF123_-xyz', id: 'ringCara0001', role: 'caller', to: 'cara@shop.example' };
        expect(await realtime.authorizeCall({ ...ring, pair: other.pair, member: caller.member }, 'user_2abc')).toEqual({ denied: 'forbidden' });
        const rang = await realtime.authorizeCall({ ...ring, pair: caller.pair, member: caller.member }, 'user_2abc');
        expect(await claimsOf(rang.token!, 'wordplus-realtime calls v1')).toMatchObject({ sub: 'user_2abc', to: 'cara@shop.example', group: 'abcDEF123_-xyz' });
    });

    it('lists whom a user may add, and encrypts a group call whose rule says so', async () => {
        const realtime = app();
        realtime.calls('support:{id}', (user, withUser) => withUser === 34 || user === 34, { people: () => [34, 56, 42, 'x', 'two words', 0, 56] });
        realtime.groupCalls('board-{id}', () => true, { encrypt: true });

        expect((await realtime.authorizeCall({ people: 'support:42' }, 42)).people).toEqual([{ id: 34, name: 'User 34', avatar: 'https://example.com/34.png' }]);
        expect((await realtime.authorizeCall({ people: 'support:42' }, 34)).people?.map((p) => p.id)).toEqual([56, 42, 'x']);
        expect((await realtime.authorizeCall({ room: 'board-7' }, 1)).media_key).toBe(V.media[1].key);
        expect((await realtime.config(null)).screen).toEqual({ add: true });
    });
    it('takes what the host of a group call does from its screen, asking its rule again, and nothing from anyone else', async () => {
        const { realtime, sent } = recorder((path) => (path.endsWith('/permit') ? { ok: true, changed: false } : { ok: true, muted: true, removed: true }));
        realtime.groupCalls('meeting:{id}', (user) => (user === 1 ? { admin: true } : true));

        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'mute', user: 42 }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'speak', user: 'auth0|5f7c8e' }, 1)).toEqual({ done: false });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'listen', user: 42 }, 1)).toEqual({ done: false });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'remove', user: 42 }, 1)).toEqual({ done: true });
        // Each names its host as `by`; Make Listener and its promotion hold, a mute is once.
        expect(sent.map((s) => [s.path, s.body])).toEqual([
            ['/wordplus/realtime/calls/meeting%3A7/mute', { user: '42', track: 'microphone', by: '1' }],
            ['/wordplus/realtime/calls/meeting%3A7/permit', { user: 'auth0|5f7c8e', publish: true, hold: true, by: '1' }],
            ['/wordplus/realtime/calls/meeting%3A7/permit', { user: '42', publish: false, hold: true, by: '1' }],
            ['/wordplus/realtime/calls/meeting%3A7/remove', { user: '42', by: '1' }],
        ]);

        // Someone in it who isn't its host, a call no rule owns, an act or a person that isn't one, and the host themselves.
        sent.length = 0;
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'remove', user: 1 }, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ moderate: 'board:7', act: 'remove', user: 42 }, 1)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'end', user: 42 }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'mute', user: 'two words' }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'mute', user: 1 }, 1)).toEqual({ denied: 'bad_request' });
        expect(sent).toEqual([]);

        const failing = app({ api: 'https://rest.example.test/', fetch: async () => Response.json({ ok: false, error: 'server' }, { status: 500 }) });
        failing.groupCalls('meeting:{id}', () => ({ admin: true }));
        expect(await failing.authorizeCall({ moderate: 'meeting:7', act: 'mute', user: 42 }, 1)).toEqual({ denied: 'server' });
    });

    it('records a group call for whoever its rule lets record, its admin by default, and says why the cloud refused', async () => {
        const { realtime, sent } = recorder((path) => (path.endsWith('/start')
            ? { ok: true, recording: { id: 'rec_abcdefgh12', state: 'recording' } }
            : { ok: true, state: 'stopping' }));
        realtime.groupCalls('meeting:{id}', (user) => (user === 1 ? { admin: true } : user === 2 ? { record: true } : user === 3 ? { admin: true, record: false } : true));

        expect(await realtime.authorizeCall({ call: 'meeting:7', record: 'start' }, 1)).toEqual({ recording: { id: 'rec_abcdefgh12', state: 'recording' } });
        expect(await realtime.authorizeCall({ call: 'meeting:7', record: 'stop', recording: 'rec_abcdefgh12' }, 2)).toEqual({ recording: { id: 'rec_abcdefgh12', state: 'stopping' } });
        expect(sent.map((s) => [s.path, s.body])).toEqual([
            ['/wordplus/realtime/recordings/start', { product: 'call', room: 'meeting:7', type: 'video', meta: '{"by":"1"}' }],
            ['/wordplus/realtime/recordings/stop', { recording: 'rec_abcdefgh12' }],
        ]);

        // The room's answer says whom the call screen offers it to, asking the rule the same way.
        const offered = async (user: number) => (await realtime.authorizeCall({ room: 'meeting:7', type: 'video' }, user)).record;
        expect([await offered(1), await offered(2), await offered(3), await offered(42)]).toEqual([false, false, undefined, undefined]);
        // Held: the answer says true again once the switch is on.
        HELD.RECORDING_AVAILABLE = true;
        try { expect([await offered(1), await offered(2), await offered(3), await offered(42)]).toEqual([true, true, undefined, undefined]); } finally { HELD.RECORDING_AVAILABLE = false; }

        sent.length = 0;
        expect(await realtime.authorizeCall({ call: 'meeting:7', record: 'start' }, 3)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ call: 'meeting:7', record: 'start' }, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ call: 'meeting:7', record: 'stop' }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ call: 'meeting:7', record: 'pause' }, 1)).toEqual({ denied: 'bad_request' });
        expect(sent).toEqual([]);

        const spent = app({ api: 'https://rest.example.test/', fetch: async () => Response.json({ ok: false, error: 'no_credits' }, { status: 403 }) });
        spent.groupCalls('meeting:{id}', () => ({ admin: true }));
        expect(await spent.authorizeCall({ call: 'meeting:7', record: 'start' }, 1)).toEqual({ denied: 'no_credits' });
    });

    it('takes a host\'s spotlight, themselves too, and takes everyone out of it with nobody named', async () => {
        const { realtime, sent } = recorder(() => ({ ok: true, changed: true, spotlight: [] }));
        realtime.groupCalls('meeting:{id}', (user) => (user === 1 ? { admin: true } : true));

        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'spotlight', user: 42 }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'spotlight', user: 1 }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'unspotlight', user: 42 }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'unspotlight', user: null }, 1)).toEqual({ done: true });
        expect(sent.map((s) => [s.path, s.body])).toEqual([
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { user: '42', on: true }],
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { user: '1', on: true }],
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { user: '42', on: false }],
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { on: false }],
        ]);

        // Nobody named is for taking everyone out alone, and a member spotlights nobody.
        sent.length = 0;
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'spotlight', user: null }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'mute', user: null }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'spotlight', user: 42 }, 42)).toEqual({ denied: 'forbidden' });
        expect(sent).toEqual([]);

        // A fifth person: the cloud's refusal, for the call screen to say.
        const full = app({ api: 'https://rest.example.test/', fetch: async () => Response.json({ ok: false, error: 'spotlight_full' }, { status: 409 }) });
        full.groupCalls('meeting:{id}', () => ({ admin: true }));
        expect(await full.authorizeCall({ moderate: 'meeting:7', act: 'spotlight', user: 42 }, 1)).toEqual({ denied: 'spotlight_full' });
    });

    const opened = (token: string) => JSON.parse(new TextDecoder().decode(unbase64url(token)!));

    it('takes every act of a host\'s screen, as Better Messages holds them, each naming its host as `by`', async () => {
        const answers: Record<string, unknown> = {
            mute: { ok: true, muted: false },
            unmute: { ok: true, changed: true },
            ban: { ok: true, removed: false, until: 1791640000000 },
            unban: { ok: true, unbanned: true },
            rules: { ok: true, rules: { mode: 'broadcast', locked: true, muted: false } },
            ask: { ok: true, id: 'ask_1', devices: ['camera'] },
            end: { ok: true },
        };
        const { realtime, sent } = recorder((path) => answers[path.split('/').pop()!] ?? { ok: true });
        realtime.groupCalls('meeting:{id}', (user) => (user === 1 ? { admin: true } : true));
        const act = (request: Record<string, unknown>) => realtime.authorizeCall({ moderate: 'meeting:7', ...request }, 1);

        expect(await act({ act: 'hold_mic', user: 42 })).toEqual({ done: true });
        expect(await act({ act: 'release_mic', user: 42 })).toEqual({ done: true });
        expect(await act({ act: 'ban', user: 42, minutes: 30 })).toEqual({ done: true });
        expect(await act({ act: 'ban', user: 'auth0|5f7c8e' })).toEqual({ done: true });
        expect(await act({ act: 'unban', user: 42 })).toEqual({ done: true });
        expect(await act({ act: 'rules', user: null, rules: { mode: 'broadcast', locked: true } })).toEqual({ done: true, rules: { mode: 'broadcast', locked: true, muted: false } });
        expect(await act({ act: 'ask', user: 42, devices: ['camera'] })).toEqual({ done: true, id: 'ask_1' });
        expect(await act({ act: 'end', user: null })).toEqual({ done: true });
        expect(sent.map((s) => [s.path.replace('/wordplus/realtime/calls/meeting%3A7', ''), s.body])).toEqual([
            ['/mute', { user: '42', track: 'microphone', hold: true, by: '1' }],
            ['/unmute', { user: '42', by: '1' }],
            ['/ban', { user: '42', minutes: 30, by: '1' }],
            ['/ban', { user: 'auth0|5f7c8e', by: '1' }],
            ['/unban', { user: '42', by: '1' }],
            ['/rules', { mode: 'broadcast', locked: true, by: '1' }],
            ['/ask', { user: '42', devices: ['camera'], by: '1' }],
            ['/end', { by: '1' }],
        ]);

        // What an act carries is checked before anyone is asked: a ban's minutes, an ask's devices, the rules, and rules
        // and end, which name nobody.
        sent.length = 0;
        for (const wrong of [
            { act: 'ban', user: 42, minutes: 0 }, { act: 'ban', user: 42, minutes: 10081 }, { act: 'ban', user: 42, minutes: 1.5 },
            { act: 'ask', user: 42 }, { act: 'ask', user: 42, devices: [] }, { act: 'ask', user: 42, devices: ['screen'] }, { act: 'ask', user: 42, devices: ['camera', 'camera'] },
            { act: 'rules', user: null }, { act: 'rules', user: null, rules: {} }, { act: 'rules', user: null, rules: { mode: 'quiet' } }, { act: 'rules', user: null, rules: { locked: 'yes' } },
            { act: 'rules', user: 42, rules: { locked: true } }, { act: 'end', user: 42 }, { act: 'ban', user: 1 }, { act: 'ask', user: 1, devices: ['camera'] },
            { act: 'record', user: 42 }, { act: 'hand', user: 42 },
        ]) expect(await act(wrong)).toEqual({ denied: 'bad_request' });
        // Someone who isn't its host.
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'end', user: null }, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ moderate: 'meeting:7', act: 'ban', user: 43 }, 42)).toEqual({ denied: 'forbidden' });
        expect(sent).toEqual([]);

        // The cloud's refusals the screen says in its own words: a host banned, an ask again, someone gone.
        for (const [code, status] of [['forbidden', 403], ['asked_recently', 429], ['not_in_call', 404]] as const) {
            const refusing = app({ api: 'https://rest.example.test/', fetch: async () => Response.json({ ok: false, error: code }, { status }) });
            refusing.groupCalls('meeting:{id}', () => ({ admin: true }));
            expect(await refusing.authorizeCall({ moderate: 'meeting:7', act: 'ask', user: 42, devices: ['microphone'] }, 1)).toEqual({ denied: code });
        }
    });

    it('lets a host act on the new acts with the proof of its token, as on the old ones', async () => {
        const { realtime, sent } = recorder(() => ({ ok: true, until: 1, removed: true }));
        const host = opened(await realtime.groupCallToken(1, 'class:7', { admin: true }));
        const member = opened(await realtime.groupCallToken(42, 'class:7'));

        expect(await realtime.authorizeCall({ moderate: 'class:7', act: 'ban', user: 42, host: host.host }, 1)).toEqual({ done: true });
        // A member's proof is no host's.
        expect(await realtime.authorizeCall({ moderate: 'class:7', act: 'ban', user: 43, host: member.member }, 42)).toEqual({ denied: 'forbidden' });
        expect(sent.length).toBe(1);
    });

    it('names its acts in every token and room answer, gives everyone the proof of being in the call, and a host alone the host\'s', async () => {
        const realtime = app().groupCalls('meeting:{id}', (user) => (user === 1 ? { admin: true } : true));
        const acts = ['remove', 'ban', 'listen', 'speak', 'mute', 'hold_mic', 'release_mic', 'rules', 'hand', 'ask', 'end', 'spotlight'];

        const host = opened(await realtime.groupCallToken(1, 'class:7', { admin: true }));
        const member = opened(await realtime.groupCallToken(42, 'class:7'));
        expect(host.acts).toEqual(acts);
        expect(member.acts).toEqual(acts);
        expect(member.member).toMatchObject({ until: expect.any(Number), proof: expect.any(String) });
        expect(host.member.proof).not.toBe(member.member.proof);
        expect(member.host).toBeUndefined();
        // No recording is offered among them.
        expect(member.acts).not.toContain('record');

        expect((await realtime.authorizeCall({ room: 'meeting:7', type: 'video' }, 42)).acts).toEqual(acts);
        expect((await realtime.authorizeCall({ room: 'meeting:7', type: 'video' }, 1)).acts).toEqual(acts);
        expect((await realtime.authorizeCall({ room: 'board:7', type: 'video' }, 1)).acts).toBeUndefined();
    });

    it('takes a raised hand from anyone the rule lets in, or with the proof of being in it, and a lowered one from a host', async () => {
        const { realtime, sent } = recorder((path) => (path.endsWith('/lower') ? { ok: true, lowered: 2 } : { ok: true, changed: true }));
        realtime.groupCalls('meeting:{id}', (user) => (user === 1 ? { admin: true } : user === 42));
        const made = opened(await realtime.groupCallToken(56, 'class:7'));
        const host = opened(await realtime.groupCallToken(1, 'class:7', { admin: true }));

        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: true }, 42)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: false }, 42)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ hand: 'class:7', up: true, member: made.member }, 56)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: false, user: 42 }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: false, user: null }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ hand: 'class:7', up: false, user: 56, host: host.host }, 1)).toEqual({ done: true });
        expect(sent.map((s) => [s.path, s.body])).toEqual([
            ['/wordplus/realtime/calls/meeting%3A7/hand', { user: '42', up: true }],
            ['/wordplus/realtime/calls/meeting%3A7/hand', { user: '42', up: false }],
            ['/wordplus/realtime/calls/class%3A7/hand', { user: '56', up: true }],
            ['/wordplus/realtime/calls/meeting%3A7/hand', { user: '42', up: false }],
            ['/wordplus/realtime/calls/meeting%3A7/hands/lower', { by: '1' }],
            ['/wordplus/realtime/calls/class%3A7/hand', { user: '56', up: false }],
        ]);

        // Someone the rule keeps out, a proof of another user or call, a member lowering another's, a host raising one.
        sent.length = 0;
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: true }, 43)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ hand: 'class:7', up: true }, 56)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ hand: 'class:7', up: true, member: made.member }, 57)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ hand: 'class:8', up: true, member: made.member }, 56)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: false, user: 43 }, 42)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: true, user: 43 }, 1)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: 'yes' }, 42)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ hand: 'meeting:7', up: false, user: 'two words' }, 1)).toEqual({ denied: 'bad_request' });
        expect(sent).toEqual([]);
    });

    it('sends what 1.1.0 sent for a call left as it was, and the holds and `by` only when given', async () => {
        const { realtime, sent } = recorder((path) => ({ ok: true, muted: true, removed: true, changed: true, unbanned: true, lowered: 0, until: 5, rules: { mode: 'participatory', locked: true, muted: false }, bans: [{ user: '43', until: 5 }, { user: '44', until: null }], id: 'a1', devices: ['microphone'] }));
        const call = realtime.call('meeting:7');

        expect(await call.mute(42)).toBe(true);
        expect(await call.remove(42)).toBe(true);
        expect(await call.permit(42, { publish: true })).toBe(true);
        expect(await call.letSpeak(42)).toBe(true);
        await call.end();
        expect(await call.mute(42, 'microphone', { hold: true, by: 1 })).toBe(true);
        expect(await call.unmute(42)).toBe(true);
        expect(await call.permit(42, { publish: false, hold: true, by: 1 })).toBe(true);
        expect(await call.remove(42, { by: 1 })).toBe(true);
        expect(await call.ban(42, { minutes: 60, by: 1 })).toEqual({ removed: true, until: 5 });
        expect(await call.unban(42)).toBe(true);
        expect(await call.bans()).toEqual([{ user: '43', until: 5 }, { user: '44', until: null }]);
        expect(await call.rules({ locked: true })).toEqual({ mode: 'participatory', locked: true, muted: false });
        expect(await call.hand(42, true)).toBe(true);
        expect(await call.lowerHands()).toBe(0);
        expect(await call.ask(42, ['microphone'], 1)).toEqual({ id: 'a1', devices: ['microphone'] });
        await call.end({ by: 1 });

        expect(sent.map((s) => [s.method, s.path.replace('/wordplus/realtime/calls/meeting%3A7', ''), s.body])).toEqual([
            ['POST', '/mute', { user: '42', track: 'microphone' }],
            ['POST', '/remove', { user: '42' }],
            ['POST', '/permit', { user: '42', publish: true }],
            ['POST', '/permit', { user: '42', publish: true }],
            ['POST', '/end', undefined],
            ['POST', '/mute', { user: '42', track: 'microphone', hold: true, by: '1' }],
            ['POST', '/unmute', { user: '42' }],
            ['POST', '/permit', { user: '42', publish: false, hold: true, by: '1' }],
            ['POST', '/remove', { user: '42', by: '1' }],
            ['POST', '/ban', { user: '42', minutes: 60, by: '1' }],
            ['POST', '/unban', { user: '42' }],
            ['GET', '/bans', undefined],
            ['POST', '/rules', { locked: true }],
            ['POST', '/hand', { user: '42', up: true }],
            ['POST', '/hands/lower', undefined],
            ['POST', '/ask', { user: '42', devices: ['microphone'], by: '1' }],
            ['POST', '/end', { by: '1' }],
        ]);
    });

    it('still takes a 1.1.0 screen\'s act, with no `acts`, `member` or the new fields', async () => {
        const { realtime, sent } = recorder(() => ({ ok: true, muted: true, removed: true, changed: true }));
        const host = opened(await realtime.groupCallToken(1, 'class:7', { admin: true }));
        expect(await realtime.authorizeCall({ moderate: 'class:7', act: 'mute', user: 42, host: host.host }, 1)).toEqual({ done: true });
        expect(await realtime.authorizeCall({ moderate: 'class:7', act: 'unspotlight', user: null, host: host.host }, 1)).toEqual({ done: true });
        expect(sent.map((s) => s.body)).toEqual([{ user: '42', track: 'microphone', by: '1' }, { on: false }]);
    });

    it('answers whether a user may call each person, as their rule answers a caller, for the call buttons of a list', async () => {
        let profiles = 0;
        const realtime = app({ profile: () => (profiles++, { name: 'Someone' }) });
        const sides: string[] = [];
        realtime.calls('support:{a}:{b}', (user, withUser, _params, _call, side) => {
            sides.push(side.role);
            return withUser !== 56;
        });

        expect(await realtime.authorizeCall({ may: [{ call: 'support:34:42', to: 34 }, { call: 'support:42:56', to: 56 }, { call: 'meeting:1', to: 34 }, { call: 'support:42:42', to: 42 }, { call: 'support:42:x', to: 'two words' }, 'junk'] }, 42))
            .toEqual({ may: [true, false, false, false, false, false] });
        expect(sides).toEqual(['caller', 'caller']);
        // No profile is looked up for an answer no call is made with.
        expect(profiles).toBe(0);
        expect(await realtime.authorizeCall({ may: Array.from({ length: 101 }, () => ({ call: 'support:34:42', to: 34 })) }, 42)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ may: 'support:34:42' }, 42)).toEqual({ denied: 'bad_request' });
        expect(await realtime.authorizeCall({ may: [] }, null)).toEqual({ denied: 'no_user' });
    });
});

describe('the keys route', () => {
    it('labels a user by their id, any id of text included, never two ids the same', async () => {
        // As labels take them: the ids of digits, Clerk, UUIDs, emails without a plus. Each other character escaped.
        expect([42, -7, 'user_2abc', '0b6f1c9e-8f5d-4c38', 'ann@shop.example'].map(labelUser)).toEqual(['42', '-7', 'user_2abc', '0b6f1c9e-8f5d-4c38', 'ann@shop.example']);
        expect(labelUser('auth0|5f7c')).toBe('auth0=7C5f7c');
        expect(labelUser('a=b')).toBe('a=3Db');
        expect(labelUser('a=7Cb')).toBe('a=3D7Cb');
        expect(labelUser('ann+news@shop.example')).toBe('ann=2Bnews@shop.example');
        expect(labelUser('Zoë')).toBe('Zo=C3=AB');
        expect([labelUser('ann smith'), labelUser('a'.repeat(65)), labelUser('')]).toEqual([null, null, null]);

        // Such a user has their own key and an identity, and may have only their own.
        const realtime = app();
        const start = await realtime.keysAnswer([], 'auth0|5f7c');
        const keys = new Keys(V.local_key, null);
        expect(start.keys[0]).toBe(await keys.entry('u:auth0=7C5f7c:1'));
        expect(await claimsOf(start.identity!.token, 'wordplus-realtime channels v1')).toMatchObject({ sub: 'auth0|5f7c' });
        expect(await realtime.mayHave('u:auth0=7C5f7c:1', 'auth0|5f7c')).toBe(true);
        expect(await realtime.mayHave('u:auth0=7C5f7c:1', 'auth0=7C5f7c')).toBe(false);
    });

    it('gives a user their own and the day\'s keys and their identity, and keys asked for that they may have', async () => {
        const realtime = app();
        realtime.room('order:{id}', (user, { id }) => user === 42 && id === '42');
        realtime.room('news', { public: true });
        realtime.kind('note', (rest, user) => rest === '7' && user === 42);
        const keys = new Keys(V.local_key, null);
        const today = dayOf();

        const start = await realtime.keysAnswer([], 42);
        expect(start.keys).toEqual([await keys.entry('u:42:1'), await keys.entry('d:' + (today - 1)), await keys.entry('d:' + today), await keys.entry('d:' + (today + 1))]);

        const identity = await claimsOf(start.identity!.token, 'wordplus-realtime channels v1');
        expect(identity).toMatchObject({ iss: V.site, aud: 'wordplus-realtime identity', sub: '42' });
        expect(identity.pd.user_id).toBe(42);
        expect(await keys.open(identity.pd.name)).toBe('User 42');
        expect(identity.hid).toBeUndefined();

        const asked = await realtime.keysAnswer(['d:' + (today + 1), 'd:' + (today + 2), 'u:42:1', 'u:43:1', 'ch:order:42:1', 'ch:order:42:2', 'ch:order:43:1', 'ch:news:1', 'note:7', 'note:8', 'nonsense'], 42);
        expect(asked.keys).toEqual([await keys.entry('d:' + (today + 1)), await keys.entry('u:42:1'), await keys.entry('ch:order:42:1'), await keys.entry('note:7')]);

        expect(await realtime.keysAnswer([], null)).toEqual({ keys: [], app: V.site });
    });

    it('keeps the directory entry plain when sealing is off, as `seal: false` says and the other packages do', async () => {
        const start = await app({ seal: false }).keysAnswer([], 42);
        const identity = await claimsOf(start.identity!.token, 'wordplus-realtime channels v1');
        expect(identity.pd).toMatchObject({ user_id: 42, name: 'User 42' });
    });

    it('moves the directory hash on with the day where the entry is sealed, its first 56 digits saying the profile alone', async () => {
        // The server keeps an entry as long as its hash matches: with one hash for weeks, a user who kept reconnecting
        // kept an entry sealed weeks ago (wordplus/realtime 64ca239).
        const keys = new Keys(V.local_key, null);
        const on = async (day: number, plain: Record<string, unknown>, seal?: boolean) => {
            vi.useFakeTimers({ now: day * 86_400_000, toFake: ['Date'] });
            return (await keys.profile(42, plain, seal)).pdh;
        };

        const monday = await on(20395, { name: 'Ann' });
        const tuesday = await on(20396, { name: 'Ann' });
        expect(monday).toMatch(/^[0-9a-f]{64}$/);
        expect(monday.slice(-8)).toBe('00004fab');
        expect(tuesday.slice(-8)).toBe('00004fac');
        expect(tuesday.slice(0, 56)).toBe(monday.slice(0, 56));
        expect((await on(20396, { name: 'Ben' })).slice(0, 56)).not.toBe(monday.slice(0, 56));

        // Nothing sealed, so nothing follows the day.
        expect(await on(20395, { name: 'Ann' }, false)).toBe(await on(20396, { name: 'Ann' }, false));
        vi.useRealTimers();
    });

    it('gives a string id its keys and identity, and marks a hidden user', async () => {
        const realtime = app({ hidden: (user) => user === 'k7f3q:ben' });
        const keys = new Keys(V.local_key, null);
        const ben = await realtime.keysAnswer([], 'k7f3q:ben');
        expect(ben.keys[0]).toBe(await keys.entry('u:k7f3q:ben:1'));
        const claims = await claimsOf(ben.identity!.token, 'wordplus-realtime channels v1');
        expect(claims).toMatchObject({ sub: 'k7f3q:ben', hid: true });
        expect(claims.pd.user_id).toBe('k7f3q:ben');
    });

    it('moves a room\'s key on, and hands out the newest beside an older one', async () => {
        const stored = new Map<string, number>();
        const realtime = app({ generations: { get: (name) => stored.get(name) ?? null, set: (name, n) => void stored.set(name, n) } });
        realtime.room('team:{id}', () => true);
        const keys = new Keys(V.local_key, null);

        await realtime.rotateRoom('team:1');
        expect(await realtime.keysAnswer(['ch:team:1:1'], 7)).toEqual({ keys: [await keys.entry('ch:team:1:1'), await keys.entry('ch:team:1:2')] });
        expect((await realtime.authorize(['team:1'], 7)).keys).toEqual([await keys.entry('ch:team:1:2')]);

        await expect(app().rotateRoom('team:1')).rejects.toThrow(/generation store/);
    });

    it('gives no key to a user the app cut off, and no identity without a profile', async () => {
        expect(await app({ hasKeys: (user) => user !== 42 }).keysAnswer([], 42)).toEqual({ keys: [], app: V.site });
        expect((await app({ profile: () => null }).keysAnswer([], 42)).identity).toBeUndefined();
    });
});

describe('emitting', () => {
    it('seals a sealed room\'s data with its key, a copy each, sends the others together, and says which rooms keep it', async () => {
        const { realtime, sent } = recorder((path) => (path.endsWith('/batch') ? { ok: true, ids: [{ 'order:42': '1-0' }, {}] } : { ok: true, ids: {} }));
        realtime.room('order:{id}', { history: 20 }, () => true);
        realtime.room('news', { public: true, history: 5 });
        realtime.room('ticker', { public: true });
        const keys = new Keys(V.local_key, null);

        const ids = await realtime.to(['order:42', 'news', 'ticker']).except('tab-1').emit('updated', { status: 'paid' });
        expect(ids).toEqual({ 'order:42': '1-0' });
        expect(sent).toHaveLength(1);
        expect(sent[0].path).toBe('/wordplus/realtime/emit/batch');
        const [sealed, plain] = sent[0].body.events;
        expect(sealed).toMatchObject({ rooms: ['order:42'], event: 'updated', history: { 'order:42': [20, MAX_HISTORY_DAYS] }, except: 'tab-1' });
        expect(JSON.parse((await keys.open(sealed.data))!)).toEqual({ status: 'paid' });
        expect(plain).toEqual({ rooms: ['news', 'ticker'], event: 'updated', data: { status: 'paid' }, history: { news: [5, MAX_HISTORY_DAYS] }, except: 'tab-1' });
    });

    it('sends to users, each sealed with their own key, and binary as { $b }', async () => {
        const { realtime, sent } = recorder();
        const keys = new Keys(V.local_key, null);

        await realtime.toUser([42, 'k7f3q:ben']).emit('notice', { text: 'Shipped', photo: new Uint8Array([7, 8]) });
        expect(sent[0].path).toBe('/wordplus/realtime/emit/batch');
        const [first, second] = sent[0].body.events;
        expect(first.users).toEqual(['42']);
        expect(JSON.parse((await keys.open(first.data))!)).toEqual({ text: 'Shipped', photo: { $b: 'Bwg=' } });
        expect(second.users).toEqual(['k7f3q:ben']);
        expect(second.data.startsWith('u:k7f3q:ben:1:1.')).toBe(true);

        await realtime.toUser(7).emit('plain', 1, { seal: false });
        expect(sent[1]).toMatchObject({ path: '/wordplus/realtime/emit', body: { users: ['7'], event: 'plain', data: 1 } });
    });

    it('sends to everyone with no room to join, never sealed, leaving out the tab named, and alone in a batch', async () => {
        const { realtime, sent } = recorder(() => ({ ok: true, ids: {} }));

        await realtime.toEveryone().emit('notice', { text: 'Back at 9', photo: new Uint8Array([7, 8]) });
        expect(sent[0]).toMatchObject({ path: '/wordplus/realtime/emit', body: { everyone: true, event: 'notice', data: { text: 'Back at 9', photo: { $b: 'Bwg=' } } } });

        await realtime.toEveryone().except('tab1').emit('notice');
        expect(sent[1].body).toEqual({ everyone: true, event: 'notice', data: null, except: 'tab1' });

        await realtime.batch([{ everyone: true, event: 'notice', data: 1 }]);
        expect(sent[2].body).toEqual({ everyone: true, event: 'notice', data: 1 });

        await expect(realtime.emitEvent({ everyone: true, rooms: 'chat:1', event: 'notice' })).rejects.toMatchObject({ code: 'bad_request' });
        await expect(realtime.emitEvent({ everyone: true, users: 42, event: 'notice' })).rejects.toMatchObject({ code: 'bad_request' });
        expect(sent).toHaveLength(3);
    });

    it('sends a batch 100 events to a request, and throws the server\'s refusal', async () => {
        const { realtime, sent } = recorder();
        realtime.room('r{n}', { public: true });
        await realtime.batch(Array.from({ length: 3 }, (_, i) => ({ rooms: 'r' + i, event: 'e' })));
        expect(sent.map((s) => s.path)).toEqual(['/wordplus/realtime/emit', '/wordplus/realtime/emit', '/wordplus/realtime/emit']);

        const refusing = app({ fetch: async () => Response.json({ ok: false, error: 'too_large' }, { status: 413 }) });
        await expect(refusing.to('r1').emit('e', 'x')).rejects.toMatchObject({ code: 'too_large', status: 413 });
        await expect(refusing.to('bad room').emit('e')).rejects.toBeInstanceOf(RealtimeError);
    });
});

describe('what the realtime server holds', () => {
    it('reads a room\'s count, members and history opened, erases it, and kicks a user out, moving its key on', async () => {
        const keys = new Keys(V.local_key, null);
        const sealedInfo = await keys.sealJson({ name: 'Ann' }, 'ch:chat:1:1');
        const sealedData = await keys.sealJson({ text: 'Hi', photo: { $b: 'CQ==' } }, 'ch:chat:1:1');
        const stored = new Map<string, number>();
        const { realtime, sent } = recorder((path) => {
            if (path.includes('/history') && !path.includes('id=')) return { ok: true, events: [{ id: '1-0', at: 1, event: 'message', data: sealedData, from: '34' }], more: false };
            if (path.endsWith('?members=1')) return { ok: true, count: 1, connections: 2, members: { count: 1, list: [{ id: '34', info: sealedInfo }] } };
            if (path.includes('/rooms/')) return { ok: true, count: 3, connections: 3, deleted: 1 };
            return { ok: true };
        });
        (realtime as any).localKeys = new Keys(V.local_key, { get: (n: string) => stored.get(n) ?? null, set: (n: string, v: number) => void stored.set(n, v) });

        expect(await realtime.in('chat:1').count()).toBe(3);
        expect(await realtime.in('chat:1').members()).toEqual({ count: 1, list: [{ id: '34', info: { name: 'Ann' } }] });
        const history = await realtime.in('chat:1').history({ limit: 10 });
        expect(history.events[0]).toMatchObject({ id: '1-0', event: 'message', from: '34' });
        expect((history.events[0].data as any).text).toBe('Hi');
        expect([...(history.events[0].data as any).photo]).toEqual([9]);
        expect(await realtime.in('chat:1').forget('1-0')).toBe(1);

        await realtime.in('chat:1').kick(43);
        expect(sent.map((s) => [s.method, s.path])).toEqual([
            ['GET', '/wordplus/realtime/rooms/chat%3A1'],
            ['GET', '/wordplus/realtime/rooms/chat%3A1?members=1'],
            ['GET', '/wordplus/realtime/rooms/chat%3A1/history?limit=10'],
            ['DELETE', '/wordplus/realtime/rooms/chat%3A1/history?id=1-0'],
            ['POST', '/wordplus/realtime/rooms/chat%3A1/kick'],
        ]);
        expect(sent[4].body).toEqual({ user: '43' });
        expect(stored.get('ch:chat:1')).toBe(2);
    });

    it('gives one room by its name alone: reading it, sending to it and taking someone out, as in() and kick() still do', async () => {
        const { realtime, sent } = recorder((path) => (path.endsWith('/emit') ? { ok: true, ids: { 'chat:1': '1-0' } } : { ok: true, count: 3 }));
        const room = realtime.room('chat:1');

        expect(await room.count()).toBe(3);
        expect(await room.emit('renamed', { title: 'Team' })).toEqual({ 'chat:1': '1-0' });
        await room.remove(43);
        await realtime.in('chat:1').kick(44);

        expect(sent.map(({ method, path }) => [method, path])).toEqual([
            ['GET', '/wordplus/realtime/rooms/chat%3A1'],
            ['POST', '/wordplus/realtime/emit'],
            ['POST', '/wordplus/realtime/rooms/chat%3A1/kick'],
            ['POST', '/wordplus/realtime/rooms/chat%3A1/kick'],
        ]);
        expect(sent[2].body).toEqual({ user: '43' });
        expect(sent[3].body).toEqual({ user: '44' });

        // A name alone with a part in it is a rule left out, as ever.
        expect(() => realtime.room('chat:{id}')).toThrow(/needs a rule/);
    });

    it('takes everyone out of a room and has its rule asked again, for one person or all, moving its key on each time', async () => {
        const stored = new Map<string, number>();
        const { realtime, sent } = recorder(() => ({ ok: true }));
        (realtime as any).localKeys = new Keys(V.local_key, { get: (n: string) => stored.get(n) ?? null, set: (n: string, v: number) => void stored.set(n, v) });
        const room = realtime.room('chat:1');

        await room.removeEveryone();
        expect(stored.get('ch:chat:1')).toBe(2);
        await room.recheck(43);
        expect(stored.get('ch:chat:1')).toBe(3);
        await room.recheckEveryone();
        expect(stored.get('ch:chat:1')).toBe(4);

        expect(sent.map(({ path, body }) => [path, body])).toEqual([
            ['/wordplus/realtime/rooms/chat%3A1/kick', { everyone: true }],
            ['/wordplus/realtime/rooms/chat%3A1/recheck', { user: '43' }],
            ['/wordplus/realtime/rooms/chat%3A1/recheck', { everyone: true }],
        ]);
    });

    it('signs when a room token was made to the millisecond, within its second, and a public grant says nothing of it', async () => {
        vi.useFakeTimers({ now: Date.UTC(2026, 10, 9, 12, 0, 0, 250), toFake: ['Date'] });

        try {
            const { realtime } = recorder();
            realtime.room('chat:{id}', (user) => user === 42);
            realtime.room('news:{id}', { public: true });

            const { token } = await realtime.authorize(['chat:1'], 42);
            const claims = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString());
            expect(claims.ms).toBe(Date.UTC(2026, 10, 9, 12, 0, 0, 250));
            expect(claims.iat).toBe(Math.floor(claims.ms / 1000));

            const [ grant ] = await realtime.publicGrants();
            expect(JSON.parse(Buffer.from(grant.token.split('.')[1], 'base64url').toString()).ms).toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });

    it('signs when a call\'s, a group call\'s and a live stream\'s token was made to the millisecond, as a room token says it', async () => {
        const at = Date.UTC(2026, 10, 9, 12, 0, 0, 250);
        vi.useFakeTimers({ now: at, toFake: ['Date'] });

        try {
            const realtime = app();
            realtime.groupCalls('meeting:{id}', () => true);
            const opened = (token: string) => JSON.parse(new TextDecoder().decode(unbase64url(token)!));
            const payload = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

            const tokens = {
                callToken: opened(await realtime.callToken(42, 34)).token,
                groupCallToken: opened(await realtime.groupCallToken(42, 'class:7')).token,
                groupCalls: (await realtime.authorizeCall({ room: 'meeting:daily', type: 'video' }, 42)).token!,
                streamToken: opened(await realtime.streamToken(42, 'show:7')).token,
            };
            for (const [made, token] of Object.entries(tokens)) {
                const claims = payload(token);
                expect(claims.ms, made).toBe(at);
                expect(claims.iat, made).toBe(Math.floor(at / 1000));
            }
            // In a stream's grant `ms` comes right after `iat`, as every language orders it.
            expect(Object.keys(payload(tokens.streamToken)).slice(-3)).toEqual(['iat', 'ms', 'exp']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('reads who is online', async () => {
        const { realtime, sent } = recorder((path) =>
            path.includes('ids=') ? { ok: true, count: 2, online: [{ id: '34', online: true }, { id: '42', online: false, at: 5 }] } : { ok: true, count: 2, ids: ['34', '43'], next: '0' },
        );
        expect(await realtime.online.states([34, 42])).toEqual([{ id: '34', online: true }, { id: '42', online: false, at: 5 }]);
        expect(await realtime.online.has(34)).toBe(true);
        expect(await realtime.online.count()).toBe(2);
        expect(await realtime.online.list()).toEqual({ ids: ['34', '43'], next: '0' });
        expect(sent[0].path).toBe('/wordplus/realtime/online?ids=34,42');
    });

    it('reaches rooms, users, usage, the webhook, group calls and live streams, each at its route', async () => {
        const sealedReply = await new Keys(V.local_key, null).sealJson({ ok: 1 }, 'u:42:1');
        const { realtime, sent } = recorder((path) => {
            if (path.startsWith('/wordplus/realtime/rooms')) return { ok: true, count: 1, rooms: [{ name: 'shop:1', count: 2, connections: 2 }], next: '1' };
            if (path.endsWith('/ask')) return { ok: true, replies: [{ data: sealedReply, at: 7 }] };
            if (path.startsWith('/wordplus/realtime/users/')) return { ok: true, user: { id: '42', online: true, connections: 2 } };
            if (path === '/wordplus/realtime/usage') return { ok: true, connections: { now: 3, limit: 1000 }, credits: null };
            if (path === '/wordplus/realtime/webhooks') return { ok: true, deliveries: [{ id: 'b1', status: 500, resendable: true }] };
            if (path.startsWith('/wordplus/realtime/webhooks/')) return { ok: true, delivered: true, status: 204 };
            if (path === '/wordplus/realtime/calls') return { ok: true, calls: [{ name: 'meeting:7', people: 2, started_at: 1 }] };
            if (path.startsWith('/wordplus/realtime/calls/')) return { ok: true, call: { name: 'meeting:7', people: 1, started_at: 1, list: [] }, muted: true, removed: true, changed: true };
            if (path.endsWith('/chat?limit=5')) return { ok: true, messages: [{ id: '1-0', text: 'hi' }] };
            if (path.endsWith('/chat')) return { ok: true, message: { id: '2-0', text: 'Welcome' } };
            return { ok: true, stream: { name: 'show:1', state: 'live' }, until: 99, lifted: true, deleted: true, watching: 3, people: [], bans: [] };
        });
        (realtime as any).localKeys = new Keys(V.local_key, null);

        expect(await realtime.listRooms({ prefix: 'shop:', limit: 1 })).toEqual({ count: 1, rooms: [{ name: 'shop:1', count: 2, connections: 2 }], next: '1' });
        expect(await realtime.user(42).get()).toEqual({ id: '42', online: true, connections: 2 });
        await realtime.user(42).disconnect();
        expect(await realtime.user(42).ask('cart', { why: 'checkout' }, { timeout: 5000 })).toEqual([{ data: { ok: 1 }, at: 7 }]);
        expect(await realtime.usage()).toEqual({ connections: { now: 3, limit: 1000 }, credits: null });
        expect((await realtime.webhooks.deliveries())[0].resendable).toBe(true);
        expect(await realtime.webhooks.resend('b1')).toEqual({ delivered: true, status: 204 });
        expect(await realtime.webhooks.test()).toEqual({ delivered: true, status: 204 });
        expect(await realtime.listCalls()).toEqual([{ name: 'meeting:7', people: 2, started_at: 1 }]);
        expect((await realtime.call('meeting:7').get()).people).toBe(1);
        expect(await realtime.call('meeting:7').mute(42, 'microphone')).toBe(true);
        expect(await realtime.call('meeting:7').permit(43, { publish: true })).toBe(true);
        expect(await realtime.call('meeting:7').remove(43)).toBe(true);
        await realtime.call('meeting:7').end();
        expect(await realtime.stream('show:1').get()).toMatchObject({ name: 'show:1', state: 'live' });
        expect(await realtime.stream('show:1').chat({ limit: 5 })).toEqual([{ id: '1-0', text: 'hi' }]);
        expect(await realtime.stream('show:1').say('Welcome', { name: 'Shop' })).toEqual({ id: '2-0', text: 'Welcome' });
        expect(await realtime.stream('show:1').deleteMessage('1-0')).toBe(true);
        await realtime.stream('show:1').pin(null);
        await realtime.stream('show:1').slow(10);
        expect(await realtime.stream('show:1').timeout(7, 600)).toBe(99);
        expect(await realtime.stream('show:1').unban(7)).toBe(true);

        expect(sent.map((s) => [s.method, s.path])).toEqual([
            ['GET', '/wordplus/realtime/rooms?prefix=shop%3A&limit=1'],
            ['GET', '/wordplus/realtime/users/42'],
            ['POST', '/wordplus/realtime/users/42/disconnect'],
            ['POST', '/wordplus/realtime/users/42/ask'],
            ['GET', '/wordplus/realtime/usage'],
            ['GET', '/wordplus/realtime/webhooks'],
            ['POST', '/wordplus/realtime/webhooks/b1/resend'],
            ['POST', '/wordplus/realtime/webhooks/test'],
            ['GET', '/wordplus/realtime/calls'],
            ['GET', '/wordplus/realtime/calls/meeting%3A7'],
            ['POST', '/wordplus/realtime/calls/meeting%3A7/mute'],
            ['POST', '/wordplus/realtime/calls/meeting%3A7/permit'],
            ['POST', '/wordplus/realtime/calls/meeting%3A7/remove'],
            ['POST', '/wordplus/realtime/calls/meeting%3A7/end'],
            ['GET', '/wordplus/realtime/streams/show%3A1'],
            ['GET', '/wordplus/realtime/streams/show%3A1/chat?limit=5'],
            ['POST', '/wordplus/realtime/streams/show%3A1/chat'],
            ['DELETE', '/wordplus/realtime/streams/show%3A1/chat/1-0'],
            ['POST', '/wordplus/realtime/streams/show%3A1/pin'],
            ['POST', '/wordplus/realtime/streams/show%3A1/slow'],
            ['POST', '/wordplus/realtime/streams/show%3A1/timeout'],
            ['POST', '/wordplus/realtime/streams/show%3A1/unban'],
        ]);
        // The ask's data sealed with the user's key, which WordPlus Cloud doesn't hold.
        expect(sent[3].body).toMatchObject({ event: 'cart', timeout: 5000 });
        expect(String(sent[3].body.data)).toMatch(/^u:42:1:1\./);
        expect(sent[10].body).toEqual({ user: '42', track: 'microphone' });
        expect(sent[11].body).toEqual({ user: '43', publish: true });
        expect(sent[16].body).toEqual({ text: 'Welcome', name: 'Shop' });
        expect(sent[18].body).toEqual({ id: null });
        expect(sent[20].body).toEqual({ user: '7', seconds: 600 });
    });
});

describe('webhooks', () => {
    const signedHook = async (body: string, timestamp = V.webhook.timestamp, path = V.webhook.path) =>
        hex(await hmac(await hmac(V.secret, 'wordplus-realtime webhook v1'), timestamp + '\nPOST\n' + path + '\n' + (await sha256Hex(body))));

    it('check the realtime server\'s signature as PHP makes it', async () => {
        expect(await signedHook(V.webhook.body)).toBe(V.webhook.signature);
    });

    it('hand each event, opened, to its handlers, a live stream going live among them, and answer 204', async () => {
        vi.useFakeTimers({ now: Number(V.webhook.timestamp) * 1000, toFake: ['Date'] });
        const realtime = app();
        const keys = new Keys(V.local_key, null);
        const seen: any[] = [];
        realtime.on('room.occupied', (e) => seen.push(['occupied', e.room]));
        realtime.on('message', (e) => seen.push(['message', e.data, e.from]));
        realtime.on('stream.live', (e) => seen.push(['live', e.stream, e.started_at]));
        realtime.on('*', (e) => seen.push(['any', e.type]));

        const body = JSON.stringify({
            events: [
                { id: 'a', at: 1, type: 'room.occupied', room: 'order:42' },
                { id: 'b', at: 2, type: 'emit', room: 'chat:1', event: 'message', data: await keys.sealJson({ text: 'Hi' }, 'ch:chat:1:1'), from: '34', event_id: '1-0' },
                { id: 'c', at: 3, type: 'stream.live', stream: 'show:mugs', started_at: 3, ended_at: null },
            ],
        });
        const headers = new Headers({ 'X-WordPlus-Site': V.site, 'X-WordPlus-Timestamp': V.webhook.timestamp, 'X-WordPlus-Signature': await signedHook(body) });
        const res = await realtime.route(new Request('https://app.example.com' + V.webhook.path, { method: 'POST', headers, body }));
        expect(res.status).toBe(204);
        expect(seen).toEqual([['occupied', 'order:42'], ['any', 'room.occupied'], ['message', { text: 'Hi' }, '34'], ['any', 'emit'], ['live', 'show:mugs', 3], ['any', 'stream.live']]);
    });

    it('hand what people used to its handlers, for an app that charges by it: a call, a group call, a live stream', async () => {
        vi.useFakeTimers({ now: Number(V.webhook.timestamp) * 1000, toFake: ['Date'] });
        const realtime = app();
        const charged: any[] = [];
        realtime.on('call.ended', (e) => charged.push(['call', e.call, e.from, e.seconds]));
        realtime.on('group.left', (e) => charged.push(['group', e.call, e.user, e.seconds]));
        realtime.on('stream.left', (e) => charged.push(['stream', e.stream, e.user, e.seconds]));

        const body = JSON.stringify({
            events: [
                { id: 'call.ended:c1', at: 1, type: 'call.ended', call: 'support:34:42', call_id: 'c1', from: 42, to: 34, media: 'video', started_at: 1, answered_at: 2, ended_at: 125002, seconds: 125, reason: 'hangup' },
                { id: 'group:EV_1', at: 2, type: 'group.left', call: 'team:7', user: 'auth0|5f7c', media: 'audio', joined_at: 1, left_at: 61001, seconds: 61 },
                { id: 's1', at: 3, type: 'stream.left', stream: 'live:1', user: 42, role: 'viewer', watch: 'w1', joined_at: 1, left_at: 30001, seconds: 30 },
            ],
        });
        const headers = new Headers({ 'X-WordPlus-Site': V.site, 'X-WordPlus-Timestamp': V.webhook.timestamp, 'X-WordPlus-Signature': await signedHook(body) });
        const res = await realtime.route(new Request('https://app.example.com' + V.webhook.path, { method: 'POST', headers, body }));
        expect(res.status).toBe(204);
        expect(charged).toEqual([['call', 'support:34:42', 42, 125], ['group', 'team:7', 'auth0|5f7c', 61], ['stream', 'live:1', 42, 30]]);
    });

    it('hand a host\'s act in a group call to its handler, for an app that keeps a longer ban or an audit', async () => {
        vi.useFakeTimers({ now: Number(V.webhook.timestamp) * 1000, toFake: ['Date'] });
        const realtime = app();
        const acts: any[] = [];
        realtime.on('call.moderated', (e) => acts.push([e.act, e.call, e.user, e.by, e.held, e.minutes ?? null, e.rules ?? null]));

        const body = JSON.stringify({
            events: [
                { id: 'm1', at: 1, type: 'call.moderated', call: 'meeting:7', act: 'ban', user: '43', by: '1', held: true, minutes: 30 },
                { id: 'm2', at: 2, type: 'call.moderated', call: 'meeting:7', act: 'rules', user: null, by: null, held: true, rules: { mode: 'broadcast', locked: false, muted: false } },
                { id: 'm3', at: 3, type: 'call.moderated', call: 'meeting:7', act: 'end', user: null, by: '1', held: false },
            ],
        });
        const headers = new Headers({ 'X-WordPlus-Site': V.site, 'X-WordPlus-Timestamp': V.webhook.timestamp, 'X-WordPlus-Signature': await signedHook(body) });
        const res = await realtime.route(new Request('https://app.example.com' + V.webhook.path, { method: 'POST', headers, body }));
        expect(res.status).toBe(204);
        expect(acts).toEqual([
            ['ban', 'meeting:7', '43', '1', true, 30, null],
            ['rules', 'meeting:7', null, null, true, null, { mode: 'broadcast', locked: false, muted: false }],
            ['end', 'meeting:7', null, '1', false, null, null],
        ]);
    });

    it('refuse what the realtime server didn\'t sign, a stale one, and answer 500 when a handler fails', async () => {
        vi.useFakeTimers({ now: Number(V.webhook.timestamp) * 1000, toFake: ['Date'] });
        const realtime = app();
        const send = (headers: Record<string, string>, body = V.webhook.body) => realtime.webhook(body, new Headers(headers), V.webhook.path);
        const good = { 'X-WordPlus-Site': V.site, 'X-WordPlus-Timestamp': V.webhook.timestamp, 'X-WordPlus-Signature': V.webhook.signature };

        expect((await send({ ...good, 'X-WordPlus-Signature': 'x' })).status).toBe(401);
        expect((await send({ ...good, 'X-WordPlus-Site': 'other' })).status).toBe(401);
        expect((await send(good, V.webhook.body + ' ')).status).toBe(401);
        vi.setSystemTime((Number(V.webhook.timestamp) + 400) * 1000);
        expect((await send(good)).body).toEqual({ code: 'stale_signature' });
        vi.setSystemTime(Number(V.webhook.timestamp) * 1000);

        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        realtime.on('room.occupied', () => {
            throw new Error('down');
        });
        expect((await send(good)).status).toBe(500);
        error.mockRestore();
    });
});

describe('the routes', () => {
    const post = (path: string, body: unknown, type = 'application/json') =>
        new Request('https://app.example.com' + path, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });

    it('answer auth, calls and keys as JSON for the request\'s user, as Next.js and every fetch handler call them', async () => {
        const realtime = app({ user: (request) => request.headers.get('x-user') });
        realtime.room('team:{id}', (user) => user === '42');

        const request = post('/api/realtime/auth', { rooms: ['team:1'] });
        request.headers.set('x-user', '42');
        const res = await realtime.route(request);
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect((await res.json()).token).toBeTypeOf('string');

        expect((await (await realtime.route(post('/api/realtime/auth/', { rooms: ['team:1'] }))).json()).denied).toEqual({ 'team:1': 'forbidden' });
        expect(await (await realtime.route(post('/api/realtime/calls', { line: true }))).json()).toEqual({ denied: 'no_user' });
        expect(await (await realtime.route(post('/api/realtime/keys', { labels: [] }))).json()).toEqual({ keys: [], app: V.site });
    });

    it('refuse anything but a JSON POST to one of them', async () => {
        const realtime = app();
        expect((await realtime.route(new Request('https://app.example.com/api/realtime/auth'))).status).toBe(405);
        expect((await realtime.route(post('/api/realtime/auth', { rooms: [] }, 'text/plain'))).status).toBe(415);
        expect((await realtime.route(post('/api/realtime/other', {}))).status).toBe(404);
        expect((await realtime.route(post('/api/realtime/auth', { rooms: 'x' }))).status).toBe(400);
        expect((await realtime.route(new Request('https://app.example.com/api/realtime/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status).toBe(400);
    });

    it('answer Node\'s own requests, a body parsed already or not, and a webhook as it was sent', async () => {
        vi.useFakeTimers({ now: Number(V.webhook.timestamp) * 1000, toFake: ['Date'] });
        const realtime = app();
        realtime.room('team:{id}', () => true);
        const handler = realtime.node((req) => (req.headers['x-user'] as string) ?? null);
        const seen = vi.fn();
        realtime.on('room.occupied', seen);

        const answer = (req: any) =>
            new Promise<{ status: number; body: any }>((resolve) => {
                const res = { statusCode: 0, headers: {} as Record<string, string>, setHeader(n: string, v: string) { this.headers[n] = v; }, end(body: string) { resolve({ status: this.statusCode, body: body ? JSON.parse(body) : null }); } };
                void handler(req, res);
            });

        const parsed = await answer({ method: 'POST', url: '/auth', headers: { 'content-type': 'application/json', 'x-user': '7' }, body: { rooms: ['team:1'] } });
        expect(parsed.status).toBe(200);
        expect(parsed.body.token).toBeTypeOf('string');

        const listeners: Record<string, (chunk?: unknown) => void> = {};
        const streamed = answer({ method: 'POST', url: '/api/realtime/keys?x=1', headers: { 'content-type': 'application/json' }, on: (event: string, fn: any) => (listeners[event] = fn) });
        listeners.data(JSON.stringify({ labels: [] }));
        listeners.end();
        expect(await streamed).toEqual({ status: 200, body: { keys: [], app: V.site } });

        const hook: Record<string, (chunk?: unknown) => void> = {};
        const hooked = answer({
            method: 'POST', url: '/webhook', originalUrl: V.webhook.path,
            headers: { 'content-type': 'application/json', 'x-wordplus-site': V.site, 'x-wordplus-timestamp': V.webhook.timestamp, 'x-wordplus-signature': V.webhook.signature },
            on: (event: string, fn: any) => (hook[event] = fn),
        });
        hook.data(Buffer.from(V.webhook.body));
        hook.end();
        expect(await hooked).toEqual({ status: 204, body: null });
        expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'room.occupied', room: 'order:42' }));
    });

    it('give the browser its settings, with a signed-in user\'s keys and identity', async () => {
        const realtime = app({ base: '/realtime/', headers: { 'X-CSRF-Token': 't' }, worker: '/realtime-worker.js' });
        const config = await realtime.config(42);

        expect(config).toMatchObject({
            server: 'https://ws.wordplus.cloud',
            path: '/websocket',
            site: V.site,
            api: 'https://rest.wordplus.cloud',
            worker: '/realtime-worker.js',
            auth: { endpoint: '/realtime/auth', headers: { 'X-CSRF-Token': 't' } },
            calls: { endpoint: '/realtime/calls' },
            keys: { endpoint: '/realtime/keys' },
        });
        expect(config.keys.entries).toHaveLength(4);
        expect(config.keys.identity?.token).toBeTypeOf('string');
        expect(config.grants).toBeUndefined();

        expect((await realtime.config(null)).keys).toEqual({ endpoint: '/realtime/keys', headers: { 'X-CSRF-Token': 't' }, entries: [] });
    });

    it('answer each at an address of its own, named to the page, and hand every other request on', async () => {
        const realtime = app({
            user: (request) => request.headers.get('x-user'),
            routes: { auth: '/permit/rooms', calls: '/check-call/', keys: 'https://app.example.com/my/keys' },
        });
        realtime.room('team:{id}', (user) => user === '42');

        const config = await realtime.config(null);
        expect([config.auth.endpoint, config.calls.endpoint, config.keys.endpoint]).toEqual(['/permit/rooms', '/check-call/', 'https://app.example.com/my/keys']);
        expect(realtime.address('webhook')).toBe('/api/realtime/webhook');

        const request = post('/permit/rooms', { rooms: ['team:1'] });
        request.headers.set('x-user', '42');
        expect((await (await realtime.route(request)).json()).token).toBeTypeOf('string');
        expect(await (await realtime.route(post('/check-call', { line: true }))).json()).toEqual({ denied: 'no_user' });
        expect(await (await realtime.route(post('/my/keys', { labels: [] }))).json()).toEqual({ keys: [], app: V.site });
        // Not at their usual addresses any more, and nothing else ending as a route does.
        expect((await realtime.route(post('/api/realtime/calls', { line: true }))).status).toBe(404);
        expect((await realtime.route(post('/blog/auth', { rooms: ['team:1'] }))).status).toBe(404);

        // Added once for the whole app: the routes answered, the rest of the app reached.
        const handler = realtime.node((req) => (req.headers['x-user'] as string) ?? null);
        const run = (req: any) =>
            new Promise<{ status: number; body: any } | 'next'>((resolve) => {
                const res = { statusCode: 0, setHeader() {}, end(body: string) { resolve({ status: this.statusCode, body: body ? JSON.parse(body) : null }); } };
                void handler(req, res, () => resolve('next'));
            });
        const json = { 'content-type': 'application/json' };
        expect(await run({ method: 'POST', url: '/my/keys', headers: json, body: { labels: [] } })).toEqual({ status: 200, body: { keys: [], app: V.site } });
        expect(await run({ method: 'POST', url: '/check-call?x=1', headers: json, body: { line: true } })).toEqual({ status: 200, body: { denied: 'no_user' } });
        expect(await run({ method: 'POST', url: '/api/auth', headers: json, body: { email: 'a@b.c' } })).toBe('next');
        expect(await run({ method: 'GET', url: '/', headers: {} })).toBe('next');
    });
});

describe('the browser files', () => {
    // Served from the routes, so an app copies nothing and each release serves its own (an SDK review, 2026-10-15).
    const asset = (name: string) => readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
    const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => new Request('https://app.example.com' + path, { method, headers });

    it('are named to the page in the folder of this version, unless the app serves them itself', async () => {
        const config = await app().config(null);
        expect(config.worker).toMatch(/^\/api\/realtime\/files\/[0-9a-f]{12}\/realtime-worker\.js$/);
        expect(config.rooms).toBe(config.worker!.replace('realtime-worker.js', 'realtime-rooms.min.js'));
        expect(app().fileAt('realtime.js')).toBe(config.worker!.replace('realtime-worker.js', 'realtime.js'));
        expect((await app({ base: '/rt/' }).config(null)).worker).toMatch(/^\/rt\/files\/[0-9a-f]{12}\/realtime-worker\.js$/);

        expect(await app({ worker: '/realtime-worker.js', rooms: '/realtime-rooms.min.js' }).config(null)).toMatchObject({ worker: '/realtime-worker.js', rooms: '/realtime-rooms.min.js' });
        const own = await app({ files: false }).config(null);
        expect([own.worker, own.rooms]).toEqual([undefined, undefined]);
    });

    it('are served as the package carries them, kept a year in their version folder, checked again without one', async () => {
        const realtime = app();
        const at = realtime.fileAt('realtime-worker.js');
        const version = at.split('/')[4];

        // The recording player and hls.js too, which docs/recording.md has a page load from here.
        for (const name of ['realtime-worker.js', 'realtime-rooms.min.js', 'realtime-rooms-e2ee.worker.js', 'realtime-ui.min.js', 'realtime-ui-streams.min.js', 'realtime-ui-recording.min.js', 'hls.light.min.js', 'realtime.js']) {
            const res = await realtime.route(get(realtime.fileAt(name)));
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
            expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
            expect(await res.text()).toBe(asset(name));
        }

        // As a page names it by hand: checked again each time, and not sent again while it is the same.
        const plain = await realtime.route(get('/api/realtime/files/realtime.js'));
        expect(plain.headers.get('Cache-Control')).toBe('no-cache');
        expect(plain.headers.get('ETag')).toBe('"' + version + '"');
        const same = await realtime.route(get('/api/realtime/files/realtime.js', { 'If-None-Match': '"' + version + '"' }));
        expect([same.status, await same.text()]).toEqual([304, '']);

        // Another version's folder, as during an update: this version's file, kept by nobody.
        const other = await realtime.route(get('/api/realtime/files/0123456789ab/realtime-worker.js'));
        expect([other.status, other.headers.get('Cache-Control')]).toEqual([200, 'no-store']);

        const head = await realtime.route(get(at, {}, 'HEAD'));
        expect([head.status, await head.text()]).toEqual([200, '']);
        expect((await realtime.route(get('/api/realtime/files/' + version + '/server.js'))).status).toBe(404);
        expect((await realtime.route(get('/api/realtime/files/a/b/realtime.js'))).status).toBe(404);
        expect((await realtime.route(get('/api/realtime/files/' + version + '/constructor'))).status).toBe(404);
        expect((await app({ files: false }).route(get(at))).status).toBe(405);
    });

    it('are named in a page head, the client by an import map, the settings safe in a script', async () => {
        const realtime = app({ profile: () => ({ name: '</script><b>x' }) });
        const head = await realtime.head(42);
        expect(head.startsWith('<script type="importmap">{"imports":{"@wordplus/realtime":"' + realtime.fileAt('realtime.js') + '"}}</script>')).toBe(true);
        expect(head.split('</script>')).toHaveLength(3);   // nothing in the settings closes a script
        const settings = JSON.parse(head.split('window.wordplusRealtimeConfig = ')[1].slice(0, -';</script>'.length));
        expect([settings.site, settings.keys.entries.length]).toEqual([V.site, 4]);
        expect(await realtime.head(42, { importmap: false })).not.toContain('importmap');
        expect(await app({ files: false }).head(null)).not.toContain('importmap');
    });

    it('include the client as one ES module, for a page with no bundler', () => {
        const text = asset('realtime.js');
        expect(text.startsWith('/*! @wordplus/realtime')).toBe(true);
        expect(text).toMatch(/export\s*\{[^}]*\bconnect\b/);
        expect(text).not.toMatch(/\bimport\s*[\w{*][^;]*?\bfrom\s*["']/);   // nothing left to import
    });

    it('are served by Node\'s own routes too, and hand on what is not theirs', async () => {
        const realtime = app({ routes: { auth: '/permit/rooms' } });
        const handler = realtime.node(() => null);
        const run = (req: any) =>
            new Promise<{ status: number; headers: Record<string, string>; body: string } | 'next'>((resolve) => {
                const res = { statusCode: 0, headers: {} as Record<string, string>, setHeader(n: string, v: string) { this.headers[n] = v; }, end(body: string) { resolve({ status: this.statusCode, headers: this.headers, body }); } };
                void handler(req, res, () => resolve('next'));
            });

        const served = await run({ method: 'GET', url: realtime.fileAt('realtime-worker.js') + '?v=1', headers: {} });
        expect(served).toMatchObject({ status: 200, headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
        expect((served as { body: string }).body).toBe(asset('realtime-worker.js'));
        expect(await run({ method: 'GET', url: '/', headers: {} })).toBe('next');
    });
});

describe('live streams (streams())', () => {
    const G = JSON.parse(readFileSync(new URL('../spec/stream-grants.json', import.meta.url), 'utf8'));

    it('signs every claim to the token Easy Stream\'s own vectors give', async () => {
        const key = await hmac(G.secret, 'easy-stream grant v1');
        for (const c of G.cases) expect(await streamGrant({ ...c.claims, aud: 'easy-stream' }, key), c.name).toBe(c.token);
    });

    it('answers the calls route with a stream\'s grant, as its rule and settings say, a visitor as a viewer only', async () => {
        const realtime = app();
        realtime.streams('show:{id}', (user, params) => {
            if (user === 1) return { role: 'host', quality: '720p' };
            if (user === 9) return false;
            return user === null ? 'viewer' : { role: 'viewer', chat: 'read', info: { name: 'Ben', avatar: 'http://not-https.example/b.png' } };
        }, { stage: false, reactions: true, chat: (params) => ({ offline: params.id === '42' ? 'open' : 'closed', links: false }) });

        const host = await realtime.authorizeCall({ stream: 'show:42' }, 1);
        const claims = await claimsOf(host.token!, 'live-stream grant v1');
        expect(Object.keys(claims)).toEqual(['iss', 'aud', 'str', 'role', 'sub', 'name', 'avatar', 'q', 'stage', 'offline', 'links', 'reactions', 'iat', 'ms', 'exp']);
        expect(claims).toMatchObject({ iss: V.site, aud: 'live-stream', str: 'show:42', role: 'host', sub: '1', name: 'User 1', avatar: 'https://example.com/1.png', q: '720p', stage: false, offline: 'open', links: false, reactions: true });
        expect(claims.exp - claims.iat).toBe(600);
        expect(host.exp).toBe(claims.exp);

        // The rule's own info, its picture only when https; a visitor, as a viewer with no name.
        const ben = await claimsOf((await realtime.authorizeCall({ stream: 'show:7' }, 34)).token!, 'live-stream grant v1');
        expect(ben).toMatchObject({ role: 'viewer', sub: '34', name: 'Ben', chat: 'read', offline: 'closed' });
        expect(ben.avatar).toBeUndefined();
        const visitor = await claimsOf((await realtime.authorizeCall({ stream: 'show:7' }, null)).token!, 'live-stream grant v1');
        expect(visitor.role).toBe('viewer');
        expect(visitor.sub).toBeUndefined();

        expect(await realtime.authorizeCall({ stream: 'show:7' }, 9)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ stream: 'talk:7' }, 1)).toEqual({ denied: 'forbidden' });
        expect(await realtime.authorizeCall({ stream: 'show_7' }, 1)).toEqual({ denied: 'bad_request' });

        // A rule that gives a visitor more than a viewer's place.
        realtime.streams('open:{id}', () => 'host');
        expect(await realtime.authorizeCall({ stream: 'open:1' }, null)).toEqual({ denied: 'no_user' });
    });
});

describe('one set of words', () => {
    const paths = (sent: { method: string; path: string; body: any }[]) => sent.map((s) => [s.path, s.body]);

    it('sends to a user from their own handle, as to a room from its own', async () => {
        const { realtime, sent } = recorder();
        (realtime as any).localKeys = new Keys(V.local_key, null);

        await realtime.user(42).emit('notice', { text: 'Hi' }, { seal: false, except: 'tab-1' });

        expect(paths(sent)).toEqual([['/wordplus/realtime/emit', { users: ['42'], event: 'notice', data: { text: 'Hi' }, except: 'tab-1' }]]);
    });

    it('takes `except` on a room\'s emit too', async () => {
        const { realtime, sent } = recorder();

        await realtime.room('order:42').emit('updated', { status: 'paid' }, { except: 'tab-1' });

        expect(sent[0].body).toMatchObject({ rooms: ['order:42'], event: 'updated', except: 'tab-1' });
    });

    it('gives a host on the server the words a host has on the page', async () => {
        const { realtime, sent } = recorder(() => ({ ok: true, muted: true, changed: true }));
        const call = realtime.call('meeting:7');

        expect(await call.mute(42)).toBe(true);
        expect(await call.letSpeak(43)).toBe(true);
        expect(await call.makeListener(43)).toBe(true);
        expect(await call.spotlightOn(43)).toBe(true);
        expect(await call.spotlightOff(43)).toBe(true);
        expect(await call.spotlightOff()).toBe(true);

        expect(paths(sent)).toEqual([
            ['/wordplus/realtime/calls/meeting%3A7/mute', { user: '42', track: 'microphone' }],
            ['/wordplus/realtime/calls/meeting%3A7/permit', { user: '43', publish: true }],
            ['/wordplus/realtime/calls/meeting%3A7/permit', { user: '43', publish: false }],
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { user: '43', on: true }],
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { user: '43', on: false }],
            ['/wordplus/realtime/calls/meeting%3A7/spotlight', { on: false }],
        ]);
    });

    it('removes someone from a stream as from a room or a call, and `kick` still does', async () => {
        const { realtime, sent } = recorder();

        await realtime.stream('show:1').remove(7);
        await realtime.stream('show:1').kick(8);

        expect(paths(sent)).toEqual([
            ['/wordplus/realtime/streams/show%3A1/kick', { user: '7' }],
            ['/wordplus/realtime/streams/show%3A1/kick', { user: '8' }],
        ]);
    });
});

describe('the routes as a framework takes them', () => {
    it('come by method name, so a route file is one line', async () => {
        const realtime = app({ user: () => 42 });
        const { GET, POST } = realtime.handlers;

        expect(GET).toBe(realtime.route);
        const answer = await POST(new Request('https://shop.example.com/api/realtime/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: [] }) }));
        expect(((await answer.json()) as { app: string }).app).toBe(V.site);
    });

    it('say who a request\'s user is, by the `user` option', async () => {
        const request = new Request('https://shop.example.com/', { headers: { cookie: 'a=1' } });

        expect(await app({ user: (r) => (r.headers.get('cookie') ? 42 : null) }).userOf(request)).toBe(42);
        expect(await app({ user: async () => 'user_2abc' }).userOf(request)).toBe('user_2abc');
        expect(await app({ user: () => undefined }).userOf(request)).toBeNull();
        expect(await app({ user: () => 0 }).userOf(request)).toBeNull();
        expect(await app().userOf(request)).toBeNull();
    });
});

describe('a name no rule owns', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is said once in the server\'s log, with what to declare, and still refused as ever', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realtime = app();

        expect((await realtime.authorize(['nothing:1'], 42)).denied).toEqual({ 'nothing:1': 'no_rule' });
        await realtime.authorize(['nothing:1'], 43);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('"nothing:1"');
        expect(warn.mock.calls[0][0]).toContain('realtime.room(');

        expect(await realtime.authorizeCall({ call: 'nothing:1', id: 'attempt-1', role: 'caller', to: 43 }, 42)).toEqual({ denied: 'forbidden' });
        expect(warn.mock.calls[1][0]).toContain('realtime.callToken(');

        expect(await realtime.authorizeCall({ room: 'nothing:1' }, 42)).toEqual({ denied: 'forbidden' });
        expect(warn.mock.calls[2][0]).toContain('realtime.groupCallToken(');

        expect(await realtime.authorizeCall({ stream: 'nothing:1' }, 42)).toEqual({ denied: 'forbidden' });
        expect(warn.mock.calls[3][0]).toContain('realtime.streamToken(');
    });

    it('says nothing about a user a rule turned away', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realtime = app();
        realtime.room('order:{id}', () => false);

        expect((await realtime.authorize(['order:1'], 42)).denied).toEqual({ 'order:1': 'forbidden' });
        expect(warn).not.toHaveBeenCalled();
    });

    it('stops saying so after a few names, however many a page makes up', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const realtime = app();

        for (let i = 0; i < 40; i++) await realtime.authorize(['nothing:' + i], 42);

        expect(warn.mock.calls.length).toBe(20);
    });
});
