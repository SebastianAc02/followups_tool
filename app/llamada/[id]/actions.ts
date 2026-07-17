"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  registrarToque,
  actualizarCampoCalificacion,
  terminosBusquedaTranscript,
  leerToqueTranscript,
  escribirTranscriptCompleto,
  escribirTranscriptSoloPuntero,
  marcarPasoInscripcionCompletadaManual,
  datosEnvioPasoManual,
  registrarPasoEnviadoConToque,
  lineaWhatsappActiva,
  guardarProximoPasoPBX,
  graduarDePBX,
  leerDiscovery,
  guardarDiscovery,
  leerTranscriptResumen,
  sacarInscripcionDeCampana,
  datosSecuenciaExterna,
} from "../../db/repository";
import { fusionarDiscovery, hidratarBrief } from "../../core/fusionar";
import { pedirBorradores } from "../../core/borradores";
import { crearRegistroEnvio } from "../../adapters/registro-envio";
import { registrarToqueSchema } from "../../db/validation";
import type { CampoCalificacion } from "../../core/calificacion";
import { requireSession, requireEscritura } from "../../lib/session";
import { crearGranolaAdapter } from "../../adapters/granola";
import { crearClaudeAdapter } from "../../adapters/claude";
import { agruparCandidatas, type CandidataOFusion } from "../../core/matcher";
import { confirmarTranscript } from "../../core/confirmarTranscript";
import { estructurarToque, type ToqueEstructurado } from "../../core/estructurar-toque";
import { interpretarResultadoPBX, type PbxInterpretado } from "../../core/pbx-interpretar";
import { proponerSiguientePaso, type ResultadoPBX } from "../../core/pbx";
import { aprobarDesdeInboxAction, type AprobarDesdeInboxResultado } from "../../por-revisar/actions";

