// What an app's TypeScript sees of the Vue and Svelte helpers, as test/types/api.ts has it for the rest: a line a compiler
// should refuse has `@ts-expect-error` above it, and the build fails if it is let through.
import { ref } from 'vue';
import {
    AudioTrack, provideRealtime as provideVue, StreamVideo, useCall as callVue, useCalls as callsVue, useConnection as connectionVue, useGroupCall as groupVue, useOnline as onlineVue, usePresence as presenceVue, useProfiles as profilesVue,
    useRealtime as realtimeVue, useRoom as roomVue, useStream as streamVue, useTyping as typingVue, useUserEvent as userEventVue, VideoTrack,
} from '../../src/vue.js';
import {
    provideRealtime as provideSvelte, streamVideo, track, useCall as callSvelte, useCalls as callsSvelte, useConnection as connectionSvelte, useGroupCall as groupSvelte, useOnline as onlineSvelte, usePresence as presenceSvelte,
    useProfiles as profilesSvelte, useRealtime as realtimeSvelte, useRoom as roomSvelte, useStream as streamSvelte, useTyping as typingSvelte, useUserEvent as userEventSvelte,
} from '../../src/svelte.js';
import type { Call, GroupCall, Incoming, Person, Realtime, RemoteTrack, Stream, StreamSnapshot, UserProfile } from '../../src/browser.js';

type Chat = { message: { text: string }; typing: { on: boolean } };
type Member = { name: string };

export function vue() {
    provideVue();
    provideVue({ app: 's1500000007' });
    provideVue(ref({ app: 's1500000007' }));
    provideVue(() => ({ app: 's1500000007' }));

    const name = ref<string | null>('chat:7');
    roomVue(name);
    roomVue(() => name.value);
    roomVue(null);
    roomVue('chat:{pair}', {}, { with: ref<number | null>(null) });
    roomVue('chat:{pair}', {}, { with: () => 34 });

    // Unnamed: any event, any data.
    roomVue('order:42', { updated: (data, meta) => [data.anything, meta.from] }).emit('anything', 1);

    // One handler typed and the other not: the other's data is any, and emit() takes any event.
    roomVue('chat:7', { message: (message: { text: string }) => message.text, typing: (typing) => typing.anything }).emit('read', 1);

    const chat = roomVue<Chat, Member>('chat:7', {
        message: (message, meta) => [message.text.length, meta.from],
        // The room's own events, whatever it carries.
        kicked: (error) => error.code,
        join: (member) => member.info.name,
        count: (count) => count + 1,
    });
    chat.emit('typing', { on: true });
    const state: string = chat.state.value;
    const error: string | null = chat.error.value;
    const first: string | undefined = chat.members.value[0]?.info.name;
    const count: number | null = chat.count.value;
    chat.room.value?.volatile.emit('typing', { on: false });
    void chat.emitWithAck('message', { text: 'Hi' }).then(({ id, at }) => [id.length, at + 1]);

    // @ts-expect-error A named room's events are the ones named.
    chat.emit('nonsense');
    // @ts-expect-error As is what they carry.
    chat.emit('typing', { on: 'yes' });
    // @ts-expect-error
    roomVue<Chat>('chat:7', { message: (message) => message.nothing });
    // @ts-expect-error Its state is the room's, and read only.
    chat.state.value = 'joined';

    const rt: Realtime | null = realtimeVue().value;
    const { connected, error: failure } = connectionVue();
    const up: boolean = connected.value;
    const why: string | undefined = failure.value && 'code' in failure.value ? failure.value.code : undefined;
    userEventVue('notice', (data, meta) => [data.anything, meta.at]);
    userEventVue(() => 'notice', () => {});

    const inLobby: string | undefined = presenceVue<Member>('lobby').value[0]?.info.name;
    const { online, lastSeen, count: across } = onlineVue(ref([34, 'auth0|5f7c']), { count: true });
    const isOn: boolean | undefined = online.value[34];
    const seenAt: number | undefined = lastSeen.value[34];
    const howMany: number | null = across.value;
    const profile: UserProfile | undefined = profilesVue(() => [34]).value[34];
    const writers: string[] = typingVue(chat).value;
    typingVue(chat.room);
    typingVue(() => chat.room.value);

    const ringing: Incoming[] = callsVue().incoming.value;
    const current = callVue();
    const placed: Call | null = current.call.value;
    const theirs: RemoteTrack | null | undefined = current.remote.value?.camera;
    const mine: MediaStreamTrack | null = current.camera.value;
    const peer: number | string | undefined = current.peer.value?.user;
    void current.start('support:{pair}', { to: 34, type: 'audio', devices: false });
    void current.answer(ringing[0], { devices: false });
    void current.setCamera(true);
    current.end();
    void current.start('a token from your server');
    void current.start('a token from your server', { devices: false });
    // @ts-expect-error A call starts with a token from your server, not with whom it calls.
    void current.start(34);
    // @ts-expect-error What it says is read only.
    current.state.value = 'connected';

    const meeting = groupVue(() => 'meeting:7', { type: ref<'audio' | 'video'>('video') });
    const joined: GroupCall | null = meeting.group.value;
    const people: Person[] = meeting.people.value;
    void meeting.setMicrophone(false);
    groupVue(null);

    const show = streamVue(() => 'show:7');
    const stream: Stream | null = show.stream.value;
    const snapshot: StreamSnapshot | null = show.state.value;
    const refused: string | null = show.error.value;
    // @ts-expect-error What it says is read only.
    show.error.value = null;
    streamVue(null);
    void [stream, snapshot, refused];

    // The components, as a template or a render function gives them a track.
    void [VideoTrack, AudioTrack, StreamVideo];

    return [state, error, first, count, rt, up, why, inLobby, isOn, seenAt, howMany, profile, writers, placed, theirs, mine, peer, joined, people];
}

