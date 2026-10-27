'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { courseOf, enroll, follow, leave, lessonsOf, roomOf } from '@/lib/lessons';
import { liveNow, realtime } from '@/lib/realtime';

/** The signed-in person, or off to sign in. */
async function me(): Promise<string> {
    const id = await currentUserId();
    if (!id) redirect('/signin');
    return id;
}

/** Join a course: its lessons are theirs to watch from now on, those live now too, on their next try. */
export async function joinCourse(course: string) {
    const id = await me();
    if ((await courseOf(course))?.teacher === id) return;
    await enroll(id, course);
    revalidatePath('/', 'layout'); // every page shows it
}

/** Leave a course: out of its lessons live now at once, as the rule says no to them from here on. */
export async function leaveCourse(course: string) {
    const id = await me();
    await leave(id, course);

    const live = await liveNow();
    for (const lesson of await lessonsOf(course)) {
        if (!lesson.open && live.has(lesson.id)) await realtime.stream(roomOf(lesson.id)).kick(id);
    }
    revalidatePath('/', 'layout'); // every page shows it
}

/** Follow a teacher, to be told when they go live, or stop. */
export async function followTeacher(teacher: string, on: boolean) {
    const id = await me();
    if (teacher === id) return;
    await follow(id, teacher, on);
    revalidatePath('/', 'layout'); // every page shows it
}
