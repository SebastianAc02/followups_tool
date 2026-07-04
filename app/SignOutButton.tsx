'use client';

import { useRouter } from 'next/navigation';
import { authClient } from './lib/auth-client';

export default function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  return (
    <button
      className="signout"
      title={email}
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Salir
    </button>
  );
}
