import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// scripts/files.mjs writes src/server/files, which every compile reads. `npm test` runs it again during its own build
// (commonjs.test.ts) while test/types.test.ts compiles against those files. It took them all away and wrote them back, so
// that compile failed now and then, with "Cannot find module './hls.light.min.js'".

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'server', 'files');
const write = () => execFileSync(process.execPath, ['scripts/files.mjs'], { cwd: root, stdio: 'pipe' });
const times = () => Object.fromEntries(readdirSync(out).map((file) => [file, statSync(join(out, file)).mtimeMs]));

describe('scripts/files.mjs', () => {
    it('leaves each file as it is when nothing changed, so a compile running beside it finds them all', () => {
        write();
        const before = times();

        write();

        expect(Object.keys(before)).toContain('index.ts');
        expect(times()).toEqual(before);
    });

    it('takes away a file no longer served', () => {
        // Any name the script didn't write goes, whatever it ends with. Not a .ts one here: the package's build, which
        // commonjs.test.ts runs beside this, lists every .ts of src and failed with TS6053 when this one went from under it.
        const stale = join(out, 'no-longer-served.txt');
        writeFileSync(stale, 'export {};\n');

        write();

        expect(existsSync(stale)).toBe(false);
    });
});
