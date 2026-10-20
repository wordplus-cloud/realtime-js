// The app server: the Express example (examples/express), which signs the app in with a token, answers the
// realtime routes for it, and emits the shop changes. EXPO_PUBLIC_SHOP_SERVER says where it runs. The iOS
// simulator reaches the Mac at localhost, the Android emulator at 10.0.2.2.
import { connect, type BrowserConfig, type Realtime } from '@wordplus/realtime/native';

export type { Room } from '@wordplus/realtime/native';

export const SERVER = process.env.EXPO_PUBLIC_SHOP_SERVER ?? 'http://localhost:3000';

export interface Person {
    id: number;
    name: string;
    role: string;
    staff: boolean;
    avatar: string;
}

export type Status = 'placed' | 'packed' | 'shipped' | 'delivered';

export interface Message {
    id: string;
    from: number;
    text: string;
    at?: number;
}

export interface Shop {
    me: Person;
    people: Person[];
    order: { id: number; customer: number; item: string; status: Status };
    chat: { between: number[] };
    routes: { status: string; messages: string };
    rooms: { order: string; chat: string; shop: string; meeting: string };
    events: { order: string; chat: string };
}

export interface Session {
    token: string;
    shop: Shop;
    rt: Realtime;
}

/** Signs in as one of the shop people, then connects with the settings the server sent: no request first. */
export async function signIn(as: number): Promise<Session> {
    const answer = await fetch(`${SERVER}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ as }),
    }).then((r) => r.json() as Promise<{ token: string; realtime: BrowserConfig; shop: Shop }>);

    const rt = await connect({
        site: answer.realtime.site,
        server: answer.realtime.server,
        api: answer.realtime.api,
        // In full: an app has no address of its own. The token is how the server knows its user.
        endpoint: `${SERVER}/api/realtime`,
        headers: { Authorization: `Bearer ${answer.token}` },
        keys: { entries: answer.realtime.keys?.entries, identity: answer.realtime.keys?.identity },
    });
    rt.on('connected', () => console.log('realtime: connected'));
    rt.on('disconnected', (why: unknown) => console.log('realtime: disconnected', why));
    rt.on('error', (e: { code?: string }) => console.log('realtime: error', e?.code ?? e));

    return { token: answer.token, shop: answer.shop, rt };
}

/** A POST to the app server, as the signed-in user, naming this connection so the server emit skips it. */
export async function post<T>(session: Session, path: string, body: object): Promise<T | null> {
    const response = await fetch(SERVER + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ ...body, tab: session.rt.tab }),
    });
    return response.ok ? ((await response.json()) as T) : null;
}

/** A GET from the app server, as the signed-in user. */
export async function get<T>(session: Session, path: string): Promise<T | null> {
    const response = await fetch(SERVER + path, { headers: { Authorization: `Bearer ${session.token}` } });
    return response.ok ? ((await response.json()) as T) : null;
}

/** An avatar address on the server. */
export const avatarOf = (path: string) => SERVER + path;
