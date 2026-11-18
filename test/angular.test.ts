// @vitest-environment happy-dom
import '@angular/compiler';
import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, Directive, ElementRef, inject, Injectable, Injector, input, Input, provideZonelessChangeDetection, signal, viewChild, ViewChild, type EnvironmentProviders, type Provider, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RemoteTrack } from '../src/browser.js';
import { aConnection, anIncoming } from './framework-fakes.js';

// The functions an app draws its own screens on, in Angular itself: TestBed, with no zone.js, as a new app is made today,
// and components compiled as the test runs, written without decorators so the test needs no compiler step either. What
// they share with Vue and Svelte is test/framework-bindings.test.ts's. test/angular-server.test.ts renders on a server.

const made: Array<ReturnType<typeof aConnection>> = [];

vi.mock('../src/browser.js', () => ({
    connect: vi.fn(async (options: unknown) => {
        const rt = aConnection(options);
        // What the real connection has beside what the other bindings use: injectOnline() lets go of what it watched.
        Object.assign(rt.online, { unwatch: vi.fn(() => rt.online) });
        made.push(rt);
        return rt;
    }),
}));

const {
    injectCall, injectCalls, injectConnection, injectGroupCall, injectOnline, injectPresence, injectProfiles, injectRealtime, injectRoom, injectStream, injectStreamVideo, injectTrack, injectTyping, injectUserEvent, provideRealtime,
} = await import('../src/angular.js');
const browser = await import('../src/browser.js');

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const settle = async () => {
    for (let i = 0; i < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve));
        TestBed.tick();
    }
};

/** The application's providers, as app.config.ts has them: the connection, with what the test adds. */
function withRealtime({ options, providers = [], realtime = true }: { options?: Parameters<typeof provideRealtime>[0]; providers?: Array<Provider | EnvironmentProviders>; realtime?: boolean } = {}) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...(realtime ? [provideRealtime(options)] : []), ...providers] });
}

/**
 * `setup` in a component of the app, drawn now: what it answered, and how the component goes while the app stays. With the
 * connection up already, what it starts has started once this returns, which a test on fake timers needs.
 */
function placeNow<T>(setup: () => T) {
    let seen!: T;
    const Host = Component({ selector: 'test-host', template: '' })(class {
        constructor() {
            seen = setup();
        }
    });
    const fixture = TestBed.createComponent(Host as Type<unknown>);
    TestBed.tick();
    return { seen, unmount: () => fixture.destroy() };
}

/**
 * What Angular's compiler writes for each `input()` and `viewChild()` of a class, as its JIT transform does in a CLI app's
 * tests: a component compiled as the test runs doesn't see them otherwise.
 */
function compiledAs(type: Type<unknown>, fields: Record<string, (target: object, name: string) => void>) {
    for (const [name, decorate] of Object.entries(fields)) decorate(type.prototype, name);
}

/** The same, once the connection it may make is up. */
async function place<T>(setup: () => T) {
    const placed = placeNow(setup);
    await settle();
    return placed;
}

async function mounted<T>(setup: () => T, given: Parameters<typeof withRealtime>[0] = {}) {
    withRealtime(given);
    return place(setup);
}

