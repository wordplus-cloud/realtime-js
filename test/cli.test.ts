import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// The package's command, as an app runs it: in the app's folder, with no terminal to ask in.

const BIN = fileURLToPath(new URL('../bin/wordplus-realtime.mjs', import.meta.url));
const folders: string[] = [];
const servers: Server[] = [];

function folder(files: Record<string, string> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'wordplus-cli-'));
    folders.push(dir);
    for (const [file, text] of Object.entries(files)) {
        mkdirSync(join(dir, file, '..'), { recursive: true });
        writeFileSync(join(dir, file), text);
    }
    return dir;
}

function run(dir: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
        const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('WORDPLUS_')));
        execFile(process.execPath, [BIN, ...args], { cwd: dir, env: { ...clean, ...env } }, (error, stdout, stderr) => {
            resolve({ code: error ? Number(error.code) || 1 : 0, out: stdout + stderr });
        });
    });
}

function serve(answer: (method: string, path: string, headers: Record<string, unknown>) => { status: number; body?: unknown }): Promise<string> {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            const { status, body } = answer(req.method ?? '', req.url ?? '', req.headers);
            res.statusCode = status;
            res.end(body === undefined ? '' : JSON.stringify(body));
        });
        servers.push(server);
        server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + (server.address() as { port: number }).port));
    });
}

afterEach(() => {
    for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const server of servers.splice(0)) server.close();
});

const NEXT = { 'package.json': JSON.stringify({ dependencies: { next: '16.0.0' } }), 'tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": [ "./*" ] } } }', '.gitignore': '.env*\n' };

