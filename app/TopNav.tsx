import Link from "next/link";
import SignOutButton from "./SignOutButton";

// Barra superior compartida por el dashboard (/) y la cola (/cola). La marca vuelve
// siempre al dashboard; Salir cierra sesion. Los links de seccion (Cadencias,
// Conectores, Agregar toque) NO viven aqui: son tarjetas del dashboard.
export default function TopNav({ email }: { email: string }) {
  return (
    <div className="mb-5 flex items-center justify-between border-b border-line pb-[18px]">
      <Link
        href="/"
        className="font-serif text-[18px] font-medium tracking-[-0.01em] text-ink hover:text-white"
      >
        Follow-ups OnePay
      </Link>
      <SignOutButton email={email} />
    </div>
  );
}
