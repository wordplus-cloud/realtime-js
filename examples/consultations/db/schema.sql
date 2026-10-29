-- The consultations part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers
-- to "user", whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A person: an expert, who takes appointments, or a client, who books them.
create table if not exists profile (
    user_id    integer primary key references "user" (id) on delete cascade,
    role       text not null default 'client' check (role in ('expert', 'client')),
    -- An expert's: what they do, and the field the directory files them under.
    title      text not null default '',
    field      text not null default '',
    about      text not null default '',
    photo      bytea,
    created_at timestamptz not null default now()
);

-- An appointment: a client's half hour with an expert. Its visit is the group call visit:{id}, its messages the room
-- chat:{id}, and its waiting room the presence room waiting:{id}.
create table if not exists appointment (
    id          serial primary key,
    expert      integer not null references "user" (id) on delete cascade,
    client      integer not null references "user" (id) on delete cascade,
    starts_at   timestamptz not null,
    ends_at     timestamptz not null,
    topic       text not null default '',
    -- The expert let the client in: from then on the client may join the visit.
    admitted_at timestamptz,
    -- The visit itself: when the first one came in, and when it ended.
    started_at  timestamptz,
    ended_at    timestamptz,
    -- What the expert wrote down after it, for the client.
    notes       text,
    notes_at    timestamptz,
    created_at  timestamptz not null default now()
);
-- An expert has one appointment at a time.
create unique index if not exists appointment_slot on appointment (expert, starts_at);
create index if not exists appointment_client on appointment (client, starts_at);

-- A session asked for now ("Talk now"), until the expert takes it or says not now.
create table if not exists request (
    id          serial primary key,
    expert      integer not null references "user" (id) on delete cascade,
    client      integer not null references "user" (id) on delete cascade,
    topic       text not null default '',
    created_at  timestamptz not null default now(),
    -- 'accepted' with its appointment, or 'declined'.
    answer      text,
    appointment integer references appointment (id) on delete cascade
);

-- The messages about each appointment, by the id of the room event that brought them, with their files.
create table if not exists message (
    id             text primary key,
    appointment_id integer not null references appointment (id) on delete cascade,
    sender         integer not null references "user" (id) on delete cascade,
    text           text not null,
    files          jsonb not null default '[]',
    at             bigint not null,
    reactions      jsonb not null default '{}'
);
create index if not exists message_appointment on message (appointment_id, at);

-- A file sent in an appointment's messages: kept here, opened only by its expert and its client.
create table if not exists file (
    id             text primary key,
    appointment_id integer not null references appointment (id) on delete cascade,
    owner          integer not null references "user" (id) on delete cascade,
    name           text not null,
    type           text not null,
    size           integer not null,
    data           bytea not null,
    created_at     timestamptz not null default now()
);
