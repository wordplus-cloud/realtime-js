import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The docs and the AI skill's references stay one text (scripts/skill.mjs copies them), and every relative link in
// either, and in the skill itself, reaches a file.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const skill = join(root, 'skills', 'wordplus-realtime-apps');
const references = join(skill, 'references');

const links = (text: string) => [...text.matchAll(/\]\((?!https?:|#)([^)#]+)(#[^)]*)?\)/g)].map((m) => m[1]);

describe('the docs and the skill', () => {
    it('carry the same text', () => {
        // Every page, the guides' folders included (nextjs/getting-started.md …).
        const pagesOf = (folder: string) => readdirSync(folder, { recursive: true }).map(String).filter((f) => f.endsWith('.md')).sort();
        const files = pagesOf(docs);
        expect(pagesOf(references)).toEqual(files);
        for (const file of files) expect(readFileSync(join(references, file), 'utf8'), file + ': run node scripts/skill.mjs').toBe(readFileSync(join(docs, file), 'utf8'));
    });

    it('link only to files that are there', () => {
        // The docs at the top, and the guides in their folders (docs/nextjs/, docs/express/ …).
        const pages = readdirSync(docs, { withFileTypes: true }).flatMap((entry) =>
            entry.isDirectory()
                ? readdirSync(join(docs, entry.name)).filter((f) => f.endsWith('.md')).map((f) => [join(docs, entry.name), f])
                : entry.name.endsWith('.md') ? [[docs, entry.name]] : [],
        );
        for (const [folder, file] of [...pages, [skill, 'SKILL.md'], [root, 'README.md'], [root, 'llms.txt'], [root, 'AGENTS.md']]) {
            for (const link of links(readFileSync(join(folder, file), 'utf8'))) expect(existsSync(join(folder, link)), file + ' → ' + link).toBe(true);
        }
    });

    it('name the skill as agents read it', () => {
        const text = readFileSync(join(skill, 'SKILL.md'), 'utf8');
        expect(text).toMatch(/^---\nname: wordplus-realtime-apps\ndescription: .{200,1024}\n---\n/);
    });
});
