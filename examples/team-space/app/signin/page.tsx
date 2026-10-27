import { WORLDS } from '@/lib/worlds';
import { AccountForm } from '../account-form';
import { DemoPeople } from '../demo-people';

export default function SignIn() {
    return (
        <AccountForm mode="signin" peopleOnly={WORLDS}>
            <DemoPeople />
        </AccountForm>
    );
}
