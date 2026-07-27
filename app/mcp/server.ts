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
  reasignarNitTool,
  reconciliarNotionTool,
  cambiosDesdeTool,
  actividadTool,
  aperturasWhatsappTool,
  colaTool,
  aplazarSeguimientoTool,
  snapshotEstadosTool,
  editarToqueTool,
  planearDiaTool,
  marcarNoEjecutadoTool,
  planVsEjecutadoTool,
} from './tools';
import { CANALES_TOQUE, RESULTADOS, MOTIVOS_APLAZO, RAZONES_PERDIDA, OBJECIONES, ACCIONES_CLIENTE, TIPOS_PLAN, ORIGENES_PLAN } from '../db/validation';
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
  'panel_metricas',
  'pipeline',
  'plan_vs_ejecutado',
] as const;

export const TOOLS_ESCRITURA = [
  'actualizar_empresa',
  'aplazar_seguimiento',
  'cambiar_cadencia',
  'crear_empresa',
  'editar_toque',
  'marcar_no_ejecutado',
  'marcar_perdida',
  'mover_estado',
  'planear_dia',
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
function registrarWriteTools(server: McpServer, idOrganizacion: number): void {
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
        'cambiarCadencia() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        idCampana: z.number().int().positive().optional().describe('Inscribe la empresa en la cadencia de esta campana'),
        proximoFollowUp: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
        proximoPaso: z.string().min(1).optional(),
      },
    },
    async (input) => {
      const r = cambiarCadenciaTool(input as Parameters<typeof cambiarCadenciaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
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
export function crearMcpServer(opts: { escritura?: boolean; idOrganizacion?: number } = {}): McpServer {
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
        'estado, owner, quien lo ejecuto) y, en una lista APARTE, los seguimientos que se aplazaron ' +
        '(empresa, fecha incumplida, fecha nueva). Los aplazos no se suman a los toques: son lo que NO se ' +
        'hizo. Trae ademas conteos por canal, por resultado, por ejecutor, de duracion, y el par de ' +
        'reuniones (conFechaPropuesta / ocurridas / noShow) que da el no-show rate. Devuelve todas las ' +
        'filas del rango, sin tope. Reporta toquesSinAtribuir y toquesSinFecha: la porcion de la que no se ' +
        'puede decir quien la hizo ni cuando.',
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
    registrarWriteTools(server, opts.idOrganizacion ?? ORGANIZACION_DEFAULT);
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
