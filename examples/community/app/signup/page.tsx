import { WORLDS } from '@/lib/worlds';
import { AccountForm } from '../account-form';
import { DemoPeople } from '../demo-people';

export default function SignUp() {
    return (
        <AccountForm mode="signup" peopleOnly={WORLDS}>
            <DemoPeople />
        </AccountForm>
    );
}
