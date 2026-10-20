#!/usr/bin/env node
// The server part serves the browser files from the app's routes by itself (GET {base}/files/{version}/{name}), so most
// apps copy nothing. This is for an app that serves them as static files of its own, with `files: false` in
// createRealtime(): it puts them where the app serves static files.
//   realtime.js                     the browser client as one ES module, for a page with no bundler
//   realtime-worker.js              the connector's SharedWorker, so every tab of a browser shares one connection
//   realtime-rooms.min.js           the mesh's room client, loaded when a page first joins a group call
//   realtime-rooms-e2ee.worker.js   its worker for a room encrypted end to end, found beside it
//   realtime-ui.min.js              the call screen (Better Messages' call screens), loaded by rt.callScreen(),
//                                   found beside the worker
//   realtime-ui-streams.min.js      the live stream elements, loaded by rt.streamScreen(), found beside it
//
//   npx wordplus-realtime copy public/        (Next.js, Vite, Remix …: public/; Laravel: public/; Django: static/)
//
// Then give createRealtime() `files: false, worker: '/realtime-worker.js', rooms: '/realtime-rooms.min.js'`. Run it
// again after each update of the package, as the files change with it.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const [command, target] = process.argv.slice(2);

if (command !== 'copy' || !target) {
    console.log('Usage: npx wordplus-realtime copy <folder the app serves as is, such as public/>');
    console.log('Only for an app that serves the browser files itself: the routes serve them by default.');
    process.exit(command === undefined || command === 'help' || command === '--help' ? 0 : 1);
}

const to = resolve(target);
if (!existsSync(to)) mkdirSync(to, { recursive: true });

for (const file of ['realtime.js', 'realtime-worker.js', 'realtime-rooms.min.js', 'realtime-rooms-e2ee.worker.js', 'realtime-ui.min.js', 'realtime-ui-streams.min.js']) {
    copyFileSync(join(assets, file), join(to, file));
    console.log(join(target, file));
}
