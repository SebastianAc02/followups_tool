import Link from "next/link";
import { estadoConector, type EstadoConector } from "../db/repository";
import { requireSession } from "../lib/session";
import { guardarGranolaAction, guardarNotionAction } from "./actions";

// V3.8: link fijo al CRM real. No es un secreto (cualquiera del workspace ya tiene
// acceso vía Notion), por eso vive en env con default en vez de en `conector`.
const NOTION_CRM_URL =
  process.env.NOTION_CRM_URL ?? "https://app.notion.com/p/f5e2be53a1514d42ac6db30fd7c5202a";

function semaforo(estado: EstadoConector): { color: "verde" | "amarillo" | "rojo" | "gris"; texto: string } {
  if (!estado.tieneCredencial) return { color: "gris", texto: "Sin configurar" };
  if (estado.ultimoResultado?.startsWith("error")) return { color: "rojo", texto: "Caído" };
  if (estado.ultimoResultado === "ok") return { color: "verde", texto: "Vivo" };
  return { color: "amarillo", texto: "Configurado, sin corridas todavía" };
}

function EstadoCard({ estado }: { estado: EstadoConector }) {
  const s = semaforo(estado);
  return (
    <div className="conector-estado">
      <span className={`conector-dot ${s.color}`} aria-hidden="true" />
      <span className="conector-texto">{s.texto}</span>
      {estado.ultimaCorrida && (
        <span className="conector-meta mono">
          última corrida {estado.ultimaCorrida.slice(0, 16).replace("T", " ")}
        </span>
      )}
      {estado.ultimoResultado && estado.ultimoResultado !== "ok" && (
        <span className="conector-resultado">{estado.ultimoResultado}</span>
      )}
    </div>
  );
}

export default async function Conectores() {
  const sesion = await requireSession();
  const granola = estadoConector("granola", sesion.id);
  const notion = estadoConector("notion");

  return (
    <div className="wrap">
      <Link href="/" className="back">
        ← Inicio
      </Link>
      <div className="h-title" style={{ marginBottom: 24 }}>
        Conectores
      </div>

      <div className="section-label">Granola (tu cuenta)</div>
      <p className="conector-desc">
        Cada quien conecta su propia cuenta de Granola. Se pega una vez, se guarda cifrada y
        nunca vuelve a mostrarse.
      </p>
      <EstadoCard estado={granola} />
      <form action={guardarGranolaAction} className="conector-form">
        <input name="credencial" type="password" placeholder="grn_..." autoComplete="off" />
        <button type="submit">Guardar</button>
      </form>

      <div className="section-label" style={{ marginTop: 32 }}>
        Notion (CRM del equipo)
      </div>
      <p className="conector-desc">
        Un solo CRM para todos.{" "}
        <a href={NOTION_CRM_URL} target="_blank" rel="noreferrer">
          Abrir el CRM →
        </a>
      </p>
      <EstadoCard estado={notion} />
      {sesion.admin ? (
        <form action={guardarNotionAction} className="conector-form">
          <input name="credencial" type="password" placeholder="Token de integración de Notion" autoComplete="off" />
          <button type="submit">Guardar</button>
        </form>
      ) : (
        <p className="conector-desc conector-solo-admin">Solo un admin puede configurar esta credencial.</p>
      )}
    </div>
  );
}
