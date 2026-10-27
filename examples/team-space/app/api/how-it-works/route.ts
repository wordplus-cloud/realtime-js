// The values "How this page works" shows on the demo, for the page open (?path=/teams/…): who is signed in, their teams
// and the meetings on now, on a team's page the team, its meeting room and its first channel, and on a colleague's page
// our conversation. Only on the demo.
import { currentUserId } from '@/lib/auth';
import { inMeeting, meetingsNow } from '@/lib/realtime';
import { areColleagues, channelsOf, chatBetween, everyone, isMember, meetingOf, peopleIn, personOf, roomOf, teamOf, teamsOf } from '@/lib/team';

/** Names of people by their ids, as a list says them. */
async function namesOf(ids: string[]): Promise<string> {
    const people = await Promise.all(ids.map((id) => personOf(id)));
    return people.filter((person) => person !== null).map((person) => person.name).join(', ') || 'nobody';
}

export async function GET(request: Request) {
    if (process.env.TEAM_DEMO !== '1') return new Response(null, { status: 404 });
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const me = await currentUserId();
    if (me === null) return Response.json({ values: {} });
    const person = await personOf(me);
    const values: Record<string, string> = { me_id: me, me_name: person?.name ?? '' };

    // My teams, and the meetings on now, as the cloud says and the database names them.
    const [mine, now] = await Promise.all([teamsOf(me), meetingsNow()]);
    const on = mine.filter((team) => now.has(team.id));
    values.my_teams = mine.map((team) => team.name).join(', ') || 'none';
    values.meetings_now = [...now.keys()].map((id) => `'${meetingOf(id)}'`).join(', ') || 'none';
    values.meetings_on = on.map((team) => `${team.name} (${now.get(team.id)} in it)`).join(', ') || 'none right now';

    // A team's page, else my first team: the team, its lead, its meeting room and its first channel.
    const teamId = path.match(/^\/teams\/(\d+)$/)?.[1] ?? mine[0]?.id;
    const team = teamId && (await isMember(teamId, me)) ? await teamOf(teamId) : null;
    if (team) {
        const [people, channels, inIt] = await Promise.all([peopleIn(team.id), channelsOf(team.id), inMeeting(team.id)]);
        const others = people.map((one) => one.id).filter((id) => id !== me);
        Object.assign(values, {
            team_id: team.id,
            team_name: team.name,
            lead_name: team.leadName ?? 'nobody',
            members: people.map((one) => one.name).join(', '),
            meeting: meetingOf(team.id),
            in_meeting: await namesOf(inIt),
            answer: team.lead === me ? `{ admin: true }: ${person?.name} leads ${team.name}` : `true: ${person?.name} is in ${team.name}`,
            others: await namesOf(others),
            channel_name: channels[0]?.name ?? '',
            channel_room: channels[0] ? roomOf(channels[0].id) : '',
        });
    }

    // People: how many there are.
    values.people_count = String((await everyone()).length - 1);

    // A colleague's page: our conversation, and its room.
    const personId = path.match(/^\/people\/(\d+)$/)?.[1];
    const them = personId && (await areColleagues(me, personId)) ? await personOf(personId) : null;
    if (them) {
        const chat = await chatBetween(me, them.id);
        Object.assign(values, { them_id: them.id, them_name: them.name, chat_id: chat, chat_room: roomOf(chat) });
    }

    return Response.json({ values });
}