export function svelte() {
    provideSvelte();
    provideSvelte({ app: 's1500000007' });
    provideSvelte(() => ({ app: 's1500000007' }));

    roomSvelte(() => 'chat:7');
    roomSvelte(null);
    roomSvelte('chat:{pair}', {}, { with: () => 34 });

    // Unnamed: any event, any data.
    roomSvelte('order:42', { updated: (data, meta) => [data.anything, meta.from] }).emit('anything', 1);

    // One handler typed and the other not: the other's data is any, and emit() takes any event.
    roomSvelte('chat:7', { message: (message: { text: string }) => message.text, typing: (typing) => typing.anything }).emit('read', 1);

    const chat = roomSvelte<Chat, Member>('chat:7', {
        message: (message, meta) => [message.text.length, meta.from],
        // The room's own events, whatever it carries.
        kicked: (error) => error.code,
        join: (member) => member.info.name,
        count: (count) => count + 1,
    });
    chat.emit('typing', { on: true });
    const state: string = chat.state;
    const error: string | null = chat.error;
    const first: string | undefined = chat.members[0]?.info.name;
    const count: number | null = chat.count;
    chat.room?.volatile.emit('typing', { on: false });
    void chat.emitWithAck('message', { text: 'Hi' }).then(({ id, at }) => [id.length, at + 1]);

    // @ts-expect-error A named room's events are the ones named.
    chat.emit('nonsense');
    // @ts-expect-error As is what they carry.
    chat.emit('typing', { on: 'yes' });
    // @ts-expect-error
    roomSvelte<Chat>('chat:7', { message: (message) => message.nothing });
    // @ts-expect-error Its state is the room's, and read only.
    chat.state = 'joined';

    const rt: Realtime | null = realtimeSvelte().current;
    const connection = connectionSvelte();
    const up: boolean = connection.connected;
    const why: string | undefined = connection.error && 'code' in connection.error ? connection.error.code : undefined;
    userEventSvelte('notice', (data, meta) => [data.anything, meta.at]);
    userEventSvelte(() => 'notice', () => {});

    const inLobby: string | undefined = presenceSvelte<Member>('lobby').current[0]?.info.name;
    const status = onlineSvelte(() => [34, 'auth0|5f7c'], { count: true });
    const isOn: boolean | undefined = status.online[34];
    const seenAt: number | undefined = status.lastSeen[34];
    const howMany: number | null = status.count;
    const profile: UserProfile | undefined = profilesSvelte(() => [34]).current[34];
    const writers: string[] = typingSvelte(chat).current;
    typingSvelte(chat.room);
    typingSvelte(() => chat.room);

    const ringing: Incoming[] = callsSvelte().incoming;
    const current = callSvelte();
    const placed: Call | null = current.call;
    const theirs: RemoteTrack | null | undefined = current.remote?.camera;
    const mine: MediaStreamTrack | null = current.camera;
    const peer: number | string | undefined = current.peer?.user;
    void current.start('support:{pair}', { to: 34, type: 'audio', devices: false });
    void current.answer(ringing[0], { devices: false });
    void current.setCamera(true);
    current.end();
    void current.start('a token from your server');
    void current.start('a token from your server', { devices: false });
    // @ts-expect-error A call starts with a token from your server, not with whom it calls.
    void current.start(34);
    // @ts-expect-error What it says is read only.
    current.state = 'connected';

    const meeting = groupSvelte(() => 'meeting:7', { type: () => 'video' });
    const joined: GroupCall | null = meeting.group;
    const people: Person[] = meeting.people;
    void meeting.setMicrophone(false);
    groupSvelte(null);

    const show = streamSvelte(() => 'show:7');
    const stream: Stream | null = show.stream;
    const snapshot: StreamSnapshot | null = show.state;
    // @ts-expect-error What it says is read only.
    show.error = null;
    streamSvelte(null);
    const showing = streamVideo(document.createElement('video'), stream);
    showing.update(null);
    showing.destroy();
    void snapshot;

    // The action, as `use:track={ … }` calls it.
    const action = track(document.createElement('video'), current.remote?.camera);
    action.update(current.camera);
    action.destroy();

    return [state, error, first, count, rt, up, why, inLobby, isOn, seenAt, howMany, profile, writers, placed, theirs, mine, peer, joined, people];
}
