import { estadoConector, listarConfigConectores, lineasWhatsappDeUsuario, lineasWhatsappPool, leerConfiguracionAdmin } from "../db/repository";
import { requireSession } from "../lib/session";
import { AppShell } from "../ui/shell/AppShell";
import { CATALOGO_CONECTORES, CATALOGO_CONFIGURACION, conectorDelCatalogo, type ModoConector } from "./catalogo.ts";
import { vistaEstado, contarEstados } from "./estado-ui.ts";
import { EstadoResumen } from "./EstadoResumen";
import { ConectorRow } from "./ConectorRow";
import { AgregarConector } from "./AgregarConector";
import { ConfiguracionAdmin } from "./ConfiguracionAdmin";
import { emailGmailConectado } from "../adapters/gmail";

export default async function Conectores() {
  const sesion = await requireSession();
  const config = listarConfigConectores();

  // Cruzar config (DB) con el catalogo (codigo). Ignorar filas cuyo proveedor ya no existe
  // en el catalogo (defensivo). Para admin-mode leemos el estado GLOBAL; para personal, el
  // del usuario en sesion.
  const activos = config
    .map((c) => {
      const cat = conectorDelCatalogo(c.proveedor);
      if (!cat) return null;
      const modo = c.modo as ModoConector;
      const estado = estadoConector(c.proveedor, modo === "personal" ? sesion.id : undefined);
      return { cat, modo, estado };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const resumen = contarEstados(activos.map((a) => vistaEstado(a.estado)));

  const agregados = new Set(activos.map((a) => a.cat.id));
  const disponibles = CATALOGO_CONECTORES.filter((c) => !agregados.has(c.id));

  // Tarea 8 (D6): "tus lineas" no depende del modo del conector whatsapp (esa fila
  // sigue siendo solo la credencial admin del servidor Evolution) -- se leen aparte,
  // por sesion.id, y se le pasan a ConectorRow solo cuando el conector es whatsapp.
  const misLineasWhatsapp = lineasWhatsappDeUsuario(sesion.id);
  const lineasPoolWhatsapp = sesion.admin ? lineasWhatsappPool() : [];

  // Etapa 1 (gmail): igual que emailCuenta de WhatsApp, el email conectado no es secreto
  // (a diferencia del refreshToken) -- se resuelve por fuera de estadoConector (que nunca
  // descifra nada) via una funcion Gmail-especifica en el adaptador.
  const emailConectadoGmail = emailGmailConectado(sesion.id);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="mb-4 text-xs uppercase tracking-widest text-muted">Operación</p>
          <h1 className="mb-4 font-serif text-4xl font-semibold tracking-tight text-ink md:text-5xl">
            Conectores
          </h1>
          <p className="max-w-prose text-base leading-relaxed text-muted">
            Las integraciones que alimentan tus follow-ups. Un vistazo basta para saber qué está vivo y qué falta por
            conectar.
          </p>
        </div>

        <EstadoResumen r={resumen} />

        {activos.length === 0 ? (
          <p className="py-9 text-sm text-muted">
            {sesion.admin
              ? "Todavía no hay conectores. Agrega el primero abajo."
              : "Todavía no hay conectores configurados. Tu admin los agrega."}
          </p>
        ) : (
          activos.map((a) => (
            <ConectorRow
              key={a.cat.id}
              cat={a.cat}
              estado={a.estado}
              modo={a.modo}
              esAdmin={sesion.admin}
              misLineasWhatsapp={a.cat.id === "whatsapp" ? misLineasWhatsapp : undefined}
              lineasWhatsappPool={a.cat.id === "whatsapp" ? lineasPoolWhatsapp : undefined}
              emailConectadoGmail={a.cat.id === "gmail" ? emailConectadoGmail : undefined}
            />
          ))
        )}

        {sesion.admin && <AgregarConector disponibles={disponibles} />}

        {sesion.admin && (
          <div className="mt-10">
            <p className="mb-3 text-xs uppercase tracking-widest text-muted">Configuración</p>
            <div className="flex flex-col gap-2.5">
              {CATALOGO_CONFIGURACION.map((cat) => (
                <ConfiguracionAdmin key={cat.clave} cat={cat} valor={leerConfiguracionAdmin(cat.clave)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
