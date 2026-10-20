# For coding agents

## Using this package in an app

Read [`skills/wordplus-realtime-apps/SKILL.md`](skills/wordplus-realtime-apps/SKILL.md): which feature fits a task, the workflow, templates for Node and Next.js, Laravel, Django and FastAPI, the rules, and how to verify. Its references are the docs in [`docs/`](docs/getting-started.md).

## Working on this package

- **The server part:** `src/server/` (`index.ts` the rules, routes, tokens and sending; `keys.ts` the keys and sealing; `crypto.ts` Web Crypto and XChaCha20-Poly1305). It answers the browser exactly as the WordPress package (`wordplus/realtime`), `wordplus/realtime-php` and `wordplus-realtime` do: change all four together.
- **The browser part:** `src/browser.ts`, `src/react.tsx`, `src/native.ts`, over `vendor/realtime-client`, which is built from `@wordplus/realtime-client` and never edited here (`vendor/realtime-client/SOURCE.txt` names the build).
- **Tests:** `npm test` (the vectors in `spec/vectors.json`, which `scripts/vectors.php` writes with PHP and libsodium, the routes, the browser's settings, the docs and the skill). Every change comes with its test.
- **Docs:** change `docs/`, then `node scripts/skill.mjs`; `test/skill.test.ts` fails while the skill's references differ.
