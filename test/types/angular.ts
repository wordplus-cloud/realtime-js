// What an app's TypeScript sees of the Angular functions, as frameworks.ts has it for Vue and Svelte: a line a compiler
// should refuse has `@ts-expect-error` above it, and the build fails if it is let through. A template's bindings are Angular's
// own compiler's to check (strictTemplates), which this package doesn't install.
import { computed, ElementRef, inject, InjectionToken, signal, viewChild, type EnvironmentProviders, type Signal } from '@angular/core';
import {
    injectCall, injectCalls, injectConnection, injectGroupCall, injectOnline, injectPresence, injectProfiles, injectRealtime, injectRoom, injectStream, injectStreamVideo, injectTrack, injectTyping, injectUserEvent, provideRealtime,
} from '../../src/angular.js';
import type { Call, GroupCall, Incoming, Person, Realtime, RemoteTrack, Stream, StreamSnapshot, UserProfile } from '../../src/browser.js';

type Chat = { message: { text: string }; typing: { on: boolean } };
type Member = { name: string };

/** A session of the app's own, its realtime settings a signal. */
const SESSION = new InjectionToken<{ realtime: Signal<{ app: string; endpoint: string }> }>('session');

export function providers(): EnvironmentProviders[] {
    const options = signal({ app: 's1500000007' });
    return [
        provideRealtime(),
        provideRealtime({ app: 's1500000007' }),
        provideRealtime(options),
        provideRealtime(() => inject(SESSION).realtime()),
        // @ts-expect-error Its options are connect()'s.
        provideRealtime({ app: 7 }),
    ];
}

export function angular() {
    const name = signal<string | null>('chat:7');
    injectRoom(name);
    injectRoom(() => name());
    injectRoom(computed(() => name()));
    injectRoom(null);
    injectRoom('chat:{pair}', {}, { with: signal<number | null>(null) });
    injectRoom('chat:{pair}', {}, { with: () => 34 });

    // Unnamed: any event, any data.
    injectRoom('order:42', { updated: (data, meta) => [data.anything, meta.from] }).emit('anything', 1);

    // One handler typed and the other not: the other's data is any, and emit() takes any event.
    injectRoom('chat:7', { message: (message: { text: string }) => message.text, typing: (typing) => typing.anything }).emit('read', 1);

    const chat = injectRoom<Chat, Member>('chat:7', {
        message: (message, meta) => [message.text.length, meta.from],
        // The room's own events, whatever it carries.
        kicked: (error) => error.code,
        join: (member) => member.info.name,
        count: (count) => count + 1,
    });
    chat.emit('typing', { on: true });
    const state: string = chat.state();
    const error: string | null = chat.error();
    const first: string | undefined = chat.members()[0]?.info.name;
    const count: number | null = chat.count();
    chat.room()?.volatile.emit('typing', { on: false });
    void chat.emitWithAck('message', { text: 'Hi' }).then(({ id, at }) => [id.length, at + 1]);

    // @ts-expect-error A named room's events are the ones named.
    chat.emit('nonsense');
    // @ts-expect-error As is what they carry.
    chat.emit('typing', { on: 'yes' });
    // @ts-expect-error
    injectRoom<Chat>('chat:7', { message: (message) => message.nothing });
    // @ts-expect-error Its state is the room's, and read only.
    chat.state.set('joined');

    const rt: Realtime | null = injectRealtime()();
    // @ts-expect-error The connection is the provider's, and read only.
    injectRealtime().set(null);
    const { connected, error: failure } = injectConnection();
    const up: boolean = connected();
    const failed = failure();
    const why: string | undefined = failed && 'code' in failed ? failed.code : undefined;
    injectUserEvent('notice', (data, meta) => [data.anything, meta.at]);
    injectUserEvent(signal('notice'), () => {});

    const inLobby: string | undefined = injectPresence<Member>('lobby')()[0]?.info.name;
    const { online, lastSeen, count: across } = injectOnline(signal([34, 'auth0|5f7c']), { count: true });
    const isOn: boolean | undefined = online()[34];
    const seenAt: number | undefined = lastSeen()[34];
    const howMany: number | null = across();
    const profile: UserProfile | undefined = injectProfiles(() => [34])()[34];
    const writers: string[] = injectTyping(chat)();
    injectTyping(chat.room);
    injectTyping(() => chat.room());
    injectTyping(chat, signal('writing'), 2000);

    const ringing: Incoming[] = injectCalls().incoming();
    const current = injectCall();
    const placed: Call | null = current.call();
    const theirs: RemoteTrack | null | undefined = current.remote()?.camera;
    const mine: MediaStreamTrack | null = current.camera();
    const peer: number | string | undefined = current.peer()?.user;
    void current.start('support:{pair}', { to: 34, type: 'audio', devices: false });
    void current.answer(ringing[0], { devices: false });
    void current.setCamera(true);
    current.end();
    void current.start('a token from your server');
    void current.start('a token from your server', { devices: false });
    // @ts-expect-error A call starts with a token from your server, not with whom it calls.
    void current.start(34);

    const meeting = injectGroupCall(() => 'meeting:7', { type: signal<'audio' | 'video'>('video') });
    const joined: GroupCall | null = meeting.group();
    const people: Person[] = meeting.people();
    void meeting.setMicrophone(false);
    injectGroupCall(null);
    injectGroupCall('meeting:7', async () => 'a token from your server');
    // @ts-expect-error A group call's type is audio or video.
    injectGroupCall('meeting:7', { type: 'screen' });

    const show = injectStream(() => 'show:7', () => 'a token from your server');
    const stream: Stream | null = show.stream();
    const snapshot: StreamSnapshot | null = show.state();
    const refused: string | null = show.error();
    injectStream(null);
    void [stream, snapshot, refused];

    // The elements, as a template gives them: viewChild()'s signal, inject( ElementRef ) in a directive, or one itself.
    const video: Signal<ElementRef<HTMLVideoElement> | undefined> = viewChild<ElementRef<HTMLVideoElement>>('video');
    injectTrack(video, () => current.remote()?.camera);
    injectTrack(inject(ElementRef), current.camera);
    injectTrack(document.createElement('audio'), meeting.microphone);
    injectStreamVideo(video, show.stream);
    // @ts-expect-error A stream goes on a <video>, not an <audio>.
    injectStreamVideo(viewChild<ElementRef<HTMLAudioElement>>('sound'), show.stream);
    // @ts-expect-error A track is a track.
    injectTrack(video, () => show.stream());

    return [state, error, first, count, rt, up, why, inLobby, isOn, seenAt, howMany, profile, writers, placed, theirs, mine, peer, joined, people];
}
