import Link from "next/link";
import { getContextoToque } from "../../db/repository";
import { Confirmacion, type CampoConfirmacion } from "./Confirmacion";
import { LlamadaCard } from "./LlamadaCard";
import { decidirVista, urlNotionDe } from "./ToqueContexto";
import { calificar } from "../../core/calificacion";
import { RESULTADO_LABELS } from "../../db/validation";
import { requireSession } from "../../lib/session";
import { SidebarFrame } from "../../ui/shell/SidebarFrame";

// Despachador: decide la vista (canal del paso activo de la secuencia, o ?vista=confirmacion
// justo despues de guardar) y arma las props que cada vista necesita. Este archivo es el unico
// que decide -- LlamadaCard y Confirmacion solo pintan lo que reciben.

function labelResultado(resultado: string | null | undefined, canal: string | null | undefined) {
  if (!resultado) return canal ?? "toque";
  if (resultado === "contesto") return "Contestó"; // valor legado pre-V1.2
  return RESULTADO_LABELS[resultado as keyof typeof RESULTADO_LABELS] ?? canal ?? resultado;
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
  const sp = await searchParams;
  const ctx = getContextoToque(id);

  if (!ctx.emp) {
    return (
      <SidebarFrame>
        <div className="wrap">
          <Link href="/cola" className="back">← Cola</Link>
          <p className="empty">Cuenta no encontrada.</p>
        </div>
      </SidebarFrame>
    );
  }

  const vista = decidirVista(ctx, sp);

  // Tarea 7: receipt post-submit. registrarToqueAction redirige aca con ?vista=confirmacion
  // tras guardar -- esto SOLO lee lo que ya se persistio (nada de sync nuevo). El resumen de
  // Granola no se cachea hoy en `toque` (solo el puntero transcriptId/Url si ya se confirmo
  // una grabacion, y getCuenta().toques no expone transcriptUrl); por eso, si no hay resumen
  // cacheado, <Confirmacion> cae al mismo flujo <BuscarGrabacion> que la vista normal.
  if (vista === "confirmacion") {
    const { emp, toques } = ctx;
    const ultimo = toques[0];
    const campos: CampoConfirmacion[] = [
      { label: "Usuarios", valor: emp.usuarios != null ? String(Math.round(emp.usuarios)) : "sacar en la llamada" },
      { label: "CRM / Software", valor: emp.crm ?? "sacar en la llamada" },
      { label: "Pasarela actual", valor: emp.pasarela ?? "sacar en la llamada" },
      { label: "Resultado", valor: labelResultado(ultimo?.resultado, ultimo?.canal) },
    ];

    return (
      <SidebarFrame>
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
      </SidebarFrame>
    );
  }

  if (vista === "llamada") {
    return (
      <SidebarFrame>
        <div className="wrap">
          <Link href="/cola" className="back">← Cola</Link>
          <LlamadaCard
            ctx={ctx}
            urlNotion={urlNotionDe(ctx)}
            calificacion={calificar({
              usuarios: ctx.emp.usuarios ?? null,
              crm: ctx.emp.crm ?? null,
              pasarela: ctx.emp.pasarela ?? null,
              recaudo: null,
            })}
          />
        </div>
      </SidebarFrame>
    );
  }

  // Fase 2: canal correo/whatsapp todavia no tiene editor propio.
  return (
    <SidebarFrame>
      <div className="wrap">
        <Link href="/cola" className="back">← Cola</Link>
        <p className="empty">Editor en camino (Fase 2).</p>
      </div>
    </SidebarFrame>
  );
}
