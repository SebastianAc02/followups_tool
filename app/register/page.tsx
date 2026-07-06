import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import { miembrosLibres } from '../db/organizacion-repository';
import RegisterForm from './RegisterForm';

// V6: id 1 = Onepay, sembrada por scripts/seed_organizacion.ts. Una sola organizacion por
// ahora (fuera de alcance: multi-organizacion real).
const ID_ORGANIZACION_ONEPAY = 1;

export default async function RegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  const miembros = miembrosLibres(ID_ORGANIZACION_ONEPAY);

  return (
    <div className="wrap login-wrap">
      <div className="h-title">Follow-ups OnePay</div>
      <RegisterForm miembros={miembros} />
    </div>
  );
}
