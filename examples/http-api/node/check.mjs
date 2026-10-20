// Checks wordplus.mjs against the test values of the protocol, then against a realtime server (WORDPLUS_SITE, _SECRET, _API).
import { readFileSync } from 'node:fs';
import { open, seal, signature, webhookEvents, wordplus } from './wordplus.mjs';

const v = JSON.parse(readFileSync(new URL('../../../spec/vectors.json', import.meta.url), 'utf8'));
const live = { site: process.env.WORDPLUS_SITE, secret: process.env.WORDPLUS_SECRET, key: process.env.WORDPLUS_LOCAL_KEY };
const out = {};

Object.assign(process.env, { WORDPLUS_SITE: v.site, WORDPLUS_SECRET: v.secret, WORDPLUS_LOCAL_KEY: v.local_key });
out.signature = signature(v.secret, v.emit.timestamp, v.emit.method, v.emit.path, v.emit.body) === v.emit.signature;
const headers = { 'x-wordplus-site': v.site, 'x-wordplus-timestamp': v.webhook.timestamp, 'x-wordplus-signature': v.webhook.signature };
out.webhook = webhookEvents(headers, v.webhook.path, v.webhook.body, Number(v.webhook.timestamp) * 1000)[0]?.type === 'room.occupied';
out.sealed = v.sealed.every((s) => seal(s.plain, s.label, Buffer.from(s.nonce_hex, 'hex')) === s.sealed && open(s.sealed) === s.plain);

Object.assign(process.env, { WORDPLUS_SITE: live.site, WORDPLUS_SECRET: live.secret, WORDPLUS_LOCAL_KEY: live.key });
const sent = await wordplus('POST', '/wordplus/realtime/emit', { rooms: ['product:1'], event: 'price', data: { price: 12 } });
const online = await wordplus('GET', '/wordplus/realtime/online?ids=42,34');
out.live = sent.ok === true && Array.isArray(online.online) && online.online.length === 2;
console.log(JSON.stringify(out));
