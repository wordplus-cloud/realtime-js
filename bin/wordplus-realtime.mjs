#!/usr/bin/env node
// The package's command, for the first minutes of an app and for when something doesn't connect:
//
//   npx wordplus-realtime init            your app's key and secret into .env.local (or .env), a local key made for you,
//                                         that file into .gitignore, and on Next.js lib/realtime.ts, its route file and a
//                                         call token route.
//                                         Nothing already there changes.
//   npx wordplus-realtime check [address] whether your keys work with WordPlus Cloud, and your routes at that address
//   npx wordplus-realtime copy <folder>   the browser files, for an app that serves them itself
//
// `copy`: the server part serves the browser files from the app's routes by itself (GET {base}/files/{version}/{name}), so
// most apps copy nothing. This is for an app that serves them as static files of its own, with `files: false` in
// createRealtime(): it puts them where the app serves static files.
//   realtime.js                     the browser client as one ES module, for a page with no bundler
//   realtime-worker.js              the connector's SharedWorker, so every tab of a browser shares one connection
//   realtime-rooms.min.js           the mesh's room client, loaded when a page first joins a group call
//   realtime-rooms-e2ee.worker.js   its worker for a room encrypted end to end, found beside it
//   realtime-ui.min.js              the call screen (Better Messages' call screens), loaded by rt.callScreen(),
//                                   found beside the worker
//   realtime-ui-streams.min.js      the live stream elements, loaded by rt.streamScreen(), found beside it
//   realtime-ui-recording.min.js    the recording player, <recording-player>, which a page loads itself
//   hls.light.min.js                hls.js, which the player loads where the browser plays no HLS of its own
//
//   npx wordplus-realtime copy public/        (Next.js, Vite, Remix …: public/; Laravel: public/; Django: static/)
//
// Then give createRealtime() `files: false, worker: '/realtime-worker.js', rooms: '/realtime-rooms.min.js'`. Run it
// again after each update of the package, as the files change with it.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const API = 'https://rest.wordplus.cloud';
const PUBLISH_LABEL = 'wordplus-realtime publish v1';
const USAGE = `Usage:
  npx wordplus-realtime init [--app <key>] [--secret <secret>]   set your app up here
  npx wordplus-realtime check [address] [--base <path>]          see whether it works, such as http://localhost:3000
  npx wordplus-realtime copy <folder>                           only for an app that serves the browser files itself`;

function copy(target) {
    if (!target) {
        console.log(USAGE);
        process.exit(1);
    }
    const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
    const to = resolve(target);
    if (!existsSync(to)) mkdirSync(to, { recursive: true });

    for (const file of ['realtime.js', 'realtime-worker.js', 'realtime-rooms.min.js', 'realtime-rooms-e2ee.worker.js', 'realtime-ui.min.js', 'realtime-ui-streams.min.js', 'realtime-ui-recording.min.js', 'hls.light.min.js']) {
        copyFileSync(join(assets, file), join(to, file));
        console.log(join(target, file));
    }
}

/** `--app value` and `--app=value`, as an object. */
function flags(args) {
    const out = {};
    for (let i = 0; i < args.length; i++) {
        const match = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
        if (match) out[match[1]] = match[2] ?? args[++i];
    }
    return out;
}

/** What a .env-style file sets, as far as this command needs: `NAME=value`, with quotes or not, a comment after a value left out. */
function envOf(file) {
    if (!existsSync(file)) return {};
    const out = {};
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match) out[match[1]] = match[2].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
}

/** The app's own settings as its server would read them: the environment first, then its files. */
function settings() {
    return { ...envOf('.env'), ...envOf('.env.local'), ...process.env };
}

async function ask(question) {
    if (!process.stdin.isTTY) return '';
    const reader = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((done) => reader.question(question, done));
    reader.close();
    return answer.trim();
}

