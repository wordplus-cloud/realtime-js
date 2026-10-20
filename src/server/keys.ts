/**
 * The keys that seal what an app sends through the realtime server, so WordPlus Cloud carries it without being able to
 * read or change it: the WordPress package's WordPlus_Realtime_Keys, label for
 * label, derived from the app's local key in place of WordPress's master key.
 *
 * - `d:{day}` the day's key (UTC days since 1970), for what everyone the app knows may see: the directory's profiles, a
 *   call's and a room's people.
 * - `u:{id}:{generation}` a user's own, for what goes to them alone.
 * - `ch:{room}:{generation}` a sealed room's, for its events and its members' info (the label's kind kept from protocol
 *   2's channels).
 * - an app's own kinds (Realtime#kind()).
 *
 * A key is `HMAC-SHA256(local key, "wordplus-realtime key v1|" + label)`, and a sealed value
 * `{label}:1.{base64url(nonce + ciphertext)}`, XChaCha20-Poly1305 with the label as associated data.
 */
import { aeadOpen, aeadSeal, base64url, bytes, hex, hmac, text, unbase64url } from './crypto.js';
import { validRoom } from './patterns.js';

export const KEY_DERIVE = 'wordplus-realtime key v1|';
/** A room's media key's derivation, and a call's proofs', apart from the labels' so no label names one. */
export const MEDIA_DERIVE = 'wordplus-realtime media v1|';
export const PROOF_DERIVE = 'wordplus-realtime proof v1|';
export const SEAL_FORMAT = '1';
export const LABEL = '[a-z][a-z0-9]{0,15}:[A-Za-z0-9_\\-=@,.;:]{1,240}';
export const RESERVED_KINDS = ['d', 'u', 'ch'];
export const MAX_LABELS = 100;

const LABEL_RE = new RegExp('^' + LABEL + '$');
const SEALED_RE = new RegExp('^(' + LABEL + '):' + SEAL_FORMAT + '\\.([A-Za-z0-9_-]+)$');

export type UserId = string | number;

/** The characters of an id a label carries as they are: those of room names, but `=`, which escapes the others. */
const LABEL_SAFE = /^[A-Za-z0-9_\-@,.;:]$/;
const utf8 = new TextEncoder();

/**
 * A user id as a label carries it, ids such as Auth0's `auth0|5f7c…` included: as it is when every character
 * is one labels take, else each other character, `=` among them, as `=` and the hex of its UTF-8 bytes (`auth0=7C5f7c`),
 * so no two ids share a label. Null for an id of more than 64 characters, or with a space or a control character. The
 * PHP and Python packages write the same.
 */
export function labelUser(user: UserId): string | null {
    const id = String(user);
    if (id === '' || [...id].length > 64 || /[\s\u0000-\u001f\u007f]/.test(id)) return null;
    let out = '';
    for (const char of id) {
        out += LABEL_SAFE.test(char) ? char : [...utf8.encode(char)].map((byte) => '=' + byte.toString(16).toUpperCase().padStart(2, '0')).join('');
    }
    return out.length <= 200 ? out : null;
}

/** Where an app keeps its keys' generations (`ch:{channel}` and `u:{id}`), so rotating one holds across its processes. */
export interface GenerationStore {
    get(name: string): Promise<number | null> | number | null;
    set(name: string, generation: number): Promise<void> | void;
}

export const validLabel = (label: unknown): label is string => typeof label === 'string' && label.length <= 256 && LABEL_RE.test(label);

/** The label of the key that opens a sealed value, or null when it isn't one. */
export function labelOf(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const match = SEALED_RE.exec(value);
    return match ? match[1] : null;
}

export const dayOf = (time: number = Date.now()): number => Math.floor(time / 86_400_000);

export class Keys {
    private readonly derived = new Map<string, Uint8Array>();

    constructor(
        private readonly master: string,
        private readonly store: GenerationStore | null,
    ) {
        if (!/^[0-9a-f]{64}$/.test(master)) throw new Error('wordplus-realtime: localKey must be 64 hex characters (openssl rand -hex 32)');
    }

    /** The key a label names, 32 bytes; also the profile hash's, under a name no label takes. */
    async key(label: string): Promise<Uint8Array> {
        let key = this.derived.get(label);
        if (!key) {
            key = await hmac(this.master, KEY_DERIVE + label);
            if (this.derived.size > 10_000) this.derived.clear();
            this.derived.set(label, key);
        }
        return key;
    }

    /**
     * The key a room's media is encrypted with end to end, base64url: `call|{call}|{call id}|{caller}|{callee}` for a
     * call's rooms, `room|{room}` for a group call's room whose prefix encrypts it. Only the calls route gives it out.
     */
    async media(what: string): Promise<string> {
        return base64url(await hmac(this.master, MEDIA_DERIVE + what));
    }

