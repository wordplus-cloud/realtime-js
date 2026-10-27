import { db } from './db';

export type Subject = 'cooking' | 'music' | 'fitness';

export const SUBJECTS: Record<Subject, string> = { cooking: 'Cooking', music: 'Music', fitness: 'Fitness' };

/** What others see of a person. Ids are text ('2'), as Better Auth gives them. */
export interface Person {
    id: string;
    name: string;
    about: string;
}

export interface Course {
    id: string;
    teacher: string;
    teacherName: string;
    subject: Subject;
    title: string;
    about: string;
}

export interface Lesson {
    id: string;
    course: string;
    position: number;
    title: string;
    open: boolean;
    teacher: string;
    teacherName: string;
    courseTitle: string;
    subject: Subject;
}

const COURSE = `select c.id::text, c.teacher::text, u.name as "teacherName", c.subject, c.title, c.about
                from course c join "user" u on u.id = c.teacher`;
const LESSON = `select l.id::text, l.course_id::text as course, l.position, l.title, l.open, c.teacher::text,
                       u.name as "teacherName", c.title as "courseTitle", c.subject
                from lesson l join course c on c.id = l.course_id join "user" u on u.id = c.teacher`;

const isNumber = (id: string) => /^[0-9]+$/.test(id);

export async function personOf(id: string): Promise<Person | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query<Person>(
        `select u.id::text, u.name, coalesce(p.about, '') as about from "user" u left join profile p on p.user_id = u.id where u.id = $1`,
        [id],
    );
    return rows[0] ?? null;
}

/** A person's photo as stored, or null. */
export async function photoOf(id: string): Promise<Buffer | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query<{ photo: Buffer | null }>('select photo from profile where user_id = $1', [id]);
    return rows[0]?.photo ?? null;
}

/** Every course, by subject. */
export async function courses(): Promise<Course[]> {
    const { rows } = await db.query<Course>(`${COURSE} order by c.subject, c.title`);
    return rows;
}

export async function courseOf(id: string): Promise<Course | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query<Course>(`${COURSE} where c.id = $1`, [id]);
    return rows[0] ?? null;
}

/** The courses a person teaches. */
export async function coursesOf(teacher: string): Promise<Course[]> {
    if (!isNumber(teacher)) return [];
    const { rows } = await db.query<Course>(`${COURSE} where c.teacher = $1 order by c.title`, [teacher]);
    return rows;
}

export async function lessonsOf(course: string): Promise<Lesson[]> {
    if (!isNumber(course)) return [];
    const { rows } = await db.query<Lesson>(`${LESSON} where l.course_id = $1 order by l.position`, [course]);
    return rows;
}

export async function lessonOf(id: string): Promise<Lesson | null> {
    if (!isNumber(id)) return null;
    const { rows } = await db.query<Lesson>(`${LESSON} where l.id = $1`, [id]);
    return rows[0] ?? null;
}

/** The lessons of these numbers, in their courses' order. */
export async function lessonsIn(ids: string[]): Promise<Lesson[]> {
    const numbers = ids.filter(isNumber);
    if (numbers.length === 0) return [];
    const { rows } = await db.query<Lesson>(`${LESSON} where l.id = any($1::int[]) order by c.subject, l.position`, [numbers]);
    return rows;
}

/** The stream of a lesson: lesson:7. */
export function roomOf(lesson: string): string {
    return `lesson:${lesson}`;
}

/** The lesson a stream's name is of: 7 for lesson:7, null for any other. */
export function lessonIn(room: string): string | null {
    const id = room.startsWith('lesson:') ? room.slice('lesson:'.length) : '';
    return isNumber(id) ? id : null;
}

export async function isEnrolled(user: string, course: string): Promise<boolean> {
    const { rowCount } = await db.query('select 1 from enrollment where course_id = $1 and user_id = $2', [course, user]);
    return (rowCount ?? 0) > 0;
}

/**
 * Who may watch a lesson: its teacher, anyone for an open one, signed in or not, and otherwise the students of its
 * course. The same rule decides the stream (lib/realtime.ts) and what the lesson's page shows.
 */
export async function mayWatch(user: string | null, lesson: Lesson): Promise<boolean> {
    if (user === lesson.teacher) return true;
    if (lesson.open) return true;
    if (user === null) return false;
    return isEnrolled(user, lesson.course);
}

export async function enroll(user: string, course: string) {
    await db.query('insert into enrollment (course_id, user_id) values ($1, $2) on conflict do nothing', [course, user]);
}

export async function leave(user: string, course: string) {
    await db.query('delete from enrollment where course_id = $1 and user_id = $2', [course, user]);
}

/** The students of a course. */
export async function studentsOf(course: string): Promise<string[]> {
    const { rows } = await db.query<{ id: string }>('select user_id::text as id from enrollment where course_id = $1', [course]);
    return rows.map((row) => row.id);
}

export async function follows(who: string, teacher: string): Promise<boolean> {
    const { rowCount } = await db.query('select 1 from follow where who = $1 and teacher = $2', [who, teacher]);
    return (rowCount ?? 0) > 0;
}

export async function follow(who: string, teacher: string, on: boolean) {
    if (on) await db.query('insert into follow (who, teacher) values ($1, $2) on conflict do nothing', [who, teacher]);
    else await db.query('delete from follow where who = $1 and teacher = $2', [who, teacher]);
}

/** Who follows a teacher. */
export async function followersOf(teacher: string): Promise<string[]> {
    const { rows } = await db.query<{ id: string }>('select who::text as id from follow where teacher = $1', [teacher]);
    return rows.map((row) => row.id);
}

/** The courses a student is in. */
export async function enrolledIn(user: string): Promise<string[]> {
    const { rows } = await db.query<{ id: string }>('select course_id::text as id from enrollment where user_id = $1', [user]);
    return rows.map((row) => row.id);
}
