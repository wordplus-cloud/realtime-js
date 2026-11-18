// Every ts, tsx, js and jsx block of the docs (docs/, the README and the skill) compiled against this package, so a
// sample that names something the package no longer has, or calls it wrongly, fails test/samples.test.ts with its page
// and line.
//
//   node scripts/samples.mjs        (prints what fails; test/samples.test.ts runs the same)
//
// Each block is a module of its own, compiled by the package's TypeScript, the package's entries (@wordplus/realtime,
// /server, /react …) read from src/ as the build makes them: ts and tsx blocks as strictly as a Next.js app compiles
// them, js and jsx blocks as plain JavaScript is checked (checkJs, not strict). What a block may take as given is in
// test/samples/assumed.d.ts, declared once: the app (`app`), its database (`db`), the signed-in user (`user`), the
// server's `realtime` and the page's `rt`, the React hooks and the package's hooks a block uses without importing them,
// as the examples import them, and the modules of what this package doesn't install (Next.js, Express, the ready-made
// parts of @wordplus/realtime-ui …), whose names are taken as they are. React is React 19's types, as the Next.js
// examples have them.
//
// The app's own: a name a block uses and nothing declares (`mayCall()`, `showTyping()`, `Appointment`) is the app's,
// as the prose says, and is taken as it is; so is a module of the app's own (`@/lib/auth`, `./live`), which the block
// imports and the page doesn't show. Everything else is checked: the package's names, their arguments and options, what
// they answer, and the props of its components.
//
// Two kinds of part are compiled as what they are part of, on the same lines: markup after the imports
// (`<CallScreen />` and `<Chat />` side by side) as a fragment, `<>…</>`, and a block whose lines `return` at its
// first column (a component's body) as a function's body. Any other part (an option of createRealtime() alone, a tag
// with no end) says so after its language, ```ts fragment, and is not compiled. Keep those few: test/samples.test.ts
// counts them.
import { execFile } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = { ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx' };

/** The pages whose samples are checked: every page of docs/, the README and the skill. */
export function pages() {
    const docs = readdirSync(join(root, 'docs'), { recursive: true }).map(String).filter((f) => f.endsWith('.md')).sort().map((f) => join('docs', f));
    return [...docs, 'README.md', 'skills/wordplus-realtime-apps/SKILL.md'];
}

/** Every ts, tsx, js and jsx block of a page: its first line's number, its language, the words after it and its code. */
export function blocksOf(page) {
    const lines = readFileSync(join(root, page), 'utf8').split('\n');
    const blocks = [];
    for (let i = 0; i < lines.length; i++) {
        const open = /^(\s*)(`{3,})(\w*)(.*)$/.exec(lines[i]);
        if (!open) continue;
        const [, indent, fence, lang, rest] = open;
        let end = i + 1;
        while (end < lines.length && !(lines[end].trim().startsWith(fence) && lines[end].trim().replace(/`/g, '') === '')) end++;
        if (EXTENSIONS[lang]) {
            const code = lines.slice(i + 1, end).map((line) => line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()).join('\n');
            blocks.push({ page, line: i + 2, lang, words: rest.trim(), fragment: /(^|\s)fragment(\s|$)/.test(rest), code });
        }
        i = end;
    }
    return blocks;
}

const IMPORTS = /^\s*(import\b|\/\/|'use client'|"use client"|'use server'|"use server")/;

/**
 * The code compiled for a block: itself, or the markup or the body it is a part of (see the top), on the same lines.
 * `body` says it returns outside a function (the compiler's TS1108). `shift` is how far its first changed line moved
 * right.
 */
function sourceOf(block, body = false) {
    const lines = block.code.split('\n');
    const first = lines.findIndex((line) => line.trim() && !IMPORTS.test(line));
    if (first < 0) return block.code;
    if (block.lang.endsWith('x') && lines[first].startsWith('<')) {
        block.shift = { line: first + 1, by: 2 };
        lines[first] = '<>' + lines[first];
        // The markup runs to the block's end, or to the first statement after it (the component it renders, say).
        const end = lines.findIndex((line, i) => i > first && /^(export |async |function |const |let |class |type |interface )/.test(line));
        if (end < 0) return lines.join('\n') + '\n</>;';
        if (lines[end - 1].trim()) throw new Error(`${block.page}:${block.line}: leave a blank line between the markup and line ${block.line + end}`);
        lines[end - 1] = '</>;';
        return lines.join('\n');
    }
    if (body) {
        const opening = 'async function body() { ';
        block.shift = { line: first + 1, by: opening.length };
        lines[first] = opening + lines[first];
        return lines.join('\n') + '\n}';
    }
    return block.code;
}

