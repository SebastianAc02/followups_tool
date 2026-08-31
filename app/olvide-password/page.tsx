import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import OlvidePasswordForm from './OlvidePasswordForm';

export default async function OlvidePasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  return (
    <div className="auth-cockpit">
      <OlvidePasswordForm />
    </div>
  );
}
