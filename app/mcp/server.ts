// MCP server de solo lectura (Fase 3, docs/plan-panel-metricas-tiempo-real.md): expone
// las metricas del panel y la historia de deals por HTTP, para que Claude (o cualquier
// cliente MCP) las consulte sin abrir la UI.
//
// Proceso Node aparte, NO una route de Next (igual que app/worker/index.ts): el worker ya
// establecio el patron de "reusar la imagen de followups-web con otro `command:` en
// Compose" -- este server sigue el mismo patron (ver docker-compose.mcp.yml). Vive fuera
// del arbol de app/api a proposito: las routes de Next pasan por requireSession (cookie de
// better-auth), y este server se autentica por token porque no hay navegador ni sesion de
// usuario en el otro extremo (Claude, un curl, otro proceso).
//
// crearServidorMcp() NO llama .listen(): retorna el http.Server ya armado para que
// server.test.ts pueda levantarlo en un puerto efimero (0) sin pisar el puerto real. El
// entrypoint de despliegue es index.ts (el que corre `command:` en Compose).
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { tokenDeHeaders, tokenValido } from './auth';
import {
  panelMetricas,
  dealHistoria,
  pipeline,
  embudoTool,
  cuentasTool,
  registrarToqueTool,
  moverEstadoTool,
  cambiarCadenciaTool,
  marcarPerdidaTool,
  buscarEmpresaTool,
  crearEmpresaTool,
  actualizarEmpresaTool,
  crearContactoTool,
  actualizarContactoTool,
  reasignarNitTool,
  reconciliarNotionTool,
  cambiosDesdeTool,
  actividadTool,
  aperturasWhatsappTool,
  enviosProgramadosTool,
  programarEnviosTool,
  colaTool,
  aplazarSeguimientoTool,
  snapshotEstadosTool,
  editarToqueTool,
  planearDiaTool,
  marcarNoEjecutadoTool,
  planVsEjecutadoTool,
  empujarEnviosTool,
  lanzarCampanaTool,
  crearCadenciaTool,
  enviarWhatsappDirectoTool,
  trackingCorreoTool,
  type SesionLanzamiento,
} from './tools';
import {
  CANALES,
  CANALES_TOQUE,
  RESULTADOS,
  MOTIVOS_APLAZO,
  RAZONES_PERDIDA,
  OBJECIONES,
  ACCIONES_CLIENTE,
  TIPOS_PLAN,
  ORIGENES_PLAN,
  RITMOS_INGRESO,
  MODOS_CAMPANA,
  REGLAS_FALTANTE,
} from '../db/validation';
import { ESTADOS_NOTION } from '../core/reconciliacion/mapeoEstados';
import { CATEGORIAS_EMPRESA } from '../core/empresa-identidad';
import { ORIGENES_CAMBIO } from '../core/origen-cambio';

// Los nombres que se registran, en un solo lugar. Sirven para /api/mcp/version, que responde
// "que tools tiene el servidor AHORA" sin entrar por SSH al VPS. No pueden desincronizarse del
// registro real: server.test.ts y tools.write.test.ts comparan tools/list contra estas constantes,
// asi que agregar una tool sin ponerla aca rompe el gate.
export const TOOLS_LECTURA = [
  'actividad',
  'aperturas_whatsapp',
  'buscar_empresa',
  'cambios_desde',
  'cola',
  'cuentas',
  'deal_historia',
  'embudo',
  'envios_programados',
  'panel_metricas',
  'pipeline',
  'plan_vs_ejecutado',
  'tracking_correo',
] as const;

export const TOOLS_ESCRITURA = [
  'actualizar_contacto',
  'actualizar_empresa',
  'aplazar_seguimiento',
  'cambiar_cadencia',
  'crear_cadencia',
  'crear_contacto',
  'crear_empresa',
  'editar_toque',
  'empujar_envios',
  'enviar_whatsapp_directo',
  'lanzar_campana',
  'marcar_no_ejecutado',
  'marcar_perdida',
  'mover_estado',
  'planear_dia',
  'programar_envios',
  'reasignar_nit',
  'reconciliar_notion',
  'registrar_toque',
  'snapshot_estados',
] as const;

// Momento en que arranco ESTE proceso. Es la forma barata de saber si el contenedor se recreo
// con el deploy: si la hora es vieja, el codigo nuevo no esta corriendo por mas que el workflow
// haya dicho success.
export const ARRANCADO_EN = new Date().toISOString();

const NOMBRE_SERVIDOR = 'followups-panel-mcp';
const VERSION_SERVIDOR = '1.0.0';

// La escala ordinal de compromiso del cliente, identica en las tres tools que escriben un
// toque. Se declara una vez: tres copias del mismo texto se desincronizan a la primera
// correccion, y esta descripcion es lo unico que le dice al cliente MCP que la escala tiene
// orden y que no debe rellenarla sola.
const ACCION_CLIENTE_DESCRIBE =
  'Hasta donde se movio el CLIENTE en este toque, en escala ordinal de compromiso: ' +
  '0 sin_cliente (no contesta, numero malo, gatekeeper bloquea), 1 concede_atencion (contesta; ' +
  '"llamame en media hora" cae aca, pospone sin cerrar), 2 revela_informacion (cuenta su CRM, sus ' +
  'usuarios, su dolor), 3 invierte_tiempo (acepta fecha, se conecta, trae a alguien), ' +
  '4 evaluacion_interna (pide propuesta, la lleva al contador o a los socios), 5 negocia (objeta con ' +
  'numero, pide otro plan; negociar es senal de compra), 6 se_compromete ("el jueves te confirmo", ' +
  'firma, paga). El ORDEN es el dato: la secuencia de una cuenta por fecha es su buyer journey y ' +
  'puede SUBIR o BAJAR, y donde se estancan las perdidas es donde se frena el embudo. ' +
  'OMITILA si el operador no dijo que hizo el cliente: vacia significa "no se dijo" y JAMAS se ' +
  'infiere del resultado del toque (no_contesto NO es sin_cliente por si solo). Un ordinal ' +
  'inventado corrompe justo la medicion para la que existe el campo.';

// Organizacion default para las WRITE tools cuando el caller no la fija (solo el server
// standalone legacy, que hoy corre en modo solo-lectura y por tanto nunca registra escritura).
// El camino real (app/api/mcp/route.ts) SIEMPRE pasa la organizacion de la sesion.
const ORGANIZACION_DEFAULT = 1;