    /** A proof only this app's server makes, base64url: a user is in a call, or was rung into it (`member|…`, `rung|…`). */
    async proof(what: string): Promise<string> {
        return base64url(await hmac(this.master, PROOF_DERIVE + what));
    }

    /** A label and its key as a browser keeps them, `{label}:{64 hex}`, or '' for a label that isn't one. */
    async entry(label: string): Promise<string> {
        return validLabel(label) ? label + ':' + hex(await this.key(label)) : '';
    }

    async seal(value: string, label: string): Promise<string | null> {
        if (!validLabel(label)) return null;
        return label + ':' + SEAL_FORMAT + '.' + base64url(aeadSeal(await this.key(label), bytes(value), label));
    }

    async sealJson(data: unknown, label: string): Promise<string | null> {
        const json = JSON.stringify(data === undefined ? null : data);
        return this.seal(json, label);
    }

    /** The plain value of one this app sealed, or null: not a sealed value, another app's, or changed on the way. */
    async open(value: unknown): Promise<string | null> {
        if (typeof value !== 'string') return null;
        const match = SEALED_RE.exec(value);
        const raw = match ? unbase64url(match[2]) : null;
        if (!match || !raw) return null;
        const plain = aeadOpen(await this.key(match[1]), raw, match[1]);
        return plain ? text(plain) : null;
    }

    dayLabel(day: number = dayOf()): string {
        return 'd:' + day;
    }

    async userGeneration(user: UserId): Promise<number> {
        return Math.max(1, Number((await this.store?.get('u:' + user)) ?? 1) || 1);
    }

    /** A user's own key, its newest; '' for nobody or an id labels can't carry. */
    async userLabel(user: UserId | null): Promise<string> {
        const part = user === null || user === 0 ? null : labelUser(user);
        if (part === null) return '';
        return 'u:' + part + ':' + (await this.userGeneration(user!));
    }

    /** The user's next key, which the one they had doesn't open: when their access is revoked. */
    async rotateUser(user: UserId): Promise<void> {
        if (!this.store) throw new Error('wordplus-realtime: rotating a key needs a generation store (the `generations` option)');
        await this.store.set('u:' + user, (await this.userGeneration(user)) + 1);
    }

    async roomGeneration(room: string): Promise<number> {
        return Math.max(1, Number((await this.store?.get('ch:' + room)) ?? 1) || 1);
    }

    /** A room's key, its newest; '' for a name that isn't one. Whether a room is sealed is its rule's to say. */
    async roomLabel(room: string): Promise<string> {
        if (!validRoom(room)) return '';
        return 'ch:' + room + ':' + (await this.roomGeneration(room));
    }

    /** A room's next key, when someone lost access to it: what it carries from now on is sealed from them. */
    async rotateRoom(room: string): Promise<void> {
        if (!this.store) throw new Error('wordplus-realtime: rotating a key needs a generation store (the `generations` option)');
        if (validRoom(room)) await this.store.set('ch:' + room, (await this.roomGeneration(room)) + 1);
    }

    /** The keys a user starts with: their own, and the day's from yesterday's to tomorrow's. None for nobody. */
    async userEntries(user: UserId | null): Promise<string[]> {
        const own = await this.userLabel(user);
        if (own === '') return [];
        const today = dayOf();
        return Promise.all([own, this.dayLabel(today - 1), this.dayLabel(today), this.dayLabel(today + 1)].map((label) => this.entry(label)));
    }

    /**
     * A user's entry in the directory: `pd`, the profile with every text sealed with the day's key however deep (numbers,
     * true and false as they are), and `pdh`, which spares the server a write when nothing changed, an HMAC of the plain
     * profile under a key derived from the local key, so the server can't confirm a name it guessed.
     */
    async profile(user: UserId, plain: Record<string, unknown>): Promise<{ pd: Record<string, unknown>; pdh: string }> {
        const label = this.dayLabel();
        const full = { ...plain, user_id: user };
        const pd: Record<string, unknown> = {};

        for (const [field, value] of Object.entries(full)) {
            // The id stays as it is, a number or a string: the server keys the entry by it.
            if (field === 'user_id') {
                pd.user_id = user;
                continue;
            }
            // What JSON can't carry is left out, as WordPress's profile() leaves it.
            const kept = await this.sealedValue(value, label, 0);
            if (kept !== null || value === null) pd[field] = kept;
        }

        return { pd, pdh: hex(await hmac(await this.key('profile-hash'), JSON.stringify(full))) };
    }

    private async sealedValue(value: unknown, label: string, depth: number): Promise<unknown> {
        if (typeof value === 'string') return value === '' ? value : this.seal(value, label);
        if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
        if (typeof value !== 'object' || value === undefined || depth >= 8) return null;

        if (Array.isArray(value)) return Promise.all(value.map((item) => this.sealedValue(item, label, depth + 1)));

        const sealed: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) sealed[key] = await this.sealedValue(item, label, depth + 1);
        return sealed;
    }
}