describe('init', () => {
    it('sets a Next.js app up: its keys, a local key made for it, its realtime file and its route', async () => {
        const dir = folder(NEXT);

        const { code, out } = await run(dir, ['init', '--app', 's1500000007', '--secret', 'the-secret']);

        expect(code).toBe(0);
        const env = readFileSync(join(dir, '.env.local'), 'utf8');
        expect(env).toContain('WORDPLUS_SITE=s1500000007\n');
        expect(env).toContain('WORDPLUS_SECRET=the-secret\n');
        expect(env).toMatch(/WORDPLUS_LOCAL_KEY=[0-9a-f]{64}\n/);
        expect(readFileSync(join(dir, 'lib/realtime.ts'), 'utf8')).toContain("from '@wordplus/realtime/server'");
        expect(readFileSync(join(dir, 'app/api/realtime/[...path]/route.ts'), 'utf8')).toBe("import { realtime } from '@/lib/realtime';\n\nexport const { GET, POST } = realtime.handlers;\n");
        const callRoute = readFileSync(join(dir, 'app/api/call-token/route.ts'), 'utf8');
        expect(callRoute).toContain("from '@/lib/realtime'");
        expect(callRoute).toContain('export async function GET( request: Request )');
        expect(callRoute).toContain('realtime.callToken( me, to,');
        expect(callRoute).toContain('Your own check goes here');
        expect(readFileSync(join(dir, 'lib/realtime.ts'), 'utf8')).not.toMatch(/\.calls\(|\{pair\}' \)/);
        expect(out).toContain('@wordplus/realtime/next');
        expect(out).toContain('wordplus-realtime check');
        expect(out).not.toContain('the-secret');
        expect(out).not.toContain(/WORDPLUS_LOCAL_KEY=(\S+)/.exec(env)![1]);
    });

    it('changes nothing already there, the local key above all', async () => {
        const local = 'ab'.repeat(32);
        const own = "export const realtime = 'mine';\n";
        const route = 'export function GET() {}\n';
        const dir = folder({ ...NEXT, '.env.local': `WORDPLUS_SITE=s1\nWORDPLUS_SECRET=old\nWORDPLUS_LOCAL_KEY=${local}\n`, 'lib/realtime.ts': own, 'app/api/call-token/route.ts': route });

        await run(dir, ['init', '--app', 's2', '--secret', 'new']);

        expect(readFileSync(join(dir, '.env.local'), 'utf8')).toBe(`WORDPLUS_SITE=s1\nWORDPLUS_SECRET=old\nWORDPLUS_LOCAL_KEY=${local}\n`);
        expect(readFileSync(join(dir, 'lib/realtime.ts'), 'utf8')).toBe(own);
        expect(readFileSync(join(dir, 'app/api/call-token/route.ts'), 'utf8')).toBe(route);
    });

    it('adds what a file lacks after what it has, on a line of its own', async () => {
        const dir = folder({ ...NEXT, '.env.local': 'OTHER=1' });

        await run(dir, ['init', '--app', 's1', '--secret', 'x']);

        expect(readFileSync(join(dir, '.env.local'), 'utf8')).toMatch(/^OTHER=1\nWORDPLUS_SITE=s1\nWORDPLUS_SECRET=x\nWORDPLUS_LOCAL_KEY=/);
    });

    it('puts the files beside src/app, and writes JavaScript for an app with no TypeScript', async () => {
        const dir = folder({ 'package.json': NEXT['package.json'], '.gitignore': '.env.local\n', 'src/app/page.js': '' });

        await run(dir, ['init', '--app', 's1', '--secret', 'x']);

        expect(existsSync(join(dir, 'src/lib/realtime.js'))).toBe(true);
        expect(readFileSync(join(dir, 'src/app/api/realtime/[...path]/route.js'), 'utf8')).toContain("from '../../../../lib/realtime'");
        const callRoute = readFileSync(join(dir, 'src/app/api/call-token/route.js'), 'utf8');
        expect(callRoute).toContain("from '../../../lib/realtime'");
        expect(callRoute).toContain('export async function GET( request )');
    });

    it('keeps the secret out of git, on a line of its own and once', async () => {
        const dir = folder({ 'package.json': NEXT['package.json'], '.gitignore': 'node_modules' });

        expect((await run(dir, ['init', '--app', 's1', '--secret', 'x'])).out).toContain('added    .env.local to .gitignore');
        expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.env.local\n');

        await run(dir, ['init', '--app', 's1', '--secret', 'x']);
        expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n.env.local\n');
    });

    it('starts a .gitignore where there is none', async () => {
        const dir = folder({ 'package.json': JSON.stringify({ dependencies: { express: '5.0.0' } }) });

        await run(dir, ['init', '--app', 's1', '--secret', 'x']);

        expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('.env\n');
    });

    it('tells a user reading the route to check who is asking, not to believe the page', async () => {
        const dir = folder(NEXT);

        const { out } = await run(dir, ['init', '--app', 's1', '--secret', 'x']);

        expect(readFileSync(join(dir, 'lib/realtime.ts'), 'utf8')).toContain('Never take a name or an id the page sends');
        expect(out).toContain('from a session or a token your server checks');
    });

    it('writes only .env in an app that is not on Next.js, and says where to go on', async () => {
        const dir = folder({ 'package.json': JSON.stringify({ dependencies: { express: '5.0.0' } }), '.gitignore': '.env\n' });

        const { out } = await run(dir, ['init', '--app', 's1', '--secret', 'x']);

        expect(readFileSync(join(dir, '.env'), 'utf8')).toContain('WORDPLUS_SITE=s1');
        expect(existsSync(join(dir, 'lib'))).toBe(false);
        expect(out).toContain('https://docs.wordplus.cloud/');
    });
});

describe('check', () => {
    const KEYS = { WORDPLUS_SITE: 's1500000007', WORDPLUS_SECRET: 'the-secret', WORDPLUS_LOCAL_KEY: 'ab'.repeat(32) };

    it('says each key that is missing or wrong, and what to do', async () => {
        const { code, out } = await run(folder(), ['check'], { WORDPLUS_LOCAL_KEY: 'short' });

        expect(code).toBe(1);
        expect(out).toContain('WORDPLUS_SITE is missing');
        expect(out).toContain('WORDPLUS_SECRET is missing');
        expect(out).toContain("WORDPLUS_LOCAL_KEY isn't 64 hex characters");
        expect(out).toContain('openssl rand -hex 32');
    });

    it('reads .env.local as a Next.js server does, over .env', async () => {
        const dir = folder({ '.env': 'WORDPLUS_SITE=wrong\n', '.env.local': 'WORDPLUS_SITE="s1"  # the key\n' });

        expect((await run(dir, ['check'])).out).toContain('WORDPLUS_SITE is s1\n');
    });

    it('asks WordPlus Cloud with a signature it can check, changing nothing, and never says the secret', async () => {
        const asked: Array<[string, string, Record<string, unknown>]> = [];
        const api = await serve((method, path, headers) => {
            asked.push([method, path, headers]);
            return { status: 200, body: { ok: true, connections: { now: 3, limit: 1000 } } };
        });

        const { code, out } = await run(folder(), ['check'], { ...KEYS, WORDPLUS_REALTIME_API: api });

        expect(code).toBe(0);
        expect(asked[0][0]).toBe('GET');
        expect(asked[0][1]).toBe('/wordplus/realtime/usage');
        expect(asked[0][2]['x-wordplus-site']).toBe('s1500000007');
        expect(asked[0][2]['x-wordplus-signature']).toMatch(/^[0-9a-f]{64}$/);
        expect(out).toContain('3 connected now of 1000');
        expect(out).not.toContain('the-secret');
    });

    it('signs as the server part does, so a right secret passes', async () => {
        const { hmac, hex, sha256Hex } = await import('../src/server/crypto.js');
        const expected = (timestamp: string) => hmac(KEYS.WORDPLUS_SECRET, 'wordplus-realtime publish v1').then(async (key) => hex(await hmac(key, timestamp + '\nGET\n/wordplus/realtime/usage\n' + (await sha256Hex('')))));
        let seen: { timestamp: string; signature: string } | null = null;
        const api = await serve((_method, _path, headers) => {
            seen = { timestamp: String(headers['x-wordplus-timestamp']), signature: String(headers['x-wordplus-signature']) };
            return { status: 200, body: { ok: true } };
        });

        await run(folder(), ['check'], { ...KEYS, WORDPLUS_REALTIME_API: api });

        expect(seen!.signature).toBe(await expected(seen!.timestamp));
    });

    it.each([
        ['unknown_site', 'WORDPLUS_SITE'],
        ['bad_signature', 'WORDPLUS_SECRET'],
        ['stale_signature', 'clock'],
        ['not_included', 'plan'],
    ])('says what %s means', async (error, word) => {
        const api = await serve(() => ({ status: 401, body: { ok: false, error } }));

        const { code, out } = await run(folder(), ['check'], { ...KEYS, WORDPLUS_REALTIME_API: api });

        expect(code).toBe(1);
        expect(out).toContain(word);
    });

    describe('with the address of the app', () => {
        const app = (keys: { status: number; body?: unknown }, file: number) => serve((method, path) => {
            if (path === '/wordplus/realtime/usage') return { status: 200, body: { ok: true } };
            if (method === 'POST' && path === '/api/realtime/keys') return keys;
            if (path === '/api/realtime/files/realtime-worker.js') return { status: file };
            return { status: 404 };
        });
        const checked = async (address: string) => run(folder(), ['check', address], { ...KEYS, WORDPLUS_REALTIME_API: address });

        it('passes routes that answer', async () => {
            const { code, out } = await checked(await app({ status: 200, body: { keys: [], app: KEYS.WORDPLUS_SITE } }, 200));

            expect(out).toContain('the keys route answers');
            expect(out).toContain('the browser files are served');
            expect(code).toBe(0);
        });

        it('says where the route goes when nothing is there', async () => {
            const { code, out } = await checked(await app({ status: 404 }, 404));

            expect(code).toBe(1);
            expect(out).toContain('[...path]/route.ts');
            expect(out).toContain('realtime.handlers');
        });

        it('says a route of one segment, which reaches no file', async () => {
            const { code, out } = await checked(await app({ status: 200, body: { keys: [], app: KEYS.WORDPLUS_SITE } }, 404));

            expect(code).toBe(1);
            expect(out).toContain('the catch-all [...path]');
        });

        it('says a sign-in in front of the routes', async () => {
            expect((await checked(await app({ status: 401 }, 200))).out).toContain('asks for a sign-in');
        });

        it('says when the server reads other keys than these', async () => {
            expect((await checked(await app({ status: 200, body: { keys: [], app: 's-other' } }, 200))).out).toContain('your server reads other values');
        });

        it('says when nothing runs there', async () => {
            const { out } = await run(folder(), ['check', 'http://127.0.0.1:9'], { ...KEYS, WORDPLUS_REALTIME_API: await app({ status: 200 }, 200) });

            expect(out).toContain('Is your app running there?');
        });
    });
});

describe('copy', () => {
    it('still puts the browser files where the app serves them', async () => {
        const dir = folder();

        const { code } = await run(dir, ['copy', 'public']);

        expect(code).toBe(0);
        expect(existsSync(join(dir, 'public/realtime-worker.js'))).toBe(true);
    });
});

describe('with no command', () => {
    it('says what it does', async () => {
        const { code, out } = await run(folder(), []);

        expect(code).toBe(0);
        expect(out).toContain('wordplus-realtime init');
    });

    it('fails on one it does not know', async () => {
        expect((await run(folder(), ['nonsense'])).code).toBe(1);
    });
});

describe('--help', () => {
    it.each([[['--help']], [['-h']], [['help']], [['init', '--help']], [['check', '-h']], [['copy', '--help']]])('%j says what it does and does nothing', async (args) => {
        const dir = folder();

        const { code, out } = await run(dir, args);

        expect(code).toBe(0);
        expect(out).toContain('wordplus-realtime init');
        expect(readdirSync(dir)).toEqual([]);
    });
});
