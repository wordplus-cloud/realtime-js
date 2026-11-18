import { vi } from 'vitest';

// The connection and what hangs off it, as the Vue and Svelte helpers use them: framework-bindings.test.ts, vue.test.ts and
// svelte.test.ts share these. Each `fire()` is what the real one would say.

type Listener = (...args: any[]) => void;

export function emitter<T extends object>(fields: T) {
    const listeners = new Map<string, Listener[]>();
    return Object.assign(fields, {
        on(event: string, fn: Listener) {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
            return this;
        },
        off(event: string, fn?: Listener) {
            listeners.set(event, (listeners.get(event) ?? []).filter((f) => fn && f !== fn));
            return this;
        },
        fire(event: string, ...args: unknown[]) {
            for (const fn of listeners.get(event) ?? []) fn(...args);
        },
    });
}

export function aRoom(name = 'chat:7') {
    return emitter({
        name,
        state: 'joining',
        error: null as string | null,
        members: new Map<string, unknown>(),
        count: null as number | null,
        emit: vi.fn(),
        emitWithAck: vi.fn(async () => ({ id: '1', at: 1 })),
    });
}

/** What a call or a group call sends, which only reads as changed once asked again, as the real tracks do. */
function ownTracks() {
    const tracks: Record<string, unknown> = {};
    return {
        get camera() {
            return (tracks.camera ?? null) as MediaStreamTrack | null;
        },
        get microphone() {
            return (tracks.microphone ?? null) as MediaStreamTrack | null;
        },
        get screen() {
            return (tracks.screen ?? null) as MediaStreamTrack | null;
        },
        setCamera: vi.fn(async (on: boolean) => {
            tracks.camera = on ? 'camera-track' : null;
        }),
        setMicrophone: vi.fn(async (on: boolean) => {
            tracks.microphone = on ? 'microphone-track' : null;
        }),
        setScreenShare: vi.fn(async (on: boolean) => {
            tracks.screen = on ? 'screen-track' : null;
            return on;
        }),
    };
}

/** A call as rt.call() and incoming.accept() make it. */
export function aCall() {
    return emitter(Object.defineProperties(
        {
            peer: { user: 34, info: { name: 'Ann' } },
            state: 'ringing',
            remote: { camera: null, microphone: null, screen: null, screenAudio: null, media: {}, quality: 'unknown' },
            end: vi.fn(function (this: { fire(event: string, reason: string): void }) {
                this.fire('ended', 'hangup');
            }),
        },
        Object.getOwnPropertyDescriptors(ownTracks()),
    ));
}

/** A group call as rt.groupCall() makes it. */
export function aGroup() {
    return emitter(Object.defineProperties(
        {
            state: 'connected',
            self: { user: 42 },
            people: vi.fn((): unknown[] => [{ identity: 'user_34', user: 34 }]),
            leave: vi.fn(),
        },
        Object.getOwnPropertyDescriptors(ownTracks()),
    ));
}

/** A live stream as rt.stream() makes it: `change()` is the real one hearing something new. */
export function aStream() {
    const listeners = new Set<() => void>();
    let now: Record<string, unknown> = { status: 'ready', media: 'live', viewers: 1 };
    const stopWatching = vi.fn();

    return {
        snapshot: vi.fn(() => now),
        subscribe: vi.fn((listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }),
        watch: vi.fn((_video: unknown) => stopWatching),
        leave: vi.fn(),
        stopWatching,
        listening: () => listeners.size,
        change(next: Record<string, unknown>) {
            now = { ...now, ...next };
            for (const listener of listeners) listener();
        },
    };
}

export function anIncoming(answer: unknown = aCall(), type = 'video') {
    return emitter({ id: 'c1', from: 34, type, state: 'ringing', accept: vi.fn(async () => answer), decline: vi.fn(async () => {}) });
}

export function someCalls() {
    const ringing: unknown[] = [];
    return emitter({
        ringing,
        incoming: vi.fn(() => ringing),
    });
}

export function aConnection(options: unknown = {}, user: string | null = '42') {
    const rooms = new Map<string, ReturnType<typeof aRoom>>();
    const known = new Set<string>();
    const seen = new Map<string, number>();
    const online = emitter({
        count: null as number | null,
        known,
        seen,
        has: (id: number | string) => known.has(String(id)),
        lastSeen: (id: number | string) => seen.get(String(id)) ?? null,
        watch: vi.fn(function (this: unknown) {
            return this;
        }),
    });
    const calls = someCalls();
    const call = aCall();
    const group = aGroup();
    const stream = aStream();

    return emitter({
        options,
        user,
        connected: false,
        rooms,
        online,
        made: { calls, call, group, stream },
        room: vi.fn((name: string) => rooms.get(name)),
        join: vi.fn((name: string) => {
            const room = aRoom(name);
            rooms.set(name, room);
            return room;
        }),
        leave: vi.fn((name: string) => rooms.delete(name)),
        users: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { user_id: id, name: 'User ' + id }]))),
        calls: vi.fn(async () => calls),
        call: vi.fn(async () => call),
        groupCall: vi.fn(async () => group),
        stream: vi.fn(async (_name: string) => stream),
        startCall: vi.fn(async (_token: string) => call),
        joinGroupCall: vi.fn(async (_token: string) => group),
        joinStream: vi.fn(async (_token: unknown) => stream),
        close: vi.fn(),
    });
}
