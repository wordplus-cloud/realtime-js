-- The public demo alone (LESSONS_WORLDS=1, lib/worlds.ts): every visitor gets a copy of the ready-made people of their
-- own, a world, kept apart from the others in this one database. Each row has the world it was written in, taken from
-- the connection's demo.world, and Postgres shows a connection the rows of its world alone (row level security), so
-- the site's own queries are the same as without it. Run after npm run db, as the owner of the tables, who must not be
-- a superuser: Postgres shows a superuser every row, whatever the policy says.

set client_min_messages = warning;
-- The rows there are already belong to world 0, where nobody signs in.
set demo.world = '0';

-- The worlds open now, each ended a day after it was opened.
create table if not exists world (
    id     integer primary key,
    opened timestamptz not null default now()
);

do $$
declare
    name text;
begin
    foreach name in array array['user', 'session', 'account', 'verification', 'profile', 'course', 'lesson', 'enrollment', 'follow'] loop
        execute format('alter table %I add column if not exists world integer not null default nullif(current_setting(''demo.world'', true), '''')::integer', name);
        execute format('alter table %I enable row level security', name);
        execute format('alter table %I force row level security', name);
        execute format('drop policy if exists world on %I', name);
        -- A connection sees its world's rows, or every row for the webhooks and while it ends old worlds ('all'), and
        -- writes in its world, never in world 0.
        execute format('create policy world on %I using (current_setting(''demo.world'', true) in (world::text, ''all'')) with check (world::text = current_setting(''demo.world'', true) and world <> 0)', name);
    end loop;
end $$;

-- Every world has its own Mia, so an email is one person's within its world.
alter table "user" drop constraint if exists user_email_key;
create unique index if not exists user_world_email on "user" (world, email);
