import Link from "next/link";
import { buscarEmpresasPorNombre } from "../db/repository";
import { requireSession } from "../lib/session";

// V3.9: registrar un toque con alguien que NO es lead de la cola (cliente existente
// u otra relacion). No hay lógica nueva de dominio: busca la empresa y manda a la
// MISMA ficha /llamada/[id] que ya usa registrarToque para cualquier lead, ese
// toque queda igual que cualquier otro, solo que no nació desde la cola del día.
export default async function ToqueIndependiente({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const resultados = q.length >= 2 ? buscarEmpresasPorNombre(q) : [];

  return (
    <div className="wrap">
      <Link href="/" className="back">
        ← Inicio
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Agregar toque
      </div>
      <p className="conector-desc">
        Para dejar constancia de contacto con alguien que no es lead de la cola (cliente
        existente u otra relación). Busca la empresa y registra el toque igual que siempre.
      </p>

      <form method="GET" className="conector-form">
        <input name="q" defaultValue={q} placeholder="Buscar empresa por nombre..." autoFocus />
        <button type="submit">Buscar</button>
      </form>

      {q.length > 0 && q.length < 2 && <p className="conector-desc">Escribe al menos 2 letras.</p>}

      {resultados.length === 0 && q.length >= 2 && <p className="conector-desc">Sin resultados.</p>}

      {resultados.map((r) => (
        <Link key={r.id} href={`/llamada/${r.id}`} className="row">
          <div>
            <div className="l1">
              <span className="emp">{r.nombre}</span>
              {r.esCliente === 1 && <span className="pill hot">cliente</span>}
            </div>
            {r.ciudad && <div className="l2">{r.ciudad}</div>}
          </div>
        </Link>
      ))}
    </div>
  );
}