/** A module the app keeps itself, which a block imports and the page doesn't show. */
const own = (specifier) => /^(\.{1,2}\/|\/|@\/|~\/|\$lib\/)/.test(specifier);

/** The names of what a block declares or imports itself, as far as a JavaScript block's own names need. */
const declaredIn = (code) => new Set([...code.matchAll(/\b(?:const|let|var|function|class|import)\s+\{?\s*([\w$]+)/g)].map((m) => m[1]));

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

async function compile(config) {
    try {
        await promisify(execFile)(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', config], { cwd: dirname(config), maxBuffer: 64 << 20 });
        return [];
    } catch (error) {
        const output = String(error.stdout ?? '') + String(error.stderr ?? '');
        const found = [];
        let last = null;
        for (const line of output.split('\n')) {
            const m = DIAGNOSTIC.exec(line);
            if (m) found.push(last = { file: m[1].replace(/\\/g, '/').split('/').pop(), line: Number(m[2]), column: Number(m[3]), code: m[4], message: m[5] });
            else if (last && /^\s+\S/.test(line)) last.message += ' ' + line.trim();
        }
        if (!found.length) throw new Error('tsc failed with no diagnostic:\n' + output);
        return found;
    }
}

/** The name a diagnostic says nothing declares, if it says so. */
function missingName(d, block) {
    const named = /Cannot find name '([\w$]+)'/.exec(d.message) ?? /shorthand property '([\w$]+)'/.exec(d.message);
    if (named && ['TS2304', 'TS2552', 'TS18004'].includes(d.code)) return named[1];
    // A JavaScript block that sets a property of a name nothing declares (`button.hidden = …`) makes it an object of
    // that one property, and then misses its others.
    const expando = /on type 'typeof ([\w$]+)'/.exec(d.message);
    if (expando && d.code === 'TS2339' && !block.lang.startsWith('t') && !declaredIn(block.code).has(expando[1])) return expando[1];
    return null;
}

/**
 * Compiles every block and answers what failed, each with its page and the line in it, and the blocks it took.
 * `dir` is where the blocks are written (node_modules/.cache/samples by default), emptied first; `from` the pages, by
 * their path in the package (every page by default).
 */
export async function check({ dir = join(root, 'node_modules', '.cache', 'samples'), from = pages() } = {}) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    const all = from.flatMap(blocksOf);
    const blocks = all.filter((block) => !block.fragment);
    const byFile = new Map();
    for (const block of blocks) {
        block.file = block.page.replace(/\.md$/, '').replace(/[^\w-]+/g, '_') + '_' + block.line + '.' + EXTENSIONS[block.lang];
        block.source = sourceOf(block);
        byFile.set(block.file, block);
        // `export {}` keeps each block a module, so two blocks' names never meet.
        writeFileSync(join(dir, block.file), block.source + '\n\nexport {};\n');
    }

    copyFileSync(join(root, 'test', 'samples', 'assumed.d.ts'), join(dir, 'assumed.d.ts'));
    const to = (path) => relative(dir, join(root, path)).replace(/\\/g, '/');
    const entries = { '': 'browser.ts', '/server': 'server/index.ts', '/react': 'react.tsx', '/next': 'next.tsx', '/vue': 'vue.ts', '/svelte': 'svelte.ts', '/angular': 'angular.ts', '/native': 'native.ts', '/echo': 'echo.ts' };
    const react = 'node_modules/@types/react-19/';
    const compilerOptions = {
        target: 'es2022', module: 'es2022', moduleResolution: 'bundler', lib: ['es2022', 'dom', 'dom.iterable'], types: ['node'], jsx: 'react-jsx',
        noEmit: true, skipLibCheck: true, allowUmdGlobalAccess: true,
        paths: {
            ...Object.fromEntries(Object.entries(entries).flatMap(([entry, file]) => [['@wordplus/realtime' + entry, [to('src/' + file)]], ['npm:@wordplus/realtime' + entry, [to('src/' + file)]]])),
            react: [to(react + 'index.d.ts')], 'react/jsx-runtime': [to(react + 'jsx-runtime.d.ts')], 'react/jsx-dev-runtime': [to(react + 'jsx-dev-runtime.d.ts')],
        },
    };
    const extra = ['assumed.d.ts', to('src/next-modules.d.ts')];
    const configs = {
        // As strictly as a Next.js app (strict: true), save the types of a sample's own parameters, which the docs leave
        // out to be read.
        ts: { compilerOptions: { ...compilerOptions, strict: true, noImplicitAny: false }, files: [...extra, ...blocks.filter((b) => b.lang.startsWith('t')).map((b) => b.file)] },
        js: { compilerOptions: { ...compilerOptions, strict: false, allowJs: true, checkJs: true }, files: [...extra, 'javascript.d.ts', ...blocks.filter((b) => b.lang.startsWith('j')).map((b) => b.file)] },
    };
    copyFileSync(join(root, 'test', 'samples', 'javascript.d.ts'), join(dir, 'javascript.d.ts'));
    for (const [kind, config] of Object.entries(configs)) writeFileSync(join(dir, `tsconfig.${kind}.json`), JSON.stringify(config, null, 2));
    // The package's own files are read strictly, as its build reads them: what the JavaScript program finds in them is
    // the looser settings', not the samples'.
    // One compiler at a time, so the rest of the suite keeps its share of the machine.
    const both = async () => {
        const found = [];
        for (const kind of Object.keys(configs)) found.push(...(await compile(join(dir, `tsconfig.${kind}.json`))).filter((d) => kind === 'ts' || byFile.has(d.file)));
        return found;
    };

    // First, the names nothing declares: the app's own, declared after the block as anything, a value and a type; and
    // the blocks that are a function's body, a route's or a component's, which return outside one. A body's names are
    // checked once it is one, so this goes round until nothing new is found.
    const missing = new Map();
    const bodies = new Set();
    let found = await both();
    for (let round = 0; round < 3; round++) {
        const changed = new Set();
        for (const d of found) {
            const block = byFile.get(d.file);
            if (!block) continue;
            if (d.code === 'TS1108' && !bodies.has(d.file)) {
                bodies.add(d.file);
                changed.add(d.file);
            }
            const name = missingName(d, block);
            const names = missing.get(d.file) ?? missing.set(d.file, new Set()).get(d.file);
            if (name && !names.has(name)) {
                names.add(name);
                changed.add(d.file);
            }
        }
        if (!changed.size) break;
        for (const file of changed) {
            const block = byFile.get(file);
            block.source = sourceOf(block, bodies.has(file));
            block.assumed = [...missing.get(file)].sort();
            const typed = block.lang.startsWith('t');
            // A name the block has as a type of its own (`type Line`) is missing only as a value (the component `<Line>`).
            const typeOf = (name) => new RegExp(`\\b(type|interface|class|enum)\\s+${name.replace(/\$/g, '\\$')}\\b`).test(block.code) ? '' : ` type ${name}<A = any, B = any, C = any> = any;`;
            const declared = block.assumed.map((name) => typed ? `declare var ${name}: any;${typeOf(name)}` : `/** @type {any} */ var ${name};`).join('\n');
            writeFileSync(join(dir, file), block.source + '\n\nexport {};\n// The app\'s own:\n' + declared + '\n');
        }
        found = await both();
    }

    const errors = [];
    for (const d of found) {
        const block = byFile.get(d.file);
        if (!block) {
            errors.push({ page: d.file, line: d.line, column: d.column, code: d.code, message: d.message });
            continue;
        }
        // A file of the app's own the page doesn't show.
        const specifier = /^Cannot find module '([^']+)'/.exec(d.message)?.[1];
        if (d.code === 'TS2307' && specifier && own(specifier)) continue;
        // JavaScript has no `unknown`: what the package leaves to the app (a member's info, an answer's data) is read
        // as it comes.
        if (block.lang.startsWith('j') && (d.code === 'TS18046' || (d.code === 'TS2339' && /on type 'unknown'/.test(d.message)))) continue;
        // Past the block's end (the fragment's or the body's close, the names declared) is its last line.
        const lines = block.code.split('\n').length;
        const column = d.line > lines ? 1 : d.column - (block.shift?.line === d.line ? block.shift.by : 0);
        errors.push({ page: block.page, line: block.line + Math.min(d.line, lines) - 1, column, lang: block.lang, code: d.code, message: d.message });
    }
    errors.sort((a, b) => a.page.localeCompare(b.page) || a.line - b.line || a.column - b.column);
    return { blocks: all.length, checked: blocks.length, fragments: all.filter((b) => b.fragment).map(({ page, line, code }) => ({ page, line, first: code.split('\n')[0].trim() })), errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const { blocks, checked, fragments, errors } = await check();
    for (const e of errors) console.log(`${e.page}:${e.line}:${e.column} ${e.lang ?? ''} ${e.code} ${e.message}`);
    console.log(`${checked} of ${blocks} blocks compiled (${fragments.length} marked fragment): ${errors.length} errors`);
    process.exitCode = errors.length ? 1 : 0;
}
