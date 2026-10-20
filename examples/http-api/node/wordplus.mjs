// The HTTP API of WordPlus Cloud from Node with no package of ours: a signed request, a webhook checked, a value sealed.
// Node 20 or later. Sealing takes @noble/ciphers (npm install @noble/ciphers).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const hmac = (key, message) => createHmac('sha256', key).update(message).digest();
const sha256 = (body) => createHash('sha256').update(body).digest('hex');

/** The signature of a request: hex HMAC-SHA256, under the publish key, of timestamp, method, path and the body hash. */
export function signature(secret, timestamp, method, pathWithQuery, body) {
    const key = hmac(secret, 'wordplus-realtime publish v1');
    return hmac(key, `${timestamp}\n${method}\n${pathWithQuery}\n${sha256(body)}`).toString('hex');
}

/** A signed request to the realtime server: its JSON answer, or an error with the code it refused with. */
export async function wordplus(method, path, body) {
    const api = process.env.WORDPLUS_API ?? 'https://rest.wordplus.cloud';
    const url = new URL(path, api);
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));

    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-WordPlus-Site': process.env.WORDPLUS_SITE,
            'X-WordPlus-Timestamp': timestamp,
            'X-WordPlus-Signature': signature(process.env.WORDPLUS_SECRET, timestamp, method, url.pathname + url.search, raw),
        },
        body: body === undefined ? undefined : raw,
    });
    const answer = await res.json();
    if (!answer.ok) throw Object.assign(new Error(`WordPlus Cloud refused it: ${answer.error}`), { code: answer.error, status: res.status });
    return answer;
}

/** The events of a webhook, its signature checked: the body as it came, and the path it came to with its query. */
export function webhookEvents(headers, pathWithQuery, raw, now = Date.now()) {
    const site = headers['x-wordplus-site'], timestamp = headers['x-wordplus-timestamp'], given = headers['x-wordplus-signature'];
    if (site !== process.env.WORDPLUS_SITE || !/^\d{1,12}$/.test(timestamp ?? '') || !given) throw new Error('missing_signature');
    if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) throw new Error('stale_signature');

    const key = hmac(process.env.WORDPLUS_SECRET, 'wordplus-realtime webhook v1');
    const expected = hmac(key, `${timestamp}\nPOST\n${pathWithQuery}\n${sha256(raw)}`).toString('hex');
    if (expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) throw new Error('bad_signature');

    return JSON.parse(raw).events;
}

/** The key a label names: HMAC-SHA256 of the label under the local key, the 64 hex characters as they are. */
export const keyOf = (label) => hmac(process.env.WORDPLUS_LOCAL_KEY, 'wordplus-realtime key v1|' + label);

/** A value sealed with the key a label names: "{label}:1.{base64url(nonce, ciphertext and tag)}". */
export function seal(text, label, nonce = randomBytes(24)) {
    const sealed = xchacha20poly1305(keyOf(label), nonce, Buffer.from(label)).encrypt(Buffer.from(text));
    return `${label}:1.${Buffer.concat([nonce, sealed]).toString('base64url')}`;
}

/** A value this app sealed, opened; null for one it did not seal or that changed on the way. */
export function open(value) {
    const at = value.lastIndexOf(':1.');
    if (at <= 0) return null;
    const label = value.slice(0, at);
    const raw = Buffer.from(value.slice(at + 3), 'base64url');
    try {
        return Buffer.from(xchacha20poly1305(keyOf(label), raw.subarray(0, 24), Buffer.from(label)).decrypt(raw.subarray(24))).toString();
    } catch {
        return null;
    }
}
