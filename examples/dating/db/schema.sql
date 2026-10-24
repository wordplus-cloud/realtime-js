-- The dating part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to "user",
-- whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A profile: what others see, beside the name the person signed up with.
create table if not exists profile (
    user_id     integer primary key references "user" (id) on delete cascade,
    birthday    date not null,
    gender      text not null check (gender in ('woman', 'man', 'nonbinary')),
    seeking     text not null check (seeking in ('women', 'men', 'everyone')),
    city        text not null default '',
    about       text not null default '',
    photo       bytea,
    hide_online boolean not null default false,
    created_at  timestamptz not null default now()
);

-- Someone blocked, with the reason when it was a report. Neither sees the other again.
create table if not exists block (
    who    integer not null references "user" (id) on delete cascade,
    whom   integer not null references "user" (id) on delete cascade,
    reason text,
    at     timestamptz not null default now(),
    primary key (who, whom)
);

-- A chat: two people, or a group. Its messages and calls are in the room chat:{id}.
create table if not exists chat (
    id         serial primary key,
    -- A chat of two people is known by their ids, the smaller first ('1:10'), so either of them finds the same one. A
    -- group has none.
    pair       text unique,
    created_at timestamptz not null default now()
);

-- Who is in each chat.
create table if not exists chat_member (
    chat_id integer not null references chat (id) on delete cascade,
    user_id integer not null references "user" (id) on delete cascade,
    primary key (chat_id, user_id)
);

-- The messages of every chat, by the id of the room event that brought them.
create table if not exists message (
    id        text primary key,
    chat_id   integer not null references chat (id) on delete cascade,
    sender    integer not null references "user" (id) on delete cascade,
    text      text not null,
    at        bigint not null,
    reactions jsonb not null default '{}'
);
create index if not exists message_chat on message (chat_id, at);
