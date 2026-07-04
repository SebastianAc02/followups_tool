import Link from "next/link";
import { getCuenta } from "../../db/repository";
import CaptureForm from "./CaptureForm";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <div className={`field ${has ? "has" : "miss"}`}>
      <span className="f-label">{label}</span>
      <span className="f-value">{has ? value : "sacar en la llamada"}</span>
    </div>
  );
}

export default async function Llamada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { emp, contactos, toques } = getCuenta(id);

  if (!emp) {
    return (
      <div className="wrap">
        <Link href="/" className="back">← Cola</Link>
        <p className="empty">Cuenta no encontrada.</p>
      </div>
    );
  }

  const principal = contactos.find((c) => c.esPrincipal === 1) ?? contactos[0];

  return (
    <div className="wrap">
      <Link href="/" className="back">← Cola</Link>

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
          {toques.map((t, i) => (
            <div className="tq" key={i}>
              <span className={`tq-res ${t.resultado === "no_contesto" ? "neg" : "pos"}`}>
                {t.resultado === "no_contesto" ? "No contestó" : t.resultado === "contesto" ? "Contestó" : t.canal ?? "toque"}
              </span>
              <span className="tq-txt">{t.quePaso ?? "—"}</span>
              <span className="tq-date mono">{(t.fecha ?? "").slice(0, 10)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
