/**
 * The names an app's rules own, by pattern: `order:{id}`,
 * `chat:{a}:{b}`, `meeting:{id}`, a plain name for itself. A `{part}` takes one or more characters other than `:` and
 * `.`, as few as the rest of the pattern allows, exactly as the realtime server matches a public grant's patterns. The
 * rule with the most characters of its own wins; on a tie, the one declared first.
 */

/** A room's name, a call's or a group call's: 1 to 200 of A-Z a-z 0-9 _ - = @ , . ; and `:`. */
export const validRoom = (name: unknown): name is string => typeof name === 'string' && /^[A-Za-z0-9_\-=@,.;:]{1,200}$/.test(name);

/** A pattern: a name with `{part}`s, each named by a letter or `_` then up to 31 letters, digits and `_`. */
export const validPattern = (pattern: unknown): pattern is string =>
    typeof pattern === 'string' && /^(?:[A-Za-z0-9_\-=@,.;:]|\{[A-Za-z_][A-Za-z0-9_]{0,31}\}){1,200}$/.test(pattern);

interface Compiled<T> {
    pattern: string;
    re: RegExp;
    parts: string[];
    literal: number;
    order: number;
    value: T;
}

export class Patterns<T> {
    private readonly list: Compiled<T>[] = [];

    /** Adds a pattern and what it owns; one already there is replaced. */
    add(pattern: string, value: T): void {
        if (!validPattern(pattern)) throw new Error('wordplus-realtime: not a pattern: ' + JSON.stringify(pattern) + ' (letters, digits, _ - = @ , . ; : and {part}s)');
        const parts: string[] = [];
        const source = pattern
            .split(/(\{[^}]+\})/)
            .map((piece) => {
                if (!piece.startsWith('{')) return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                parts.push(piece.slice(1, -1));
                return '([^:.]+?)';
            })
            .join('');
        const existing = this.list.findIndex((c) => c.pattern === pattern);
        const compiled = { pattern, re: new RegExp('^' + source + '$'), parts, literal: pattern.replace(/\{[^}]+\}/g, '').length, order: existing >= 0 ? this.list[existing].order : this.list.length, value };
        if (existing >= 0) this.list[existing] = compiled;
        else this.list.push(compiled);
    }

    /** What owns a name, with its parts, or null for none. */
    match(name: string): { pattern: string; value: T; params: Record<string, string> } | null {
        let best: Compiled<T> | null = null;
        let params: Record<string, string> = {};
        for (const c of this.list) {
            const m = c.re.exec(name);
            if (!m) continue;
            if (best && (c.literal < best.literal || (c.literal === best.literal && c.order > best.order))) continue;
            best = c;
            params = Object.fromEntries(c.parts.map((part, i) => [part, m[i + 1]]));
        }
        return best ? { pattern: best.pattern, value: best.value, params } : null;
    }

    entries(): Array<[string, T]> {
        return this.list.map((c) => [c.pattern, c.value]);
    }

    get size(): number {
        return this.list.length;
    }
}
