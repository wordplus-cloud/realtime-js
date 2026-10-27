-- The team part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to "user",
-- whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A person: what colleagues see, beside the name they signed up with.
create table if not exists profile (
    user_id    integer primary key references "user" (id) on delete cascade,
    title      text not null default '',
    about      text not null default '',
    photo      bytea,
    created_at timestamptz not null default now()
);

-- A team, run by its lead, who hosts its meetings.
create table if not exists team (
    id    serial primary key,
    name  text not null,
    about text not null default '',
    lead  integer references "user" (id) on delete set null
);

-- Who is in each team.
create table if not exists team_member (
    team_id integer not null references team (id) on delete cascade,
    user_id integer not null references "user" (id) on delete cascade,
    primary key (team_id, user_id)
);

-- A chat: a channel of a team, its members the team's, or a conversation between two people. Its messages are in the
-- room chat:{id}, and the call of a conversation between two too.
create table if not exists chat (
    id         serial primary key,
    -- A channel: its team and its name ('general').
    team_id    integer references team (id) on delete cascade,
    name       text,
    -- A conversation between two is known by their ids, the smaller first ('1:10'), so either of them finds the same one.
    pair       text unique,
    created_at timestamptz not null default now()
);

-- Who is in each conversation between two. A channel has none here: its members are its team's.
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
