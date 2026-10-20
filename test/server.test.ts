import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRealtime, MAX_HISTORY_DAYS, Patterns, Realtime, RealtimeError, streamGrant } from '../src/server/index.js';
import { aeadSeal, base64url, hex, hmac, sha256Hex, unbase64url } from '../src/server/crypto.js';
import { dayOf, Keys, labelUser } from '../src/server/keys.js';

// The server part against the conformance vectors PHP wrote (spec/vectors.json, scripts/vectors.php), and as the
// browser uses its routes, on protocol 3's rooms.

const V = JSON.parse(readFileSync(new URL('../spec/vectors.json', import.meta.url), 'utf8'));

afterEach(() => {
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
        await expect(bare.config(42)).rejects.toThrow(/site and secret/);
        expect(() => createRealtime({ site: 's1', secret: V.secret, localKey: '' }).keys).toThrow(/64 hex/);
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
});

describe('the auth route', () => {
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
        expect(sent.map((s) => [s.path, s.body])).toEqual([
            ['/wordplus/realtime/calls/meeting%3A7/mute', { user: '42', track: 'microphone' }],
            ['/wordplus/realtime/calls/meeting%3A7/permit', { user: 'auth0|5f7c8e', publish: true }],
            ['/wordplus/realtime/calls/meeting%3A7/permit', { user: '42', publish: false }],
            ['/wordplus/realtime/calls/meeting%3A7/remove', { user: '42' }],
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

        expect(await realtime.keysAnswer([], null)).toEqual({ keys: [] });
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
        expect(await app({ hasKeys: (user) => user !== 42 }).keysAnswer([], 42)).toEqual({ keys: [] });
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
        expect(await (await realtime.route(post('/api/realtime/keys', { labels: [] }))).json()).toEqual({ keys: [] });
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
        expect(await streamed).toEqual({ status: 200, body: { keys: [] } });

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
        expect(await (await realtime.route(post('/my/keys', { labels: [] }))).json()).toEqual({ keys: [] });
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
        expect(await run({ method: 'POST', url: '/my/keys', headers: json, body: { labels: [] } })).toEqual({ status: 200, body: { keys: [] } });
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

        for (const name of ['realtime-worker.js', 'realtime-rooms.min.js', 'realtime-rooms-e2ee.worker.js', 'realtime-ui.min.js', 'realtime-ui-streams.min.js', 'realtime.js']) {
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
        const claims = await claimsOf(host.token!, 'easy-stream grant v1');
        expect(Object.keys(claims)).toEqual(['iss', 'aud', 'str', 'role', 'sub', 'name', 'avatar', 'q', 'stage', 'offline', 'links', 'reactions', 'iat', 'exp']);
        expect(claims).toMatchObject({ iss: V.site, aud: 'easy-stream', str: 'show:42', role: 'host', sub: '1', name: 'User 1', avatar: 'https://example.com/1.png', q: '720p', stage: false, offline: 'open', links: false, reactions: true });
        expect(claims.exp - claims.iat).toBe(600);
        expect(host.exp).toBe(claims.exp);

        // The rule's own info, its picture only when https; a visitor, as a viewer with no name.
        const ben = await claimsOf((await realtime.authorizeCall({ stream: 'show:7' }, 34)).token!, 'easy-stream grant v1');
        expect(ben).toMatchObject({ role: 'viewer', sub: '34', name: 'Ben', chat: 'read', offline: 'closed' });
        expect(ben.avatar).toBeUndefined();
        const visitor = await claimsOf((await realtime.authorizeCall({ stream: 'show:7' }, null)).token!, 'easy-stream grant v1');
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
