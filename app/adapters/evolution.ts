import type { CanalEntrega, DestinatarioEnvio, PasoEnvio, EnvioResultado } from '../core/ports/envio';
import type { ConexionLinea, InicioConexion, EstadoLinea } from '../core/ports/conexion';
import type { MensajeEntrante } from '../core/llego-respuesta';
import { leerCredencialConector } from '../db/repository';

// Base local de Fase 0 (planning/plan-whatsapp-adapter.md, ../whatsapp-osserver/README.md):
// self-hosted, sin default a un dominio publico (a diferencia de Apollo, que es SaaS).
// En VPS (Fase 1) esta variable pasa a apuntar al proxy interno de Docker, nunca a una
// URL publica -- Evolution nunca se expone directo a internet.
const EVOLUTION_API_BASE = process.env.EVOLUTION_API_BASE_URL ?? 'http://localhost:8080';
const TIMEOUT_MS = 10_000; // mismo limite que apollo.ts: un fetch colgado no traba el ciclo del worker

// Credencial GLOBAL (una sola instalacion de Evolution para toda OnePay), mismo patron
// admin-mode que Notion: se guarda una vez en /conectores, no por usuario.
function credencial(): string {
  const key = leerCredencialConector('whatsapp');
  if (!key) throw new Error('No hay credencial de Evolution (whatsapp) configurada');
  return key;
}

