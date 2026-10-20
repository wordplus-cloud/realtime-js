// The browser files the server part serves from the app's own routes (GET {base}/files/{version}/{name}), so an app has
// no copy step: the package carries them and every release serves the ones it came with (an SDK review, 2026-10-15).
//
//   node scripts/files.mjs            (npm run build, typecheck and test run it first)
//
// It writes:
//   assets/realtime.js        the browser client as one ES module, for a page with no bundler:
//                             <script type="module">import { connect } from '/api/realtime/files/realtime.js'</script>
//   src/server/files/         each served file as a module holding its text, behind a literal import(), so a bundler
//                             (Next.js, an edge runtime) takes them along and loads one only when it is asked for, and
//                             index.ts with their version: a hash of all of them, the folder they are served from
//
// The other files come from the client and the ready-made parts (scripts/client.mjs, scripts/ui.mjs). Both folders
// are written here only, and neither is kept in git.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');
const out = join(root, 'src', 'server', 'files');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// The served files, in the order a page asks for them.
export const SERVED = ['realtime.js', 'realtime-worker.js', 'realtime-rooms.min.js', 'realtime-rooms-e2ee.worker.js', 'realtime-ui.min.js', 'realtime-ui-streams.min.js'];

await build({
    entryPoints: [join(root, 'src', 'browser.ts')],
    outfile: join(assets, 'realtime.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2021',
    minify: true,
    legalComments: 'none',
    banner: { js: `/*! @wordplus/realtime ${version}: the browser client as one ES module. MIT License. Includes socket.io-client and @noble/ciphers (MIT): THIRD-PARTY-NOTICES.txt. */` },
    logLevel: 'warning',
});

const hash = createHash('sha256');
const texts = SERVED.map((name) => {
    const text = readFileSync(join(assets, name), 'utf8');
    hash.update(name + '\0' + text + '\0');
    return text;
});
export const filesVersion = hash.digest('hex').slice(0, 12);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const moduleOf = (name) => name.replace(/\.js$/, '');
SERVED.forEach((name, i) => {
    // Typed as a string, so the declaration is one line, not the file again as a literal type.
    writeFileSync(join(out, moduleOf(name) + '.ts'), `// ${name}, as the app serves it. Written by scripts/files.mjs.\nconst text: string = ${JSON.stringify(texts[i])};\nexport default text;\n`);
});

writeFileSync(join(out, 'index.ts'), [
    '// The browser files the routes serve, written by scripts/files.mjs from assets/.',
    '',
    '/** A hash of every file, the folder they are served from: a new one with any change. */',
    `export const FILES_VERSION = '${filesVersion}';`,
    '',
    '/** Each file, loaded only when a page asks for it. */',
    'export const FILES: Record<string, () => Promise<{ default: string }>> = {',
    ...SERVED.map((name) => `    '${name}': () => import('./${moduleOf(name)}.js'),`),
    '};',
    '',
].join('\n'));

console.log(`src/server/files: ${SERVED.length} files, version ${filesVersion}`);
