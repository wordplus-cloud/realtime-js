// What an app's TypeScript sees of the package: the checks in test/types.test.ts compile this file. A line a compiler
// should refuse has `@ts-expect-error` above it, and the build fails if it is let through.
import type { CallQuality, GroupCall, Invite, InviteState, Person, Realtime, RealtimeErrorCode, RealtimeErrorEvent, Room } from '../../src/browser.js';
import { connect } from '../../src/browser.js';
import { createRealtime } from '../../src/server/index.js';
import { AudioTrack, useCall, useConnection, useGroupCall, useRoom, useTyping, VideoTrack } from '../../src/react.js';

type Chat = { message: { text: string }; typing: { on: boolean } };
type Member = { name: string; avatar?: string };

export async function rooms(rt: Realtime) {
    const chat = rt.join<Chat, Member>('chat:34:42');

    chat.on('message', (message, meta) => [message.text.length, meta.from]);
    chat.emit('typing', { on: true });
    await chat.emitWithAck('message', { text: 'Hi' });
    chat.volatile.emit('typing', { on: false });
    await chat.timeout(1000).emitWithAck('message', { text: 'Hi' });

    // @ts-expect-error A named room's events are the ones named.
    chat.on('nonsense', () => {});
    // @ts-expect-error As is what they carry.
    chat.emit('typing', { on: 'yes' });
    // @ts-expect-error
    chat.on('message', (message) => message.nothing);

    // Its own events, whatever it carries.
    chat.on('join', ({ id, info }) => [id, info.name]);
    chat.on('leave', ({ id }) => id);
    chat.on('count', (count) => count + 1);
    chat.on('error', (error) => error.code);
    const members: Map<string, Member> = chat.members;

    const { events } = await chat.history();
    for (const event of events) {
        if (event.event === 'message') event.data.text.length;
    }

    // Unnamed, as ever: any event, any data.
    const open: Room = rt.join('order:42');
    open.on('updated', (data) => data.anything.at.all);
    open.emit('anything', 1);

    return members;
}

export function errors(code: RealtimeErrorCode, event: RealtimeErrorEvent) {
    // A code is one of those named, with the others still allowed from a newer server.
    const known: RealtimeErrorCode = 'not_allowed';
    const newer: RealtimeErrorCode = 'a_code_from_a_newer_server';
    return [known, newer, code, event.code];
}

export async function calls(rt: Realtime) {
    const call = await rt.call('support:{pair}', { to: 34 });
    await call.setCamera(true, { deviceId: 'c1' });
    call.on('state', (state) => state.length);
    call.on('autoplay_blocked', () => call.startAudio());
    // @ts-expect-error A call has no such event.
    call.on('nonsense', () => {});

    const group: GroupCall = await rt.groupCall('meeting:daily', { type: 'audio' });
    group.on('person', (person: Person) => person.quality);
    group.on('spotlit', (users) => users.map(String));
    group.on('quality', (quality: CallQuality) => quality);
    await group.setCamera(true, { deviceId: 'c1' });
    await group.setMicrophone(false);
    await group.mute(34);
    await group.spotlightOff();
    const { cameras } = await group.devices();
    // @ts-expect-error
    group.on('nonsense', () => {});
    // @ts-expect-error A camera is on or off.
    await group.setCamera('yes');

    // A ring into the group call, named from the package as an app keeps a list of its own.
    const invite: Invite = await call.add('a-token');
    const rung: Invite[] = [invite, await group.add('a-token'), ...group.invites()];
    invite.on('state', (state: InviteState) => state);
    group.on('invite', (heard: Invite) => heard.to);
    const ringing: InviteState = 'ringing';
    // @ts-expect-error A ring has only the states named.
    const unknown: InviteState = 'lost';
    await invite.cancel();

    // Not an app's business.
    // @ts-expect-error
    group.livekit;
    // @ts-expect-error
    rt.rooms.rideFor;
    // @ts-expect-error
    rt.join('chat:1').joined;

    const show = await rt.stream('show:42', { video: false });
    show.on('state', (state) => state.length);
    await show.setCamera(true, { deviceId: 'c1' });
    // @ts-expect-error
    show.on('nonsense', () => {});

    return [cameras, rung, ringing, unknown];
}

export function connecting() {
    return [connect(), connect({ app: 's1' }), connect({ site: 's1' })];
}

export function server() {
    const realtime = createRealtime({ user: async () => 42, profile: async () => ({ name: 'Ann' }) });
    createRealtime();
    createRealtime({ app: 's1', secret: 'x', localKey: 'y' });
    createRealtime({ site: 's1', secret: 'x', localKey: 'y' });

    realtime.room('order:{id}', (user, { id }) => user === id, { history: 20 });
    realtime.room('chat:{id}', () => true, { history: { last: 50, seconds: 120 }, presence: true });
    realtime.room('old:{id}', { history: 20 }, () => true);
    realtime.room('news:{id}', { public: true });
    realtime.calls('support:{a}:{b}', () => true, { people: () => [] });
    realtime.groupCalls('meeting:{id}', () => ({ admin: true }), { encrypt: true });
    realtime.streams('show:{id}', () => 'host', { reactions: true });

    // The two people in a name, with no rule to write, or a rule of what is the app's own.
    realtime.calls('support:{pair}');
    realtime.calls('pro:{pair}', (user, withUser, _params, _call, side) => side.role === 'callee' || user === withUser);
    realtime.room('chat:{pair}').room('dm:{pair}', { history: 50 }).room('block:{pair}', (_user, { other }) => other !== '34', { emit: ['message'] });
    // @ts-expect-error Any other call needs its rule.
    realtime.calls('support:{id}');

    // One room by its name.
    const room = realtime.room('chat:7');
    const removed: Promise<void> = room.remove(42);
    const members: Promise<{ count: number }> = room.members();
    const sent: Promise<Record<string, string>> = room.emit('renamed', { title: 'Team' });
    return [removed, members, sent, realtime.in('chat:7').kick(42)];
}

