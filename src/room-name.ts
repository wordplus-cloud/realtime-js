import { callName } from '../vendor/realtime-client/sdk-calls/call-name.js';

/** Whether a room's name waits for the other person: `chat:{pair}`. */
export const namesOther = (name: string): boolean => /\{(pair|id)\}/.test(name);

/**
 * A room's name for the page's user and another, as a call's is: `{pair}` the two ids in order, `{me}`, `{id}`, so both of
 * them name the same room. A name with none of them is as it is. Throws `no_identity` where it needs the page's user and
 * the app named none.
 */
export function roomName(name: string, me: string | null, other?: number | string | null): string {
    if (namesOther(name) && (other === undefined || other === null)) throw new Error('wordplus-realtime: the room ' + JSON.stringify(name) + ' needs `with`, the other person');
    return callName(name, me, other ?? '');
}
