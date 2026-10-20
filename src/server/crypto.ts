/**
 * What the server part signs and seals with: Web Crypto's HMAC-SHA256 and SHA-256, which Node 20 and every edge
 * runtime have, and XChaCha20-Poly1305 from @noble/ciphers, the same library the browser opens with.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const bytes = (value: string | Uint8Array): Uint8Array<ArrayBuffer> => (typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value));

export const text = (value: Uint8Array): string => decoder.decode(value);

export function hex(value: Uint8Array): string {
    let out = '';
    for (const byte of value) out += byte.toString(16).padStart(2, '0');
    return out;
}

export function base64url(value: string | Uint8Array): string {
    const raw = bytes(value);
    let binary = '';
    for (const byte of raw) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unbase64url(value: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
    try {
        const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
        return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
        return null;
    }
}

/** HMAC-SHA256 of `message` under `key`, as PHP's hash_hmac( 'sha256', $message, $key, true ). */
export async function hmac(key: string | Uint8Array, message: string | Uint8Array): Promise<Uint8Array> {
    const imported = await crypto.subtle.importKey('raw', bytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', imported, bytes(message)));
}

export async function sha256Hex(message: string | Uint8Array): Promise<string> {
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(message))));
}

export function randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
}

/** XChaCha20-Poly1305 with the label as associated data: the nonce, then the ciphertext and its tag. */
export function aeadSeal(key: Uint8Array, plain: Uint8Array, label: string, nonce: Uint8Array = randomBytes(24)): Uint8Array {
    const sealed = xchacha20poly1305(key, nonce, bytes(label)).encrypt(plain);
    const out = new Uint8Array(nonce.length + sealed.length);
    out.set(nonce);
    out.set(sealed, nonce.length);
    return out;
}

export function aeadOpen(key: Uint8Array, sealed: Uint8Array, label: string): Uint8Array | null {
    if (sealed.length < 24 + 16) return null;
    try {
        return xchacha20poly1305(key, sealed.subarray(0, 24), bytes(label)).decrypt(sealed.subarray(24));
    } catch {
        return null;
    }
}

/** An HS256 JWT of the claims, signed with the key. */
export async function jwt(claims: Record<string, unknown>, key: Uint8Array): Promise<string> {
    const input = base64url('{"alg":"HS256","typ":"JWT"}') + '.' + base64url(JSON.stringify(claims));
    return input + '.' + base64url(await hmac(key, input));
}