export function nodeRoutes() {
    const realtime = createRealtime();
    // The request Express or Connect passes, with what its middleware put on it (a session, `get()`), as the docs read it.
    realtime.node((req) => req.session.userId ?? null);
    realtime.node((req) => req.get('authorization') === 'Bearer x' ? 42 : null);
    // An app's own request type, Express's Request say, is the one the route takes.
    type ExpressRequest = { headers: Record<string, string | string[] | undefined>; session: { userId?: number }; get(name: string): string | undefined };
    const route: (req: ExpressRequest, res: { statusCode: number; setHeader(name: string, value: string): unknown; end(body: string): unknown }) => Promise<void> = realtime.node((req: ExpressRequest) => req.session.userId);
    // @ts-expect-error What it answers is still a user's id, or none.
    realtime.node((req) => req.headers);
    return route;
}

/** Whether a type is `any`, which nothing but `any` passes. */
type IsAny<T> = 0 extends 1 & T ? true : false;

export function handlersTypedOneByOne() {
    // One handler types its data and the other not: the other's is any, as with none typed, never unknown (A-docs, item 3).
    const chat = useRoom('chat:1', {
        message: (message: { text: string }) => message.text.length,
        typing: (typing) => {
            const any: IsAny<typeof typing> = true;
            return any;
        },
    });
    // The handlers named don't decide the room's events: emit() takes any, as with no handler typed.
    chat.emit('read', { upTo: 3 });
    // A handler's own type still holds inside it.
    // @ts-expect-error
    useRoom('chat:1', { message: (message: { text: string }) => message.body });
}

export function hook() {
    const { room, emit, members } = useRoom<Chat, Member>('chat:1', { message: (message) => message.text.length });
    emit('typing', { on: true });
    // @ts-expect-error
    emit('nonsense');
    // @ts-expect-error
    useRoom<Chat>('chat:1', { nonsense: () => {} });
    useRoom<Chat>('chat:{pair}', { message: (message) => message.text.length }, { with: 34 });
    useRoom('chat:{pair}', {}, { with: null });
    return [room?.name, members.map((member) => member.info.name)];
}

export function rulesKnowTheirParts() {
    const realtime = createRealtime();

    realtime.room('order:{id}', (user, { id }) => id.length > 0 && user !== null);
    realtime.room('chat:{shop}:{id}', (_user, { shop, id }) => shop === id, { history: 20 });
    realtime.room('chat:{pair}', (_user, { pair, other }) => pair.includes(other));
    // @ts-expect-error `order:{id}` has no part called `nonsense`.
    realtime.room('order:{id}', (_user, { nonsense }) => nonsense === '1');
    // A rule written for any name still fits, as one written before this did.
    realtime.room('order:{id}', (_user, params: Record<string, string>) => params.id === '1');

    realtime.calls('support:{pair}');
    realtime.calls('support:{pair}', (_user, _with, { pair }) => pair.length > 0);
    realtime.calls('ticket:{id}', (_user, _with, { id }) => id.length > 0);
    // @ts-expect-error
    realtime.calls('ticket:{id}', (_user, _with, { nonsense }) => nonsense === '1');

    realtime.groupCalls('meeting:{id}', (_user, { id }) => id.length > 0);
    // @ts-expect-error
    realtime.groupCalls('meeting:{id}', (_user, { nonsense }) => nonsense === '1');

    realtime.streams('show:{id}', (_user, { id }) => (id ? 'host' : 'viewer'));
    // @ts-expect-error
    realtime.streams('show:{id}', (_user, { nonsense }) => (nonsense ? 'host' : 'viewer'));

    // A pattern only known as a string gets any part, as it did.
    const pattern: string = 'order:{id}';
    realtime.room(pattern, (_user, { anything }) => anything === '1');

    return realtime.room('chat:7').members();
}

export function callOnAScreenOfYourOwn() {
    const { call, state, remote, camera, setCamera, start, answer, end } = useCall();
    const { connected, error } = useConnection();
    const typing = useTyping(useRoom('chat:7'));
    const group = useGroupCall('meeting:daily');

    void start('support:{pair}', { to: 34, type: 'audio' });
    void setCamera(!camera);
    void start('a token from your server');
    void start('a token from your server', { devices: false });
    // @ts-expect-error A call starts with a token from your server, not with whom it calls.
    void start(34);

    return [
        call?.peer.user, state === 'ringing', connected, error, typing.length, answer, end, group.self?.user, group.people.length,
        VideoTrack({ track: remote?.camera, className: 'tile' }),
        VideoTrack({ track: camera }),
        AudioTrack({ track: remote?.microphone }),
    ];
}
