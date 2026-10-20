import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The package in a CommonJS project: an Express app or NestJS compiled to CommonJS requires it, which threw
// ERR_PACKAGE_PATH_NOT_EXPORTED while every entry had only an `import` condition (an SDK review, 2026-10-15). Node loads
// its ES modules through require() from 20.19, and TypeScript on the old `node` resolution finds each entry's types.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let project = '';

beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
    project = mkdtempSync(join(tmpdir(), 'realtime-cjs-'));
    mkdirSync(join(project, 'node_modules', '@wordplus'), { recursive: true });
    symlinkSync(root, join(project, 'node_modules', '@wordplus', 'realtime'));
    writeFileSync(join(project, 'package.json'), JSON.stringify({ type: 'commonjs' }));
}, 120_000);

describe('a CommonJS project', () => {
    it('requires each entry, and the server signs as from an ES module', () => {
        const script = `
            const { createRealtime } = require('@wordplus/realtime/server');
            const browser = require('@wordplus/realtime');
            const react = require('@wordplus/realtime/react');
            const native = require('@wordplus/realtime/native');
            const realtime = createRealtime({ site: 's1500000007', secret: 'test-secret', localKey: '${'ab'.repeat(32)}' });
            realtime.config(42).then((config) => console.log(JSON.stringify({
                server: typeof createRealtime, connect: typeof browser.connect, chat: typeof react.Chat, native: typeof native.connect,
                auth: config.auth.endpoint, site: config.site,
            })));
        `;
        const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: project, encoding: 'utf8' }));

        expect(out).toEqual({ server: 'function', connect: 'function', chat: 'function', native: 'function', auth: '/api/realtime/auth', site: 's1500000007' });
    });

    it('type-checks TypeScript compiled to CommonJS, as NestJS compiles it', () => {
        writeFileSync(join(project, 'main.ts'), [
            "import { createRealtime, type Realtime } from '@wordplus/realtime/server';",
            "import { connect } from '@wordplus/realtime';",
            "const realtime: Realtime = createRealtime({ site: 's1', secret: 'x', localKey: 'y' });",
            'void realtime.to( "room" ).emit( "event", { ok: true } );',
            'void connect;',
        ].join('\n'));
        const tsc = join(root, 'node_modules', '.bin', 'tsc');

        for (const resolution of [['--module', 'commonjs', '--moduleResolution', 'node10'], ['--module', 'nodenext', '--moduleResolution', 'nodenext']]) {
            expect(() => execFileSync(tsc, ['--noEmit', '--strict', '--skipLibCheck', '--ignoreDeprecations', '5.0', ...resolution, 'main.ts'], { cwd: project, encoding: 'utf8' })).not.toThrow();
        }
    });
});
