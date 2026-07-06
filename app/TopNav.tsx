import Link from "next/link";
import SignOutButton from "./SignOutButton";

// Barra superior compartida por el dashboard (/) y la cola (/cola). La marca vuelve
// siempre al dashboard; Salir cierra sesion. Los links de seccion (Cadencias,
// Conectores, Agregar toque) NO viven aqui: son tarjetas del dashboard.
export default function TopNav({ email }: { email: string }) {
  return (
    <div className="topnav">
      <Link href="/" className="topnav-brand">Follow-ups OnePay</Link>
      <SignOutButton email={email} />
    </div>
  );
}
