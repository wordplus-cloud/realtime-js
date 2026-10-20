// The AI skill's references (skills/wordplus-realtime-apps/references/) are the docs (docs/), its guides' folders
// (nextjs/, express/, mobile/) included, copied so the skill's folder stands alone wherever an agent installs it.
//
//   node scripts/skill.mjs
//
// Change the docs, then run this; test/skill.test.ts fails while the two differ.
import { cpSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const references = join(root, 'skills', 'wordplus-realtime-apps', 'references');

rmSync(references, { recursive: true, force: true });
cpSync(docs, references, { recursive: true, filter: (path) => !/\.[^/]+$/.test(path) || path.endsWith('.md') });

const count = readdirSync(references, { recursive: true }).filter((f) => String(f).endsWith('.md')).length;
console.log('skills/wordplus-realtime-apps/references: ' + count + ' files from docs/');
