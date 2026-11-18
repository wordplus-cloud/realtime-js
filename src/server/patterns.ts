/**
 * The names an app's rules own, by pattern: `order:{id}`,
 * `chat:{a}:{b}`, `meeting:{id}`, a plain name for itself. A `{part}` takes one or more characters other than `:` and
 * `.`, as few as the rest of the pattern allows, exactly as the realtime server matches a public grant's patterns. The
 * rule with the most characters of its own wins; on a tie, the one declared first.
 *
 * `{pair}`, in a room's or a call's pattern, is the two people the name holds: `support:{pair}` matches `support:34:42`,
 * with `{ pair: '34:42' }`, and only those two get in, which room() and calls() check before any rule of the app's.
 */

/** Whether a pattern names the two people in it. */
export const hasPair = (pattern: string): boolean => pattern.includes('{pair}');

/** The other of the two in a `{pair}` for a user who is one of them, or null for anyone else, and for one person twice. */
export function otherOf(pair: string, user: number | string | null): string | null {
    const [a, b] = pair.split(':');
    if (user === null || a === b) return null;
    const id = String(user);
    return id === a ? b : id === b ? a : null;
}

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
        if (pattern.split('{pair}').length > 2) throw new Error('wordplus-realtime: a name holds one pair: ' + JSON.stringify(pattern));
        const parts: string[] = [];
        const source = pattern
            .split(/(\{[^}]+\})/)
            .map((piece) => {
                if (!piece.startsWith('{')) return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                parts.push(piece.slice(1, -1));
                return piece === '{pair}' ? '([^:.]+?:[^:.]+?)' : '([^:.]+?)';
            })
            .join('');
        const existing = this.list.findIndex((c) => c.pattern === pattern);
        // `{pair}` counts its `:`, so it weighs as `{a}:{b}` does.
        const literal = pattern.replace(/\{pair\}/g, ':').replace(/\{[^}]+\}/g, '').length;
        const compiled = { pattern, re: new RegExp('^' + source + '$'), parts, literal, order: existing >= 0 ? this.list[existing].order : this.list.length, value };
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
