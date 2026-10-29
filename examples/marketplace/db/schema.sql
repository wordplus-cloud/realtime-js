-- The marketplace part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to
-- "user", whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- A neighbour: where they are, and a line about them, beside the name they signed up with.
create table if not exists profile (
    user_id    integer primary key references "user" (id) on delete cascade,
    area       text not null default '',
    about      text not null default '',
    photo      bytea,
    created_at timestamptz not null default now()
);

-- An item for sale. Reserved or sold, for a buyer. Its live count of people looking is the room listing:{id}.
create table if not exists listing (
    id         serial primary key,
    seller     integer not null references "user" (id) on delete cascade,
    title      text not null,
    about      text not null default '',
    price      integer not null check (price >= 0),
    category   text not null default '',
    area       text not null default '',
    status     text not null default 'available' check (status in ('available', 'reserved', 'sold')),
    buyer      integer references "user" (id) on delete set null,
    created_at timestamptz not null default now()
);

-- An item's photos, in their order.
create table if not exists listing_photo (
    id         text primary key,
    listing_id integer not null references listing (id) on delete cascade,
    position   integer not null default 0,
    type       text not null,
    data       bytea not null
);

-- A conversation about an item, between its seller and one buyer: its messages and its calls are in the room deal:{id}.
create table if not exists deal (
    id         serial primary key,
    listing_id integer not null references listing (id) on delete cascade,
    buyer      integer not null references "user" (id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (listing_id, buyer)
);

-- An offer a buyer makes in a conversation, until the seller answers it.
create table if not exists offer (
    id          serial primary key,
    deal_id     integer not null references deal (id) on delete cascade,
    amount      integer not null check (amount > 0),
    status      text not null default 'open' check (status in ('open', 'accepted', 'declined', 'withdrawn')),
    created_at  timestamptz not null default now(),
    answered_at timestamptz
);

-- The messages of every conversation, by the id of the room event that brought them, with their photos.
create table if not exists message (
    id        text primary key,
    deal_id   integer not null references deal (id) on delete cascade,
    sender    integer not null references "user" (id) on delete cascade,
    text      text not null,
    files     jsonb not null default '[]',
    at        bigint not null,
    reactions jsonb not null default '{}'
);
create index if not exists message_deal on message (deal_id, at);

-- A photo sent in a conversation: kept here, opened by its seller and its buyer alone.
create table if not exists file (
    id         text primary key,
    deal_id    integer not null references deal (id) on delete cascade,
    owner      integer not null references "user" (id) on delete cascade,
    name       text not null,
    type       text not null,
    size       integer not null,
    data       bytea not null,
    created_at timestamptz not null default now()
);