afterEach(() => {
    TestBed.resetTestingModule();
    made.length = 0;
    vi.mocked(browser.connect).mockClear();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('provideRealtime', () => {
    it('says in the console when a function has none above it', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { seen } = await mounted(() => injectRoom('chat:7'), { realtime: false });

        expect(warn.mock.lastCall?.[0]).toContain('provideRealtime()');
        expect(browser.connect).not.toHaveBeenCalled();
        expect(seen.state()).toBe('idle');
    });

    it('connects once as the application starts, with no options the routes saying which app, and closes as it goes', async () => {
        const { seen } = await mounted(() => injectRealtime());

        expect(browser.connect).toHaveBeenCalledTimes(1);
        expect(made[0].options).toEqual({});
        expect(seen()).toBe(made[0]);

        TestBed.resetTestingModule();
        expect(made[0].close).toHaveBeenCalled();
    });

    it('connects with nothing asking for the connection yet', async () => {
        withRealtime();
        TestBed.inject(Injector);
        await settle();

        expect(browser.connect).toHaveBeenCalledTimes(1);
    });

    it('connects again when its options say something else, as a signal, and not for the same again', async () => {
        const options = signal<{ app: string }>({ app: 's1' });
        const { seen } = await mounted(() => injectRealtime(), { options });

        options.set({ app: 's1' });
        await settle();
        expect(made).toHaveLength(1);

        options.set({ app: 's2' });
        await settle();
        expect(made).toHaveLength(2);
        expect(made[0].close).toHaveBeenCalled();
        expect(seen()).toBe(made[1]);
    });

    it('takes its options from a service of the app, as a function that injects it', async () => {
        const Session = Injectable({ providedIn: 'root' })(class {
            readonly user = signal('42');
            readonly realtime = computed(() => ({ app: 's1', user: this.user() }));
        });
        await mounted(() => injectRealtime(), { options: () => inject(Session).realtime() });
        expect(made[0].options).toEqual({ app: 's1', user: '42' });

        TestBed.inject(Session).user.set('43');
        await settle();
        expect(made[1].options).toEqual({ app: 's1', user: '43' });
        expect(made[0].close).toHaveBeenCalled();
    });

    it('is refused where inject() is, outside a field initializer or a constructor, naming the function', () => {
        expect(() => injectRoom('chat:7')).toThrow(/injectRoom/);
    });
});

describe('injectConnection', () => {
    it('says whether the connection is up, and why it was refused until it connects', async () => {
        const { seen } = await mounted(() => injectConnection());

        expect(seen.connected()).toBe(false);
        made[0].fire('connected');
        expect(seen.connected()).toBe(true);
        made[0].fire('disconnected');
        expect(seen.connected()).toBe(false);

        made[0].fire('error', { code: 'wrong_origin' });
        expect(seen.error()).toEqual({ code: 'wrong_origin' });
        made[0].fire('connected');
        expect(seen.error()).toBeNull();
    });
});

describe('injectRoom', () => {
    it('joins as the component comes, stays current, and leaves as it goes', async () => {
        const { seen, unmount } = await mounted(() => injectRoom('chat:7'));
        const room = made[0].rooms.get('chat:7')!;

        expect(seen.state()).toBe('joining');
        expect(seen.room()).toBe(room);

        room.state = 'joined';
        room.count = 2;
        room.members.set('34', { name: 'Ann' });
        room.fire('joined', []);
        expect(seen.state()).toBe('joined');
        expect(seen.members()).toEqual([{ id: '34', info: { name: 'Ann' } }]);
        expect(seen.count()).toBe(2);

        unmount();
        expect(made[0].leave).toHaveBeenCalledWith('chat:7');
        expect(made[0].close).not.toHaveBeenCalled();
    });

    it('gives its handlers each event, and error covers a rule that says no and a kick', async () => {
        const handlers = { message: vi.fn(), kicked: vi.fn() };
        const { seen } = await mounted(() => injectRoom('chat:7', handlers));
        const room = made[0].rooms.get('chat:7')!;

        room.fire('message', { text: 'Hi' }, { from: '34' });
        expect(handlers.message).toHaveBeenCalledWith({ text: 'Hi' }, { from: '34' });

        room.state = 'failed';
        room.error = 'forbidden';
        room.fire('error', { code: 'forbidden' });
        expect(seen.error()).toBe('forbidden');

        room.error = 'kicked';
        room.fire('kicked', { code: 'kicked' });
        expect(seen.error()).toBe('kicked');
        expect(handlers.kicked).toHaveBeenCalledTimes(1);
    });

    it('moves to another room as its name changes, and joins nothing for null', async () => {
        const name = signal<string | null>('chat:7');
        const { seen } = await mounted(() => injectRoom(name));

        name.set('chat:8');
        await settle();
        expect(made[0].leave).toHaveBeenCalledWith('chat:7');
        expect(made[0].join).toHaveBeenLastCalledWith('chat:8');

        name.set(null);
        await settle();
        expect(made[0].leave).toHaveBeenCalledWith('chat:8');
        expect(seen.state()).toBe('idle');
        expect(seen.room()).toBeNull();
    });

    it('stays in its room when what its name is read from changes and the name does not', async () => {
        const id = signal(7);
        await mounted(() => injectRoom(() => (id() > 0 ? 'chat:7' : 'chat:0')));

        id.set(8);
        await settle();

        expect(made[0].join).toHaveBeenCalledTimes(1);
        expect(made[0].leave).not.toHaveBeenCalled();
    });

    it('waits for `with` on {pair}, then joins the room of the two', async () => {
        const other = signal<number | null>(null);
        const { seen } = await mounted(() => injectRoom('chat:{pair}', {}, { with: other }));

        expect(seen.state()).toBe('idle');
        expect(made[0].join).not.toHaveBeenCalled();

        other.set(34);
        await settle();
        expect(made[0].join).toHaveBeenCalledWith('chat:34:42');
    });

    it('keeps its room when the connection only drops, as the room comes back by itself', async () => {
        await mounted(() => injectRoom('chat:7'));

        made[0].fire('disconnected');
        made[0].fire('connected');
        await settle();

        expect(made[0].join).toHaveBeenCalledTimes(1);
        expect(made[0].leave).not.toHaveBeenCalled();
    });

    it('sends to the room, and refuses with not_joined when there is none', async () => {
        withRealtime();
        const { seen } = await place(() => injectRoom('chat:7'));
        seen.emit('message', { text: 'Hi' });
        expect(made[0].rooms.get('chat:7')!.emit).toHaveBeenCalledWith('message', { text: 'Hi' });
        await expect(seen.emitWithAck('message', { text: 'Hi' })).resolves.toEqual({ id: '1', at: 1 });

        const none = await place(() => injectRoom(null));
        expect(() => none.seen.emit('message')).not.toThrow();
        await expect(none.seen.emitWithAck('message')).rejects.toMatchObject({ code: 'not_joined' });
    });

    it('is held by each component that joins it, and left as the last goes', async () => {
        withRealtime();
        const first = await place(() => injectRoom('chat:7'));
        const second = await place(() => injectRoom('chat:7'));
        expect(made[0].join).toHaveBeenCalledTimes(1);

        first.unmount();
        expect(made[0].leave).not.toHaveBeenCalled();
        second.unmount();
        expect(made[0].leave).toHaveBeenCalledWith('chat:7');
    });
});

describe('injectPresence', () => {
    it('lists who is in the room as that changes', async () => {
        const { seen } = await mounted(() => injectPresence('lobby'));
        const room = made[0].rooms.get('lobby')!;

        room.members.set('34', { name: 'Ann' });
        room.fire('join', { id: '34' });

        expect(seen()).toEqual([{ id: '34', info: { name: 'Ann' } }]);
    });
});

describe('injectOnline', () => {
    it('says who of them is online as that changes, and follows new ids, not a new array of the same', async () => {
        const ids = signal([34]);
        const { seen } = await mounted(() => injectOnline(ids));
        const { online } = made[0];

        expect(online.watch).toHaveBeenLastCalledWith(['34']);
        expect(seen.online()).toEqual({ 34: false });

        online.known.add('34');
        online.fire('change', { id: '34', online: true });
        expect(seen.online()).toEqual({ 34: true });

        online.watch.mockClear();
        ids.set([34]);
        await settle();
        expect(online.watch).not.toHaveBeenCalled();

        ids.set([34, 42]);
        await settle();
        expect(online.watch).toHaveBeenLastCalledWith(['34', '42']);
    });

    it('says how many are online with `count`', async () => {
        const { seen } = await mounted(() => injectOnline([], { count: true }));

        made[0].online.count = 7;
        made[0].online.fire('count', 7);

        expect(seen.count()).toBe(7);
    });

    it('lets go of what it watched as the component goes, five seconds later, and hears nothing more', async () => {
        const { seen, unmount } = await mounted(() => injectOnline([34]));
        const { online } = made[0];
        vi.useFakeTimers();

        unmount();
        vi.advanceTimersByTime(4900);
        expect(online.unwatch).not.toHaveBeenCalled();
        vi.advanceTimersByTime(200);
        expect(online.unwatch).toHaveBeenCalledWith(['34']);

        online.known.add('34');
        online.fire('change', { id: '34', online: true });
        expect(seen.online()).toEqual({ 34: false });
    });

    it('keeps an id that another component still watches, and unwatches it once neither does', async () => {
        withRealtime();
        const first = await place(() => injectOnline([34, 42]));
        const second = await place(() => injectOnline([34]));
        const { online } = made[0];
        vi.useFakeTimers();

        first.unmount();
        vi.advanceTimersByTime(6000);
        expect(online.unwatch).toHaveBeenCalledTimes(1);
        expect(online.unwatch).toHaveBeenCalledWith(['42']);

        second.unmount();
        vi.advanceTimersByTime(6000);
        expect(online.unwatch).toHaveBeenLastCalledWith(['34']);
    });

    it('keeps the ids that stay as its ids change, and lets go of the one that went', async () => {
        const ids = signal<Array<number | string>>([34, 42]);
        await mounted(() => injectOnline(ids));
        const { online } = made[0];
        vi.useFakeTimers();

        ids.set([34]);
        TestBed.tick();
        vi.advanceTimersByTime(6000);

        expect(online.unwatch).toHaveBeenCalledTimes(1);
        expect(online.unwatch).toHaveBeenCalledWith(['42']);
    });

    it('keeps a person a component lets go of and the next takes within the five seconds, and asks the server nothing again', async () => {
        withRealtime();
        const first = await place(() => injectOnline([34]));
        const { online } = made[0];
        vi.useFakeTimers();

        first.unmount();
        vi.advanceTimersByTime(1000);
        online.watch.mockClear();
        placeNow(() => injectOnline([34]));
        vi.advanceTimersByTime(6000);

        expect(online.unwatch).not.toHaveBeenCalled();
        // The other bindings' own watch, which the connection takes as one it has: none from what counts them.
        expect(online.watch).toHaveBeenCalledTimes(1);
    });
});

describe('injectProfiles', () => {
    it('adds the names of the people asked for as they arrive', async () => {
        const ids = signal([34]);
        const { seen } = await mounted(() => injectProfiles(ids));
        expect(seen()[34]?.name).toBe('User 34');

        ids.set([42]);
        await settle();
        expect(seen()[34]?.name).toBe('User 34');
        expect(seen()[42]?.name).toBe('User 42');
    });
});

describe('injectTyping', () => {
    it('takes what injectRoom() answered, and a room\'s other news restarts nothing', async () => {
        const { seen } = await mounted(() => injectTyping(injectRoom('chat:7')));
        const room = made[0].rooms.get('chat:7')!;

        room.fire('typing', { on: true }, { from: '34' });
        await settle();
        expect(seen()).toEqual(['34']);

        room.fire('join', { id: '43' });
        await settle();
        expect(seen()).toEqual(['34']);
    });

    it('takes a room, or a signal or a function of one', async () => {
        const held = signal<any>(null);
        const { seen } = await mounted(() => injectTyping(held));
        const rt = made[0];
        expect(seen()).toEqual([]);

        held.set(rt.join('chat:9'));
        await settle();
        rt.rooms.get('chat:9')!.fire('typing', { on: true }, { from: '34' });
        expect(seen()).toEqual(['34']);
    });
});

describe('injectUserEvent', () => {
    it('hears what the server sends the user while the component is on the page', async () => {
        const handler = vi.fn();
        const { unmount } = await mounted(() => injectUserEvent('notice', handler));

        made[0].fire('notice', { text: 'Hi' }, { at: 1 });
        expect(handler).toHaveBeenCalledWith({ text: 'Hi' }, { at: 1 });

        unmount();
        made[0].fire('notice', { text: 'Again' }, { at: 2 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('injectCalls', () => {
    it('loads the calls, and says what rings as it changes', async () => {
        const { seen } = await mounted(() => injectCalls());
        const { calls } = made[0].made;
        expect(seen.calls()).toBe(calls);
        expect(seen.incoming()).toEqual([]);

        const ring = anIncoming();
        calls.ringing.push(ring);
        calls.fire('incoming', ring);
        expect(seen.incoming()).toEqual([ring]);
    });

    it('says what they were refused with', async () => {
        vi.mocked(browser.connect).mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.calls.mockRejectedValueOnce(Object.assign(new Error('no_webrtc'), { code: 'no_webrtc' }));
            made.push(rt);
            return rt as never;
        });
        const { seen } = await mounted(() => injectCalls());

        expect(seen.error()).toBe('no_webrtc');
        expect(seen.calls()).toBeNull();
    });
});

describe('injectCall', () => {
    it('starts with no call, places one with what its type asks for, and ends it as the component goes', async () => {
        const { seen, unmount } = await mounted(() => injectCall());
        expect(seen.state()).toBe('idle');
        expect(seen.call()).toBeNull();

        await seen.start('support:{pair}', { to: 34 });
        await settle();
        const { call } = made[0].made;
        expect(seen.call()).toBe(call);
        expect(seen.state()).toBe('ringing');
        expect(seen.camera()).toBe('camera-track');

        call.fire('state', 'connected');
        expect(seen.state()).toBe('connected');

        unmount();
        expect(call.end).toHaveBeenCalled();
    });

    it('answers what rings, turns its camera off and on, and says why it ended', async () => {
        const { seen } = await mounted(() => injectCall());
        const { call } = made[0].made;

        await seen.answer(anIncoming(call) as never);
        await settle();
        expect(seen.peer()).toEqual(call.peer);

        await seen.setCamera(false);
        expect(seen.camera()).toBeNull();

        seen.end();
        expect(seen.state()).toBe('idle');
        expect(seen.endReason()).toBe('hangup');
    });

    it('says not_connected for a call started before the connection is up', async () => {
        const { seen } = await mounted(() => injectCall(), { realtime: false });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        await seen.start('a-token');
        expect(seen.error()).toBe('not_connected');
    });
});

describe('a token from the app\'s own server', () => {
    it('injectCall() starts the call in it', async () => {
        const { seen } = await mounted(() => injectCall());
        await seen.start('a-token');
        expect(made[0].startCall).toHaveBeenCalledWith('a-token');
        expect(made[0].call).not.toHaveBeenCalled();
    });

    it('injectGroupCall() asks for it, and joins the call it names, once while the name stays', async () => {
        const getToken = vi.fn(async () => 'a-token');
        const name = signal<string | null>('meeting:7');
        const { seen } = await mounted(() => injectGroupCall(name, getToken));
        await settle();
        expect(getToken).toHaveBeenCalledTimes(1);
        expect(made[0].joinGroupCall).toHaveBeenCalledWith('a-token');
        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(seen.group()).toBe(made[0].made.group);
    });

    it('injectGroupCall() says why when the app\'s route refuses', async () => {
        const getToken = vi.fn(async () => { throw Object.assign(new Error('forbidden'), { code: 'forbidden' }); });
        const { seen } = await mounted(() => injectGroupCall('meeting:7', getToken));
        await settle();
        expect(seen.error()).toBe('forbidden');
        expect(made[0].joinGroupCall).not.toHaveBeenCalled();
    });

    it('injectStream() joins with the function, for the SDK to ask again as each token runs out', async () => {
        const getToken = vi.fn(async () => 'a-token');
        await mounted(() => injectStream('show:7', getToken));
        await settle();
        expect(made[0].joinStream).toHaveBeenCalledWith(getToken);
        expect(made[0].stream).not.toHaveBeenCalled();
    });
});

describe('injectGroupCall', () => {
    it('joins, says who is in it, and leaves as its name goes or the component does', async () => {
        const name = signal<string | null>('meeting:7');
        const { seen, unmount } = await mounted(() => injectGroupCall(name, { type: 'audio' }));
        const { group } = made[0].made;

        expect(made[0].groupCall).toHaveBeenCalledWith('meeting:7', { type: 'audio' });
        expect(seen.group()).toBe(group);
        expect(seen.state()).toBe('connected');
        expect(seen.people()).toEqual([{ identity: 'user_34', user: 34 }]);
        expect(seen.self()).toEqual({ user: 42 });

        await seen.setCamera(true);
        expect(seen.camera()).toBe('camera-track');

        group.people.mockReturnValue([{ identity: 'user_34', user: 34 }, { identity: 'user_43', user: 43 }]);
        group.fire('person', { identity: 'user_43' });
        expect(seen.people()).toHaveLength(2);

        name.set(null);
        await settle();
        expect(group.leave).toHaveBeenCalledTimes(1);
        expect(seen.state()).toBe('idle');

        name.set('meeting:7');
        await settle();
        unmount();
        expect(group.leave).toHaveBeenCalledTimes(2);
    });

    it('joins nothing for null', async () => {
        const { seen } = await mounted(() => injectGroupCall(null));

        expect(made[0].groupCall).not.toHaveBeenCalled();
        expect(seen.state()).toBe('idle');
    });

    it('says what it was refused with', async () => {
        vi.mocked(browser.connect).mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.groupCall.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
            made.push(rt);
            return rt as never;
        });
        const { seen } = await mounted(() => injectGroupCall('meeting:7'));

        expect(seen.error()).toBe('forbidden');
    });
});

describe('injectStream', () => {
    it('joins, says how it is as it changes, and leaves as its name goes or the component does', async () => {
        const name = signal<string | null>('show:7');
        const { seen, unmount } = await mounted(() => injectStream(name));
        const { stream } = made[0].made;

        expect(made[0].stream).toHaveBeenCalledWith('show:7');
        expect(seen.stream()).toBe(stream);
        expect(seen.state()?.viewers).toBe(1);

        stream.change({ viewers: 5 });
        expect(seen.state()?.viewers).toBe(5);

        name.set(null);
        await settle();
        expect(stream.leave).toHaveBeenCalledTimes(1);
        expect(seen.stream()).toBeNull();
        expect(seen.state()).toBeNull();

        name.set('show:7');
        await settle();
        unmount();
        expect(stream.leave).toHaveBeenCalledTimes(2);
    });

    it('joins nothing for null', async () => {
        const { seen } = await mounted(() => injectStream(null));

        expect(made[0].stream).not.toHaveBeenCalled();
        expect(seen.stream()).toBeNull();
    });

    it('says what it was refused with', async () => {
        vi.mocked(browser.connect).mockImplementationOnce(async (options) => {
            const rt = aConnection(options);
            rt.stream.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
            made.push(rt);
            return rt as never;
        });
        const { seen } = await mounted(() => injectStream('show:7'));

        expect(seen.error()).toBe('forbidden');
    });
});

describe('injectTrack and injectStreamVideo', () => {
    const track = () => ({ attach: vi.fn(), detach: vi.fn() });

    /** A component with a `<video #video>` it shows `given` on, which an `@if` may take off the page. */
    async function drawn(given: ReturnType<typeof signal<any>>, show = signal(true), what: 'track' | 'stream' = 'track') {
        withRealtime({ realtime: false });
        const Screen = class {
            show = show;
            video = viewChild<ElementRef<HTMLVideoElement>>('video');
            constructor() {
                if (what === 'track') injectTrack(this.video, given);
                else injectStreamVideo(this.video, given);
            }
        };
        compiledAs(Screen, { video: ViewChild('video', { isSignal: true } as never) });
        Component({ selector: 'test-screen', template: '@if ( show() ) { <video #video autoplay playsinline muted></video> }' })(Screen);
        const fixture = TestBed.createComponent(Screen);
        await settle();
        return { fixture, element: () => fixture.componentInstance.video()?.nativeElement };
    }

    it('attach a track as it comes, let it go as another does, as it leaves and as the element goes', async () => {
        const first = track();
        const second = track();
        const given = signal<any>(first);
        const show = signal(true);
        const { fixture, element } = await drawn(given, show);
        const video = element()!;
        expect(first.attach).toHaveBeenCalledWith(video);

        given.set(second);
        await settle();
        expect(first.detach).toHaveBeenCalledWith(video);
        expect(second.attach).toHaveBeenCalledWith(video);

        show.set(false);
        await settle();
        expect(second.detach).toHaveBeenCalledTimes(1);

        show.set(true);
        await settle();
        expect(second.attach).toHaveBeenCalledTimes(2);
        fixture.destroy();
        expect(second.detach).toHaveBeenCalledTimes(2);
    });

    it('show this page\'s own track muted, and give the element back as it was', async () => {
        const own = { kind: 'video' } as unknown as MediaStreamTrack;
        // happy-dom's own, holding the tracks it was given, as its srcObject takes no other.
        const Page = globalThis.MediaStream;
        vi.stubGlobal('MediaStream', class extends Page {
            constructor(readonly tracks: unknown[]) {
                super();
            }
        });
        const given = signal<any>(null);
        const { element } = await drawn(given);
        const video = element()!;
        // As the page had it, which the template's `muted` said otherwise.
        video.muted = false;
        given.set(own);
        await settle();

        expect(video.muted).toBe(true);
        expect((video.srcObject as unknown as { tracks: unknown[] }).tracks).toEqual([own]);
        given.set(null);
        await settle();
        expect(video.srcObject).toBeNull();
        expect(video.muted).toBe(false);
        vi.unstubAllGlobals();
    });

    it('take the element from a directive of the app\'s own, as inject( ElementRef ) gives it', async () => {
        withRealtime({ realtime: false });
        const remote = track();
        // The docs' directive, as they write it.
        const TrackDirective = class {
            readonly track = input<RemoteTrack | MediaStreamTrack | null | undefined>();
            constructor() {
                injectTrack(inject(ElementRef), this.track);
            }
        };
        compiledAs(TrackDirective, { track: Input({ isSignal: true, alias: 'track', required: false } as never) });
        Directive({ selector: 'video[track], audio[track]' })(TrackDirective);
        const Tiles = Component({
            selector: 'test-tiles',
            imports: [TrackDirective],
            template: '@for ( person of people(); track person.identity ) { <video [track]="person.camera" autoplay playsinline muted></video> }',
        })(class {
            people = signal([{ identity: 'user_34', camera: remote }]);
        });
        const fixture = TestBed.createComponent(Tiles as Type<{ people: ReturnType<typeof signal<any[]>> }>);
        await settle();
        const video = (fixture.nativeElement as HTMLElement).querySelector('video');
        expect(remote.attach).toHaveBeenCalledWith(video);

        fixture.componentInstance.people.set([]);
        await settle();
        expect(remote.detach).toHaveBeenCalledWith(video);
    });

    it('show a live stream on a muted video, let it go as another comes and as the component goes', async () => {
        const stream = () => ({ watch: vi.fn(), stop: vi.fn() });
        const first = stream();
        const second = stream();
        first.watch.mockReturnValue(first.stop);
        second.watch.mockReturnValue(second.stop);
        const given = signal<any>(first);
        const { fixture, element } = await drawn(given, signal(true), 'stream');
        const video = element()!;
        expect(first.watch).toHaveBeenCalledWith(video);
        expect(video.muted).toBe(true);

        given.set(second);
        await settle();
        expect(first.stop).toHaveBeenCalledTimes(1);
        expect(second.watch).toHaveBeenCalledTimes(1);

        fixture.destroy();
        expect(second.stop).toHaveBeenCalledTimes(1);
    });
});

describe('the ready-made screens as elements', () => {
    beforeAll(() => {
        // The page's rooms as rt.ui() shares them with the screens' script, then the script itself, as the routes serve it.
        (globalThis as Record<string, unknown>).wordplusRealtimeCalls = { npm: true, page: () => (made[0] ? { rt: made[0], calls: null } : null) };
        (0, eval)(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'realtime-ui.min.js'), 'utf8'));
    });

    /** A component of the app with the elements in its template, its room a signal. */
    async function page(template: string) {
        const room = signal('lobby');
        const loader = vi.fn(async () => ({ messages: [], more: false }));
        const sent = vi.fn();
        withRealtime();
        const Page = Component({ selector: 'test-page', schemas: [CUSTOM_ELEMENTS_SCHEMA], template })(class {
            room = room;
            loader = loader;
            sent = sent;
        });
        const fixture = TestBed.createComponent(Page as Type<unknown>);
        await settle();
        return { fixture, room, loader, sent, find: (tag: string) => (fixture.nativeElement as HTMLElement).querySelector(tag) as HTMLElement & Record<string, unknown> };
    }

    const drawnIn = async (element: HTMLElement, text: string) => {
        await vi.waitFor(() => expect(element.shadowRoot?.textContent).toContain(text), { timeout: 2000 });
    };

    it('<online-count> takes its room from a binding, draws its count, and moves as the binding does', async () => {
        const { room, find } = await page('<online-count [attr.room]="room()"></online-count>');
        const count = find('online-count');
        expect(count.shadowRoot).not.toBeNull();
        expect(count.getAttribute('room')).toBe('lobby');

        const lobby = made[0].rooms.get('lobby')!;
        lobby.count = 7;
        lobby.fire('count', 7);
        await drawnIn(count, '7');

        room.set('shop');
        await settle();
        expect(count.getAttribute('room')).toBe('shop');
        await vi.waitFor(() => expect(made[0].rooms.has('shop')).toBe(true));
        expect(made[0].leave).toHaveBeenCalledWith('lobby');
        const shop = made[0].rooms.get('shop')!;
        shop.count = 3;
        shop.fire('count', 3);
        await drawnIn(count, '3');
    });

    it('<chat-room> takes `load` as a property, its other settings as attributes, and tells the component of `sent`', async () => {
        const { find, loader, sent } = await page('<chat-room [attr.room]="room()" placeholder="Write a message" [load]="loader" (sent)="sent( $event.detail )"></chat-room>');
        const chat = find('chat-room');

        expect(chat.load).toBe(loader);
        expect(chat.getAttribute('placeholder')).toBe('Write a message');
        chat.dispatchEvent(new CustomEvent('sent', { detail: { id: 'm1', text: 'Hi' } }));
        expect(sent).toHaveBeenCalledWith({ id: 'm1', text: 'Hi' });
    });
});
