# For coding agents

## Using this package in an app

Read [`skills/wordplus-realtime-apps/SKILL.md`](skills/wordplus-realtime-apps/SKILL.md): which feature fits a task, the workflow, templates for Node and Next.js, Laravel, Django and FastAPI, the rules, and how to verify. Its references are the docs in [`docs/`](docs/getting-started.md).

## Working on this package

- **The server part:** `src/server/` (`index.ts` the rules, routes, tokens and sending, `keys.ts` the keys and sealing, `crypto.ts` Web Crypto and XChaCha20-Poly1305). It answers the browser exactly as the WordPress package (`wordplus/realtime`), `wordplus/realtime-php` and `wordplus-realtime` do: change all four together.
- **The browser part:** `src/browser.ts`, `src/react.tsx`, `src/native.ts`, `src/vue.ts`, `src/svelte.ts`, `src/angular.ts`, over `vendor/realtime-client`, which is built from `@wordplus/realtime-client` and never edited here (`vendor/realtime-client/SOURCE.txt` names the build). What the Vue, Svelte and Angular helpers share, with no framework in it, is `src/bindings.ts`. Svelte's helpers are plain modules on `svelte/store`, so an app's bundler takes them with no compiling, which is why a track is the action `use:track` there, where Vue and React have components. Angular's are plain functions on `@angular/core`'s signals, with no Angular compiler (ng-packagr) in this package, which is why a track is `injectTrack()` there and a directive over it is the app's own (`docs/angular.md`). A new hook in `src/react.tsx` gets its twin in all three.
- **Tests:** `npm test` (the vectors in `spec/vectors.json`, which `scripts/vectors.php` writes with PHP and libsodium, the routes, the browser's settings, the docs and the skill). Every change comes with its test.
- **Docs:** change `docs/`, then run `node scripts/skill.mjs`. `test/skill.test.ts` fails while the skill's references differ. Every ts, tsx, js and jsx block of the docs, the README and the skill compiles against the package (`test/samples.test.ts`; `node scripts/samples.mjs` lists what fails, by page and line): what a block may take as given is in `test/samples/assumed.d.ts`, and a block that is only a part of something larger says ` ```ts fragment `.
