import Link from "next/link";
import { listarCadencias, getCadencia } from "../db/repository";
import { requireSession } from "../lib/session";
import { importarCadenciaAction } from "./actions";
import ConstructorCadencia from "./ConstructorCadencia";

const PLACEHOLDER = `# ISP outbound Tier 1

## Día 0 · correo · Me presento
Hola, soy Sebastián de OnePay...

## Día 3 · whatsapp
Seguí por acá, ¿lo pudiste ver?

## Día 7 · llamada · Cierre
Guion de la llamada.`;

export default async function Cadencias({ searchParams }: { searchParams: Promise<{ id?: string; error?: string }> }) {
  await requireSession();
  const sp = await searchParams;

  const cadencias = listarCadencias();
  const sel = sp.id ? getCadencia(Number(sp.id)) : null;
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="wrap">
      <Link href="/" className="back">
        ← Inicio
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Cadencias
      </div>

      {sp.error && <p className="login-error">{sp.error}</p>}

      <div className="section-label">Subir una cadencia</div>
      <p className="conector-desc">
        Ya hiciste el copy: pégalo una vez (CSV o Markdown) y la herramienta arma el template. En Markdown el
        título del <span className="mono">#</span> es el nombre y cada <span className="mono">## Día N · canal · asunto</span> es un toque.
      </p>
      <form action={importarCadenciaAction} className="cad-import capture">
        <div className="cad-import-top">
          <input name="nombre" placeholder="Nombre (para CSV; en Markdown lo toma del título)" />
          <select name="formato" defaultValue="md" className="cad-formato">
            <option value="md">Markdown</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <textarea name="contenido" rows={8} placeholder={PLACEHOLDER} />
        <button type="submit" className="save">
          Subir cadencia
        </button>
      </form>

      <div className="section-label">Mis cadencias</div>
      {cadencias.length === 0 ? (
        <p className="conector-desc">Todavía no hay cadencias. Sube la primera arriba.</p>
      ) : (
        <div className="cad-list">
          {cadencias.map((c) => (
            <Link key={c.id} href={`/cadencias?id=${c.id}`} className={`cad-item ${sel?.cadencia.idCadencia === c.id ? "on" : ""}`}>
              <span className="cad-item-nombre">{c.nombre}</span>
              <span className="cad-item-meta mono">{c.pasos} pasos</span>
            </Link>
          ))}
        </div>
      )}

      {sel && (
        <ConstructorCadencia
          nombre={sel.cadencia.nombre}
          anchor={hoy}
          pasos={sel.pasos.map((p) => ({ orden: p.orden, diaOffset: p.diaOffset, canal: p.canal, asunto: p.asunto }))}
        />
      )}
    </div>
  );
}