async function llamarEvolution<T>(path: string, apiKey: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${EVOLUTION_API_BASE}${path}`, {
      ...init,
      headers: { apikey: apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Evolution no respondio en ${TIMEOUT_MS}ms en ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    // Forma real verificada en vivo contra Fase 0 (POST /message/sendText con instancia
    // sin conectar): {status, error, response:{message}}. Se cuelga el body crudo en el
    // mensaje para no perder detalle mientras no hay mas variedad de errores capturados.
    const cuerpo = await res.text();
    throw new Error(`Evolution respondio ${res.status} en ${path}: ${cuerpo}`);
  }
  return res.json() as Promise<T>;
}

// Forma real de GET /instance/connect/{instancia}[?number=...], capturada en vivo
// contra Fase 0 (2026-07-09, instancia 'prueba'): {pairingCode, code, base64, count}.
// Sin `?number`, Evolution solo llena `base64` (QR); pairingCode viene null. CON
// `?number=<E164 sin +>`, llena `pairingCode` (string de 8 caracteres) ademas del QR.
//
// El QR quedo INUTIL server-side por el crackdown de WhatsApp de junio 2026
// (Shortcake/passkey): falla desde el primer intento con "no se pueden vincular
// dispositivos" -- no es un bug de Evolution, es WhatsApp bloqueando el flujo no
// oficial de vinculacion por camara. El pairing-code es hoy el UNICO metodo que
// aparea de verdad, por eso iniciarConexion lo pide por defecto (ver mas abajo).
type ConectarRespuesta = { base64?: string; pairingCode?: string | null; count?: number };
type FetchInstanceRespuesta = { connectionStatus?: string }[];
// Forma de EXITO de POST /message/sendText, CONFIRMADA en vivo (2026-07-09, linea real
// ya conectada por pairing-code): { key: { id }, status: 'PENDING', ... }. key.id es
// el id de mensaje real de WhatsApp (ya no es hipotesis).
type EnviarTextoRespuesta = { key?: { id?: string }; status?: string };

// D5: mapea el connectionStatus crudo de Evolution ('close' | 'connecting' | 'open',
// verificado en vivo via GET /instance/fetchInstances) al vocabulario de dominio.
// 'open' = activa (aparea listo para mandar); todo lo demas que no sea 'connecting'
// se trata como caida -- mas seguro que asumir que un estado desconocido sigue viva.
function mapearEstado(connectionStatus: string | undefined): EstadoLinea {
  if (connectionStatus === 'open') return 'activa';
  if (connectionStatus === 'connecting') return 'calentando';
  return 'caida';
}

export function crearEvolutionAdapter(): CanalEntrega & ConexionLinea {
  return {
    async enviarPaso(
      referenciaProveedor: string,
      destinatario: DestinatarioEnvio,
      paso: PasoEnvio,
    ): Promise<EnvioResultado> {
      // telefono nullable (DestinatarioEnvio, D3): WhatsApp es EXCLUSIVAMENTE el
      // proveedor de canal=whatsapp, siempre con telefono real -- si esto truena es un
      // bug de quien enruta (goteo mandando al canal equivocado), no un caso a manejar
      // en silencio.
      if (!destinatario.telefono) throw new Error('Evolution requiere telefono y el destinatario no trae uno');
      const apiKey = credencial();
      // proveedorCampanaId en el resto del puerto es el id de SECUENCIA (Apollo); aca
      // se reusa el mismo parametro posicional para la referenciaProveedor de la LINEA
      // (nombre de instancia) porque es lo que enviarPaso recibe de push.ts -- WhatsApp
      // no tiene concepto de secuencia externa, la linea que manda ocupa ese lugar.
      const data = await llamarEvolution<EnviarTextoRespuesta>(`/message/sendText/${referenciaProveedor}`, apiKey, {
        method: 'POST',
        body: JSON.stringify({ number: destinatario.telefono, text: paso.cuerpo, delay: 1200 }),
      });
      const mensajeId = data.key?.id;
      if (!mensajeId) throw new Error(`Evolution no devolvio id de mensaje al enviar por ${referenciaProveedor}`);
      return { proveedor: 'evolution', proveedorMensajeId: mensajeId };
    },

    // Pairing-code por DEFAULT (2026-07-09): el QR esta bloqueado server-side (ver
    // comentario de ConectarRespuesta arriba), asi que pedirlo primero solo gastaria un
    // roundtrip para un metodo que ya se sabe que falla. `?number=` es lo que le dice a
    // Evolution que rellene `pairingCode` en la respuesta.
    //
    // La rama de QR queda escrita y accesible (norma extend-only, D-algo del plan: no
    // se borra codigo que funciona), por si WhatsApp reabre el flujo o para debug
    // manual -- ver iniciarConexionPorQr mas abajo, no se llama desde aca.
    async iniciarConexion(referenciaProveedor: string, numero: string): Promise<InicioConexion> {
      const apiKey = credencial();
      const query = new URLSearchParams({ number: numero });
      const data = await llamarEvolution<ConectarRespuesta>(
        `/instance/connect/${referenciaProveedor}?${query}`,
        apiKey,
      );
      if (!data.pairingCode) throw new Error(`Evolution no devolvio pairing-code para ${referenciaProveedor}`);
      return { tipo: 'codigo', formato: 'pairing', data: data.pairingCode };
    },

    async estadoConexion(referenciaProveedor: string): Promise<EstadoLinea> {
      const apiKey = credencial();
      // Verificado en vivo: fetchInstances devuelve TODAS las instancias, no una sola
      // filtrada por nombre -- no hay GET /instance/fetchInstances/{instancia} en esta
      // version. Filtrar aca es mas barato que agregar un adaptador de query aparte.
      const data = await llamarEvolution<FetchInstanceRespuesta>('/instance/fetchInstances', apiKey);
      const instancia = data.find((i) => (i as { name?: string }).name === referenciaProveedor);
      return mapearEstado(instancia?.connectionStatus);
    },

    async desconectar(referenciaProveedor: string): Promise<void> {
      const apiKey = credencial();
      // Ruta documentada de Evolution: DELETE /instance/logout cierra la sesion de
      // WhatsApp sin borrar la instancia (se puede volver a aparear con un
      // pairing-code nuevo via iniciarConexion).
      await llamarEvolution<unknown>(`/instance/logout/${referenciaProveedor}`, apiKey, { method: 'DELETE' });
    },
  };
}

// Rama de QR (norma extend-only: no se borra codigo que funciona, aunque hoy no se
// use). Bloqueada server-side desde el crackdown de WhatsApp de junio 2026 -- falla
// desde el primer intento con "no se pueden vincular dispositivos" en el propio
// telefono, sin importar cuantas veces se regenere el QR. Se deja aparte de
// crearEvolutionAdapter (no forma parte de ConexionLinea) para no competir con
// iniciarConexion como default; sirve para debug manual o si WhatsApp reabre el flujo.
export async function iniciarConexionPorQr(referenciaProveedor: string): Promise<InicioConexion> {
  const apiKey = credencial();
  const data = await llamarEvolution<ConectarRespuesta>(`/instance/connect/${referenciaProveedor}`, apiKey);
  if (!data.base64) throw new Error(`Evolution no devolvio QR para ${referenciaProveedor}`);
  return { tipo: 'codigo', formato: 'qr', data: data.base64 };
}

// ── Entrada: parseo del webhook de Evolution (tarea 5/6, D5) ──────────────────────
// El parseo vive DENTRO del adaptador (no en la ruta): el route solo autentica y delega,
// el core recibe un MensajeEntrante ya limpio y no sabe nada de 'messages.upsert' ni de
// remoteJid. Todo lo de abajo esta modelado contra el payload REAL capturado en vivo en
// Fase 0 (2026-07-09, webhook.site), no inventado.
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// El texto segun messageType. 'conversation' CONFIRMADO en vivo (payload real Fase 0).
// 'extendedTextMessage.text' (un reply citado o con link preview) es la forma documentada
// de Baileys pero NO capturada en vivo todavia: se soporta para no perder replies reales,
// dejando la marca de que no esta confirmada con dato propio.
function extraerTexto(message: Record<string, unknown> | null): string | null {
  if (!message) return null;
  const conversation = asString(message.conversation);
  if (conversation) return conversation;
  const ext = asRecord(message.extendedTextMessage);
  return ext ? asString(ext.text) : null;
}

// Traduce el body crudo del webhook de Evolution a un evento de dominio, o null si no es
// una respuesta entrante que nos interese (otro evento, algo que mandamos nosotros, o
// un mensaje sin texto). Nunca tira: entrada no confiable, se descarta en silencio.
export function parsearMensajeEntrante(payload: unknown): MensajeEntrante | null {
  const p = asRecord(payload);
  if (!p) return null;
  // Solo mensajes nuevos. El mismo webhook tambien empuja 'messages.update' (acuses
  // DELIVERY_ACK) y 'connection.update' -- se descartan.
  if (p.event !== 'messages.upsert') return null;

  const data = asRecord(p.data);
  const key = data ? asRecord(data.key) : null;
  if (!data || !key) return null;
  // fromMe:true = lo mande yo (incluido el self-chat) -- no es una respuesta entrante.
  if (key.fromMe !== false) return null;

  const mensajeId = asString(key.id);
  const remoteJid = asString(key.remoteJid);
  if (!mensajeId || !remoteJid) return null;

  const texto = extraerTexto(asRecord(data.message));
  if (!texto) return null; // v1: solo texto (audio/media/sticker se ignoran)

  // remoteJid: '573022482292@s.whatsapp.net' -> solo digitos '573022482292'.
  const telefono = remoteJid.split('@')[0].replace(/\D/g, '');
  if (!telefono) return null;

  // referenciaProveedor = nombre de instancia (p.instance = 'prueba'), lo mismo que
  // guarda linea_whatsapp.referencia_proveedor y usa enviarPaso. instanceId (UUID) NO
  // sirve aca porque no es como identificamos la linea del lado nuestro.
  const referenciaProveedor = asString(p.instance) ?? '';

  // messageTimestamp es unix EN SEGUNDOS (verificado en vivo: 1783648298). Fallback a
  // date_time (ISO) si no viniera.
  const ts = data.messageTimestamp;
  const fecha =
    typeof ts === 'number' ? new Date(ts * 1000).toISOString() : asString(p.date_time) ?? '';

  return { referenciaProveedor, telefono, texto, mensajeId, fecha };
}
