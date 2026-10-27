-- The lessons part of the database. Better Auth makes its own tables first (npx auth migrate), as this one refers to
-- "user", whose ids are numbers (generateId: 'serial' in lib/auth.ts).

-- What others see of a person, beside the name they signed up with.
create table if not exists profile (
    user_id integer primary key references "user" (id) on delete cascade,
    about   text not null default '',
    photo   bytea
);

-- A course: what a teacher teaches, as a run of lessons.
create table if not exists course (
    id      serial primary key,
    teacher integer not null references "user" (id) on delete cascade,
    subject text not null check (subject in ('cooking', 'music', 'fitness')),
    title   text not null,
    about   text not null default ''
);

-- A lesson of a course, streamed live as lesson:{id}. An open one anyone may watch, signed in or not, the others only
-- the course's students.
create table if not exists lesson (
    id        serial primary key,
    course_id integer not null references course (id) on delete cascade,
    position  integer not null,
    title     text not null,
    open      boolean not null default false
);

-- The students of each course.
create table if not exists enrollment (
    course_id integer not null references course (id) on delete cascade,
    user_id   integer not null references "user" (id) on delete cascade,
    at        timestamptz not null default now(),
    primary key (course_id, user_id)
);

-- Who follows which teacher, to be told when they go live.
create table if not exists follow (
    who     integer not null references "user" (id) on delete cascade,
    teacher integer not null references "user" (id) on delete cascade,
    primary key (who, teacher)
);