/** Writes a file that isn't there yet, and says which: an app's own file is never changed. */
function create(file, text) {
    if (existsSync(file)) {
        console.log(`  kept     ${file}, already there`);
        return;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    console.log(`  created  ${file}`);
}

async function init(given) {
    const pack = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : {};
    const next = !!(pack.dependencies?.next ?? pack.devDependencies?.next);
    const envFile = next || existsSync('.env.local') ? '.env.local' : '.env';
    const have = envOf(envFile);

    console.log('Your app\'s key and secret are on its page in your WordPlus Cloud account: Apps → your app.');
    console.log('Your subscription and its Apps page: https://www.wordplus.cloud/pricing#apps\n');

    const values = {
        WORDPLUS_SITE: have.WORDPLUS_SITE || given.app || (await ask('App key (public, such as s1500000007): ')),
        WORDPLUS_SECRET: have.WORDPLUS_SECRET || given.secret || (await ask('App secret (stays on your server): ')),
        // It seals what goes through the cloud, which never sees it, so it is made here. A new one could not open what the old one sealed.
        WORDPLUS_LOCAL_KEY: have.WORDPLUS_LOCAL_KEY || randomBytes(32).toString('hex'),
    };

    const missing = Object.entries(values).filter(([name]) => !(name in have));
    if (missing.length > 0) {
        const old = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
        const lines = missing.map(([name, value]) => name + '=' + value);
        appendFileSync(envFile, (old !== '' && !old.endsWith('\n') ? '\n' : '') + lines.join('\n') + '\n');
        console.log(`\n  wrote    ${missing.map(([name]) => name).join(', ')} into ${envFile}`);
    } else {
        console.log(`\n  kept     ${envFile}, which has all three`);
    }
    if (missing.some(([name]) => name === 'WORDPLUS_LOCAL_KEY')) {
        console.log('           Keep WORDPLUS_LOCAL_KEY as long as the app, the same on each of its servers: what it sealed needs it to open.');
    }
    if (!ignored(envFile)) {
        const old = existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : '';
        appendFileSync('.gitignore', (old !== '' && !old.endsWith('\n') ? '\n' : '') + envFile + '\n');
        console.log(`  added    ${envFile} to .gitignore: the secret and the local key must stay out of git.`);
    }

    if (next) initNext();
    else {
        console.log('\nNext: declare your rooms and mount the routes, as the guide for your framework shows: https://docs.wordplus.cloud/');
    }

    if (!values.WORDPLUS_SITE || !values.WORDPLUS_SECRET) console.log(`\nThen fill in what is empty in ${envFile}.`);
    console.log('\nThen see that it all works, with your app running:\n\n  npx wordplus-realtime check http://localhost:3000\n');
}

/** Whether .gitignore covers a file, as far as its plain lines say: `.env*` and the like. */
function ignored(file) {
    if (!existsSync('.gitignore')) return false;
    return readFileSync('.gitignore', 'utf8').split(/\r?\n/).some((line) => {
        const pattern = line.trim().replace(/^\//, '');
        return pattern !== '' && !pattern.startsWith('#') && new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(file);
    });
}

function initNext() {
    const root = existsSync('src/app') ? 'src/' : '';
    const typed = existsSync('tsconfig.json');
    const extension = typed ? '.ts' : '.js';
    const lib = root + 'lib/realtime' + extension;
    const route = root + 'app/api/realtime/[...path]/route' + extension;
    const callRoute = root + 'app/api/call-token/route' + extension;

    create(lib, `import { createRealtime } from '@wordplus/realtime/server';

export const realtime = createRealtime( {
    // Who is asking: their id, or null for nobody. Read it your app's way: Auth.js, Clerk or your own sessions.
    // Never take a name or an id the page sends: whoever sends one would read that person's rooms and call as them.
    user: async ( request ) => null,
    // What others see of them: in who is online and in calls.
    profile: async ( user ) => ( { name: 'User ' + user } ),
} );

// A room for each order, order:1042, its last 20 updates kept. Who may join is yours to say: this lets in anyone signed in.
realtime.room( 'order:{id}', ( user, { id } ) => user !== null, { history: 20 } );

// A chat of two people, chat:34:42: those two, and nobody else. The pages send these events to it themselves.
realtime.room( 'chat:{pair}', { presence: true, history: 50, emit: [ 'message', 'typing', 'read' ] } );

// Calls, group calls and live streams start from a token your own route answers, after your own check: the call
// token route beside this file's route is one.
`);

    const alias = typed && /"@\/\*"/.test(readFileSync('tsconfig.json', 'utf8'));
    const from = alias ? '@/lib/realtime' : relative(dirname(route), lib).replace(/\.[jt]s$/, '');
    create(route, `import { realtime } from '${from}';

export const { GET, POST } = realtime.handlers;
`);

    const fromCall = alias ? '@/lib/realtime' : relative(dirname(callRoute), lib).replace(/\.[jt]s$/, '');
    create(callRoute, `// GET /api/call-token?to=34&type=video, which <CallButton to={ 34 } tokenUrl="/api/call-token"> asks as it is pressed.
import { realtime } from '${fromCall}';

export async function GET( request${typed ? ': Request' : ''} ) {
    const me = await realtime.userOf( request );
    const asked = new URL( request.url ).searchParams;
    const to = asked.get( 'to' );

    // Your own check goes here: whether this user may call that one. This lets anyone signed in call anyone else.
    if ( me === null || ! to || String( me ) === to ) return new Response( null, { status: 403 } );

    // The token that lets this user call that one.
    return Response.json( { token: await realtime.callToken( me, to, { type: asked.get( 'type' ) } ) } );
}
`);

    console.log(`
Next:

1. In ${lib}, make \`user\` say who is asking, from a session or a token your server checks.
   In ${callRoute}, put your own check of who may call whom.

2. Connect your pages, in the layout of your signed-in pages:

     import { RealtimeProvider } from '@wordplus/realtime/next';
     import { realtime } from '@/lib/realtime';

     export default function AppLayout( { children } ) {
         return <RealtimeProvider realtime={ realtime }>{ children }</RealtimeProvider>;
     }

3. On your app's page in WordPlus Cloud, list http://localhost:3000 among its addresses.

Your components then join rooms with useRoom() from '@wordplus/realtime/react'.
The guide: https://docs.wordplus.cloud/nextjs/getting-started/`);
}

let failures = 0;
const pass = (text) => console.log('  ok    ' + text);
const fail = (text) => {
    failures++;
    console.log('  FAIL  ' + text);
};

async function check(address, base) {
    const env = settings();
    const app = env.WORDPLUS_SITE ?? '';
    const secret = env.WORDPLUS_SECRET ?? '';
    const localKey = env.WORDPLUS_LOCAL_KEY ?? '';
    // Your files or your environment, which is where your server reads them too. Run this where your app runs.
    console.log('Your keys');

    if (/^[A-Za-z0-9._-]{2,}$/.test(app)) pass('WORDPLUS_SITE is ' + app);
    else fail('WORDPLUS_SITE is missing. It is your app\'s key, on its page in WordPlus Cloud (Apps).');

    if (secret !== '') pass('WORDPLUS_SECRET is there');
    else fail('WORDPLUS_SECRET is missing. It is your app\'s secret, on its page in WordPlus Cloud (Apps).');

    if (/^[0-9a-f]{64}$/.test(localKey)) pass('WORDPLUS_LOCAL_KEY is 64 hex characters');
    else fail((localKey === '' ? 'WORDPLUS_LOCAL_KEY is missing.' : 'WORDPLUS_LOCAL_KEY isn\'t 64 hex characters.') + ' Make one with `openssl rand -hex 32`, and keep it as long as the app.');

    if (app !== '' && secret !== '') await checkCloud(app, secret, (env.WORDPLUS_REALTIME_API || API).replace(/\/+$/, ''));
    if (address) await checkRoutes(address.replace(/\/+$/, ''), app, base);
    else console.log('\nGive the address your app runs on to check your routes too: npx wordplus-realtime check http://localhost:3000');

    console.log(failures > 0 ? `\n${failures} to fix.` : '\nAll good.');
    process.exit(failures > 0 ? 1 : 0);
}

/** What the signed usage route answers says whether WordPlus Cloud knows this app and its secret, and it changes nothing. */
async function checkCloud(app, secret, api) {
    console.log('\nWordPlus Cloud');
    const path = '/wordplus/realtime/usage';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = createHmac('sha256', secret).update(PUBLISH_LABEL).digest();
    const signature = createHmac('sha256', key).update(timestamp + '\nGET\n' + path + '\n' + createHash('sha256').update('').digest('hex')).digest('hex');

    let res;
    try {
        res = await fetch(api + path, { headers: { 'X-WordPlus-Site': app, 'X-WordPlus-Timestamp': timestamp, 'X-WordPlus-Signature': signature } });
    } catch {
        fail(`could not reach ${api}. Check this machine's connection to it.`);
        return;
    }
    const answer = await res.json().catch(() => null);
    if (res.status === 200 && answer?.ok) {
        const { now, limit } = answer.connections ?? {};
        pass(`it knows your app, and your secret is right${now !== undefined ? ` (${now} connected now${limit ? ` of ${limit}` : ''})` : ''}`);
        return;
    }
    const refusals = {
        unknown_site: 'it doesn\'t know this app key. Check WORDPLUS_SITE against your app\'s page in WordPlus Cloud (Apps).',
        bad_signature: 'your secret is wrong for this app. Check WORDPLUS_SECRET against your app\'s page in WordPlus Cloud (Apps).',
        stale_signature: 'this machine\'s clock is off by more than five minutes.',
        not_included: 'the plan of this app does not include realtime.',
    };
    fail(refusals[answer?.error] ?? `it answered ${res.status}${answer?.error ? ' (' + answer.error + ')' : ''}.`);
}

/** The routes as a page asks them, with no user: the keys route names the app, and GET serves the browser files. */
async function checkRoutes(address, app, base) {
    console.log(`\nYour routes at ${address}${base}`);
    const asking = (path, init) => fetch(address + base + path, init).catch(() => null);

    const keys = await asking('/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: [] }) });
    if (keys === null) {
        fail(`nothing answers at ${address}. Is your app running there?`);
        return;
    }
    const answer = await keys.json().catch(() => null);
    if (keys.status === 200 && answer?.app) {
        if (app && answer.app !== app) fail(`they name the app ${answer.app}, and your keys here say ${app}: your server reads other values than these.`);
        else pass('the keys route answers, naming your app');
    } else if (keys.status === 200) {
        fail('the keys route answers with no app key: update the package on your server.');
    } else if (keys.status === 401 || keys.status === 403) {
        fail(`the keys route answered ${keys.status}. Something in front of it asks for a sign-in: let ${base}/* through with the session.`);
    } else {
        fail(`the keys route answered ${keys.status}. Next.js: app/api/realtime/[...path]/route.ts exports GET and POST (\`export const { GET, POST } = realtime.handlers\`). Express: app.use( '${base}', realtime.node( … ) ).`);
    }

    const file = await asking('/files/realtime-worker.js', { method: 'HEAD' });
    if (file?.status === 200) pass('the browser files are served');
    else fail(`the browser files answered ${file?.status ?? 'nothing'}. Your routes serve them on GET under ${base}/files/: in Next.js the folder is the catch-all [...path], and it exports GET as well as POST. An app that serves them itself has \`files: false\`, and this one can pass.`);
}

const [command, ...rest] = process.argv.slice(2);

if (['help', '--help', '-h'].includes(command) || rest.includes('--help') || rest.includes('-h')) console.log(USAGE);
else if (command === 'copy') copy(rest[0]);
else if (command === 'init') await init(flags(rest));
else if (command === 'check') await check(rest[0]?.startsWith('--') ? undefined : rest[0], flags(rest).base ?? '/api/realtime');
else {
    console.log(USAGE);
    process.exit(command === undefined ? 0 : 1);
}