// Registra las tools de ESCRITURA (write-path, 2026-07-24). Se llaman SOLO si el caller
// autenticado paso el gate de escritura (puedeEscribirMcp) -- esa decision la toma route.ts,
// aca solo se cablean las tools contra la organizacion de esa sesion. Los inputSchema
// declaran el contrato para el cliente; la validacion dura (razonPerdida obligatoria, canal
// valido, etc.) la reimpone el dominio via Zod .parse(), no se confia solo en esto.
function registrarWriteTools(server: McpServer, idOrganizacion: number, sesion?: SesionLanzamiento): void {
  const kdmShape = z
    .object({ nombre: z.string().min(1), telefono: z.string().min(1).optional() })
    .optional()
    .describe('Contacto decisor (KDM) opcional a enlazar/crear con el toque');

  server.registerTool(
    'registrar_toque',
    {
      description:
        'Registra un toque comercial (llamada, whatsapp, correo o reunion) sobre una empresa: escribe el ' +
        'evento, mueve el embudo si aplica y encola el sync a Notion. Devuelve el toque RELEIDO de la base, ' +
        'la empresa releida y la transicion de etapa que disparo (null si no movio nada). Envuelve ' +
        'registrarToque() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1).describe('empresa.id_empresa'),
        canal: z.enum(CANALES_TOQUE).describe('reunion es un canal de toque valido; no es un canal de cadencia'),
        resultado: z
          .enum(RESULTADOS)
          .describe(
            'Que paso, en el vocabulario cerrado del negocio. razonPerdida es obligatoria en contesto_no, ' +
              'no_interesado y perdido. no_llego (no-show) exige reunionFechaPropuesta',
          ),
        fecha: z
          .string()
          .min(1)
          .optional()
          .describe('YYYY-MM-DD, el dia en que PASO el toque. Default: hoy. Para el toque que se dicta al dia siguiente'),
        duracionSegundos: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Cuanto duro la llamada o la reunion, en segundos. Sin esto no se puede separar el intento de 40 segundos de la conversacion real'),
        quePaso: z.string().min(1).optional(),
        proximoFollowUp: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
        usuarios: z.number().optional(),
        crm: z.string().min(1).optional(),
        pasarela: z.string().min(1).optional(),
        razonPerdida: z
          .enum(RAZONES_PERDIDA)
          .optional()
          .describe('Vocabulario cerrado. Lo que no cabe va en razonPerdidaNota, no se fuerza a la lista'),
        razonPerdidaNota: z.string().min(1).optional().describe('El detalle en prosa, aparte del valor acotado'),
        objecion: z
          .enum(OBJECIONES)
          .optional()
          .describe(
            'La objecion viva: el vocabulario de razonPerdida mas duda_adopcion, empaquetado y ' +
              'riesgo_percibido. Los tres primeros son INFERIDOS de ventas/frameworks/embudo.md el ' +
              '2026-07-25; empaquetado y riesgo_percibido los dicto el operador el 2026-07-26 y no son ' +
              'inferencia. empaquetado = el plan que acepta no soporta lo que necesita (acepta Essential y ' +
              'con Essential no hay integracion); riesgo_percibido = no es precio ni producto, es miedo a ' +
              'que no funcione o a que la gente no lo adopte. Antes los dos caian en precio y la respuesta ' +
              'comercial a cada uno es distinta. Si la objecion no cabe en ninguna, se deja vacia y se ' +
              'escribe objecionNota: nunca se fuerza a la lista',
          ),
        objecionNota: z.string().min(1).optional(),
        accionCliente: z.enum(ACCIONES_CLIENTE).optional().describe(ACCION_CLIENTE_DESCRIBE),
        reunionFechaPropuesta: z
          .string()
          .min(1)
          .optional()
          .describe('YYYY-MM-DD (hora opcional, YYYY-MM-DDTHH:MM): cuando quedo agendada la reunion. Obligatoria si resultado=no_llego'),
        reunionFechaOcurrida: z
          .string()
          .min(1)
          .optional()
          .describe('Cuando la reunion de verdad paso. Solo con canal=reunion. La diferencia contra la propuesta es el no-show'),
        transcriptProveedor: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Donde quedo la grabacion. Las REUNIONES se graban en tldv y las LLAMADAS en granola, nunca al ' +
              'reves. Queda abierto como dato, no cerrado como enum: un proveedor nuevo no deberia obligar a ' +
              'tocar codigo. Los tres campos de puntero son opcionales y pueden quedar vacios: una llamada por ' +
              'telefono o por WhatsApp puede no quedar grabada en ningun lado, y eso no invalida el toque',
          ),
        transcriptId: z.string().min(1).optional().describe('El id de la sesion en ese proveedor'),
        transcriptUrl: z.string().min(1).optional().describe('El link directo a la grabacion'),
        ejecutadoPor: z
          .string()
          .min(1)
          .optional()
          .describe('Quien HIZO la llamada o el mensaje. Mandalo cuando ejecuta otra persona (Felipe Castro, Camilo Fonseca); si no viene, queda Sebastian Acosta Molina'),
        idContacto: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(
            'A QUE PERSONA se toco, cuando el contacto YA existe en la base (contacto.id_contacto). ' +
              'Cinco llamadas a la recepcionista y dos al duenio no son el mismo proceso, y sin esto ' +
              'los siete se cuentan igual. Tiene que pertenecer a esa empresa o falla. Excluyente con ' +
              'kdm: idContacto enlaza uno que existe, kdm crea uno nuevo',
          ),
        kdm: kdmShape,
      },
    },
    async (input) => {
      const r = registrarToqueTool(input as Parameters<typeof registrarToqueTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'editar_toque',
    {
      description:
        'Corrige campos puntuales de un toque YA escrito, por su id. Es lo que registrar_toque no ' +
        'hace: un dato que llega despues (la duracion que sale de tl;dv horas mas tarde) o un campo ' +
        'que quedo incompleto no tenian arreglo. Solo escribe lo que de verdad cambia, revalida las ' +
        'reglas del toque sobre la fila ya mezclada (corregir el resultado a no_llego sin fecha ' +
        'propuesta falla) y deja rastro con el motivo. Devuelve el toque RELEIDO mas la lista de ' +
        'campos que se movieron con su antes y su despues; sinCambios:true dice que el parche traia ' +
        'lo que la fila ya tenia. NO cambia la empresa del toque (eso es reescribir dos historias, ' +
        'no corregir), NO mueve la etapa del embudo (para eso esta mover_estado) y NO manda nada a ' +
        'Notion. Envuelve editarToque() del dominio.',
      inputSchema: {
        idToque: z.number().int().positive().describe('toque.id_toque, el que devuelve registrar_toque'),
        motivo: z
          .string()
          .min(1)
          .describe('Por que se edita, en prosa y OBLIGATORIO: "llego la duracion de tl;dv" no es lo mismo que "me equivoque al dictar". Queda en la bitacora junto a los campos que cambiaron'),
        canal: z.enum(CANALES_TOQUE).optional(),
        resultado: z.enum(RESULTADOS).optional(),
        fecha: z.string().min(1).optional().describe('YYYY-MM-DD, el dia en que PASO el toque. Corrige fecha_dia y el timestamp; no toca el texto original de las filas viejas sin fecha parseable'),
        duracionSegundos: z.number().int().nonnegative().nullable().optional().describe('null borra el valor. Este es el campo que dejo tres reuniones de 55, 71 y 50 minutos sin poder registrarse'),
        quePaso: z.string().min(1).nullable().optional(),
        razonPerdida: z.enum(RAZONES_PERDIDA).nullable().optional(),
        razonPerdidaNota: z.string().min(1).nullable().optional(),
        objecion: z.enum(OBJECIONES).nullable().optional(),
        objecionNota: z.string().min(1).nullable().optional(),
        accionCliente: z
          .enum(ACCIONES_CLIENTE)
          .nullable()
          .optional()
          .describe(`null BORRA la accion (la vuelve a "no se dijo"). ${ACCION_CLIENTE_DESCRIBE}`),
        reunionFechaPropuesta: z.string().min(1).nullable().optional().describe('YYYY-MM-DD, con hora opcional'),
        reunionFechaOcurrida: z.string().min(1).nullable().optional().describe('Solo con canal=reunion'),
        transcriptProveedor: z.string().min(1).nullable().optional().describe('tldv para reuniones, granola para llamadas'),
        transcriptId: z.string().min(1).nullable().optional(),
        transcriptUrl: z.string().min(1).nullable().optional(),
        ejecutadoPor: z.string().min(1).optional(),
        idContacto: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe('Enlaza el toque a la persona que se toco, o null para desenlazar el contacto equivocado. Tiene que ser de esa empresa'),
      },
    },
    async (input) => {
      const r = editarToqueTool(input as Parameters<typeof editarToqueTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'planear_dia',
    {
      description:
        'Escribe el plan del dia: las cuentas que se va a tocar en una fecha, de que tipo, de donde ' +
        'salio cada una y por que canal si ya se decidio. Es lo que convierte el plan de markdown a ' +
        'dato, y sin el plan_vs_ejecutado no tiene contra que comparar. Idempotente por (fecha, ' +
        'empresa, canal): replanear la misma combinacion CORRIGE la linea en vez de duplicarla, y ' +
        'planear llamada y correo a la misma cuenta el mismo dia son dos lineas legitimas. Nunca ' +
        'borra: una cuenta que se saca de la lista se lee despues como no ejecutada, que es la ' +
        'verdad. Una cuenta que no existe o que es de otra organizacion se RECHAZA y se reporta, sin ' +
        'tumbar el resto del plan. Devuelve el plan del dia RELEIDO de la tabla, con cuantas lineas ' +
        'son nuevas, cuantas se corrigieron y cuales se rechazaron.',
      inputSchema: {
        fecha: z.string().min(1).describe('YYYY-MM-DD, el dia para el que es el plan'),
        cuentas: z
          .array(
            z.object({
              idEmpresa: z.string().min(1),
              tipo: z
                .enum(TIPOS_PLAN)
                .describe('Que CLASE de toque es: frio (primer contacto), seguimiento (continua algo que ya existe), cierre (empuja una cuenta de la parte baja del embudo)'),
              origen: z
                .enum(ORIGENES_PLAN)
                .describe(
                  'De donde salio la linea: cadencia (la pidio un paso de cadencia), rodado (venia del ' +
                    'plan de un dia anterior que no se ejecuto), manual (la puso el operador)',
                ),
              canal: z
                .enum(CANALES_TOQUE)
                .optional()
                .describe('Por donde se piensa tocar, si ya se decidio. Vacio es un valor real: se planeo la cuenta sin decidir el canal, y no se infiere'),
              nota: z.string().min(1).optional().describe('Por que esta cuenta hoy. Se queda en la base'),
            }),
          )
          .min(1),
        planeadoPor: z.string().min(1).optional().describe('Quien planeo. Si no viene, queda Sebastian Acosta Molina'),
      },
    },
    async (input) => {
      const r = planearDiaTool(input as Parameters<typeof planearDiaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'marcar_no_ejecutado',
    {
      description:
        'El cierre del dia: de lo que estaba planeado, esto NO se hizo y por esto. Escribe el ' +
        'motivo sobre la linea del plan. Existe porque hasta ahora el motivo solo existia si ' +
        'ademas se corria un aplazo, y "no lo hice porque el dia se atraveso" no siempre mueve una ' +
        'fecha: la cuenta que no se toco y cuyo follow-up sigue donde estaba no tenia forma de ' +
        'tener motivo. NO mueve ninguna fecha y NO crea el aplazo (para correr un seguimiento esta ' +
        'aplazar_seguimiento); si ya existe un aplazo de esa cuenta ese dia, lo enlaza. RECHAZA, en ' +
        'vez de escribir: una cuenta sin linea en el plan de ese dia (no se inventa el plan a ' +
        'posteriori para poder decir que no se cumplio), una cuenta con dos canales planeados ese ' +
        'dia cuando no se dice cual, y una cuenta que SI tiene toque ese dia, devolviendo el ' +
        'idToque que la contradice. Devuelve las lineas RELEIDAS, cuantas quedaron sin motivo ' +
        'porque nadie lo dijo y cuantas sobrescribieron un motivo anterior.',
      inputSchema: {
        fecha: z.string().min(1).describe('YYYY-MM-DD, el dia del plan que se esta cerrando'),
        cuentas: z
          .array(
            z.object({
              idEmpresa: z.string().min(1),
              canal: z
                .enum(CANALES_TOQUE)
                .optional()
                .describe('Solo hace falta si esa cuenta tiene mas de una linea ese dia. Sin esto y con dos, se rechaza en vez de adivinar cual no se hizo'),
              motivo: z.enum(MOTIVOS_APLAZO).optional().describe('El de la cuenta gana sobre el del lote'),
              nota: z.string().min(1).optional(),
            }),
          )
          .min(1),
        motivo: z
          .enum(MOTIVOS_APLAZO)
          .optional()
          .describe(
            'Motivo para todas las que no traigan el suyo, que es el caso real del cierre del dia ' +
              '("estas cuatro no las hice, el dia se atraveso"). Mismo vocabulario que aplazar_seguimiento, ' +
              'no uno paralelo: plan_irreal, dia_atravesado, tiempo_no_usado, cuenta_evitada. Si no viene ' +
              'ninguno, la linea queda sin motivo y se cuenta en sinMotivo: no se infiere',
          ),
        nota: z.string().min(1).optional().describe('Detalle en prosa para el lote. No pisa la nota que una linea ya tenga si no viene nada'),
      },
    },
    async (input) => {
      const r = marcarNoEjecutadoTool(input as Parameters<typeof marcarNoEjecutadoTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'mover_estado',
    {
      description:
        'Mueve la etapa comercial (estado_notion) de una empresa y escribe la transicion en el ' +
        'historico. `origen` decide si el cambio ademas viaja DB -> Notion: usa "notion" cuando ' +
        'estas alineando la base a lo que Notion YA dice (reconciliacion) y el cambio se queda ' +
        'aca; usa "herramienta" cuando el movimiento nace en la herramienta y el CRM espejo debe ' +
        'enterarse. Devuelve la empresa RELEIDA y la transicion que quedo escrita con su origen, o ' +
        'transicion null con motivo sin_cambio si la cuenta ya estaba en esa etapa. Envuelve ' +
        'actualizarEstadoNotion() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        estado: z.string().min(1).describe('slug de estado_notion: lead|contacto_iniciado|reunion_agendada|oportunidad|cierre_documentacion|enviar_contrato|firma_pago|on_hold'),
        fecha: z.string().optional().describe('YYYY-MM-DD para el historico. Default: hoy'),
        origen: z
          .enum(ORIGENES_CAMBIO)
          .optional()
          .describe('"notion" (el dato ya estaba en Notion, no se devuelve) o "herramienta" (nace aca, se encola a Notion)'),
      },
    },
    async ({ idEmpresa, estado, fecha, origen }) => {
      const r = moverEstadoTool({ idEmpresa, estado, fecha, origen }, idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );

  server.registerTool(
    'cambiar_cadencia',
    {
      description:
        'Reprograma el seguimiento de una empresa (fecha/canal/proximo paso) y opcionalmente la mueve ' +
        'a otra cadencia (idCampana). Devuelve la empresa RELEIDA con su proximo follow-up y sus ' +
        'cadencias vivas, mas el resultado de la inscripcion cuando se pidio mover de cadencia ' +
        '(puede decir ya_inscrita, que no es error pero tampoco es un cambio). Envuelve ' +
        'cambiarCadencia() del dominio. ' +
        'DEVUELVE ADEMAS envioCorreo, el diagnostico de si el correo de esa campana va a salir de verdad. ' +
        'Existe porque inscribir en una campana con pasos de correo producia correos que no salian NUNCA y ' +
        'nada avisaba: el descarte era un `continue` pelado en agruparPendientesCorreo, sin error, sin marcar ' +
        'la fila fallo, y quedaba pendiente para siempre. Ahora, si la campana tiene pasos de correo que no ' +
        'pueden salir, esta tool FALLA y no inscribe nada, diciendo cual de las tres compuertas esta cerrada ' +
        '(proveedor_campana_id NULL, aprobada_envio_gmail=0, o pasos con es_manual=1). Para armarla y seguir, ' +
        'armarEnvioCorreo: true. ' +
        'AVISO QUE VIAJA EN advertencias: inscribir pone la campana en estado activa, y con eso lanzar_campana ' +
        'deja de tomarla (solo lanza borradores). Si lo que se queria era que el mensaje saliera YA, sin esperar ' +
        'la ventana de 8:00-18:00, el movimiento es empujar_envios.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        idCampana: z.number().int().positive().optional().describe('Inscribe la empresa en la cadencia de esta campana'),
        proximoFollowUp: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
        proximoPaso: z.string().min(1).optional(),
        armarEnvioCorreo: z
          .boolean()
          .optional()
          .describe(
            'true arma la CAMPANA para que su correo pueda salir: escribe proveedor_campana_id sintetico y ' +
              'aprobada_envio_gmail=1, el mismo par que el boton "Lanzar hoy" de la web. OJO: es de la campana, no de ' +
              'esta empresa, asi que tambien desbloquea a todas las inscripciones que esa campana ya tenga. NO toca ' +
              'es_manual: un paso marcado manual sigue esperando aprobacion uno por uno.',
          ),
      },
    },
    async (input) => {
      const r = cambiarCadenciaTool(input as Parameters<typeof cambiarCadenciaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );

  server.registerTool(
    'programar_envios',
    {
      description:
        'Revisa y programa VARIOS envios de cadencia de una sola vez: guarda el copy final de cada paso y ' +
        'lo deja aprobado y programado, repartiendo las horas desde horaInicio con el espaciado pedido ' +
        '(el primero a horaInicio, el segundo horaInicio+espaciado, etc). Es el gesto de la manana: revisar ' +
        'los copys de apertura y dejarlos listos para mas tarde. ' +
        'PROGRAMA, NO MANDA: quien manda es el worker cuando llega la hora, y no manda ningun WhatsApp que ' +
        'no haya pasado por aca (un paso de whatsapp sin aprobar NO sale nunca, por mas que su fecha llegue). ' +
        'NO confundir con "ya lo mande yo": esta tool no escribe ningun toque, porque todavia no ha pasado ' +
        'nada que contar. Devuelve cada envio RELEIDO de la base, no el eco del input. Un paso que ya salio ' +
        'o que no existe se rechaza solo, con su motivo, sin tumbar los demas del lote. ' +
        'OJO: las horas son el piso desde el que cada mensaje queda elegible, no el instante exacto de ' +
        'salida; el ritmo real lo pone whatsapp_espaciado_min_ms/max_ms del worker, y para que coincida con ' +
        'el espaciado pedido esas claves tienen que valer lo mismo. La respuesta lo repite en `nota`.',
      inputSchema: {
        pasos: z
          .array(
            z.object({
              idPasoInscripcion: z.number().int().positive().describe('paso_inscripcion.id_paso_inscripcion, el que devuelve envios_programados o la cola'),
              cuerpo: z.string().min(1).describe('El copy final REVISADO, tal cual va a salir. Reemplaza la plantilla de la cadencia para ESTE envio y no toca la plantilla compartida'),
            }),
          )
          .min(1)
          .describe('Los pasos a programar, EN EL ORDEN en que deben salir: el primero de la lista sale primero'),
        horaInicio: z
          .string()
          .min(1)
          .describe('ISO con hora y zona, cuando sale el PRIMERO (ej. 2026-07-27T11:00:00.000Z para las 11:00 UTC). Una fecha sin hora los deja a todos elegibles desde la medianoche'),
        espaciadoMinutos: z.number().positive().optional().describe('Minutos entre un envio y el siguiente. Default 2'),
        aprobadoPor: z.string().min(1).optional().describe('Quien reviso. Si no viene, queda Sebastian Acosta Molina'),
      },
    },
    async (input) => {
      const r = programarEnviosTool(input as Parameters<typeof programarEnviosTool>[0]);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'marcar_perdida',
    {
      description:
        'Marca una empresa como perdida/parqueada: registra un toque con resultado perdido (razon ' +
        'obligatoria, de la lista cerrada) y la pone en on_hold, encolando el sync a Notion. Devuelve el ' +
        'toque releido, la empresa releida y la transicion (null si ya estaba on_hold). Envuelve ' +
        'marcarPerdida() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        canal: z.enum(CANALES_TOQUE),
        razonPerdida: z.enum(RAZONES_PERDIDA).describe('Por que se pierde/parquea la cuenta (obligatorio, vocabulario cerrado)'),
        razonPerdidaNota: z.string().min(1).optional().describe('El detalle en prosa, aparte del valor acotado'),
        quePaso: z.string().min(1).optional(),
        objecion: z.enum(OBJECIONES).optional(),
        objecionNota: z.string().min(1).optional(),
        accionCliente: z
          .enum(ACCIONES_CLIENTE)
          .optional()
          .describe(`El nivel al que LLEGO la cuenta antes de caerse, que es lo que responde donde se frena el embudo. ${ACCION_CLIENTE_DESCRIBE}`),
        fecha: z.string().min(1).optional().describe('YYYY-MM-DD, el dia en que se perdio. Default: hoy'),
        ejecutadoPor: z.string().min(1).optional().describe('Si no viene, queda Sebastian Acosta Molina'),
      },
    },
    async (input) => {
      const r = marcarPerdidaTool(input as Parameters<typeof marcarPerdidaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'crear_empresa',
    {
      description:
        'Crea una cuenta nueva en el pipeline. Antes de insertar corre la misma busqueda de buscar_empresa: ' +
        'si aparece un candidato de confianza alta NO crea, devuelve el candidato para enlazarlo (forzar:true lo salta). ' +
        'El id sale del NIT si viene, si no de la convencion sintetica de la base. Envuelve crearEmpresa() del dominio.',
      inputSchema: {
        nombreOficial: z.string().min(1).describe('Nombre como se va a ver en el pipeline'),
        categoria: z.enum(CATEGORIAS_EMPRESA).describe('Obligatoria: decide el alcance del barrido'),
        estadoNotion: z.enum(ESTADOS_NOTION).describe('Etapa inicial del embudo'),
        owner: z.string().min(1).describe('Duenio comercial de la cuenta, tal como se escribe en el pipeline'),
        notionPageId: z.string().min(1).optional().describe('Pagina de Notion a enlazar. Unica: si ya esta tomada, falla'),
        nit: z.string().min(1).optional().describe('NIT sin puntos ni digito de verificacion. Si viene, ES el id de la cuenta'),
        forzar: z
          .boolean()
          .optional()
          .describe('Crea aunque haya un candidato de confianza alta. Solo cuando de verdad es otra empresa'),
      },
    },
    async (input) => {
      const r = crearEmpresaTool(input as Parameters<typeof crearEmpresaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'actualizar_empresa',
    {
      description:
        'Cambia campos puntuales de una cuenta que ya existe y devuelve la fila releida. Solo escribe los campos ' +
        'que vengan; los que no vengan quedan como estaban. La etapa del embudo NO se cambia aca: para eso esta ' +
        'mover_estado, que ademas escribe el historial. Envuelve actualizarEmpresa() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        owner: z.string().min(1).optional(),
        categoria: z.enum(CATEGORIAS_EMPRESA).optional(),
        notionPageId: z.string().min(1).optional().describe('Enlaza la cuenta a una pagina de Notion. Unica'),
        proximoPaso: z.string().min(1).optional(),
        proximoFollowUpFecha: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
      },
    },
    async (input) => {
      const r = actualizarEmpresaTool(input as Parameters<typeof actualizarEmpresaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  // El movimiento que faltaba entre crear_empresa y crear_cadencia: cargar A QUIEN se le manda.
  // Ver la nota de diseño en tools.ts (por qué son dos tools y no un upsert).
  server.registerTool(
    'crear_contacto',
    {
      description:
        'Crea un contacto (persona) de una cuenta, con su email, y devuelve el contacto RELEÍDO de la base más ' +
        'todos los contactos que le quedaron a esa empresa. Es lo que le faltaba al MCP para tener a quién mandarle ' +
        'una cadencia: hasta ahora el único camino que creaba contactos era el campo kdm de registrar_toque, que solo ' +
        'acepta nombre y teléfono. Sin un contacto con email, la inscripción nace bloqueada y lanzar_campana responde ' +
        '"empresas sin destinatario utilizable". ' +
        'ANTIDUPE: antes de insertar busca en esa empresa por email (exacto, sin distinguir mayúsculas) y por teléfono ' +
        '(últimos 10 dígitos, así +57/57/guiones no engañan). Si encuentra, NO crea: devuelve el existente con su ' +
        'idContacto para que le completes lo que le falta con actualizar_contacto. forzar:true lo salta, solo cuando ' +
        'de verdad son dos personas. ' +
        'es_principal ES EXCLUSIVO por empresa (índice único uq_contacto_principal en la base): si marcas esPrincipal ' +
        'y ya había otro, el anterior QUEDA DEGRADADO en la misma transacción y se devuelve cuál era en ' +
        'principalAnterior. No se rechaza, se degrada y se dice. ' +
        'CUIDADO con quién recibe: la cadencia NO elige al principal, elige en este orden: (1) el KDM con email, ' +
        '(2) el principal con email, (3) el primero con email por id. El resultado trae destinatarioDeLaCadencia con ' +
        'quién sería hoy y por qué, y una advertencia explícita si no es el que acabas de crear.',
      inputSchema: {
        idEmpresa: z.string().min(1).describe('empresa.id_empresa. Tiene que existir y ser de esta organización, o falla'),
        nombre: z.string().min(1).optional().describe('Nombre de pila. Sin él, el copy con [nombre] sale con el hueco vacío'),
        apellido: z.string().min(1).optional(),
        cargo: z
          .string()
          .min(1)
          .optional()
          .describe('Texto libre ("Gerente General"). La cargo_categoria se deriva sola con el clasificador del dominio'),
        email: z.string().min(1).optional().describe('El campo que decide si esta empresa tiene destinatario de correo o no'),
        telefono: z.string().min(1).optional().describe('Como se escriba: el antidupe compara por los últimos 10 dígitos'),
        linkedin: z.string().min(1).optional(),
        notas: z.string().min(1).optional(),
        esPrincipal: z.boolean().optional().describe('Exclusivo por empresa: marcarlo degrada al principal anterior'),
        esKdm: z
          .boolean()
          .optional()
          .describe('Key decision maker. GANA sobre esPrincipal al resolver a quién se le manda la cadencia'),
        fuente: z.string().min(1).optional().describe("De dónde salió el dato. Default 'mcp'"),
        forzar: z.boolean().optional().describe('Crea aunque ya haya un contacto con ese email o teléfono en la empresa'),
      },
    },
    async (input) => {
      const r = crearContactoTool(input as Parameters<typeof crearContactoTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'actualizar_contacto',
    {
      description:
        'Cambia campos puntuales de un contacto que ya existe (típicamente: ponerle el email que no tenía) y devuelve ' +
        'el contacto RELEÍDO más todos los de esa empresa. Es el camino del caso más común: 248 de los 415 contactos ' +
        'de producción no tienen email, casi todos creados por el campo kdm de registrar_toque, que nunca aceptó uno. ' +
        'Solo escribe los campos que vengan; los que no vengan quedan como estaban, y un string vacío es un error de ' +
        'entrada, no un borrado. ' +
        'ANTIDUPE igual que crear_contacto: si el email o el teléfono que le pones ya lo tiene OTRO contacto de la ' +
        'misma empresa, no escribe y devuelve cuál es (forzar:true lo salta). ' +
        'esPrincipal:true degrada al principal anterior en la misma transacción (es exclusivo por empresa). ' +
        'El resultado trae destinatarioDeLaCadencia: a quién le llegaría el correo hoy y por qué.',
      inputSchema: {
        idContacto: z.number().int().positive().describe('contacto.id_contacto. Sale de crear_contacto o de contactosEmpresa'),
        nombre: z.string().min(1).optional(),
        apellido: z.string().min(1).optional(),
        cargo: z.string().min(1).optional().describe('La cargo_categoria se vuelve a derivar sola'),
        email: z.string().min(1).optional(),
        telefono: z.string().min(1).optional(),
        linkedin: z.string().min(1).optional(),
        notas: z.string().min(1).optional(),
        esPrincipal: z.boolean().optional().describe('Exclusivo por empresa: true degrada al anterior'),
        esKdm: z.boolean().optional().describe('GANA sobre esPrincipal al resolver el destinatario de la cadencia'),
        forzar: z.boolean().optional().describe('Escribe aunque el email o el teléfono ya sea de otro contacto de la empresa'),
      },
    },
    async (input) => {
      const r = actualizarContactoTool(input as Parameters<typeof actualizarContactoTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'reconciliar_notion',
    {
      description:
        'Alinea la base a lo que dice Notion, en lote. Recibe las paginas (pageId, estado como lo ' +
        'escribe Notion, owner) y devuelve el plan. Solo escribe el caso "misma pagina, distinto ' +
        'estado u owner"; las paginas sin cuenta y las cuentas sin pagina las REPORTA, porque eso ' +
        'implica decidir identidad. Nunca borra. El estado no se devuelve a Notion. ' +
        'aplicar es false por defecto: correr primero en seco y mirar el plan.',
      inputSchema: {
        paginas: z
          .array(
            z.object({
              pageId: z.string().min(1),
              estado: z.string().min(1).describe('Tal como lo escribe Notion, ej "Firma y Pago Realizado"'),
              owner: z.string().nullable().optional().describe('Vacio NO borra el owner de la base'),
              nombre: z.string().nullable().optional(),
            }),
          )
          .min(1),
        aplicar: z.boolean().optional().describe('false (default) = dry-run, solo devuelve el plan'),
      },
    },
    async ({ paginas, aplicar }) => {
      const r = reconciliarNotionTool({ paginas, aplicar }, idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'aplazar_seguimiento',
    {
      description:
        'Registra que un seguimiento programado NO se ejecuto y se corrio a otra fecha: escribe el ' +
        'evento con la fecha incumplida y mueve el proximo follow-up a la nueva, en una sola ' +
        'transaccion. NO registra un toque (aplazar no es actividad). Si la empresa no tiene ' +
        'follow-up programado falla, porque no habria fecha incumplida que registrar; para poner ' +
        'la primera fecha usa cambiar_cadencia. Cada aplazo es un evento nuevo: correr la misma ' +
        'cuenta cinco veces deja cinco filas, que es lo que permite verlo despues en `actividad`.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        fechaNueva: z.string().min(1).describe('YYYY-MM-DD, la fecha a la que se corre el seguimiento'),
        motivo: z
          .enum(MOTIVOS_APLAZO)
          .optional()
          .describe(
            'Por que no se hizo, en cuatro valores: plan_irreal (el numero planeado para el dia no era ' +
              'alcanzable), dia_atravesado (imprevisto, universidad, reunion larga), tiempo_no_usado (hubo ' +
              'tiempo y no se uso), cuenta_evitada (a esa cuenta en particular se le esta sacando el cuerpo). ' +
              'Si no viene, queda sin motivo: no se infiere ninguno',
          ),
        nota: z.string().min(1).optional().describe('Detalle en prosa, aparte del motivo. Se queda en la base, no viaja a Notion'),
        aplazadoPor: z
          .string()
          .min(1)
          .optional()
          .describe('Quien lo aplazo. Mandalo cuando aplace otra persona; si no viene, queda Sebastian Acosta Molina'),
      },
    },
    async (input) => {
      const r = aplazarSeguimientoTool(input as Parameters<typeof aplazarSeguimientoTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'snapshot_estados',
    {
      description:
        'Toma la foto del dia de la etapa de cada cuenta y deriva las transiciones comparandola con la ' +
        'foto anterior. CORRELA ANTES del barrido de la manana: la foto tiene que ser del estado con el ' +
        'que arranco el dia. Es lo que fecha bien el tramo que se mueve a mano en Notion (cierre a pago): ' +
        'la cuenta que el lunes esta en cierre y el martes en firma_pago deja una transicion fechada el ' +
        'MARTES. Idempotente: correrla dos veces el mismo dia no pisa la primera foto ni duplica una ' +
        'transicion que ya escribio un toque. Limites: dos cambios el mismo dia se ven como uno, y no ' +
        'reconstruye nada del pasado (empieza a producir dato la primera vez que corre). Devuelve las ' +
        'transiciones RELEIDAS de la tabla.',
      inputSchema: {
        fecha: z.string().min(1).optional().describe('YYYY-MM-DD, el dia de la foto. Default: hoy'),
      },
    },
    async ({ fecha }) => {
      const r = snapshotEstadosTool({ fecha }, idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'reasignar_nit',
    {
      description:
        'Corrige el id de una cuenta que se creo sin NIT (id provisional ntn- o 999xxxxxxx) y le pone ' +
        'su NIT real, arrastrando todas las referencias. Usala cuando consigas el NIT despues de haber ' +
        'creado la cuenta. SOLO va de provisional a NIT: si el id ya es un NIT, o si el NIT destino ya ' +
        'pertenece a otra cuenta, falla a proposito, porque eso seria fusionar dos cuentas y esa ' +
        'decision no la toma una tool.',
      inputSchema: {
        idEmpresa: z.string().min(1).describe('El id provisional actual (ntn-... o 999...)'),
        nit: z.string().min(1).describe('NIT real, 8 a 10 digitos, sin puntos ni digito de verificacion'),
      },
    },
    async ({ idEmpresa, nit }) => {
      const r = reasignarNitTool({ idEmpresa, nit }, idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  // La unica tool que le manda mensajes a gente real desde el MCP. Todo lo demas escribe la
  // base; esta ademas empuja al proveedor. Por eso el default es en seco y el envio exige
  // confirmar: true explicito.
  server.registerTool(
    'lanzar_campana',
    {
      description:
        'Lanza una campaña que está en borrador: fija el owner, guarda la config de goteo, inscribe el segmento ' +
        'curado en UNA transacción, deja la campaña lista para Gmail (proveedor_campana_id sintético + ' +
        'aprobada_envio_gmail) y materializa/empuja de una lo que ya vencía. Es el botón "Lanzar hoy" de la web, ' +
        'sin la web. EN SECO POR DEFAULT: sin confirmar:true no escribe nada y devuelve a quién le llegaría, por ' +
        'qué canal y a qué dirección exacta, más todo lo que impediría lanzar (bloqueos) y lo que este mismo ' +
        'empujón sacaría de OTRAS campañas (colateral). Al confirmar devuelve lo que quedó escrito RELEÍDO: la ' +
        'campaña, las inscripciones con su destinatario real, y cada paso_inscripcion con su estado, su proveedor ' +
        'y su id de mensaje: los que salieron son los que están en "enviada" con proveedorMensajeId, no los ' +
        'demás. AVISOS: (1) el empujón corre en modo manual, así que NO respeta la ventana de 8:00-18:00 Bogotá ' +
        'ni el espaciado de 45-90s del worker: lo que se lance a las 11pm sale a las 11pm; (2) los pasos de ' +
        'WhatsApp se materializan pero NO salen, porque siguen exigiendo revisión humana (programar_envios) y esta ' +
        'tool no se salta ese gate: aparecen en esperandoRevisionHumana; (3) falla en vez de seguir si la campaña ' +
        'no está en borrador, si hay empresas sin destinatario utilizable, si el canal no está listo para quien ' +
        'lanza (Gmail verificado / línea de WhatsApp) o si después de empujar quedó algún paso sin salir, y en ese ' +
        'último caso el error trae el estado releído y el log crudo del proveedor.',
      inputSchema: {
        idCampana: z.number().int().positive().describe('campana.id_campana. Tiene que estar en estado borrador'),
        confirmar: z
          .boolean()
          .optional()
          .describe('false o ausente = previsualización en seco, no escribe nada. true = inscribe y MANDA. No tiene vuelta atrás'),
        intakeDiario: z.number().int().positive().nullable().optional().describe('Cuántas empresas entran por día. null lo limpia (todas de una). Sin esto, se respeta lo ya guardado'),
        ritmoIngreso: z.enum(RITMOS_INGRESO).optional().describe('Cada cuánto entra un lote'),
        topeToquesDia: z.number().int().positive().nullable().optional(),
        fechaInicio: z.string().min(1).nullable().optional().describe('YYYY-MM-DD, desde cuándo cuenta el goteo. null = hoy'),
      },
    },
    async (input) => {
      // La sesion no se acepta por input: owner e idUsuario salen del token OAuth (route.ts).
      // Sin ellos no se lanza -- se dice, no se inventa un default.
      if (!sesion || !sesion.owner.trim() || !sesion.idUsuario.trim()) {
        throw new Error(
          'lanzar_campana: esta sesión no trae usuario ni owner (el server standalone por token no los tiene). ' +
            'Solo se puede lanzar desde el MCP autenticado por OAuth, donde la sesión dice a nombre de quién sale el mensaje.',
        );
      }
      const r = await lanzarCampanaTool(input as Parameters<typeof lanzarCampanaTool>[0], idOrganizacion, sesion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  // La segunda tool que le manda mensajes a gente real, y la que le faltaba al MCP: empujar en
  // modo manual lo que YA esta inscrito y pendiente, sin importar el estado de la campana ni la
  // hora. Ver la nota de diseno larga en tools.ts para el bug que cierra (los dos caminos de
  // inscripcion se excluian en silencio) y para por que es una tool nueva y no un flag de
  // lanzar_campana.
  server.registerTool(
    'empujar_envios',
    {
      description:
        'Empuja AHORA, en modo manual, lo que una campana/inscripcion/empresa ya tiene inscrito y pendiente. ' +
        'Es lo que faltaba: lanzar_campana solo lanza campanas en borrador, y la primera inscripcion por ' +
        'cambiar_cadencia ya pone la campana en activa, asi que inscribir cuenta por cuenta cerraba el empujon ' +
        'manual para siempre y no quedaba mas que esperar la ventana del dia siguiente. ' +
        'SE SALTA LA HORA Y NADA MAS: no respeta la ventana de 8:00-18:00 Bogota (ese es el punto), pero SI ' +
        'respeta los tres gates que importan: la revision humana de WhatsApp (un paso de whatsapp sin aprobar no ' +
        'sale, se reporta en esperandoRevisionHumana), es_manual del paso, y el tope diario de Gmail. ' +
        'ACOTADO AL BLANCO: a diferencia de lanzar_campana, que empuja TODO lo pendiente de TODAS las campanas ' +
        'activas, esta tool solo toca los pasos del blanco. Lo que otro empujon si sacaria y este deja afuera ' +
        'viaja en noIncluidos, para que "no mando de mas" se pueda verificar. Hace falta un blanco: no existe un ' +
        'modo "todo lo pendiente". ' +
        'EN SECO POR DEFAULT: sin confirmar:true no escribe ni manda nada y devuelve cada paso con saldra true/false ' +
        'y, cuando es false, POR QUE no sale (motivos). Ese diagnostico no existia en ningun lado: la cola descarta ' +
        'con un continue pelado, sin error y sin marcar la fila. ' +
        'adelantar:true es el opt-in para lo que todavia no vencio: baja la fecha_programada a ahora y, si la ' +
        'inscripcion ni siquiera tiene su paso materializado, lo materializa con fecha de ahora. UN paso por ' +
        'inscripcion y ni uno mas, para que adelantar no se convierta en mandar la cadencia entera de golpe. ' +
        'Al confirmar devuelve lo que quedo escrito RELEIDO: cada paso con su estado final y, en salieron, los que ' +
        'de verdad salieron con su proveedor y su id de mensaje. Si algo que se intento empujar no salio, la tool ' +
        'REVIENTA con el estado releido y el log crudo del proveedor adentro del error.',
      inputSchema: {
        idCampana: z.number().int().positive().optional().describe('Empuja lo pendiente de esta campana entera'),
        idsInscripcion: z.array(z.number().int().positive()).optional().describe('inscripcion.id_inscripcion. Apunta a inscripciones puntuales'),
        idsEmpresa: z.array(z.string().min(1)).optional().describe('empresa.id_empresa. Apunta a cuentas puntuales'),
        adelantar: z
          .boolean()
          .optional()
          .describe(
            'false o ausente = solo sale lo que YA vencio. true = baja a ahora la fecha del proximo paso de cada ' +
              'inscripcion del blanco (y lo materializa si todavia no existe), asi que sale en este mismo empujon',
          ),
        confirmar: z.boolean().optional().describe('false o ausente = previsualizacion en seco, no escribe ni manda nada. true = MANDA. No tiene vuelta atras'),
      },
    },
    async (input) => {
      const r = await empujarEnviosTool(input as Parameters<typeof empujarEnviosTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  // El movimiento que le faltaba al MCP: montar una cadencia. Ver la nota de diseno en
  // tools.ts para por que es UNA tool y no crear_cadencia + crear_campana por separado.
  server.registerTool(
    'crear_cadencia',
    {
      description:
        'Crea una cadencia con sus N pasos Y su campaña, en UNA transacción. Es lo que hace el wizard de ' +
        '/campanas/nueva, sin la web: hasta ahora crearCadencia/crearCampana solo tenían como caller esa Server ' +
        'Action detrás del navegador, así que montar una cadencia desde acá era imposible sin insertar a mano en ' +
        'seis tablas. Crea cadencia + paso_cadencia + version_paso (donde vive el copy) + campana, y el segmento ' +
        'si se pide uno nuevo. Es UNA tool y no dos porque campana.id_cadencia y campana.id_segmento son NOT NULL: ' +
        'una cadencia sin campaña no la consume nada y solo sirve para quedar huérfana. ' +
        'NACE EN BORRADOR: crear no es lanzar, no se le manda nada a nadie. Ponerla a correr es otro acto ' +
        '(lanzar_campana para el segmento entero, cambiar_cadencia con su idCampana para una empresa suelta). ' +
        'Devuelve todo RELEÍDO de la base (campaña, cadencia, cada paso con su copy, el segmento con cuántas ' +
        'empresas caen hoy), más envioCorreo: si el correo de esa campaña va a poder salir o qué lo frena. ' +
        'CLAVE PARA UNA CADENCIA QUE CORRE SOLA: los pasos de correo tienen que ir con esManual en false o ' +
        'ausente. Con esManual true, CADA envío exige aprobación humana una por una (programar_envios) y la ' +
        'cadencia deja de ser automática. Los pasos de whatsapp y llamada quedan manuales siempre, sin importar ' +
        'lo que se mande: whatsapp nunca se automatiza en este sistema y llamada no tiene proveedor.',
      inputSchema: {
        nombre: z.string().min(1).describe('Nombre de la cadencia. La campaña hereda este nombre salvo que se mande nombreCampana'),
        descripcion: z.string().min(1).optional(),
        pasos: z
          .array(
            z.object({
              orden: z.number().int().positive().describe('1, 2, 3... El orden en que salen'),
              diaOffset: z.number().int().nonnegative().describe('Días desde que la empresa entra a la cadencia. 0 = el mismo día'),
              canal: z.enum(CANALES),
              asunto: z.string().min(1).optional().describe('Solo correo. Admite [variables] entre corchetes'),
              cuerpo: z.string().min(1).optional().describe('El texto que se manda. Admite [variables] y la directiva [[firma]]'),
              objetivo: z.string().min(1).optional().describe('Para qué es este paso. Nota interna, no se manda'),
              esManual: z
                .boolean()
                .optional()
                .describe(
                  'true = este envío espera revisión humana antes de salir. Para correo el default (false) es lo que ' +
                    'hace que la cadencia corra sola. whatsapp y llamada quedan manuales de todas formas.',
                ),
            }),
          )
          .min(1)
          .describe('Al menos un paso. El copy de cada uno queda como su version_paso default'),
        idSegmento: z.number().int().positive().optional().describe('Reusar un segmento ya guardado. Excluyente con segmento'),
        segmento: z
          .object({
            nombre: z.string().min(1),
            definicion: z
              .object({
                condiciones: z.array(z.record(z.string(), z.unknown())).min(1),
                orden: z.object({ campo: z.string(), dir: z.enum(['asc', 'desc']) }).optional(),
                limite: z.number().int().positive().optional(),
              })
              .describe(
                'Filtro de empresas. Las condiciones se ANDean y necesita AL MENOS UNA: un segmento vacío matchearía ' +
                  'la base entera. Un valor que no pertenece al dominio del campo se RECHAZA con error (no devuelve ' +
                  '"0 empresas", que se leería como un resultado legítimo). ' +
                  'CAMPOS, con la columna que lee cada uno y sus valores válidos: ' +
                  'estado = la etapa del embudo (empresa.estado_notion), uno de lead, contacto_iniciado, oportunidad, ' +
                  'reunion_agendada, cierre_documentacion, enviar_contrato, on_hold, firma_pago. ' +
                  'categoria = la clasificación DERIVADA (vista empresa_categoria), uno de isp, sae_plus, telco_grande, ' +
                  'carrier, utility, extranjero, no_isp — OJO: NO es el campo categoria de crear_empresa (esa columna ' +
                  'acepta isp/utility/otro y el segmento no la lee); "otro" acá no existe y una empresa sin clasificar ' +
                  'cuenta como isp. ' +
                  'estado_comercial = empresa.estado_comercial, uno de cliente, negociacion, contactado, pausado, lead, ' +
                  'descartado (es otro eje, no un sinónimo de estado). ' +
                  'rol = el cargo de algún contacto de la empresa (contacto.cargo_categoria), uno de dueno, gerente, ' +
                  'rep_legal, rep_legal_suplente, subgerente, tecnico, financiero, operativo, comercial, desconocido. ' +
                  'prioridad (entero), es_cliente (0/1), usuarios (entero, usuarios estimados), personas (cuántos ' +
                  'contactos tiene la empresa): numéricos, se filtran con entre/mayor_que/menor_que. ' +
                  'ciudad, departamento, owner: TEXTO LIBRE, sin dominio cerrado — acá un valor inexistente sí devuelve ' +
                  'cero en silencio, así que el owner se escribe exacto ("Sebastian Acosta Molina"). ' +
                  'en_notion: usar es_null (nunca entró al CRM) / no_null (sí está). ' +
                  'OPERADORES: en, no_en (con "valores": []), es_null, no_null, entre ("desde"/"hasta"), mayor_que, ' +
                  'menor_que ("valor"). ' +
                  'Ejemplo: {"condiciones":[{"campo":"estado","op":"en","valores":["lead"]}]}. ' +
                  'Si el resultado da 0 empresas, la respuesta trae segmento.porQueCero con el conteo de CADA condición ' +
                  'por separado: la que salga en 0 es la que vacía el conjunto.',
              ),
            descripcionNatural: z.string().min(1).optional(),
          })
          .optional()
          .describe('Crear un segmento nuevo. Excluyente con idSegmento'),
        nombreCampana: z.string().min(1).optional(),
        modo: z.enum(MODOS_CAMPANA).optional().describe('prioritaria (default) = revisar toque a toque. batch = el copy default sale tal cual'),
        reglaFaltante: z.enum(REGLAS_FALTANTE).optional().describe('Qué hacer si la empresa no tiene el canal del paso. Default cola'),
        intakeDiario: z.number().int().positive().optional().describe('Cuántas empresas nuevas arrancan por día. Sin esto, todas de una'),
        ritmoIngreso: z.enum(RITMOS_INGRESO).optional(),
        topeToquesDia: z.number().int().positive().optional(),
        fechaInicio: z.string().min(1).optional().describe('YYYY-MM-DD'),
      },
    },
    async (input) => {
      // Mismo criterio que lanzar_campana: el owner sale de la sesión OAuth, no del input. Una
      // campaña con owner NULL manda el correo por Apollo por fallback, no por el Gmail de nadie.
      if (!sesion || !sesion.owner.trim()) {
        throw new Error(
          'crear_cadencia: esta sesión no trae owner (el server standalone por token no lo tiene). ' +
            'Solo se puede crear desde el MCP autenticado por OAuth, donde la sesión dice de quién salen los mensajes.',
        );
      }
      const r = crearCadenciaTool(input as Parameters<typeof crearCadenciaTool>[0], idOrganizacion, sesion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  // La tercera tool que le manda mensajes a gente real (despues de lanzar_campana y
  // empujar_envios), y la mas chica: UN mensaje suelto a UN numero, sin segmento, sin campana,
  // sin cadencia. Ver la nota de diseno larga en tools.ts.
  server.registerTool(
    'enviar_whatsapp_directo',
    {
      description:
        'Manda UN mensaje de WhatsApp a UN número, YA, por la línea activa de quien llama (o por la instancia que ' +
        'se le pase, si es propia). Mismo camino que el botón "Probar" de /conectores (CanalEntrega.enviarPaso ' +
        'directo): NO pasa por outbox/paso_inscripcion, así que no cuenta contra techo_diario, no encola nada y no ' +
        'deja fila en toque ni en mensaje_whatsapp (esa tabla exige un contacto real de una empresa, por privacidad; ' +
        'un número suelto no lo es). Es la herramienta para "¿mi línea manda de verdad?" o para un mensaje suelto ' +
        'que no amerita crear una campaña de un destinatario. Devuelve RELEÍDO el resultado real de Evolution: el ' +
        'proveedorMensajeId (el id real del mensaje en WhatsApp) y el estadoProveedor que el proveedor confirmó al ' +
        'aceptar el envío, nunca un {ok:true} ciego. Si Evolution dice que la instancia no existe, la línea queda ' +
        'marcada caída en la misma escritura.',
      inputSchema: {
        telefono: z.string().min(1).describe('Número de destino, con indicativo de país. Se limpia a solo dígitos antes de mandar'),
        cuerpo: z.string().min(1).describe('El texto que se manda. Evolution no tiene motor de plantillas: sale exactamente como se escriba'),
        instancia: z
          .string()
          .min(1)
          .optional()
          .describe(
            'referencia_proveedor de la línea (ej. wa-12368895214). Si no viene, se resuelve la línea ACTIVA del ' +
              'owner que llama. Si viene, tiene que ser una línea DE ESE owner o falla: no se manda por la línea de otra persona',
          ),
      },
    },
    async (input) => {
      // Mismo guard que lanzar_campana/crear_cadencia: owner e idUsuario salen de la sesión
      // autenticada por OAuth, nunca del input. El server standalone por token no tiene sesión.
      if (!sesion || !sesion.owner.trim() || !sesion.idUsuario.trim()) {
        throw new Error(
          'enviar_whatsapp_directo: esta sesión no trae usuario ni owner (el server standalone por token no los tiene). ' +
            'Solo se puede mandar desde el MCP autenticado por OAuth, donde la sesión dice a nombre de quién sale el mensaje.',
        );
      }
      const r = await enviarWhatsappDirectoTool(input as Parameters<typeof enviarWhatsappDirectoTool>[0], sesion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );
}

// Un McpServer nuevo por request (modo "stateless" del SDK, sessionIdGenerator: undefined,
// ver el ejemplo simpleStatelessStreamableHttp.js del propio paquete): este server es de
// solo lectura y sin volumen -- no hay ninguna razon para pagar el estado de sesiones
// (reconexion, resumibilidad) que el modo stateful ofrece. Cada tool call es una foto de
// la DB en ese instante, no una conversacion con memoria.
// Exportada (2026-07-23): app/api/mcp/route.ts (wiring OAuth dentro de Next, ver
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md) la reusa tal cual para no
// duplicar las 3 declaraciones de tool -- unico cambio de esa fase es el TRANSPORTE/AUTH
// (StreamableHTTPServerTransport+token aca, WebStandardStreamableHTTPServerTransport+OAuth
// alla), nunca la forma del McpServer.
// opts.escritura (write-path, 2026-07-24): registra ADEMAS las 4 write tools, atadas a
// opts.idOrganizacion (la de la sesion). Default false: el server standalone legacy
// (crearServidorMcp) lo llama sin opts y queda SOLO LECTURA, igual que antes. Solo el camino
// OAuth de Next (app/api/mcp/route.ts) opta por escritura, y SOLO tras pasar puedeEscribirMcp.
//
// opts.owner / opts.idUsuario (2026-07-27, lanzar_campana): la organizacion ya no alcanza para
// una escritura que MANDA mensajes. El owner queda estampado en la campana y el idUsuario es
// contra quien se resuelven el Gmail verificado y la linea de WhatsApp, o sea a nombre de quien
// sale el mensaje. Viajan aparte del input de la tool a proposito: si el cliente MCP pudiera
// elegirlos, podria mandar por la linea de otra persona. Opcionales en la firma porque el server
// standalone por token no tiene sesion de usuario; ahi lanzar_campana se registra igual pero
// falla explicito al invocarse, en vez de lanzar a nombre de nadie.
export function crearMcpServer(opts: { escritura?: boolean; idOrganizacion?: number; owner?: string; idUsuario?: string } = {}): McpServer {
  const server = new McpServer({ name: NOMBRE_SERVIDOR, version: VERSION_SERVIDOR });

  server.registerTool(
    'panel_metricas',
    {
      description:
        'Metricas del panel del CRO: tiempo promedio en cada etapa, ciclo de venta promedio, ' +
        'conversion stage->stage y MRR total estimado. Todas de solo lectura, sobre isps.db real.',
      inputSchema: {
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay, unica organizacion real hoy)'),
        owner: z.string().optional().describe('Filtra SOLO conversionStage (las otras 3 metricas son vista del CRO sobre toda la organizacion)'),
        ahora: z.string().optional().describe('Fecha de corte yyyy-mm-dd para tiempoPromedioPorEtapa/cicloVentaPromedio. Default: hoy'),
      },
    },
    async ({ idOrganizacion, owner, ahora }) => {
      const resultado = panelMetricas({ idOrganizacion, owner, ahora });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  server.registerTool(
    'deal_historia',
    {
      description:
        'Historia de un deal (empresa): etapa actual, transiciones de etapa con fecha, plan asignado, ' +
        'MRR potencial, %digital, probabilidad de cierre (heuristica por etapa) y usuarios efectivos.',
      inputSchema: {
        idEmpresa: z.string().min(1).describe('empresa.id_empresa'),
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ idEmpresa, idOrganizacion }) => {
      const resultado = dealHistoria({ idEmpresa, idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // Conteo por etapa. Es la primera llamada de cualquier reconciliacion contra Notion: ocho
  // numeros en vez de las 476 empresas que hay que traerse por `pipeline` para contarlas afuera.
  server.registerTool(
    'embudo',
    {
      description:
        'Cuantas cuentas hay en cada etapa del pipeline, con sus usuarios. Devuelve tambien ' +
        'sinEtapa: cuentas que existen en la base pero no estan en el embudo (estado_notion null), ' +
        'que NO aparecen en `pipeline`. Empieza por aca al cuadrar contra Notion.',
      inputSchema: {
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
        owner: z.string().optional().describe('Filtra a la cartera de una persona, tal como se escribe en el pipeline'),
      },
    },
    async ({ idOrganizacion, owner }) => {
      const resultado = embudoTool({ idOrganizacion, owner });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // La lista para cruzar contra Notion. La llave es notionPageId, nunca el nombre: cruzar 482
  // paginas contra 476 cuentas por nombre dio 326 falsas diferencias, y por page_id dio 9.
  server.registerTool(
    'cuentas',
    {
      description:
        'Lista minima de cuentas para cruzar contra Notion: idEmpresa, nombre (razon social), ' +
        'nombreNotion (marca comercial), estado, owner y notionPageId. CRUZA SIEMPRE POR ' +
        'notionPageId, nunca por nombre. Incluye cuentas sin etapa, que `pipeline` no muestra.',
      inputSchema: {
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ idOrganizacion }) => {
      const resultado = cuentasTool({ idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado) }] };
    },
  );

  // Que subir a Notion. Es el paso 1 de la resincronizacion: en vez de revisar el pipeline
  // entero, se le pregunta a la base que se movio.
  server.registerTool(
    'cambios_desde',
    {
      description:
        'Que empresas se movieron en la herramienta desde una fecha: toques nuevos y transiciones ' +
        'de etapa, con su notionPageId para saber a que pagina van. Reporta aparte cuantas no ' +
        'tienen pagina en Notion. Empieza por aca al subir cambios a Notion.',
      inputSchema: {
        desde: z.string().min(1).describe('YYYY-MM-DD. Se incluyen los cambios de ese dia en adelante'),
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ desde, idOrganizacion }) => {
      const resultado = cambiosDesdeTool({ desde, idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // Que se hizo y que NO se hizo en un periodo. Las otras tools de lectura son fotos del
  // estado de ahora; esta es la unica que responde por un rango de fechas, y la unica que
  // muestra los seguimientos que se corrieron.
  server.registerTool(
    'actividad',
    {
      description:
        'Actividad de un rango de fechas: los toques (dia, canal, resultado, duracion, razon de perdida y ' +
        'objecion con su nota, fechas de reunion propuesta y ocurrida, puntero de grabacion, empresa, ' +
        'estado, owner, quien lo ejecuto, fuente) y, en una lista APARTE, los seguimientos que se aplazaron ' +
        '(empresa, fecha incumplida, fecha nueva). Los aplazos no se suman a los toques: son lo que NO se ' +
        'hizo. `toques` trae TODAS las filas del rango, incluidas las respuestas entrantes del ISP ' +
        '(fuente=whatsapp_entrante) -- pero totalToques, toquesSinAtribuir, toquesSinFecha y conteos solo ' +
        'cuentan lo EJECUTADO por el operador; los entrantes se reportan aparte en toquesEntrantes, mismo ' +
        'criterio que totalAplazos. Trae ademas conteos por canal, por resultado, por ejecutor, de ' +
        'duracion, y el par de reuniones (conFechaPropuesta / ocurridas / noShow) que da el no-show rate. ' +
        'Devuelve todas las filas del rango, sin tope. Reporta toquesSinAtribuir y toquesSinFecha: la ' +
        'porcion de lo ejecutado de la que no se puede decir quien la hizo ni cuando.',
      inputSchema: {
        desde: z.string().min(1).describe('YYYY-MM-DD, incluido'),
        hasta: z.string().min(1).describe('YYYY-MM-DD, incluido'),
        owner: z.string().optional().describe('Filtra por el dueno del deal (empresa.owner)'),
        ejecutadoPor: z
          .string()
          .optional()
          .describe('Filtra por quien EJECUTO el toque o el aplazo. Distinto de owner: un toque sin atribuir nunca matchea'),
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ desde, hasta, owner, ejecutadoPor, idOrganizacion }) => {
      const resultado = actividadTool({ desde, hasta, owner, ejecutadoPor, idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // El copy con el que se abre una cuenta, y si esa cuenta contesto. Es el mensaje que se
  // redacta ANTES y se compara entre cuentas; el resto del hilo es reaccion. Ninguna otra tool
  // devuelve el texto de un WhatsApp: `actividad` da el toque, no lo que se escribio.
  server.registerTool(
    'aperturas_whatsapp',
    {
      description:
        'Los mensajes de APERTURA de WhatsApp (el primero que sale hacia una cuenta), juntos y en orden, ' +
        'con su empresa, su contacto, el texto tal como salio, y si esa cuenta contesto despues y cuando. ' +
        'Es lo que responde "que copy hace que la conversacion se mueva": el patron sale de comparar las ' +
        'aperturas entre si contra su resultado, no de leer una. Un mensaje solo cuenta como apertura si ' +
        'no habia NINGUN mensaje previo de esa cuenta en ninguna direccion; una respuesta nuestra a un ISP ' +
        'que escribio primero no es apertura. Devuelve total, conRespuesta y sinRespuesta por separado: una ' +
        'apertura de hoy sin respuesta no es lo mismo que una de hace un mes. Sin tope, no trunca. ' +
        'OJO con el alcance real: solo existen aperturas desde que la herramienta guarda lo que SALE ' +
        '(2026-07-26); antes de esa fecha no hay ninguna, y no es que no se hayan mandado.',
      inputSchema: {
        desde: z.string().min(1).optional().describe('YYYY-MM-DD, incluido. Sin esto, desde el principio'),
        hasta: z.string().min(1).optional().describe('YYYY-MM-DD, incluido. Sin esto, hasta hoy'),
      },
    },
    async ({ desde, hasta }) => {
      const resultado = aperturasWhatsappTool({ desde, hasta });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // El tracking de correo no se podia leer desde el MCP: evento_tracking no estaba expuesto y
  // la unica via era SSH mas node contra el volumen. Devuelve el evento crudo, no una tasa --
  // ver las advertencias que viajan en la respuesta.
  server.registerTool(
    'tracking_correo',
    {
      description:
        'Aperturas, clics y rebotes de CORREO con su timestamp, filtrables por empresa, por campaña y por rango ' +
        'de fechas. Cada evento trae la empresa, la campaña, el paso al que se le atribuyó, el asunto, el email, ' +
        'la huella cruda del request (userAgent, ip, via) cuando existe, y un VEREDICTO: clasificacion ' +
        '(humano/maquina/desconocido), razon, senal y confianza, más grupoDedupId/esRepresentanteGrupo para saber ' +
        'qué filas son el mismo hit repetido. Nada se borra ni se filtra: el crudo completo sigue en cada evento y ' +
        'clasificacion/dedup son reconstruibles corriendo las mismas funciones puras sobre él. ' +
        "conteos.crudo cuenta todas las filas; conteos.deduplicado suma por grupoDedupId distinto (una apertura " +
        'real, no un hit repetido del mismo pixel); las dos traen porClasificacion (humano/máquina/desconocido) ' +
        'y excluyen el tráfico de prueba interno. ' +
        'medibilidad.porEnvio dice, por paso_inscripcion, si hay apertura humana confirmada, si un clic prueba ' +
        'deductivamente que el pixel falló (pixel_bloqueado_confirmado, sin necesitar muestra), o si no hay señal ' +
        'humana de apertura — este último caso NUNCA significa "no lo abrió": puede ser Outlook (el pixel nunca ' +
        'sale) o Gmail con solo el proxy, y las dos causas se juntan a propósito porque no se pueden distinguir ' +
        'desde acá. medibilidad.avisosProveedor solo nombra un dominio con 3+ envíos bloqueados y cero confirmados ' +
        '(umbral en conteo, nunca en %). OJO: medibilidad.porEnvio solo cubre envíos con AL MENOS UNA fila en ' +
        'evento_tracking; un envío de Outlook cuyo pixel nunca se disparó ni una vez no tiene fila que leer y no ' +
        'aparece acá en absoluto (no genera un estado explícito). ' +
        'DEVUELVE EVENTOS Y VEREDICTOS, NUNCA UNA TASA DE APERTURA (0% en ningún campo, en ninguna forma) — eso es ' +
        'a propósito, es una decisión dura del sistema, no una limitación a resolver. La atribución por paso está ' +
        'corrida y sigue fuera de alcance: resolverDestinatarioPorEmail acredita al paso_inscripcion enviado MÁS ' +
        'RECIENTE de esa campaña y ese email, así que en una cadencia de varios pasos una apertura del correo 1 se ' +
        'le acredita al último enviado (pasoOrden viaja con esa advertencia pegada). Apple Private Relay (R5) está ' +
        'documentada pero inerte: no hay chequeo en vivo contra el CSV de Apple, así que esos casos caen en la regla ' +
        'de UA de navegador completo o en no-clasificable, nunca en la de Apple. No se detectan escáneres ' +
        'corporativos (Proofpoint/Mimecast/Barracuda) por firma propia: no hay UA público de ninguno. ' +
        'Si filtras por tipo, medibilidad.porEnvio pierde evidencia (ver advertencias en la respuesta). ' +
        'La respuesta también trae posiblesDuplicados, una heurística previa más ancha (10s) que grupoDedupId (2s), ' +
        'útil como diagnóstico rápido. ' +
        'userAgent e ip solo existen desde el 2026-07-28: un evento anterior los trae en null porque no se ' +
        'capturaron, no porque hayan venido vacíos. ' +
        'Solo canal correo: las aperturas de conversación de WhatsApp son otra cosa y viven en aperturas_whatsapp.',
      inputSchema: {
        idEmpresa: z.string().min(1).optional().describe('empresa.id_empresa'),
        idCampana: z.number().int().positive().optional(),
        tipo: z.string().min(1).optional().describe("Filtra por tipo de evento: abierto, clic, rebota, respondio, enviado"),
        desde: z.string().min(1).optional().describe('ISO o YYYY-MM-DD, incluido. Compara contra fecha_evento con fallback a created_at'),
        hasta: z.string().min(1).optional().describe('ISO o YYYY-MM-DD, incluido'),
        limite: z.number().int().positive().optional().describe('Default 200, del más reciente al más viejo'),
      },
    },
    async (input) => {
      const resultado = trackingCorreoTool(input as Parameters<typeof trackingCorreoTool>[0], opts.idOrganizacion ?? ORGANIZACION_DEFAULT);
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // Que quedo programado para un dia. Es la comprobacion de que las cuentas quedaron listas:
  // hasta hoy, despues de programar siete mensajes no habia forma de verificarlo salvo confiar.
  server.registerTool(
    'envios_programados',
    {
      description:
        'Que hay programado para una fecha: por cada envio, la empresa, el canal, la hora prevista, el copy ' +
        'final tal como saldria, si ya fue aprobado y por quien, y su estado. Trae lo aprobado Y lo que ' +
        'sigue sin aprobar, porque la mitad util de la respuesta es lo que falta por revisar: totalListos ' +
        'son los que de verdad van a salir (aprobados y con copy escrito) y totalSinAprobar los que NO van ' +
        'a salir aunque su hora llegue, porque WhatsApp no sale sin revision humana. La hora es el piso ' +
        'desde el que el envio queda elegible, no el instante exacto: el ritmo real lo pone el espaciado ' +
        'del worker. Sin tope, no trunca.',
      inputSchema: {
        fecha: z.string().min(1).describe('YYYY-MM-DD, el dia programado'),
        canal: z.enum(CANALES).optional().describe('Filtra por canal. Sin esto, todos'),
      },
    },
    async ({ fecha, canal }) => {
      const resultado = enviosProgramadosTool({ fecha, canal });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // Lo planeado contra lo hecho. `actividad` responde que se hizo; esta responde que se penso
  // hacer y no se hizo, que es la pregunta que no tenia fuente hasta que el plan del dia se
  // volvio dato (planear_dia).
  server.registerTool(
    'plan_vs_ejecutado',
    {
      description:
        'Lo planeado contra lo ejecutado, por dia y por rango. Devuelve cuantos toques se planearon, ' +
        'cuantos se hicieron, cuantos no, y de los NO hechos su tipo y su motivo (el motivo sale del ' +
        'aplazo de esa cuenta ese dia; null quiere decir que nadie lo dijo, no que no hubiera ' +
        'motivo). Lista aparte los toques que se hicieron y NO estaban en el plan, que es la porcion ' +
        'del dia que se va en cuentas que nadie penso tocar. Un toque cuenta como ejecutado aunque ' +
        'el canal no sea el planeado (se reporta en coincideCanal): cambiar de canal sobre la marcha ' +
        'es una decision, no un incumplimiento. sinPlanEnElRango:true distingue "planeo cero" de ' +
        '"nadie escribio el plan". La tasa de cumplimiento NO se calcula aca: se devuelven los ' +
        'conteos y el denominador se elige afuera.',
      inputSchema: {
        desde: z.string().min(1).describe('YYYY-MM-DD, incluido'),
        hasta: z.string().min(1).optional().describe('YYYY-MM-DD, incluido. Sin esto, el rango es el dia de `desde`'),
        owner: z.string().optional().describe('Filtra por el dueno del deal (empresa.owner)'),
        ejecutadoPor: z
          .string()
          .optional()
          .describe('Filtra por la persona: quien EJECUTO el toque y quien PLANEO la linea. Son dos eventos con la misma pregunta detras'),
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ desde, hasta, owner, ejecutadoPor, idOrganizacion }) => {
      const resultado = planVsEjecutadoTool({ desde, hasta, owner, ejecutadoPor, idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // La cola del dia, la misma que ve la web. Estaba solo en la ruta web: para saber que tocaba
  // hoy habia que abrir el navegador.
  server.registerTool(
    'cola',
    {
      description:
        'Que vence hoy y que esta vencido, con empresa, estado, fecha programada y dias de atraso. ' +
        'Es la misma cola que muestra la web (misma regla: excluye on_hold, firma_pago y lead). ' +
        'Devuelve las dos listas separadas mas el resumen del home.',
      inputSchema: {
        fecha: z.string().optional().describe('YYYY-MM-DD, fecha de corte. Default: hoy'),
        owner: z.string().optional().describe('Cola de una persona. Sin owner, la de toda la organizacion'),
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ fecha, owner, idOrganizacion }) => {
      const resultado = colaTool({ fecha, owner, idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  server.registerTool(
    'pipeline',
    {
      description:
        'Lista de deals del pipeline con sus cifras: etapa, deal size (usuarios), probabilidad de cierre, ' +
        'plan, %digital y revenue estimado. Mismo dato que expone GET /api/panel/pipeline.',
      inputSchema: {
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ idOrganizacion }) => {
      const resultado = pipeline({ idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  // LECTURA, aunque su razon de ser sea alimentar una escritura: buscar_empresa no toca
  // nada, y exigirle el permiso de escritura dejaria a un lector sin poder responder "esta
  // cuenta ya existe?" -- que es la pregunta que evita el duplicado.
  server.registerTool(
    'buscar_empresa',
    {
      description:
        'Busca si una cuenta ya existe, por los CUATRO frentes a la vez: empresa (nombre oficial y normalizado), ' +
        'alias, lista de prospeccion (nombre crudo, website, telefonos) y contactos (telefono, dominio del email). ' +
        'Devuelve cada candidato con de que frente salio y con que confianza. Correrla antes de crear es lo que ' +
        'evita duplicados.',
      inputSchema: {
        nombre: z.string().min(1).describe('Nombre a buscar. Se normaliza quitando sufijos legales (SAS, SA, ESP, LTDA...)'),
        telefono: z.string().min(1).optional().describe('Cruza contra contactos y prospeccion. Se usan los 10 digitos, sin indicativo ni signos'),
        dominio: z.string().min(1).optional().describe('Dominio, URL o email. Cruza contra el website de prospeccion y el email de los contactos'),
        nit: z.string().min(1).optional().describe('Match exacto contra el id de la cuenta'),
      },
    },
    async ({ nombre, telefono, dominio, nit }) => {
      const resultado = buscarEmpresaTool({ nombre, telefono, dominio, nit });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  if (opts.escritura) {
    const sesion = opts.owner != null && opts.idUsuario != null ? { owner: opts.owner, idUsuario: opts.idUsuario } : undefined;
    registrarWriteTools(server, opts.idOrganizacion ?? ORGANIZACION_DEFAULT, sesion);
  }

  return server;
}

function responderJson(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

const RUTA_MCP = '/mcp';
const RUTA_HEALTH = '/health';

// El health check NO exige token: es el mismo trato que /api/health en la app principal
// (sin dato de negocio, solo "el proceso esta vivo"), lo usa el healthcheck de Compose.
async function manejarHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  responderJson(res, 200, { status: 'ok' });
}

async function manejarMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    // GET/DELETE en modo stateless no aplican (no hay sesion que reabrir ni cerrar) --
    // mismo 405 JSON-RPC que el ejemplo stateless del SDK.
    responderJson(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    return;
  }

  const token = tokenDeHeaders(req.headers);
  if (!tokenValido(token)) {
    responderJson(res, 401, { error: 'token invalido o ausente' });
    return;
  }

  const mcpServer = crearMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
  } catch (e) {
    console.error('[mcp] error manejando request:', e);
    if (!res.headersSent) {
      responderJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}

export function crearServidorMcp(): http.Server {
  return http.createServer((req, res) => {
    const ruta = req.url?.split('?')[0];
    if (ruta === RUTA_HEALTH) {
      void manejarHealth(req, res);
      return;
    }
    if (ruta === RUTA_MCP) {
      void manejarMcp(req, res);
      return;
    }
    responderJson(res, 404, { error: 'ruta no encontrada' });
  });
}