export async function registrarToqueAction(formData: FormData) {
  const { idOrganizacion } = await requireSession();
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const resultado = String(formData.get("resultado") ?? "");
  if (!idEmpresa || !resultado) return;

  // Canal REAL de este toque. CaptureForm (V1.3) siempre lo manda con un selector visible;
  // el default "llamada" solo cubre el caso defensivo de un FormData incompleto.
  const canal = String(formData.get("toqueCanal") ?? "llamada").trim() || "llamada";

  const quePaso = String(formData.get("quePaso") ?? "").trim() || undefined;
  const fecha = String(formData.get("fecha") ?? "").trim() || undefined;
  const proximoCanal = String(formData.get("canal") ?? "").trim() || undefined;
  const usuariosRaw = String(formData.get("usuarios") ?? "").trim();
  const usuarios = usuariosRaw ? Number(usuariosRaw) : undefined;
  const crm = String(formData.get("crm") ?? "").trim() || undefined;
  const pasarela = String(formData.get("pasarela") ?? "").trim() || undefined;

  const razonPerdida = String(formData.get("razonPerdida") ?? "").trim() || undefined;
  const objecion = String(formData.get("objecion") ?? "").trim() || undefined;

  const kdmNombre = String(formData.get("kdmNombre") ?? "").trim() || undefined;
  const kdmTelefono = String(formData.get("kdmTelefono") ?? "").trim() || undefined;
  const kdm = kdmNombre ? { nombre: kdmNombre, telefono: kdmTelefono } : undefined;

  // Validación temprana con el mismo schema del Repository: da un error de formulario más
  // amable aquí, pero la fuente de verdad de la regla vive en registrarToque.
  const parsed = registrarToqueSchema.parse({
    idEmpresa,
    canal,
    resultado,
    quePaso,
    proximoFollowUp: fecha,
    proximoCanal,
    usuarios,
    crm,
    pasarela,
    razonPerdida,
    objecion,
    kdm,
  });

  registrarToque(parsed, idOrganizacion);

  // El discovery de la cuenta: la version FUSIONADA que el owner acaba de revisar en el
  // borrador, no lo que escupio la IA sola. Si los campos no vienen (un toque registrado sin
  // pasar por "Estructurar con IA"), no se toca nada: un form sin esos inputs no puede borrar
  // tres meses de facts.
  const notasDiscovery = String(formData.get("notasDiscovery") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  if (notasDiscovery || brief) {
    guardarDiscovery(idEmpresa, { notas: notasDiscovery, brief }, idOrganizacion);
  }

  // Sesion 2026-07-09: si este toque cierra el paso activo de una cadencia (llamada
  // con paso_inscripcion pendiente), el paso se marca 'enviada' aca -- el toque YA
  // quedo guardado arriba con su resultado real, esto solo saca la fila de "Ir a
  // llamar" y le da al motor la fecha real para re-anclar el siguiente paso. No
  // aplica a un toque suelto (idPasoInscripcion viene vacio, no hay nada que cerrar).
  const idPasoInscripcionRaw = String(formData.get("idPasoInscripcion") ?? "").trim();
  if (idPasoInscripcionRaw) {
    marcarPasoInscripcionCompletadaManual(Number(idPasoInscripcionRaw), new Date().toISOString());
  }

  revalidatePath("/");
  revalidatePath("/cola");
  revalidatePath("/por-revisar");
  revalidatePath(`/llamada/${idEmpresa}`);
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}

// Edicion inline del checklist de calificacion: guarda un solo campo (usuarios/crm/
// pasarela) sin registrar un toque. Ver actualizarCampoCalificacion en el repository.
export async function actualizarCampoCalificacionAction(
  idEmpresa: string,
  campo: CampoCalificacion,
  valor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { idOrganizacion } = await requireSession();
  try {
    actualizarCampoCalificacion(idEmpresa, campo, valor, idOrganizacion);
    revalidatePath(`/llamada/${idEmpresa}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}

const VENTANA_HORAS = 12;

function sumarHoras(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 60 * 60 * 1000).toISOString();
}

// V3.4: busca en Granola por los terminos de esta empresa/contacto, en una ventana
// de tiempo alrededor del toque. No persiste nada, el buscar es de solo lectura,
// solo confirmarGrabacionAction escribe.
//
// Resultado tipado, no excepcion (2026-07-16): en build de produccion Next.js sanitiza
// CUALQUIER error de una server action al mismo mensaje generico ("An error occurred in
// the Server Components render...") antes de mandarlo al cliente -- asi el error real
// (p.ej. "no hay credencial de Granola para este usuario", el caso mas comun: el
// conector conmuta por base y hay que conectarlo DENTRO del modo prueba, no solo en la
// real) nunca llegaba a verse, solo el digest. Mismo patron que el resto de este
// archivo/carpeta (CicloVidaResultado, LanzarCampanaResultado): atrapar aca y devolver
// el mensaje real en el resultado, no dejar que escape como excepcion.
export type BuscarGrabacionResultado = { ok: true; candidatas: CandidataOFusion[] } | { ok: false; error: string };

export async function buscarGrabacionAction(idToque: number): Promise<BuscarGrabacionResultado> {
  const sesion = await requireSession();
  try {
    const datos = terminosBusquedaTranscript(idToque);
    if (!datos || datos.terminos.length === 0) return { ok: true, candidatas: [] };

    const adapter = crearGranolaAdapter(sesion.id);
    const desde = sumarHoras(datos.fecha, -VENTANA_HORAS);
    const hasta = sumarHoras(datos.fecha, VENTANA_HORAS);
    const candidatas = await adapter.buscarCandidatas(datos.terminos, desde, hasta);

    return { ok: true, candidatas: agruparCandidatas(candidatas, datos.fecha) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo buscar en Granola' };
  }
}

// V3.4 + V3.6: escribe la candidata elegida por Sebastian. Nunca se llama sola --
// siempre despues de que el humano confirmo en la UI cual de las candidatas es la
// correcta. La politica de que se pisa y que no (V3.6) vive en el core; esta funcion
// solo conecta las dependencias reales.
export async function confirmarGrabacionAction(idEmpresa: string, idToque: number, candidata: CandidataOFusion) {
  await requireSession();
  confirmarTranscript(idToque, candidata, {
    leerToque: leerToqueTranscript,
    escribirCompleto: escribirTranscriptCompleto,
    escribirSoloPuntero: escribirTranscriptSoloPuntero,
  });
  revalidatePath(`/llamada/${idEmpresa}`);
}

// El borrador que ve el owner: lo estructurado de ESTA llamada, mas la propuesta de como queda
// el discovery acumulado de la cuenta si lo aprueba.
export type BorradorConFusion = ToqueEstructurado & { notasFusionadas: string; briefHidratado: string };

// Tarea 5b: solo PROPONE un borrador estructurado a partir del dictado (texto pegado, nunca
// audio). No escribe nada -- el owner corrige el borrador en CapturaLlamada y recien
// registrarToqueAction (submit del form) persiste.
//
// Tres pasos con la IA, no uno: extraer, fusionar los facts con lo que ya sabiamos, e hidratar
// el brief. Un solo prompt que hiciera las tres cosas las haria las tres mal, y no se podria
// testear la fusion sin testear la extraccion. Fusionar e hidratar solo dependen de extraer, no
// la una de la otra, asi que van en paralelo: la latencia es extraer + max(fusionar, hidratar),
// no la suma.
export async function estructurarDictadoAction(idEmpresa: string, dictado: string): Promise<BorradorConFusion> {
  await requireEscritura();
  const { idOrganizacion } = await requireSession();
  const ia = crearClaudeAdapter();

  const estructurado = await estructurarToque(dictado, ia);
  const actual = leerDiscovery(idEmpresa, idOrganizacion);

  const [notasFusionadas, briefHidratado] = await Promise.all([
    fusionarDiscovery(actual.notas, estructurado.notasDiscovery, ia),
    hidratarBrief(actual.brief, estructurado.brief, ia),
  ]);

  return { ...estructurado, notasFusionadas, briefHidratado };
}

// El gemelo de estructurarDictadoAction para el camino de Granola: mismo borrador, misma fusion,
// mismo schema. La diferencia es de donde sale el insumo (el resumen cacheado de la grabacion en
// vez del dictado del owner).
//
// Esta action es la que revive pedirBorradores(), que estuvo escrita y sin un solo caller desde
// que se creo: le faltaban el insumo (transcript_resumen) y el destino (notas_discovery, brief).
export async function borradorDesdeGrabacionAction(
  idEmpresa: string,
  idToque: number,
): Promise<BorradorConFusion | null> {
  await requireEscritura();
  const { idOrganizacion } = await requireSession();

  const resumenCacheado = leerTranscriptResumen(idToque);
  if (!resumenCacheado.trim()) return null; // toque dictado, o grabacion sin confirmar

  const ia = crearClaudeAdapter();
  const estructurado = await pedirBorradores(resumenCacheado, ia);
  const actual = leerDiscovery(idEmpresa, idOrganizacion);

  const [notasFusionadas, briefHidratado] = await Promise.all([
    fusionarDiscovery(actual.notas, estructurado.notasDiscovery, ia),
    hidratarBrief(actual.brief, estructurado.brief, ia),
  ]);

  return { ...estructurado, notasFusionadas, briefHidratado };
}

// EditorCorreo/EditorWhatsapp llaman esto al darle "Enviar" en el cockpit.
//
// Sesion 2026-07-10 (pedido de Sebastian: revisar NO es "yo lo mando a mano"): para
// WhatsApp, la herramienta lo MANDA de verdad por Evolution con el copy revisado, y
// marca el paso enviada con el proveedor real + deja el toque. Para correo se mantiene
// el flujo manual (aprobar): Apollo es basado en PLANTILLAS de secuencia, no manda un
// cuerpo arbitrario editado a mano -- ese caso se resuelve por la secuencia automatica,
// no aca. La action wirea el adaptador (el repo/core no lo conoce -- regla de capas).
export async function enviarToqueCanalAction(
  idEmpresa: string,
  idPasoInscripcion: number,
  cuerpo?: string,
): Promise<AprobarDesdeInboxResultado | void> {
  await requireEscritura();

  const datos = datosEnvioPasoManual(idPasoInscripcion);
  if (datos?.canal === "whatsapp") {
    const linea = lineaWhatsappActiva();
    if (!linea) return { ok: false, error: "No hay una línea de WhatsApp activa para mandar" };
    if (!datos.destinatario.telefono) return { ok: false, error: "El contacto no tiene teléfono para WhatsApp" };
    const adapter = crearRegistroEnvio().whatsapp;
    try {
      const resultado = await adapter.enviarPaso(
        linea.referenciaProveedor,
        datos.destinatario,
        { asunto: null, cuerpo: cuerpo ?? "", canal: "whatsapp" },
      );
      registrarPasoEnviadoConToque(idPasoInscripcion, resultado.proveedor, resultado.proveedorMensajeId, new Date().toISOString(), cuerpo ?? "");
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "No se pudo mandar el WhatsApp" };
    }
    revalidatePath(`/llamada/${idEmpresa}`);
    redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
  }

  // Correo (y cualquier otro canal manual): flujo de aprobar (marca enviada + toque),
  // idempotente por el WHERE estado='pendiente' en aprobarPasoManual.
  const resultado = await aprobarDesdeInboxAction(idPasoInscripcion, cuerpo);
  if (!resultado.ok) return resultado;
  revalidatePath(`/llamada/${idEmpresa}`);
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}

// Arranca el bucle PBX la primera vez que Sebastian visita una cuenta recien
// detectada (pbxForma null, sin toque previo que interpretar): resultado null es la
// entrada al bucle (proponerSiguientePaso decide llamar_conmutador vs conseguir_numero
// segun tieneNumeroConmutador). No pasa por IA -- no hay "que paso" todavia.
export async function iniciarPBXAction(idEmpresa: string, tieneNumeroConmutador: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { idOrganizacion } = await requireSession();
  try {
    const paso = proponerSiguientePaso({ resultado: null, tieneNumeroConmutador, intentos: { llamadas: 0, correos: 0 } });
    guardarProximoPasoPBX(idEmpresa, paso, idOrganizacion);
    revalidatePath(`/llamada/${idEmpresa}`);
    revalidatePath("/cola");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo iniciar el bucle" };
  }
}

// Bucle PBX (Fase 5): interpreta el "que paso" libre del toque PBX. Solo PROPONE
// (borrador -> aprobar, CLAUDE.md); no escribe nada -- PbxPanel muestra el borrador
// editable antes de que cerrarPBXAction lo persista.
export async function interpretarPBXAction(quePaso: string): Promise<PbxInterpretado> {
  await requireEscritura();
  const ia = crearClaudeAdapter();
  return interpretarResultadoPBX(ia, quePaso);
}

// Cierra un toque del bucle PBX: registra el toque real (mismo idioma que
// registrarToqueSueltoAction -- 'no_contesto' es el resultado mas honesto disponible
// para un intento que no es una de las 4 salidas cerradas de llamada) y, segun la
// clase interpretada, gradua la empresa (si se consiguio el KDM) o guarda el
// siguiente paso propuesto (proponerSiguientePaso, core puro).
export async function cerrarPBXAction(input: {
  idEmpresa: string;
  canal: "llamada" | "correo";
  quePaso: string;
  interpretado: PbxInterpretado;
  tieneNumeroConmutador: boolean;
  intentos: { llamadas: number; correos: number };
  kdm?: { nombre: string; telefono: string | null; email: string | null };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { idOrganizacion } = await requireSession();
  try {
    const parsed = registrarToqueSchema.parse({
      idEmpresa: input.idEmpresa,
      canal: input.canal,
      resultado: "no_contesto",
      quePaso: input.quePaso,
    });
    registrarToque(parsed, idOrganizacion);

    if (input.interpretado.clase === "dato_conseguido" && input.kdm) {
      graduarDePBX(input.idEmpresa, input.kdm, idOrganizacion);
    } else {
      const resultado: ResultadoPBX = {
        clase: input.interpretado.clase,
        nota: input.interpretado.proximoPasoTexto,
        personaReferida: input.interpretado.personaReferida,
      };
      const paso = proponerSiguientePaso({
        resultado,
        tieneNumeroConmutador: input.tieneNumeroConmutador,
        intentos: input.intentos,
      });
      guardarProximoPasoPBX(input.idEmpresa, paso, idOrganizacion);
    }

    revalidatePath(`/llamada/${input.idEmpresa}`);
    revalidatePath("/cola");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
}

// Tarea 12: correo/whatsapp SUELTO (sin inscripcion/cadencia activa -- no hay
// paso_inscripcion que aprobar). Reusa registrarToque tal cual CapturaLlamada, solo que
// con el canal del editor en vez de 'llamada'.
//
// Decision de diseño: registrarToqueSchema exige `resultado` (una de las 4 salidas
// cerradas del guion de LLAMADA: contesto_reunion/contesto_sigue_seguimiento/contesto_no/
// no_contesto). Un correo o whatsapp recien enviado no pasa por esas 4 salidas todavia --
// nadie ha respondido aun, no hubo conversacion que calificar. En vez de abrir el enum
// (cambio de dominio fuera de alcance de esta tarea) se usa 'no_contesto' como el valor
// mas honesto disponible: significa "sin respuesta todavia", que es exactamente el estado
// real de un mensaje que se acaba de mandar. Cuando el contacto responda, ESE es un toque
// nuevo con su propio resultado real (via CapturaLlamada u otro flujo), no una correccion
// de este.
//
// proximoFollowUp (2026-07-14, seccion "Contacto iniciado sin seguimiento"): opcional,
// deja fijado "en N dias vuelvo a intentar" en el mismo toque suelto -- sin esto, la
// fecha se perdia y la cuenta volvia a quedar invisible en colaDelDia.
export async function registrarToqueSueltoAction(
  idEmpresa: string,
  canal: "correo" | "whatsapp",
  cuerpo: string,
  proximoFollowUp?: string,
) {
  const { idOrganizacion } = await requireSession();
  const parsed = registrarToqueSchema.parse({
    idEmpresa,
    canal,
    resultado: "no_contesto",
    quePaso: cuerpo || undefined,
    proximoFollowUp: proximoFollowUp || undefined,
  });
  registrarToque(parsed, idOrganizacion);
  revalidatePath(`/llamada/${idEmpresa}`);
  revalidatePath("/cola");
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}

// Baja de la cadencia DESDE la llamada (spec 2026-07-17-cadencia-desde-la-llamada).
// Suelta a proposito: no exige registrar el toque primero. La decision "esta ya no" se
// toma colgando, y obligar a llenar el toque para poder ejecutarla es papeleo entre
// Sebastian y lo que quiere hacer.
//
// "Seguir en la cadencia" NO tiene action porque ya es el default: registrarToqueAction
// marca el paso activo como 'enviada' y el motor re-ancla el siguiente. Lo unico que
// faltaba era la salida.
//
// Gemela de sacarContactoDeCampanaAction (campanas/[id]/destinatarios/actions.ts): mismo
// corte, misma tolerancia a Apollo caido. Se duplica el cableado y no la logica -- lo que
// decide vive en sacarInscripcionDeCampana; aca solo cambia de donde salio la baja (para
// la bitacora) y que pantalla se revalida.
export async function sacarDeCadenciaAction(
  idEmpresa: string,
  idInscripcion: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireEscritura();

  // El corte LOCAL primero e incondicional: es lo minimo que garantiza que el motor deja
  // de mandar pasos, sin depender de que un proveedor externo conteste.
  sacarInscripcionDeCampana(idInscripcion, "llamada");

  // Apollo solo si esta campana de verdad tiene secuencia alla. Sin proveedorCampanaId no
  // hay nada externo que cortar (campana sin Apollo) y este bloque se salta solo -- por
  // eso "no uso Apollo" no necesita ninguna rama aparte.
  const datos = datosSecuenciaExterna(idInscripcion);
  const correo = crearRegistroEnvio().correo;
  if (datos?.proveedorCampanaId && datos.email && correo) {
    try {
      await correo.sacarDestinatario(datos.proveedorCampanaId, datos.email);
    } catch {
      // Apollo caido no revierte el corte local (mismo criterio que llego-respuesta.ts y
      // que el worker): que Apollo mande un paso mas es peor que no cortar nada, pero es
      // mucho menos malo que tirar la baja entera por un fallo de red.
    }
  }

  revalidatePath(`/llamada/${idEmpresa}`);
  revalidatePath("/cola");
  revalidatePath("/seguimiento");
  return { ok: true };
}
