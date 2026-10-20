'use client';

// The shop client components, on the provider the layout renders: the notices, the order with its timeline and what
// the cloud carried of it, the product and who is looking, the chat, who is in the shop (and who is online across it),
// the shop members with a private call to each, the webhooks the server got, and the daily meeting. And on a demo, its
// top bar (with whom this window is) and "Try this".
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { LiveStream, useOnline, useRealtime, useRoom, useUserEvent } from '@wordplus/realtime/react';
import { CallButton, Chat, GroupCallButton, OnlineList, type ChatLoader } from '@wordplus/realtime-ui/react';
import { setStatus } from '../actions';
import type { Frame } from '@/lib/demo';
import type { Order, Person, Rooms, Status } from '@/lib/shop';

const STEPS: Status[] = ['placed', 'packed', 'shipped', 'delivered'];
const LABELS: Record<Status, string> = { placed: 'Placed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered' };
// Times in the page language, as its words are.
const when = (at: number) => new Date(at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Who is online across the shop, for the dot on every avatar.
const Online = createContext<Record<string, boolean>>({});

// On a demo, the code behind each card under it, from the source of this example: its server part first, then its page
// part.
const DemoCode = createContext<Frame['code']>(undefined);

function Code({ card }: { card: string }) {
    const parts = useContext(DemoCode)?.[card];
    if (!parts) return null;
    return (
        <details className="code">
            <summary>See the code</summary>
            {parts.map((part) => (
                <figure key={part.file}>
                    <figcaption>
                        <strong>{part.side === 'server' ? 'Server' : 'Page'}</strong>
                        <code>{part.file}</code>
                    </figcaption>
                    <pre>
                        <code>
                            {part.text.split('\n').map((line, i, lines) => (
                                <span key={i} className="line" style={{ '--indent': `${indentOf(line)}ch` } as React.CSSProperties}>
                                    {i < lines.length - 1 ? line + '\n' : line}
                                </span>
                            ))}
                        </code>
                    </pre>
                </figure>
            ))}
        </details>
    );
}

// Each line of the code a block of its own: a long one wraps under its own indent, as an editor wraps it.
const indentOf = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length;

export function OnlineDots({ people, children }: { people: Person[]; children: React.ReactNode }) {
    // #region demo: presence
    const { online } = useOnline(people.map((p) => p.id));
    // #endregion
    return <Online.Provider value={online}>{children}</Online.Provider>;
}

function Avatar({ person, size = 32 }: { person?: Person | { id: number | string; avatar?: string | null }; size?: number }) {
    const online = useContext(Online);
    if (!person?.avatar) return null;
    return <img className={online[String(person.id)] ? 'avatar online' : 'avatar'} src={person.avatar} alt="" width={size} height={size} data-user={person.id} />;
}

// What the server sends the signed-in user alone, such as a notice that their order moved on. On a demo, its calls
// end after 10 minutes and its meetings after 15, as the server `limits` say: it runs on WordPlus Cloud for anyone
// who opens it. `call` and `group` hear the call screen calls too.
export function Notices({ limits }: { limits?: Frame['limits'] }) {
    const rt = useRealtime();
    const [notes, setNotes] = useState<Array<{ id: number; text: string }>>([]);
    const say = useCallback((text: string) => {
        const note = { id: Date.now() + Math.random(), text };
        setNotes((all) => [...all, note]);
        setTimeout(() => setNotes((all) => all.filter((n) => n !== note)), 6000);
    }, []);

    // #region demo: order
    useUserEvent('notice', (data: { text: string }) => say(data.text));
    // #endregion

    useEffect(() => {
        if (!rt || !limits) return;
        const span = (s: number) => (s % 60 ? `${s} seconds` : `${s / 60} minutes`);
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const keep = (held: { on: (event: 'ended', fn: () => void) => unknown }, seconds: number, stop: () => void, text: string) => {
            const timer = setTimeout(() => {
                timers.delete(timer);
                stop();
                say(text);
            }, seconds * 1000);
            timers.add(timer);
            held.on('ended', () => {
                clearTimeout(timer);
                timers.delete(timer);
            });
        };
        const onCall = (call: { on: (event: 'ended', fn: () => void) => unknown; end: () => void }) =>
            keep(call, limits.call, () => call.end(), `Calls in this demo end after ${span(limits.call)}.`);
        const onGroup = (group: { on: (event: 'ended', fn: () => void) => unknown; leave: () => void }) =>
            keep(group, limits.meeting, () => group.leave(), `Meetings in this demo end after ${span(limits.meeting)}.`);
        let calls: Awaited<ReturnType<typeof rt.calls>> | null = null;
        let gone = false;
        void rt.calls().then((found) => {
            if (gone) return;
            calls = found;
            found.on('call', onCall).on('group', onGroup);
        });
        return () => {
            gone = true;
            calls?.off('call', onCall).off('group', onGroup);
            timers.forEach(clearTimeout);
        };
    }, [rt, limits, say]);

    return (
        <div className="notices" aria-live="polite">
            {notes.map((note) => (
                <p key={note.id} className="notice">
                    {note.text}
                </p>
            ))}
        </div>
    );
}

// The order: its customer watches it move on, the staff move it. Its timeline is the room history, and "What the
// cloud sees" shows the update as WordPlus Cloud carried it.
export function OrderCard({ me, initial, customer, room: name, token, onStatus, startOver }: { me: Person; initial: Order; customer?: Person; room: string; token?: string; onStatus?: (status: Status) => void; startOver?: boolean }) {
    const rt = useRealtime();
    const [status, setLocal] = useState(initial.status);
    const [timeline, setTimeline] = useState<Array<{ status: Status; at: number }>>([]);
    const [wire, setWire] = useState<{ room: string; event: string; data: string } | null>(null);
    const [showWire, setShowWire] = useState(false);

    // An order put back to placed (a demo "Start over") starts its timeline again.
    const changed = (next: Status, at: number) => {
        setLocal(next);
        setTimeline((all) => (next === 'placed' ? [{ status: next, at }] : [...all, { status: next, at }]));
    };
    // #region demo: order
    const room = useRoom(name, {
        updated: (data: { status: Status }, meta) => changed(data.status, meta.at ?? Date.now()),
    });
    // #endregion

    // #region demo: order
    // The order updates the room kept, once it is joined.
    useEffect(() => {
        if (room.state !== 'joined' || !room.room) return;
        room.room.history({ limit: 20 }).then((kept) => {
            const updates = kept.events.filter((e) => e.event === 'updated').map((e) => ({ status: (e.data as { status: Status }).status, at: e.at ?? 0 }));
            setTimeline(updates.slice(Math.max(0, updates.map((u) => u.status).lastIndexOf('placed'))));
        }, () => {});
    }, [room.state, room.room]);
    // #endregion

    useEffect(() => onStatus?.(status), [status, onStatus]);

    // What the cloud carries: the room and event as they are, the data sealed with the room key.
    useEffect(() => {
        if (!showWire) return;
        fetch(`/api/orders/${initial.id}/wire`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
            .then((r) => (r.ok ? r.json() : null))
            .then(setWire, () => {});
    }, [showWire, status, initial.id, token]);

    // #region demo: order
    const move = async (next: Status) => {
        changed(next, Date.now());
        await setStatus(initial.id, next, rt?.tab); // emitted to everyone else in the room
    };
    // #endregion

    const reached = STEPS.indexOf(status);
    return (
        <section className="card" id="order">
            <h2>{me.staff ? `Order #${initial.number} · ${customer?.name}` : `Your order #${initial.number}`}</h2>
            <p className="muted">{initial.item}</p>
            <ol className="steps">
                {STEPS.map((step, i) => (
                    <li key={step} className={i < reached ? 'done' : i === reached ? 'now' : ''}>
                        {LABELS[step]}
                    </li>
                ))}
            </ol>
            {me.staff ? (
                <div className="actions">
                    <span className="muted">Mark as</span>
                    {STEPS.slice(1).map((next) => (
                        <button key={next} disabled={STEPS.indexOf(next) <= reached} onClick={() => move(next)}>
                            {LABELS[next]}
                        </button>
                    ))}
                    {/* On a demo, the order can go back to placed, so its steps can be tried again. */}
                    {startOver && reached > 0 && (
                        <button className="quiet" onClick={() => move('placed')}>
                            Start over
                        </button>
                    )}
                </div>
            ) : (
                <p className={`live ${room.state === 'joined' ? 'subscribed' : room.state}`}>
                    {room.state === 'joined' ? 'Live' : room.state === 'failed' ? `Not connected: ${room.error}` : 'Connecting…'}
                </p>
            )}
            <details className="history" open>
                <summary>Timeline</summary>
                <ol className="timeline" data-empty="No updates yet">
                    {timeline.map((moment, i) => (
                        <li key={i}>
                            <span>{LABELS[moment.status] ?? moment.status}</span>
                            <time>{when(moment.at)}</time>
                        </li>
                    ))}
                </ol>
            </details>
            <label className="switch">
                <input type="checkbox" checked={showWire} onChange={(e) => setShowWire(e.target.checked)} /> What the cloud sees
            </label>
            {showWire && wire && (
                <div className="wire">
                    <p className="wire-label">What WordPlus Cloud carried</p>
                    <pre>{`room   ${wire.room}\nevent  ${wire.event}\ndata   ${wire.data}`}</pre>
                    <p className="wire-label">What this page opened</p>
                    <pre>{JSON.stringify({ id: initial.id, status })}</pre>
                </div>
            )}
            <Code card="order" />
        </section>
    );
}

// The product: a public room anyone may join, signed in or not, whose live count says who is looking.
export function Product({ room: name, item, picture }: { room: string; item: string; picture: string }) {
    // #region demo: product
    const room = useRoom(name);
    const n = room.count ?? 0;
    // #endregion
    return (
        <section className="card product" id="product">
            <img src={picture} alt="" width={480} height={320} />
            <div>
                <h2>{item}</h2>
                <p className="muted" id="looking">
                    {/* #region demo: product */}
                    {room.count === null ? ' ' : n > 1 ? `${n} people are looking at this` : 'Only you are looking at this'}
                    {/* #endregion */}
                </p>
            </div>
            <Code card="product" />
        </section>
    );
}

// The chat of Ann and Ben: the Better Messages conversation on the chat room (<Chat> of @wordplus/realtime-ui), its
// messages emitted with an ack, typing and read ticks as volatile events, and reactions. Above it, the name of the other side
// and picture from the app directory. The conversation belongs to the server, which keeps each message and reaction its
// webhook brings: the chat pages through it (/api/chat/messages, asked as this window person), and the room only fills
// in what came since.
export function ShopChat({ room, other, token }: { room: string; other: Person; token?: string }) {
    const rt = useRealtime();
    const [profile, setProfile] = useState<{ name?: string | null; avatar?: string | null }>();
    const here = !!useContext(Online)[String(other.id)];

    // A user is in the directory once they have connected: asked now, and again when they come online.
    useEffect(() => {
        if (!profile) rt?.users([other.id]).then((users) => users[other.id] && setProfile(users[other.id]), () => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt, other.id, here]);

    // #region demo: chat
    const load = useCallback<ChatLoader>(async (before) => {
        const response = await fetch('/api/chat/messages' + (before ? `?before=${encodeURIComponent(before.id)}` : ''), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok) throw new Error('the shop did not give its messages');
        return response.json();
    }, [token]);
    // #endregion

    return (
        <section className="chat" id="chat">
            <header className="chat-head">
                {profile?.avatar && <Avatar person={{ id: other.id, avatar: profile.avatar }} size={30} />}
                <strong>{profile?.name ?? other.name}</strong>
            </header>
            {/* #region demo: chat */}
            <Chat rt={rt} room={room} placeholder="Write a message" load={load} />
            {/* #endregion */}
        </section>
    );
}

// The shop members, everyone in it whether online or not: a private call to any of the others (<CallButton>), named as
// the list of who is in the shop names it (support:{pair}), on a demo, their own window too, where the call rings for them.
export function Members({ me, people, open }: { me: Person; people: Person[]; open?: Frame['open'] }) {
    const rt = useRealtime();
    return (
        <section className="card" id="members">
            <h2>Members</h2>
            <ul className="members">
                {people.map((p) => {
                    const theirs = open?.find((o) => o.id === p.id);
                    return (
                        <li key={p.id} className="member">
                            <Avatar person={p} size={36} />
                            <div className="member-who">
                                <strong>{p.id === me.id ? `${p.name} (you)` : p.name}</strong>
                                <span className="muted">{p.role}</span>
                            </div>
                            {p.id !== me.id && (
                                <div className="member-actions">
                                    {/* #region demo: members */}
                                    {/* A private call to this member, by video or by voice, named by the two of them. */}
                                    <CallButton rt={rt} to={p.id} call="support:{pair}" type="video" name={p.name} avatar={p.avatar}>
                                        Video call
                                    </CallButton>
                                    <CallButton rt={rt} to={p.id} call="support:{pair}" type="audio" name={p.name} avatar={p.avatar}>
                                        Voice call
                                    </CallButton>
                                    {/* #endregion */}
                                    {theirs && (
                                        <a className="button quiet" href={theirs.url} target="_blank" rel="opener">
                                            Open as {p.name}
                                        </a>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {open && <p className="muted">A call rings for a member in their own window: open it with Open as to answer.</p>}
            <Code card="members" />
        </section>
    );
}

// Everyone in the shop now (<OnlineList>: the presence room members, with a call button for each of the others).
// Stepping out takes the list away, which leaves the room.
export function Presence({ room }: { room: string }) {
    const rt = useRealtime();
    const [here, setHere] = useState(true);

    return (
        <section className="card" id="presence">
            <div className="people">
                {/* #region demo: presence */}
                {here ? <OnlineList rt={rt} room={room} title="In the shop now" call="support:{pair}" type="video" /> : <p className="muted">You stepped out.</p>}
                {/* #endregion */}
            </div>
            <div className="actions">
                <button className="quiet" onClick={() => setHere(!here)}>
                    {here ? 'Step out' : 'Come back'}
                </button>
            </div>
            <Code card="presence" />
        </section>
    );
}

interface Webhook {
    type: string;
    room: string | null;
    user: string | number | null;
    at: number;
}

// The webhooks the server got from WordPlus Cloud (a message or reaction from a page, someone coming online …), which
// it sends on to the shop webhooks room. The room keeps the last of them.
export function Webhooks({ room: name, rooms, people }: { room: string; rooms: Rooms; people: Person[] }) {
    const [list, setList] = useState<Webhook[]>([]);
    const add = (w: Webhook) => setList((all) => [w, ...all].slice(0, 8));
    // #region demo: webhooks
    const room = useRoom(name, { webhook: (w: Webhook, meta) => add({ ...w, at: w.at ?? meta.at }) });

    useEffect(() => {
        if (room.state !== 'joined' || !room.room) return;
        room.room.history({ limit: 8 }).then((kept) => {
            setList(kept.events.filter((e) => e.event === 'webhook').map((e) => e.data as Webhook).reverse());
        }, () => {});
    }, [room.state, room.room]);
    // #endregion

    const name_ = (id: Webhook['user']) => people.find((p) => String(p.id) === String(id))?.name ?? (id ? `User ${id}` : 'Someone');
    // The shop rooms in words: `order:1042` is the order.
    const words: Record<string, string> = { order: 'the order', chat: 'the chat', shop: 'the shop', meeting: 'the meeting', product: 'the product page', webhooks: 'this list' };
    const place = (r: string | null) => Object.entries(rooms).find(([, value]) => value === r)?.[0] ?? null;
    const at = (r: string | null) => words[place(r) ?? ''] ?? r;
    const say = (w: Webhook) =>
        ({
            message: `${name_(w.user)} sent a message`,
            reaction: `${name_(w.user)} reacted to a message`,
            'user.online': `${name_(w.user)} came online`,
            'user.offline': `${name_(w.user)} went offline`,
            'member.joined': `${name_(w.user)} came into ${at(w.room)}`,
            'member.left': `${name_(w.user)} left ${at(w.room)}`,
            'room.occupied': `Someone is on ${at(w.room)}`,
            'room.vacated': `Nobody is on ${at(w.room)} now`,
            'stream.live': 'The live show went live',
            'stream.ended': 'The live show ended',
            'group.joined': `${name_(w.user)} joined the meeting`,
            'group.left': `${name_(w.user)} left the meeting`,
            'stream.joined': `${name_(w.user)} came to the live show`,
            'stream.left': `${name_(w.user)} left the live show`,
        })[w.type] ?? w.type;

    return (
        <section className="card" id="webhooks">
            <h2>Webhooks your server got</h2>
            {list.length === 0 && <p className="muted">None yet. Send a message in the chat: your server hears it by webhook.</p>}
            <ol className="webhooks">
                {list.map((w, i) => (
                    <li key={`${w.at}-${i}`}>
                        <code>{w.type}</code>
                        <span>{say(w)}</span>
                        <time>{when(w.at)}</time>
                    </li>
                ))}
            </ol>
            <Code card="webhooks" />
        </section>
    );
}

// The shop live show (a live stream, the server `streams()` rule): Ann presents the new mugs with her camera, and
// everyone else watches, signed in or not, and writes in its chat. The player, the chat and the studio where Ann goes
// live are <LiveStream>, @wordplus/realtime-ui stream elements.
export function Show({ room }: { room: string }) {
    return (
        <section className="card" id="show">
            <h2>Live show</h2>
            {/* #region demo: show */}
            <LiveStream name={room} title="The new mugs" />
            {/* #endregion */}
            <Code card="show" />
        </section>
    );
}

// The daily meeting: a group call everyone in the shop may join, and a look at your camera before you do.
export function Meeting({ room }: { room: string }) {
    const rt = useRealtime();
    const video = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        if (video.current) video.current.srcObject = stream;
        return () => stream?.getTracks().forEach((t) => t.stop());
    }, [stream]);

    const check = async () => {
        if (stream) return setStream(null);
        setStream(await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => null));
    };

    return (
        <section className="card" id="meeting">
            <h2>Daily meeting</h2>
            <p className="muted">Ann, Ben and Cara, with video.</p>
            <video ref={video} className="preview" muted playsInline autoPlay hidden={!stream} />
            <div className="actions" onClick={(e) => (e.target as HTMLElement).closest('.realtime-call-button') && setStream(null)}>
                {/* #region demo: meeting */}
                <GroupCallButton rt={rt} room={room} type="video" title="Daily meeting">
                    Join the meeting
                </GroupCallButton>
                {/* #endregion */}
                <button className="quiet" onClick={check}>
                    {stream ? 'Stop the preview' : 'Check your camera'}
                </button>
            </div>
            <Code card="meeting" />
        </section>
    );
}

// The frame of a demo: the stacks, the guide and the source in the top bar.
export function DemoBar({ demo, me, people }: { demo: Frame; me: Person; people: Person[] }) {
    return (
        <header className="shop-bar">
            <div className="demo-title">
                <strong>API demo</strong>
                <span className="demo-stack">{demo.name}</span>
            </div>
            <nav className="demo-stacks" aria-label="The same shop on other stacks">
                {demo.sites.map((site) => (
                    <a key={site.stack} href={site.url} aria-current={site.stack === demo.stack ? 'page' : undefined}>
                        {site.name}
                    </a>
                ))}
            </nav>
            <div className="demo-links">
                <a href={demo.guide}>Guide</a>
                <a href={demo.source}>Source</a>
                {/* Who this window is, and the other people of the shop a click away: the window becomes theirs, as their
                    link does in a window of its own. */}
                <nav className="demo-people" aria-label="Who you are in this window">
                    {people.map((p) => {
                        if (p.id === me.id) {
                            return (
                                <span key={p.id} className="shop-me" aria-current="true">
                                    <Avatar person={p} size={24} />
                                    {p.name}
                                </span>
                            );
                        }
                        const open = demo.open.find((o) => o.id === p.id);
                        return open ? (
                            <a key={p.id} href={open.url} title={`Be ${p.name} in this window`}>
                                <Avatar person={p} size={24} />
                                {p.name}
                            </a>
                        ) : null;
                    })}
                </nav>
            </div>
        </header>
    );
}

// "Try this", each line ticked as it happens (in every window of this browser, which shares what it ticked).
export function TryThis({ demo, me, people, status }: { demo: Frame; me: Person; people: Person[]; status: Status }) {
    const rt = useRealtime();
    const online = useContext(Online);
    const key = `example-shop-ticks-${me.shop}`;
    const [ticks, setTicks] = useState<Record<string, boolean>>({});
    const [ann, ben, cara] = [34, 42, 43].map((local) => people.find((p) => p.id % 100 === local)!);

    const read = () => {
        try {
            return JSON.parse(localStorage.getItem(key) ?? '{}');
        } catch {
            return {};
        }
    };
    const tick = (name: string) =>
        setTicks((all) => {
            if (all[name]) return all;
            const next = { ...all, [name]: true };
            try {
                localStorage.setItem(key, JSON.stringify(next));
            } catch {}
            return next;
        });

    useEffect(() => {
        setTicks(read());
        const sync = (e: StorageEvent) => e.key === key && setTicks(read());
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // Ben comes online. The order is shipped. A call rings.
    useEffect(() => {
        if (online[String(ben.id)] || me.id === ben.id) tick('ben');
    }, [online, ben.id, me.id]);
    useEffect(() => {
        if (STEPS.indexOf(status) >= STEPS.indexOf('shipped')) tick('shipped');
    }, [status]);
    useEffect(() => {
        void rt?.calls().then((calls) => calls?.on('incoming', () => tick('call')));
    }, [rt]);

    const link = (who: Person) => {
        const found = demo.open.find((o) => o.id === who.id);
        return found ? (
            <a href={found.url} target="_blank" rel="opener">
                Open as {who.name}
            </a>
        ) : null;
    };
    const ends = new Date(demo.ends).toLocaleString('en', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

    return (
        <section className="card try" id="try">
            <h2>Try this</h2>
            <ol>
                <li className={ticks.ben ? 'done' : ''}>
                    <span>Open {ben.name}, the customer, in another window</span> {link(ben)}
                </li>
                <li className={ticks.shipped ? 'done' : ''}>
                    <span>As {cara.name}, mark the order shipped</span> {link(cara)}
                </li>
                <li className={ticks.call ? 'done' : ''}>
                    <span>
                        As {ben.name}, call {ann.name} from the list of who is in the shop
                    </span>
                </li>
            </ol>
            <p className="muted">This shop is yours until {ends}. Send a window link to a colleague to share it.</p>
        </section>
    );
}

export interface ShopData {
    me: Person;
    people: Person[];
    order: Order;
    chat: number[];
    rooms: Rooms;
    product: { item: string; picture: string };
    demo: Frame | null;
}

// The page: the order, the product and the meeting on one side, the chat, who is in the shop and the webhooks on the
// other. On a demo, its top bar and "Try this" above them.
export function ShopView({ data, signOut }: { data: ShopData; signOut: React.ReactNode }) {
    const { me, people, order, chat, rooms, demo } = data;
    const [status, setStatusHere] = useState(order.status);
    const other = people.find((p) => chat.includes(p.id) && p.id !== me.id);

    return (
        <DemoCode.Provider value={demo?.code}>
            <OnlineDots people={people}>
                {demo ? <DemoBar demo={demo} me={me} people={people} /> : signOut}
                <main className="shop-main">
                    <Notices limits={demo?.limits} />
                    {demo && <TryThis demo={demo} me={me} people={people} status={status} />}
                    <div className="shop-grid">
                        <div className="shop-column">
                            <OrderCard me={me} initial={order} customer={people.find((p) => p.id === order.customer)} room={rooms.order} token={demo?.token} onStatus={setStatusHere} startOver={!!demo} />
                            <Product room={rooms.product} item={data.product.item} picture={data.product.picture} />
                            {rooms.show && <Show room={rooms.show} />}
                            <Meeting room={rooms.meeting} />
                        </div>
                        <div className="shop-column">
                            {chat.includes(me.id) && other ? (
                                <>
                                    <ShopChat room={rooms.chat} other={other} token={demo?.token} />
                                    <Code card="chat" />
                                </>
                            ) : (
                                <section className="card">
                                    <h2>Chat</h2>
                                    <p className="muted">The chat is between Ann and Ben.</p>
                                </section>
                            )}
                            <Members me={me} people={people} open={demo?.open} />
                            <Presence room={rooms.shop} />
                            <Webhooks room={rooms.webhooks} rooms={rooms} people={people} />
                        </div>
                    </div>
                </main>
            </OnlineDots>
        </DemoCode.Provider>
    );
}
