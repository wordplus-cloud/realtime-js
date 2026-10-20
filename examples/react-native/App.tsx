// The API demo as a React Native app: sign in as Ann (support), Ben (a customer) or Cara (the warehouse), then
// watch the order of Ben move on, see who is in the shop, and chat with “typing…”. The same rooms as the shop web
// pages, so the app and a browser signed in as someone else see each other. Calls come to React Native in a later
// version of the SDK.
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { get, post, signIn, type Message, type Person, type Room, type Session, type Status } from './shop';

const STEPS: Status[] = ['placed', 'packed', 'shipped', 'delivered'];
const LABELS: Record<Status, string> = { placed: 'Placed', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered' };
const COLOURS: Record<string, string> = { Ann: '#2563c9', Ben: '#13865b', Cara: '#b4561c' };
const PEOPLE = [
    { id: 34, name: 'Ann', role: 'Support' },
    { id: 42, name: 'Ben', role: 'Customer' },
    { id: 43, name: 'Cara', role: 'Warehouse' },
];

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [error, setError] = useState<string | null>(null);

    const choose = async (id: number) => {
        setError(null);
        try {
            setSession(await signIn(id));
        } catch (e) {
            setError((e as { code?: string; message?: string }).code ?? (e as Error).message);
        }
    };

    const signOut = () => {
        session?.rt.close();
        setSession(null);
    };

    // A link signs in too, `…?as=42` (in Expo Go: exp://<your Mac>:8081/--/?as=42): two devices, or a simulator and
    // an emulator, as two of the shop people without tapping through.
    useEffect(() => {
        const follow = (url: string | null) => {
            const as = url?.match(/[?&]as=(\d+)/)?.[1];
            if (as) void choose(Number(as));
        };
        void Linking.getInitialURL().then(follow);
        const listener = Linking.addEventListener('url', ({ url }) => follow(url));
        return () => listener.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <SafeAreaView style={styles.screen}>
            <StatusBar style="dark" />
            <View style={styles.bar}>
                <Text style={styles.title}>API demo</Text>
                {session && (
                    <Pressable style={styles.me} onPress={signOut}>
                        <Avatar name={session.shop.me.name} size={24} />
                        <Text style={styles.muted}> {session.shop.me.name} · Sign out</Text>
                    </Pressable>
                )}
            </View>
            {session ? (
                <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView contentContainerStyle={styles.main} keyboardShouldPersistTaps="handled">
                        <OrderCard session={session} />
                        <InTheShop session={session} />
                        {session.shop.chat.between.includes(session.shop.me.id) && <Chat session={session} />}
                    </ScrollView>
                </KeyboardAvoidingView>
            ) : (
                <View style={styles.main}>
                    <View style={styles.card}>
                        <Text style={styles.heading}>Sign in</Text>
                        <Text style={styles.muted}>As Ann, Ben or Cara. Sign in as someone else in a browser, or on another device.</Text>
                        {PEOPLE.map((p) => (
                            <Pressable key={p.id} style={styles.person} onPress={() => choose(p.id)} accessibilityRole="button">
                                <Avatar name={p.name} size={28} />
                                <Text style={styles.name}>{p.name}</Text>
                                <Text style={styles.muted}>{p.role}</Text>
                            </Pressable>
                        ))}
                        {error && <Text style={styles.error}>Could not connect: {error}</Text>}
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

// The order of Ben: he watches it move on. The staff move it. The server emits each change to the order room, skipping the
// one that made it.
function OrderCard({ session }: { session: Session }) {
    const { shop, rt } = session;
    const [status, setStatus] = useState(shop.order.status);
    const [live, setLive] = useState(false);

    useEffect(() => {
        const room = rt.join(shop.rooms.order);
        room.on(shop.events.order, (data: { status: Status }) => setStatus(data.status));
        room.on('joined', () => setLive(true));
        return () => rt.leave(shop.rooms.order);
    }, [rt, shop]);

    const move = async (next: Status) => {
        setStatus(next);
        await post(session, shop.routes.status, { status: next });
    };

    const reached = STEPS.indexOf(status);
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{shop.me.staff ? `Order #${shop.order.id} · Ben` : `Your order #${shop.order.id}`}</Text>
            <Text style={styles.muted}>{shop.order.item}</Text>
            <View style={styles.steps}>
                {STEPS.map((step, i) => (
                    <View key={step} style={styles.step}>
                        <View style={[styles.dot, i < reached && styles.done, i === reached && styles.now]} />
                        <Text style={[styles.stepLabel, i <= reached && styles.reached]}>{LABELS[step]}</Text>
                    </View>
                ))}
            </View>
            {shop.me.staff ? (
                <View style={styles.actions}>
                    {STEPS.slice(1).map((next) => (
                        <Pressable key={next} disabled={STEPS.indexOf(next) <= reached} onPress={() => move(next)} style={[styles.button, STEPS.indexOf(next) <= reached && styles.disabled]}>
                            <Text style={STEPS.indexOf(next) <= reached ? styles.muted : styles.buttonText}>{LABELS[next]}</Text>
                        </Pressable>
                    ))}
                </View>
            ) : (
                <Text style={styles.live}>{live ? '● Live' : 'Connecting…'}</Text>
            )}
        </View>
    );
}

// Everyone in the shop now: a presence room, which the shop web pages are in too.
function InTheShop({ session }: { session: Session }) {
    const { shop, rt } = session;
    const [members, setMembers] = useState<{ id: string; info: { name: string; role: string } }[]>([]);

    useEffect(() => {
        const room = rt.join(shop.rooms.shop);
        const draw = () => setMembers([...room.members].map(([id, info]) => ({ id, info: info as { name: string; role: string } })));
        for (const event of ['joined', 'join', 'leave']) room.on(event, draw);
        return () => rt.leave(shop.rooms.shop);
    }, [rt, shop]);

    return (
        <View style={styles.card}>
            <Text style={styles.heading}>In the shop now</Text>
            {members.map((m) => (
                <View key={m.id} style={styles.person}>
                    <Avatar name={m.info.name} size={32} />
                    <Text style={styles.name}>
                        {m.info.name}
                        {m.id === String(shop.me.id) && <Text style={styles.muted}> (you)</Text>}
                    </Text>
                    <Text style={styles.muted}>{m.info.role}</Text>
                </View>
            ))}
        </View>
    );
}

// The chat of Ann and Ben: messages emitted straight to the room, acked, and kept by the app server, which the webhook
// brings them to. Typing as volatile events. The web pages draw the same room as the Better Messages conversation
// (<chat-room>).
function Chat({ session }: { session: Session }) {
    const { shop, rt } = session;
    const otherId = shop.chat.between.find((id) => id !== shop.me.id)!;
    const [messages, setMessages] = useState<Message[]>([]);
    const [more, setMore] = useState(false);
    // Their name from the shop people until the directory, which has them once they have connected, says it.
    const [other, setOther] = useState<Person['name']>(shop.people.find((p) => p.id === otherId)?.name ?? '');
    const [typing, setTyping] = useState(false);
    const [text, setText] = useState('');
    const sent = useRef(0);
    const ends = useRef<ReturnType<typeof setTimeout>>(undefined);
    const room = useRef<Room>(undefined);
    const seen = useRef(new Set<string>());

    // Each message once, in the order it was said.
    const add = (...added: Message[]) => {
        const fresh = added.filter((m) => !seen.current.has(m.id));
        fresh.forEach((m) => seen.current.add(m.id));
        if (fresh.length) setMessages((all) => [...all, ...fresh].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity)));
    };

    // A page of the conversation the app server keeps: the newest, or the one before the oldest shown.
    const earlier = async (before?: string) => {
        const page = await get<{ messages: Message[]; more: boolean }>(session, shop.routes.messages + (before ? '?before=' + encodeURIComponent(before) : ''));
        if (!page) return;
        add(...page.messages);
        setMore(page.more);
    };

    useEffect(() => {
        const chat = rt.join(shop.rooms.chat);
        room.current = chat;
        chat.on(shop.events.chat, (data: { from?: number; text: string }, meta: { id?: string; from?: string; at?: number }) => {
            setTyping(false);
            add({ id: meta.id ?? String(Math.random()), from: Number(data.from ?? meta.from), text: data.text, at: meta.at ?? Date.now() });
        });
        chat.on('typing', (data: { on: boolean }) => {
            setTyping(data.on);
            clearTimeout(ends.current);
            if (data.on) ends.current = setTimeout(() => setTyping(false), 4000);
        });
        // What was said before the app opened: the conversation from the app server, then from the room history
        // (its last day) what the webhook may not have brought yet.
        chat.once('joined', async () => {
            await earlier().catch(() => {});
            const { events } = await chat.history({ limit: 50 });
            add(
                ...events
                    .filter((e) => e.event === shop.events.chat)
                    .map((e) => ({ id: e.id ?? String(Math.random()), from: Number((e.data as { from?: number }).from ?? e.from), text: (e.data as { text: string }).text, at: e.at })),
            );
        });
        // Who is on the other side, from the app directory.
        rt.users([otherId])
            .then((users) => users[otherId]?.name && setOther(users[otherId].name!))
            .catch(() => {});
        return () => rt.leave(shop.rooms.chat);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rt, shop, otherId]);

    const type = (value: string) => {
        setText(value);
        if (value && Date.now() - sent.current > 2000) {
            sent.current = Date.now();
            room.current?.volatile.emit('typing', { on: true });
        }
    };

    const send = async () => {
        const words = text.trim();
        if (!words || !room.current) return;
        setText('');
        sent.current = 0;
        room.current.volatile.emit('typing', { on: false });
        try {
            const { id } = await room.current.emitWithAck(shop.events.chat, { from: shop.me.id, text: words });
            add({ id, from: shop.me.id, text: words, at: Date.now() });
        } catch (error) {
            add({ id: String(Math.random()), from: shop.me.id, text: 'Not sent: ' + (error as { code?: string }).code, at: Date.now() });
        }
    };

    return (
        <View style={styles.card}>
            <View style={styles.person}>
                {other ? <Avatar name={other} size={30} /> : null}
                <Text style={styles.heading}>{other}</Text>
            </View>
            {more ? (
                <Pressable onPress={() => earlier(messages[0]?.id).catch(() => {})}>
                    <Text style={styles.muted}>Earlier messages</Text>
                </Pressable>
            ) : null}
            {messages.map((m) => (
                <View key={m.id} style={[styles.bubble, m.from === shop.me.id ? styles.mine : styles.theirs]}>
                    <Text style={m.from === shop.me.id ? styles.buttonText : undefined}>{m.text}</Text>
                </View>
            ))}
            <Text style={styles.muted}>{typing ? `${other} is typing…` : ' '}</Text>
            <View style={styles.compose}>
                <TextInput style={styles.input} value={text} onChangeText={type} placeholder="Write a message" onSubmitEditing={send} />
                <Pressable style={styles.button} onPress={send}>
                    <Text style={styles.buttonText}>Send</Text>
                </Pressable>
            </View>
        </View>
    );
}

function Avatar({ name, size }: { name: string; size: number }) {
    return (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: COLOURS[name] ?? '#64748b' }]}>
            <Text style={[styles.initial, { fontSize: size * 0.45 }]}>{name.slice(0, 1)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#f8fafc' },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e2e8f0' },
    title: { fontWeight: '700', fontSize: 15, color: '#0f172a' },
    me: { flexDirection: 'row', alignItems: 'center' },
    main: { padding: 14, gap: 14 },
    card: { padding: 16, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff', gap: 8 },
    heading: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
    muted: { color: '#64748b', fontSize: 14 },
    error: { color: '#b91c1c' },
    person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    name: { flex: 1, fontSize: 15, color: '#0f172a' },
    avatar: { alignItems: 'center', justifyContent: 'center' },
    initial: { color: '#fff', fontWeight: '600' },
    steps: { flexDirection: 'row', marginTop: 10 },
    step: { flex: 1, alignItems: 'center', gap: 6 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#cbd5e1', backgroundColor: '#fff' },
    done: { borderColor: '#13865b', backgroundColor: '#13865b' },
    now: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
    stepLabel: { fontSize: 12, color: '#64748b' },
    reached: { color: '#0f172a' },
    live: { color: '#13865b', fontSize: 12, marginTop: 6 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2563eb' },
    disabled: { backgroundColor: '#f1f5f9' },
    buttonText: { color: '#fff' },
    bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
    mine: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
    theirs: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9' },
    compose: { flexDirection: 'row', gap: 8 },
    input: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
});
