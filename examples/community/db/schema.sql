-- The club part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to
-- "user", whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A member: what others see, beside the name they signed up with. A host runs events and looks after the lounges.
create table if not exists profile (
    user_id    integer primary key references "user" (id) on delete cascade,
    role       text not null default 'member' check (role in ('host', 'member')),
    title      text not null default '',
    about      text not null default '',
    photo      bytea,
    created_at timestamptz not null default now()
);

-- A channel: a conversation of the whole club about one thing, its messages in the room channel:{id}.
create table if not exists channel (
    id       serial primary key,
    name     text not null,
    about    text not null default '',
    position integer not null default 0
);

-- A lounge: a group call members drop into, lounge:{id}, by voice or with their cameras.
create table if not exists lounge (
    id    serial primary key,
    name  text not null,
    about text not null default '',
    kind  text not null default 'audio' check (kind in ('audio', 'video'))
);

-- An event: a live stream its host goes live in, event:{id}, for the members to watch, some of them on stage.
create table if not exists event (
    id        serial primary key,
    title     text not null,
    about     text not null default '',
    host      integer not null references "user" (id) on delete cascade,
    starts_at timestamptz not null
);

-- Who said they are going to an event.
create table if not exists going (
    event_id integer not null references event (id) on delete cascade,
    user_id  integer not null references "user" (id) on delete cascade,
    primary key (event_id, user_id)
);

-- A conversation between two members, known by their ids, the smaller first ('1:10'). Its messages and its calls are in
-- the room chat:{id}.
create table if not exists chat (
    id         serial primary key,
    pair       text unique,
    created_at timestamptz not null default now()
);

create table if not exists chat_member (
    chat_id integer not null references chat (id) on delete cascade,
    user_id integer not null references "user" (id) on delete cascade,
    primary key (chat_id, user_id)
);

-- The messages of every channel and conversation, by the room they were written in and the id of the room event that
-- brought them, with their photos and files.
create table if not exists message (
    id        text primary key,
    room      text not null,
    sender    integer not null references "user" (id) on delete cascade,
    text      text not null,
    files     jsonb not null default '[]',
    at        bigint not null,
    reactions jsonb not null default '{}'
);
create index if not exists message_room on message (room, at);

-- A photo or file sent in a channel or a conversation: kept here, opened only by those who may read it.
create table if not exists file (
    id         text primary key,
    room       text not null,
    owner      integer not null references "user" (id) on delete cascade,
    name       text not null,
    type       text not null,
    size       integer not null,
    data       bytea not null,
    created_at timestamptz not null default now()
);
