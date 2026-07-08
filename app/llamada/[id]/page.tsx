import Link from "next/link";
import { getCuenta } from "../../db/repository";
import CaptureForm from "./CaptureForm";
import BuscarGrabacion from "./BuscarGrabacion";
import { Confirmacion, type CampoConfirmacion } from "./Confirmacion";
import { RESULTADO_LABELS, RESULTADOS_CONTESTO, type Resultado } from "../../db/validation";
import { requireSession } from "../../lib/session";

// Resultados que cuentan como "algo bueno pasó" (verde --done vía .pos). El resto (incluido
// el legado "contesto" que ya no se genera pero puede existir en toques históricos) es .neg.
const RESULTADOS_POSITIVOS = new Set(["contesto_reunion", "contesto_sigue_seguimiento"]);

function labelResultado(resultado: string | null | undefined, canal: string | null | undefined) {
  if (!resultado) return canal ?? "toque";
  if (resultado === "contesto") return "Contestó"; // valor legado pre-V1.2
  return RESULTADO_LABELS[resultado as keyof typeof RESULTADO_LABELS] ?? canal ?? resultado;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <div className={`field ${has ? "has" : "miss"}`}>
      <span className="f-label">{label}</span>
      <span className="f-value">{has ? value : "sacar en la llamada"}</span>
    </div>
  );
}

export default async function Llamada({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { vista } = await searchParams;
  const { emp, contactos, toques } = getCuenta(id);

  if (!emp) {
    return (
      <div className="wrap">
        <Link href="/cola" className="back">← Cola</Link>
        <p className="empty">Cuenta no encontrada.</p>
      </div>
    );
  }

  // Tarea 7: receipt post-submit. registrarToqueAction redirige aca con ?vista=confirmacion
  // tras guardar -- esto SOLO lee lo que ya se persistio (nada de sync nuevo). El resumen de
  // Granola no se cachea hoy en `toque` (solo el puntero transcriptId/Url si ya se confirmo
  // una grabacion, y getCuenta().toques no expone transcriptUrl); por eso, si no hay resumen
  // cacheado, <Confirmacion> cae al mismo flujo <BuscarGrabacion> que la vista normal.
  if (vista === "confirmacion") {
    const ultimo = toques[0];
    const campos: CampoConfirmacion[] = [
      { label: "Usuarios", valor: emp.usuarios != null ? String(Math.round(emp.usuarios)) : "sacar en la llamada" },
      { label: "CRM / Software", valor: emp.crm ?? "sacar en la llamada" },
      { label: "Pasarela actual", valor: emp.pasarela ?? "sacar en la llamada" },
      { label: "Resultado", valor: labelResultado(ultimo?.resultado, ultimo?.canal) },
    ];

    return (
      <div className="wrap">
        <Link href="/cola" className="back">← Cola</Link>
        <Confirmacion
          idEmpresa={emp.id}
          idToque={ultimo?.idToque ?? 0}
          empresa={emp.nombre ?? "Cuenta sin nombre"}
          dia={null}
          duracion={null}
          campos={campos}
          resumenDictado={ultimo?.quePaso ?? "Sin resumen dictado."}
          granola={{ resumen: null, url: null }}
          sincronizado={{ notion: Boolean(emp.notionPageId), granola: Boolean(ultimo?.transcriptId) }}
        />
      </div>
    );
  }

  const principal = contactos.find((c) => c.esPrincipal === 1) ?? contactos[0];

  return (
    <div className="wrap">
      <Link href="/cola" className="back">← Cola</Link>

      <div className="call-head">
        <h1 className="call-title">{emp.nombre}</h1>
        <div className="call-sub">
          {principal ? `${principal.nombre ?? ""}${principal.cargo ? " · " + principal.cargo : ""}` : "sin contacto"}
          {principal?.telefono ? <> · <span className="mono">{principal.telefono}</span></> : null}
        </div>
      </div>

      <CaptureForm idEmpresa={emp.id} />

      <div className="section-label">Los 3 imprescindibles</div>
      <div>
        <Field label="Usuarios" value={emp.usuarios != null ? Math.round(emp.usuarios) : null} />
        <Field label="CRM / Software" value={emp.crm} />
        <Field label="Pasarela actual" value={emp.pasarela} />
      </div>

      <div className="section-label">La cuenta</div>
      <div>
        <Field label="Ciudad" value={emp.ciudad} />
        <Field label="Estado" value={emp.estado} />
        <Field label="Email" value={principal?.email} />
        <Field label="Próximo paso" value={emp.proximoPaso} />
      </div>

      {toques.length > 0 && (
        <>
          <div className="section-label">Toques anteriores</div>
          {toques.map((t) => (
            <div className="tq" key={t.idToque}>
              <span className={`tq-res ${RESULTADOS_POSITIVOS.has(t.resultado ?? "") ? "pos" : "neg"}`}>
                {labelResultado(t.resultado, t.canal)}
              </span>
              <span className="tq-txt">{t.quePaso ?? "—"}</span>
              <span className="tq-date mono">{(t.fecha ?? "").slice(0, 10)}</span>
              {t.canal === "llamada" && !t.transcriptId && RESULTADOS_CONTESTO.includes(t.resultado as Resultado) && (
                <BuscarGrabacion idEmpresa={emp.id} idToque={t.idToque} />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
