'use client';

import { useRouter } from 'next/navigation';
import { authClient } from './lib/auth-client';

export default function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="cursor-pointer border-none bg-transparent font-[inherit] text-[13px] text-ink opacity-50 hover:opacity-100"
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
