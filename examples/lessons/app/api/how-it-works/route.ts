// The values "How this page works" shows on the demo, for the page open (?path=/lessons/…): who is signed in, the
// lessons live now, on a lesson's or a course's page the lesson, its course and who may watch it, and in a teacher's
// studio what they teach. Only on the demo.
import { currentUserId } from '@/lib/auth';
import { courseOf, coursesOf, follows, followersOf, isEnrolled, lessonOf, lessonsIn, lessonsOf, mayWatch, personOf, roomOf, studentsOf } from '@/lib/lessons';
import { liveNow } from '@/lib/realtime';

/** Names of people by their ids, as a list says them. */
async function namesOf(ids: string[]): Promise<string> {
    const people = await Promise.all(ids.map((id) => personOf(id)));
    return people.filter((person) => person !== null).map((person) => person.name).join(', ') || 'nobody';
}

export async function GET(request: Request) {
    if (process.env.LESSONS_DEMO !== '1') return new Response(null, { status: 404 });
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const me = await currentUserId();
    const person = me ? await personOf(me) : null;
    const values: Record<string, string> = {
        me_id: me ?? 'null',
        me_name: person?.name ?? 'a visitor',
    };

    // What is live now, as the cloud says and the database names it.
    const live = await liveNow();
    const liveLessons = await lessonsIn([...live.keys()]);
    values.live_names = [...live.keys()].map((id) => `'lesson:${id}'`).join(', ') || 'none';
    values.live_count = String(live.size);
    values.live_titles = liveLessons.map((lesson) => `${lesson.title} (${lesson.teacherName}, ${live.get(lesson.id) ?? 0} watching)`).join(', ') || 'none right now';

    // A teacher's studio: what they teach, and which of it is live now.
    if (me !== null && path.startsWith('/studio')) {
        const teaching = await coursesOf(me);
        const theirs = liveLessons.filter((lesson) => lesson.teacher === me);
        values.teaching = teaching.map((course) => course.title).join(', ') || 'nothing yet';
        values.teaching_live = theirs.map((lesson) => lesson.title).join(', ') || 'none of them';
        values.studio_lesson = 'the lesson picked';
    }

    // A lesson's page, or its studio: the lesson, and what the rule answers this person.
    const lessonId = path.match(/^\/(?:lessons|studio)\/(\d+)$/)?.[1];
    const lesson = lessonId ? await lessonOf(lessonId) : null;
    if (lesson) {
        const enrolled = me !== null && (await isEnrolled(me, lesson.course));
        const watches = await mayWatch(me, lesson);
        const students = await studentsOf(lesson.course);
        const followers = await followersOf(lesson.teacher);
        const told = [...new Set([...students, ...(lesson.open ? followers : [])])].filter((user) => user !== lesson.teacher);
        Object.assign(values, {
            lesson_id: lesson.id,
            lesson_title: lesson.title,
            studio_lesson: lesson.title,
            lesson_open: String(lesson.open),
            room: roomOf(lesson.id),
            teacher_id: lesson.teacher,
            teacher_name: lesson.teacherName,
            course_id: lesson.course,
            course_title: lesson.courseTitle,
            enrolled: String(enrolled),
            may_watch: String(watches),
            role: me === lesson.teacher ? `{ role: 'host', quality: '1080p' }: ${person?.name} teaches it` : watches ? `'viewer'` : 'false',
            live_here: live.has(lesson.id) ? `live, ${live.get(lesson.id)} watching` : 'not live now',
            students: await namesOf(students),
            followers: await namesOf(followers),
            told: await namesOf(told),
        });
    }

    // A course's page: whether this person is in it and follows its teacher.
    const courseId = path.match(/^\/courses\/(\d+)$/)?.[1];
    const course = courseId ? await courseOf(courseId) : null;
    if (course) {
        const lessons = await lessonsOf(course.id);
        const closedLive = lessons.filter((one) => !one.open && live.has(one.id));
        Object.assign(values, {
            course_id: course.id,
            course_title: course.title,
            teacher_id: course.teacher,
            teacher_name: course.teacherName,
            enrolled: String(me !== null && (await isEnrolled(me, course.id))),
            following: String(me !== null && (await follows(me, course.teacher))),
            closed_live: closedLive.map((one) => `'lesson:${one.id}'`).join(', ') || 'none',
        });
    }

    return Response.json({ values, people: [] });
}
