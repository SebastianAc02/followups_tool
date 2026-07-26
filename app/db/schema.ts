import { sqliteTable, sqliteView, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Refleja las tablas que YA existen en isps.db (no se crean aquí). Solo las que usa el cockpit.

export const empresa = sqliteTable('empresa', {
  idEmpresa: text('id_empresa').primaryKey(),
  tipoId: text('tipo_id').notNull(),
  nombreOficial: text('nombre_oficial').notNull(),
  nombreNormalizado: text('nombre_normalizado').notNull(),
  // Fase 0 dedup Notion (2026-07-14): al fundir un gemelo NIT<->sintetico,
  // nombreOficial pasa a ser el nombre de NOTION (lo que ve toda la app). La razon
  // social del NIT queda aca, solo para referencia/auditoria, nunca en la UI.
  nombreLegal: text('nombre_legal'),
  // Ya existe en isps.db (sin mapear hasta ahora). Fase 0 dedup lo usa como marca de
  // fusion: si esta seteado, esta fila es un duplicado absorbido por otra empresa
  // (el sobreviviente), no se borra pero deja de ser una identidad activa.
  operaBajoId: text('opera_bajo_id'),
  // Task 12 (plan 2026-07-15-embudo-real-y-registro): satelite_de, DISTINTA de
  // operaBajoId. operaBajoId = identidad muerta (absorbida, fundida, sin deal propio).
  // idEmpresaMatriz = ambas filas siguen vivas, cada una con su propio deal, pero
  // relacionadas para que el matcher deje de confundirlas (ej. EMCALI de Thomas es
  // satelite de Emcali (ISP) de Felipe: dos paginas reales de Notion, misma empresa
  // matriz, deals separados).
  idEmpresaMatriz: text('id_empresa_matriz'),
  ciudadPrincipal: text('ciudad_principal'),
  departamento: text('departamento'),
  esCliente: integer('es_cliente').notNull().default(0),
  enConversacion: integer('en_conversacion').notNull().default(0),
  crmSoftware: text('crm_software'),
  estadoComercial: text('estado_comercial').notNull(),
  estadoNotion: text('estado_notion'),
  prioridadComercial: integer('prioridad_comercial'),
  pasarelaActual: text('pasarela_actual'),
  categoria: text('categoria'),
  // Facts crudos acumulados de la cuenta (cifras, sin narracion). Espeja la propiedad
  // "Notas Discovery" de Notion. Hasta 2026-07-15 esto era escritura ciega: se encolaba al
  // outbox y el adapter lo mapeaba, pero sin columna local la tool no las podia leer de
  // vuelta ni acumularlas, solo pisarlas en cada sync.
  notasDiscovery: text('notas_discovery'),
  // Narrativa del estado de la cuenta, se hidrata con cada toque. Distinta de notasDiscovery:
  // eso son datos sueltos, esto es la historia.
  brief: text('brief'),
  owner: text('owner'),
  proximoFollowUpFecha: text('proximo_follow_up_fecha'),
  proximoPaso: text('proximo_paso'),
  proximoCanal: text('proximo_canal'),
  // Bucle PBX (enriquecimiento del decisor): la forma actual (vocabulario de
  // FormaPaso en app/core/pbx.ts), null cuando la empresa no esta en el bucle. Los
  // intentos NO se persisten aqui, se cuentan desde `toque`.
  pbxForma: text('pbx_forma'),
  // Nombre tal como aparece en la propiedad "Empresa" de Notion (marca comercial, ej.
  // "Atlantel" vs "ATLANTEL S.A.S" del RUES). Nullable, se puebla solo al reconciliar.
  // Permite cruzar sin fuzzy matching cuando es exacto.
  nombreNotion: text('nombre_notion'),
  // V3.1b: enlace directo a la pagina real de Notion. Se llena una vez (script de
  // enlace, V3.7) y de ahi en adelante el sync escribe por ID, nunca busca por nombre
  // (hay nombres normalizados duplicados reales en la base).
  notionPageId: text('notion_page_id'),
  // Multi-organización (Parte 1, 2026-07-09): la organización que ACTUALMENTE trabaja
  // este lead. Un lead compartido lo trabaja una organización a la vez (ver spec
  // 2026-07-09-multi-organizacion-real-design.md) -- NO es aislamiento de catálogo,
  // es de a quién pertenece la relación comercial ahora mismo.
  organizacionActivaId: integer('organizacion_activa_id').notNull(),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
  // MRR potencial real (2026-07-22, plan-panel-metricas-tiempo-real.md): que plan puede
  // tomar el deal y que % de sus transacciones ya son digitales, ambos capturados en el
  // discovery. Nullable: la mayoria de deals no lo tiene todavia (se llena hacia
  // adelante). Sin id_plan, el deal no aporta al MRR total (no se inventa tarifa).
  idPlan: integer('id_plan'),
  // 0..1, mismo rango que digitalPct en app/core/mrr.ts. Null hasta que el discovery lo
  // capture; digitalPctConDefault() aplica el 40% (igual que la formula de Notion,
  // verificada contra un deal real) mientras tanto.
  pctDigital: real('pct_digital'),

  // --- CRM portable (2026-07-24) ---
  // Todo lo de abajo entra nullable y sin default: son 1.956 filas vivas y ninguna
  // tiene el dato todavia. NULL significa "nunca se evaluo", distinto de 0 = "no".
  // Backfill hacia adelante, no hay script de relleno.

  // De donde salio el lead: inbound, outbound, evento, referido. Es el corte que mas se
  // va a pedir y hoy no existe a nivel empresa. Existe cliente.fuente_lead, pero solo
  // cubre las 73 filas que ya son cliente y viene de Notion, no del origen real.
  fuenteLead: text('fuente_lead'),
  // Primer y ultimo toque en fecha ISO. No son derivables limpio de toque: 97 de 274
  // toques tienen fecha NULL, y los contactos por WhatsApp viven en mensaje_whatsapp,
  // fuera de toque. max(toque.fecha) daria una respuesta incompleta y silenciosa.
  fechaPrimerContacto: text('fecha_primer_contacto'),
  fechaUltimoContacto: text('fecha_ultimo_contacto'),
  // Razon de perdida a nivel cuenta. Ya existe toque.razon_perdida, pero con 0 filas
  // llenas en 274 toques: la perdida se decide sobre la cuenta, no sobre un toque suelto.
  razonPerdida: text('razon_perdida'),

  // Marcadores del embudo, 0/1. Son monotonos ("alguna vez llego"), distintos de
  // estado_notion que es la etapa de AHORA. No se pueden derivar de
  // empresa_estado_historial: esa tabla tiene 47 filas contra 1.956 empresas, arranco
  // el 2026-07-15 y no cubre nada anterior.
  contactado: integer('contactado'),
  respondio: integer('respondio'),
  agendado: integer('agendado'),
  sePresento: integer('se_presento'),
  califica: integer('califica'),

  // Tier comercial de la cuenta. Existe cliente.tier_notion, otra vez solo para clientes.
  // prioridad_comercial (1..5, 9) y score_outbound son del motor de prospeccion, no del
  // tamano del deal.
  tier: text('tier'),
  // Tipo de empresa. Se solapa con `categoria` (isp/utility/otro, 1.950 filas llenas) y
  // con la vista empresa_categoria, que ya derivan si la cuenta es atacable. Entra
  // aparte porque eso responde "sirve de target", no "que es".
  tipoEmpresa: text('tipo_empresa'),

  // pag_web NO entra aca a proposito: empresa_web.url_website ya es 1:1 con empresa por
  // la misma PK y cubre 1.777 de 1.956 filas. Meterlo aqui crea una segunda verdad que
  // se desincroniza sola. Se resuelve con join.
});

// Catalogo de planes (2026-07-22, plan-panel-metricas-tiempo-real.md): NO se refleja de
// Notion (la propiedad "Planes" de Notion es una relacion a su propia DB), es tabla
// nueva local, sembrada a mano desde ese catalogo (scripts/seed_planes.ts). saasMensual y
// tarifaTxn en COP enteros (el negocio no maneja centavos). Es la fuente real de
// calcularMrrEstimado (app/core/mrr.ts), reemplaza la tarifa global de configuracion_admin.
export const plan = sqliteTable('plan', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // unique: el seed (scripts/seed_planes.ts) hace upsert por nombre, correrlo dos veces
  // no debe duplicar el catalogo.
  nombre: text('nombre').notNull().unique(),
  saasMensual: integer('saas_mensual').notNull(),
  tarifaTxn: integer('tarifa_txn').notNull(),
});

export const contacto = sqliteTable('contacto', {
  idContacto: integer('id_contacto').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  nombre: text('nombre'),
  apellido: text('apellido'),
  cargo: text('cargo'),
  cargoCategoria: text('cargo_categoria'),
  esKeyDecisionMaker: integer('es_key_decision_maker').notNull().default(0),
  telefono: text('telefono'),
  email: text('email'),
  // T11: enriquecimiento Notion (Buying Comittee) trae LinkedIn per-persona.
  linkedin: text('linkedin'),
  notas: text('notas'),
  esPrincipal: integer('es_principal').notNull().default(0),
  fuente: text('fuente').notNull(),
});

export const empresaUsuarios = sqliteTable('empresa_usuarios', {
  idEmpresa: text('id_empresa').primaryKey(),
  usuariosReales: real('usuarios_reales'),
  usuariosRealesFuente: text('usuarios_reales_fuente'),
  usuariosEstimados: real('usuarios_estimados'),
  usuariosEstFuente: text('usuarios_est_fuente'),
  // Columna GENERATED ALWAYS ... STORED en isps.db real (COALESCE(reales, estimados)).
  // generatedAlwaysAs() es necesario, no cosmetico: sin marcarla como generada, Drizzle
  // incluye IGUAL esta columna (con null) en el INSERT de cualquier .values() sobre esta
  // tabla que no la mencione explicitamente -- y SQLite rechaza CUALQUIER referencia a
  // una columna generada en la lista de un INSERT, incluso null (encontrado corriendo
  // enriquecerDesdeNotion contra la DB real, T12; el DDL de prueba no la declaraba
  // generada y por eso el test no lo agarro).
  usuariosEfectivos: real('usuarios_efectivos').generatedAlwaysAs(sql`(COALESCE(usuarios_reales, usuarios_estimados))`, { mode: 'stored' }),
  actualizadoEn: text('actualizado_en'),
  actualizadoPor: text('actualizado_por'),
});

export const toque = sqliteTable('toque', {
  idToque: integer('id_toque').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  idContacto: integer('id_contacto'),
  fecha: text('fecha'),
  // El DIA calendario del toque, ISO YYYY-MM-DD y nada mas (2026-07-25). `fecha` de arriba es
  // texto libre historico: de 285 filas de produccion, 97 estan en NULL, 142 en ISO de dia, 39
  // en ISO con hora, 4 con hora separada por espacio y 3 en prosa ("~inicios jun",
  // "oct-2025 (aprox)"). El resultado medido es que 100 toques se caen de cualquier consulta
  // con fecha y que solo 35 toques tienen fecha Y resultado a la vez.
  //
  // fechaDia es la columna sobre la que se cuenta: la escribe el dominio ya normalizada y Zod
  // la valida contra ^\d{4}-\d{2}-\d{2}$ (mismo patron que canal/resultado: la garantia es del
  // dominio, no un CHECK -- un CHECK en SQLite no se amplia sin recrear la tabla, ver
  // docs/playbook-migraciones.md). `fecha` se sigue escribiendo con el timestamp completo, que
  // es el que dice a que hora paso.
  fechaDia: text('fecha_dia'),
  // Lo que no se pudo convertir a un dia, guardado tal cual en vez de botado. Dos filas de
  // produccion viven aca ("~inicios jun", "oct-2025 (aprox)"): son toques reales con una fecha
  // que nadie sabe, y borrar el texto seria perder el unico rastro que queda de cuando fueron.
  fechaTexto: text('fecha_texto'),
  canal: text('canal'),
  resultado: text('resultado'),
  // Cuanto duro, en segundos. Nullable: un correo no dura, y un toque viejo no lo sabe. Sin
  // esta columna no se puede separar la llamada de 40 segundos que no fue conversacion de la
  // de 12 minutos que si lo fue, y las dos contaban igual en el conteo del dia.
  duracionSegundos: integer('duracion_segundos'),
  // Las dos fechas de la reunion, que son dos cosas distintas y por eso son dos columnas
  // (2026-07-25): la PROPUESTA es cuando quedo agendada, la OCURRIDA es cuando de verdad
  // paso. La diferencia entre las dos ES el dato: iguales = se cumplio, propuesta sin ocurrida
  // = no-show o reagendamiento (lo dice el resultado: no_llego vs una reunion nueva), y la
  // distancia entre la ocurrida y el pago es el ciclo de reunion a plata. Ninguna de las 90
  // columnas de fecha del esquema respondia esto: un toque podia decir "quedamos en reunion"
  // sin dejar cuando era ni si paso.
  reunionFechaPropuesta: text('reunion_fecha_propuesta'),
  reunionFechaOcurrida: text('reunion_fecha_ocurrida'),
  quePaso: text('que_paso'),
  proximoPaso: text('proximo_paso'),
  proximoFollowUpFecha: text('proximo_follow_up_fecha'),
  transcriptProveedor: text('transcript_proveedor'),
  transcriptId: text('transcript_id'),
  transcriptUrl: text('transcript_url'),
  // El resumen que ESCRIBIO la tool para este toque (producto). Es lo que se ve al abrir el
  // toque en el historial. Se llena venga de Granola o del dictado.
  resumen: text('resumen'),
  // El resumen que devolvio Granola, tal cual (insumo). Solo lo llena el camino de Granola;
  // en un toque dictado queda null. Se guarda aparte de `resumen` para poder regenerar el
  // producto cuando cambie el prompt, sin volver a pedirle a Granola con credencial por
  // toques viejos. Es el "resumen cacheado" que pide el CLAUDE.md: el consumidor (CRO/MCP)
  // lo lee sin credencial.
  transcriptResumen: text('transcript_resumen'),
  // Razon de perdida ACOTADA, uno de RAZONES_PERDIDA (app/db/validation.ts). La columna ya
  // existia como texto libre y llego con UNA fila llena sobre 285 toques, en prosa. El
  // vocabulario cerrado es lo que se cuenta; la prosa va en razonPerdidaNota y no la reemplaza.
  // Mismo patron que motivo/nota en seguimiento_aplazado.
  razonPerdida: text('razon_perdida'),
  razonPerdidaNota: text('razon_perdida_nota'),
  // Objecion VIVA, uno de OBJECIONES. Misma historia: 5 filas llenas sobre 285, todas en
  // prosa, tres de ellas diciendo "precio" con distintas palabras.
  objecion: text('objecion'),
  objecionNota: text('objecion_nota'),
  fuente: text('fuente').notNull(),
  // Quien EJECUTO el toque (hizo la llamada o mando el mensaje), distinto de empresa.owner,
  // que es el dueno del deal. Los dos coinciden casi siempre y por eso no existia la
  // columna; cuando no coinciden (alguien cubre la cartera de otro, o el toque lo hace un
  // SDR sobre un deal ajeno) hoy no hay forma de saber quien lo hizo, porque el owner del
  // deal se lee como si fuera el ejecutor.
  // Nullable y SIN default a proposito: NULL significa "no atribuido", nunca "lo hizo el
  // owner". Las filas viejas quedan en NULL y no se rellenan hacia atras.
  ejecutadoPor: text('ejecutado_por'),
  // Multi-organización (Parte 1): de qué organización es este toque. A diferencia de
  // empresa.organizacionActivaId (mutable, "quién tiene la relación ahora"), este campo
  // es inmutable: el toque queda para siempre de la organización que lo registró.
  idOrganizacion: integer('id_organizacion').notNull(),
  createdAt: text('created_at'),
});

// Lista cruda de prospeccion (670 filas en isps.db): el nombre tal como venia de la fuente
// original, con su website y sus telefonos, antes de que existiera la cuenta. Ya existia en
// isps.db; se mapea ahora (2026-07-24) porque es uno de los cuatro frentes de buscarEmpresa
// -- una cuenta se encuentra por su nombre crudo de prospeccion cuando el nombre_oficial ya
// no se le parece. telefonosRaw es UN texto con varios numeros separados por " | ", no una
// tabla hija; se parte en memoria, no en SQL.
export const prospeccion = sqliteTable('prospeccion', {
  idProspeccion: integer('id_prospeccion').primaryKey({ autoIncrement: true }),
  // Nullable en el DDL real. Hoy las 670 filas apuntan a una empresa, pero el esquema
  // permite que no, asi que el tipo lo dice.
  idEmpresa: text('id_empresa'),
  empresaNombreRaw: text('empresa_nombre_raw').notNull(),
  usuariosEstimados: real('usuarios_estimados'),
  ciudadPrincipal: text('ciudad_principal'),
  departamento: text('departamento'),
  website: text('website'),
  telefonosRaw: text('telefonos_raw'),
  fuente: text('fuente').notNull(),
  createdAt: text('created_at'),
});

export const empresaAlias = sqliteTable('empresa_alias', {
  idAlias: integer('id_alias').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  alias: text('alias').notNull(),
  fuente: text('fuente').notNull(),
  confianza: text('confianza').notNull().default('alta'),
  createdAt: text('created_at'),
});

// Task 12: complemento de empresaAlias. empresaAlias solo guarda los SI ("estos dos
// nombres son la misma empresa"); esta tabla guarda los TRES veredictos posibles
// (mismo/distinto/satelite_de) para que un par ya refutado por Sebastian no se vuelva a
// proponer en cada corrida del matcher/diff. decidido_por siempre humano, nunca inferido.
export const identidadDecision = sqliteTable('identidad_decision', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  a: text('a').notNull(),
  b: text('b').notNull(),
  veredicto: text('veredicto').notNull(), // 'mismo' | 'distinto' | 'satelite_de'
  decididoPor: text('decidido_por').notNull(),
  nota: text('nota'),
  createdAt: text('created_at'),
});

export const syncCambios = sqliteTable('sync_cambios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha'),
  corrida: text('corrida'),
  fuente: text('fuente'),
  entidad: text('entidad'),
  idRegistro: text('id_registro'),
  accion: text('accion'),
  detalle: text('detalle'),
});

// V3.1 + V3.1b: credenciales de conectores externos. Granola es PERSONAL (cada
// usuario conecta su propia cuenta grabadora): una fila por (proveedor, idUsuario).
// Notion es GLOBAL (un solo CRM para todos, solo admin lo edita): idUsuario NULL.
// credencialCiphertext nunca guarda texto plano (V3.2 cifra antes de escribir).
export const conector = sqliteTable('conector', {
  idConector: integer('id_conector').primaryKey({ autoIncrement: true }),
  proveedor: text('proveedor').notNull(),
  idUsuario: text('id_usuario'),
  // Nullable = global (igual que idUsuario). Con valor = credencial propia de esa
  // organización (ej. el Notion de una organización nueva, distinto al de Onepay).
  // Sin UI todavía (Parte 2): el esquema queda listo, ver spec.
  idOrganizacion: integer('id_organizacion'),
  credencialCiphertext: text('credencial_ciphertext'),
  estado: text('estado').notNull().default('sin_credencial'),
  ultimaCorrida: text('ultima_corrida'),
  ultimoResultado: text('ultimo_resultado'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// Rediseño conectores: política a nivel workspace (qué conectores están habilitados y
// en qué modo). SEPARADA de `conector` (que guarda los secretos): esta tabla la controla
// el admin y la puede leer todo el mundo; nunca guarda credenciales. modo = 'personal'
// (cada quien su credencial) | 'admin' (una global para el equipo). habilitado=0 = dormido
// (quitado por el admin) sin borrar sus credenciales, para poder re-agregar sin perder nada.
export const conectorConfig = sqliteTable('conector_config', {
  proveedor: text('proveedor').primaryKey(),
  idOrganizacion: integer('id_organizacion'),
  modo: text('modo').notNull(),
  habilitado: integer('habilitado').notNull().default(1),
  agregadoPor: text('agregado_por'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// Config de negocio editable por admin desde /conectores, sin pasar por SSH/.env del
// VPS (2026-07-14, pedido de Sebastian tras revisar donde vivian los secretos de
// produccion). Clave-valor deliberado en vez de columnas propias: valores como el
// buzon de envio de Apollo no son secretos (no se cifran, a diferencia de `conector`)
// y una tabla generica evita una migracion nueva cada vez que se agregue un ajuste
// mas de este mismo tipo.
export const configuracionAdmin = sqliteTable('configuracion_admin', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
  actualizadoPor: text('actualizado_por'),
  updatedAt: text('updated_at'),
});

// V3.1: patron outbox. Se escribe en la MISMA transaccion que el cambio real; el
// worker (V3.5/V3.7) drena hacia Notion con reintentos, nunca la app llama a Notion
// directo.
export const outbox = sqliteTable('outbox', {
  idOutbox: integer('id_outbox').primaryKey({ autoIncrement: true }),
  entidad: text('entidad').notNull(),
  idRegistro: text('id_registro').notNull(),
  payload: text('payload').notNull(),
  estado: text('estado').notNull().default('aprobado'),
  intentos: integer('intentos').notNull().default(0),
  proximoIntento: text('proximo_intento'),
  createdAt: text('created_at'),
});

// ---------------------------------------------------------------------------
// Fase 4 (V4.1): modelo de cadencias. Grupos 1 y 2 del Anexo. Tablas nuevas que
// cuelgan de las maestras (empresa, contacto), sin tocarlas. "fk" logica, sin
// REFERENCES fisicas (mismo estilo que empresa_alias/contacto en esta base).

// Grupo 1 · la cadencia como template.
export const cadencia = sqliteTable('cadencia', {
  idCadencia: integer('id_cadencia').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  activa: integer('activa').notNull().default(1),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

export const pasoCadencia = sqliteTable('paso_cadencia', {
  idPaso: integer('id_paso').primaryKey({ autoIncrement: true }),
  idCadencia: integer('id_cadencia').notNull(),
  orden: integer('orden').notNull(),
  // dia_offset: dia RELATIVO del playbook (0,1,4,7...), no fecha absoluta. El motor
  // de fechas (V4.6) lo convierte a fecha real segun dias bloqueados y corrimiento.
  diaOffset: integer('dia_offset').notNull(),
  canal: text('canal').notNull(),
  objetivo: text('objetivo'),
  // esManual (V5.6): FLAG del paso, no una rama de codigo. Un paso manual nunca lo
  // dispara el push automatico (V5.4); espera revision humana (aprobarPasoManual).
  esManual: integer('es_manual').notNull().default(0),
  // proveedorStepId (sesion 2026-07-08): el id de emailer_step que Apollo devuelve
  // al subir este paso (sincronizarCopy). Nace null; sin el, resincronizar crearia
  // un step duplicado en vez de actualizar el existente.
  proveedorStepId: text('proveedor_step_id'),
  createdAt: text('created_at'),
});

// version_paso: el A/B cuelga del paso, no es template suelto. Iterar copy = nueva
// version (peso reparte el trafico en el motor en seco), nunca editar la enviada.
export const versionPaso = sqliteTable('version_paso', {
  idVersion: integer('id_version').primaryKey({ autoIncrement: true }),
  idPaso: integer('id_paso').notNull(),
  nombre: text('nombre'),
  asunto: text('asunto'),
  cuerpo: text('cuerpo'),
  esDefault: integer('es_default').notNull().default(0),
  activa: integer('activa').notNull().default(1),
  peso: integer('peso').notNull().default(1),
  // Parte 3 campanas: firmaApollo es el flag "incluir firma" que puso el parser
  // (directiva [[firma]] en el markdown, ver cadencia-parser.ts). variables es el
  // JSON de los nombres [entre-corchetes] detectados en asunto/cuerpo, para que la
  // UI del toque sepa que personalizar sin volver a parsear texto.
  firmaApollo: integer('firma_apollo').notNull().default(0),
  variables: text('variables'),
  // proveedorTemplateId (sesion 2026-07-08): el id de emailer_template que Apollo
  // devuelve al subir esta version (sincronizarCopy). Mismo motivo que
  // pasoCadencia.proveedorStepId: sin el, editar y resubir crearia un template nuevo
  // en vez de hacer PUT sobre el existente.
  proveedorTemplateId: text('proveedor_template_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// Grupo 2 · campana e inscripcion.
export const segmento = sqliteTable('segmento', {
  idSegmento: integer('id_segmento').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  // definicion: el filtro compilado a JSON (tier/estado/on-hold/categoria). El
  // lenguaje natural (descripcion_natural) llega en Fase 6, aqui solo se guarda.
  definicion: text('definicion').notNull(),
  descripcionNatural: text('descripcion_natural'),
  idOrganizacion: integer('id_organizacion').notNull(),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// Parte 2 campanas: revision de leads de un segmento ANTES de crear la campana (la
// campana ni existe todavia en este punto del flujo). Excluir es "esta no va, a
// priori": UNIQUE(id_segmento, id_empresa) hace que excluir/incluir sea un toggle
// idempotente (insert / delete de la misma fila), no un historial que crece.
export const segmentoExclusion = sqliteTable('segmento_exclusion', {
  idExclusion: integer('id_exclusion').primaryKey({ autoIncrement: true }),
  idSegmento: integer('id_segmento').notNull(),
  idEmpresa: text('id_empresa').notNull(),
  createdAt: text('created_at'),
});

// proveedorCampanaId (V5.2): id de la secuencia en Apollo (emailer_campaign_id),
// distinto del idCampana interno. Nace null; el EnvioAdapter la crea (crearCampanaExterna)
// la primera vez que la campana necesita enviar.
export const campana = sqliteTable('campana', {
  idCampana: integer('id_campana').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  idCadencia: integer('id_cadencia').notNull(),
  idSegmento: integer('id_segmento').notNull(),
  estado: text('estado').notNull().default('borrador'),
  // Parte 4 campanas: 'prioritaria' = toque uno a uno, revisar/personalizar cada
  // envio antes de mandarlo. 'batch' = el copy default sale tal cual a todo el
  // grupo del dia (tiers bajos, sin personalizacion); igual se puede editar antes
  // de confirmar, pero por defecto no pide revisar lead por lead.
  modo: text('modo').notNull().default('prioritaria'),
  // Parte 5 campanas: que hacer con un paso cuyo canal la empresa no tiene
  // (reemplazar/saltar/cola). Ver REGLAS_FALTANTE en validation.ts.
  reglaFaltante: text('regla_faltante').notNull().default('cola'),
  // intake_diario: cuantas cuentas nuevas arrancan la cadencia por dia (goteo). null =
  // todas el dia 1. Lo usa el preview dia a dia (Fase E) y el arranque real.
  intakeDiario: integer('intake_diario'),
  // Fase 8 (Lanzar): ritmoIngreso rige que dias del calendario cuentan como "dia activo"
  // de goteo (ver RITMOS_INGRESO en validation.ts); topeToquesDia es el control REAL por
  // campana (editable en el wizard, no un agregado). fechaInicio null = arranca hoy.
  ritmoIngreso: text('ritmo_ingreso').notNull().default('diario'),
  topeToquesDia: integer('tope_toques_dia'),
  fechaInicio: text('fecha_inicio'),
  owner: text('owner'),
  idOrganizacion: integer('id_organizacion').notNull(),
  proveedorCampanaId: text('proveedor_campana_id'),
  // Gmail Etapa 2 (2026-07-15): compuerta de aprobacion para correo por Gmail. Se
  // marca automaticamente en lanzarCampanaAction cuando el dueno resuelve a Gmail
  // (el click de "Lanzar hoy" ES la aprobacion explicita, misma convencion real que
  // ya usa Apollo -- ver nota del plan). pasoInscripcionesPendientes la usa como gate
  // defensivo: sin esto en 1, ningun paso de correo de una campana Gmail sale.
  aprobadaEnvioGmail: integer('aprobada_envio_gmail').notNull().default(0),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// inscripcion (nivel EMPRESA): la regla "una activa por empresa" la garantiza el
// indice unico parcial ux_inscripcion_activa (WHERE estado='activa'), creado en la
// migracion. Una inscripcion 'bloqueada' (sin email, cola de revision) NO cuenta
// contra ese limite: el WHERE la deja fuera del indice.
export const inscripcion = sqliteTable('inscripcion', {
  idInscripcion: integer('id_inscripcion').primaryKey({ autoIncrement: true }),
  idCampana: integer('id_campana').notNull(),
  idEmpresa: text('id_empresa').notNull(),
  estado: text('estado').notNull().default('activa'),
  pasoActual: integer('paso_actual'),
  fechaInscripcion: text('fecha_inscripcion'),
  fechaFin: text('fecha_fin'),
  // motivo_fin es PROSA para la bitacora humana ("respuesta detectada (whatsapp)").
  // origen_fin es el DATO del que depende el comportamiento: quien puede volver a la
  // cadencia y quien no. Antes el unico discriminador era el texto de motivo_fin, y
  // comparar strings en prosa para decidir es exactamente lo que la constitucion
  // prohibe (canal y transcript_proveedor son datos, no codigo).
  //
  // NULL = la inscripcion sigue viva (no tiene fin), O se pauso antes de esta columna.
  // Ninguno de los dos es reversible: al viejo no sabemos por que lo pausaron, y
  // ofrecer la reversa sobre uno que se corto por respuesta es el error que esto
  // existe para evitar. Ver core/reinscripcion.ts.
  motivoFin: text('motivo_fin'),
  origenFin: text('origen_fin'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// destinatario (nivel CONTACTO, 1+ por inscripcion). Una respuesta de cualquier
// destinatario pausa la inscripcion de la empresa entera (Fase 5).
export const destinatario = sqliteTable('destinatario', {
  idDestinatario: integer('id_destinatario').primaryKey({ autoIncrement: true }),
  idInscripcion: integer('id_inscripcion').notNull(),
  idContacto: integer('id_contacto').notNull(),
  estado: text('estado').notNull().default('activo'),
  createdAt: text('created_at'),
});

// paso_inscripcion (el motor / "toques de hoy"): un envio por destinatario y paso
// (indice unico id_destinatario+id_paso, B6). idToque enlaza al toque materializado
// cuando se ejecuta; proveedorMensajeId es el id de Apollo para cruzar tracking.
export const pasoInscripcion = sqliteTable('paso_inscripcion', {
  idPasoInscripcion: integer('id_paso_inscripcion').primaryKey({ autoIncrement: true }),
  idDestinatario: integer('id_destinatario').notNull(),
  idPaso: integer('id_paso').notNull(),
  idVersion: integer('id_version').notNull(),
  idToque: integer('id_toque'),
  canal: text('canal').notNull(),
  proveedor: text('proveedor'),
  proveedorMensajeId: text('proveedor_mensaje_id'),
  estado: text('estado').notNull().default('pendiente'),
  fechaProgramada: text('fecha_programada'),
  fechaEnviada: text('fecha_enviada'),
  // Backoff (V5.4, mismo patron que outbox): intentos cuenta cuantas veces se
  // intento; proximoIntento es desde cuando vale la pena reintentar (null = ya).
  intentos: integer('intentos').notNull().default(0),
  proximoIntento: text('proximo_intento'),
  createdAt: text('created_at'),
});

// evento_tracking (append-only, la unica que crece). Idempotente por
// proveedorEventoId (indice unico, V5.5): el mismo evento de Apollo nunca se duplica.
export const eventoTracking = sqliteTable('evento_tracking', {
  idEvento: integer('id_evento').primaryKey({ autoIncrement: true }),
  idPasoInscripcion: integer('id_paso_inscripcion').notNull(),
  tipo: text('tipo').notNull(),
  canal: text('canal').notNull(),
  proveedorEventoId: text('proveedor_evento_id').notNull(),
  detalle: text('detalle'),
  fechaEvento: text('fecha_evento'),
  createdAt: text('created_at'),
});

// notificacion_respuesta (append-only, V6.1): una fila por CADA respuesta detectada,
// sin importar el canal (correo via Apollo tracking, whatsapp via webhook Evolution).
// vistaEn null = todavia no se abrio la ficha de esa empresa desde que llego. Alimenta
// el destaque "Respondio" de /cola y /seguimiento -- ver core/tracking.ts y
// core/llego-respuesta.ts (el unico punto de notificacion, en los dos lugares donde
// ya se pausa la inscripcion por respuesta).
export const notificacionRespuesta = sqliteTable('notificacion_respuesta', {
  idNotificacion: integer('id_notificacion').primaryKey({ autoIncrement: true }),
  idInscripcion: integer('id_inscripcion').notNull(),
  idEmpresa: text('id_empresa').notNull(),
  canal: text('canal').notNull(),
  detectadaEn: text('detectada_en').notNull(),
  vistaEn: text('vista_en'),
  createdAt: text('created_at'),
});

export const organizacion = sqliteTable('organizacion', {
  idOrganizacion: integer('id_organizacion').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  createdAt: text('created_at'),
});

export const organizacionMiembro = sqliteTable('organizacion_miembro', {
  idMiembro: integer('id_miembro').primaryKey({ autoIncrement: true }),
  idOrganizacion: integer('id_organizacion').notNull(),
  // Valor EXACTO de empresa.owner en isps.db (incluye mayusculas/minusculas reales, ej.
  // "Camilo fonseca"). No es el nombre bonito: es la llave con la que se filtra la cola.
  ownerCanonico: text('owner_canonico').notNull(),
  nombreDisplay: text('nombre_display').notNull(),
  idUser: text('id_user'),
  createdAt: text('created_at'),
});

// Perfil Fase 2 (ver docs/superpowers/specs/2026-07-08-perfil-abstraccion-design.md):
// una fila por usuario, columnas nullable. Sin fila = usa PREFERENCIAS_DEFAULT
// (app/core/perfil.ts); el adapter (app/adapters/preferencias-db.ts) es quien aplica
// ese fallback, nunca el core. No sync a Notion: son ajustes locales del usuario.
export const preferenciaUsuario = sqliteTable('preferencia_usuario', {
  idUser: text('id_user').primaryKey(),
  colorAvatar: text('color_avatar'),
  vistaInicio: text('vista_inicio'),
  // cargo/telefono: contacto editable en /perfil (referencia visual: mockup "Nodalis
  // Cockpit"). No son "preferencias" en sentido estricto pero comparten fila/ciclo de
  // vida con el resto (una fila por usuario, ajuste local, sin sync a Notion).
  cargo: text('cargo'),
  telefono: text('telefono'),
  updatedAt: text('updated_at'),
});

// Panel cockpit + constructor (Tarea 5 del plan): una fila por usuario, layout en JSON
// ([{ widgetId, span }, ...]) serializado/validado por app/core/panel/tablero.ts. Mismo
// patron que preferencia_usuario (upsert por id_user, sin sync a Notion).
export const panelTablero = sqliteTable('panel_tablero', {
  idUser: text('id_user').primaryKey(),
  layout: text('layout'),
  updatedAt: text('updated_at'),
});

// Fase 8 (WhatsApp adaptador): lineas WhatsApp activas (núcleo de identidad para
// envios de lotes). Una linea por instancia Evolution API (u otro proveedor). techo_diario
// es el limite local de esta linea; el motor de cadencias (V8.2) respeta el limite
// global de la empresa + el de cada linea individual.
//
// idUsuario (sesion 2026-07-09, "cada quien su propio WhatsApp"): nullable a proposito
// -- NULL es una linea de POOL (compartida, la administra el admin, sin dueño);
// no-null es la linea PERSONAL de ESE usuario (cada quien conecta y aparea la suya,
// misma idea que Granola pero para una fila de linea, no para un conector completo).
// No se agrega antes de la primera aplicacion de la migracion (tabla nueva, sin datos
// todavia) para no necesitar un ALTER TABLE despues.
export const lineaWhatsapp = sqliteTable('linea_whatsapp', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numero: text('numero').notNull(),
  tipo: text('tipo').notNull(),
  idUsuario: text('id_usuario'),
  referenciaProveedor: text('referencia_proveedor'),
  estado: text('estado').notNull().default('calentando'),
  techoDiario: integer('techo_diario').notNull().default(25),
  fechaCreacion: text('fecha_creacion'),
});

// Respuestas entrantes de WhatsApp (tarea 6, plan-whatsapp-adapter.md). Dos usos en una
// tabla: (1) idempotencia -- mensajeId es el key.id de Evolution, UNIQUE, para que un
// reintento del webhook no procese dos veces el mismo mensaje (molde: evento_tracking); y
// (2) auditoria del inbound crudo (telefono, texto, a que contacto matcheo). NO es el
// historial completo de la conversacion: eso vive en el Postgres de Evolution (patron
// Granola, resumen operativo aca). idContacto es nullable: un numero desconocido que
// escribe igual se registra, aunque no matchee ningun contacto.
export const mensajeWhatsapp = sqliteTable('mensaje_whatsapp', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mensajeId: text('mensaje_id').notNull().unique(),
  referenciaProveedor: text('referencia_proveedor'),
  telefono: text('telefono'),
  texto: text('texto'),
  idContacto: integer('id_contacto'),
  fecha: text('fecha'),
  createdAt: text('created_at'),
});

// Histórico de transiciones de etapa comercial (estado_notion). Una fila por cambio.
// No existia: se crea para poder derivar "dias en etapa" y el timeline del drawer.
// Se llena hacia adelante (actualizarEstadoNotion); el pasado pre-deploy es desconocido.
export const empresaEstadoHistorial = sqliteTable('empresa_estado_historial', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  estadoAnterior: text('estado_anterior'), // null si es el primer registro
  estadoNuevo: text('estado_nuevo').notNull(),
  fecha: text('fecha').notNull(), // ISO, cuando ocurrio la transicion
  // De donde salio esta fila, uno de ORIGENES_TRANSICION (app/db/validation.ts): toque |
  // perdida | manual | reconciliacion | backfill (2026-07-25). Sin esta columna, separar una
  // transicion real de un backfill se hacia agrupando por timestamp identico -- de las 63
  // filas, 57 caen en ocho lotes con la misma marca de tiempo al milisegundo y solo 5 se
  // escribieron una a una. Esa heuristica funciona hasta que dos transiciones reales caen en el
  // mismo segundo. Con la columna, el ciclo de venta excluye el ruido en el WHERE en vez de en
  // la interpretacion.
  // NULL = las 63 filas viejas y cualquier caller que no lo diga. No se infiere hacia atras.
  origen: text('origen'),
  idOrganizacion: integer('id_organizacion').notNull().default(1),
});

// Foto diaria de la etapa de cada empresa (2026-07-25). Una fila por empresa por dia. De aca
// salen las transiciones del tramo que se mueve a mano en Notion (cierre_documentacion ->
// firma_pago), que hasta hoy quedaban fechadas el dia en que corrio el barrido y no el dia en
// que pasaron: "cuanto tarda del cierre al pago" era incontestable.
//
// Por que una foto y no la fecha de Notion: last_edited_time es de la PAGINA entera, asi que se
// mueve cuando alguien corrige un telefono o una nota. Fechar transiciones con eso inventa
// movimiento comercial cada vez que alguien arregla una coma. La foto no depende de ningun
// proveedor: comparar la de ayer con la de hoy dice que cambio, y si el barrido se cae dos dias
// la foto del tercero igual lo detecta, con un error acotado y conocido en vez de una fecha
// inventada.
//
// Lo que esta tecnica NO hace, y no se disimula:
//   - dos cambios de etapa el mismo dia colapsan en uno (se ve el neto, no el camino).
//   - no recupera nada del pasado: empieza a producir dato el dia que corre por primera vez.
//   - la resolucion es de un dia. Nadie pregunta cuantas HORAS tardo del cierre al pago.
//
// Se corre ANTES del barrido de /dia-sales, para que la foto sea del estado con el que arranco
// el dia. Volver a correrla el mismo dia no pisa la foto (INSERT ... DO NOTHING): la primera
// del dia es la buena.
//
// Costo: ~2.000 filas por dia de texto corto.
export const empresaEstadoSnapshot = sqliteTable(
  'empresa_estado_snapshot',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    idEmpresa: text('id_empresa').notNull(),
    // La etapa tal cual estaba. NULL es un valor legitimo: la empresa existe y no esta en el
    // embudo. Una cuenta que pasa de null a lead ES una transicion.
    estado: text('estado'),
    fechaSnapshot: text('fecha_snapshot').notNull(), // ISO YYYY-MM-DD
    idOrganizacion: integer('id_organizacion').notNull(),
    createdAt: text('created_at'),
  },
  (t) => [
    // Una foto por empresa por dia. Es lo que hace idempotente volver a correr el snapshot.
    uniqueIndex('idx_snapshot_empresa_fecha').on(t.idEmpresa, t.fechaSnapshot, t.idOrganizacion),
    index('idx_snapshot_fecha').on(t.fechaSnapshot, t.idOrganizacion),
  ],
);

// Bitacora de campo a nivel de BASE, no de aplicacion (2026-07-25). Una fila por columna que
// cambio de valor, con el antes y el despues. La escribe un TRIGGER de SQLite
// (empresa_auditoria_campo, migracion 0015), nunca el codigo TypeScript: por eso esta tabla se
// mapea aqui SOLO para poder leerla.
//
// Por que en la base y no en el Repository: la instrumentacion a nivel de aplicacion ya fallo.
// Global IP (901174053) paso a on_hold y su historial en empresa_estado_historial tiene una
// sola linea, del 15-jul a cierre_documentacion; el cambio se escribio por fuera de
// actualizarEstadoNotion y para efectos de medicion la transicion no existe. Un log que solo
// corre cuando el cambio pasa por el camino instrumentado tiene exactamente ese punto ciego.
// El trigger dispara en CUALQUIER UPDATE: MCP, script, migracion, docker exec o alguien
// conectado directo al archivo.
//
// Generica a proposito (columna `tabla`): cubrir contacto o toque despues es un trigger nuevo
// apuntando aqui, no una tabla nueva.
//
// Lo que esta bitacora NO sabe, y no se disimula:
//   - QUIEN hizo el cambio. SQLite no le pasa al trigger nada del proceso que escribio. Ningun
//     campo de actor se inventa; correlacionar con toque/sync_cambios por timestamp es lo que
//     hay.
//   - POR QUE. Lo mismo: el trigger ve valores, no intencion.
//   - INSERT y DELETE. Es AFTER UPDATE. Crear o borrar una empresa no deja fila aca.
//   - El pasado. Empieza a producir dato el dia que se aplica; no hay backfill posible.
export const auditoriaCampo = sqliteTable(
  'auditoria_campo',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Constante 'empresa' hoy. Existe para que un trigger sobre otra tabla escriba aqui.
    tabla: text('tabla').notNull(),
    // La PK del registro, como texto. En empresa es id_empresa (que tambien es auditable:
    // reasignar_nit cambia la PK, y ahi id_registro guarda el valor NUEVO).
    idRegistro: text('id_registro').notNull(),
    campo: text('campo').notNull(),
    // Sin tipar: SQLite convierte a texto por afinidad, asi que es_cliente=0 llega como '0' y
    // pct_digital=0.4 como '0.4'. NULL en valor_anterior es un valor real (el campo estaba
    // vacio), no un dato faltante.
    valorAnterior: text('valor_anterior'),
    valorNuevo: text('valor_nuevo'),
    // ISO UTC con milisegundos, no el datetime('now') a segundos que usan los triggers viejos.
    // Dos campos de la misma fila cambian en el mismo UPDATE: con resolucion de segundo no se
    // distingue un lote de una escritura de dos escrituras seguidas.
    // El DEFAULT vive en el DDL a proposito: el trigger no lo nombra, asi que cualquier trigger
    // futuro que escriba aqui hereda el mismo formato sin poder equivocarse.
    cambiadoEn: text('cambiado_en')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    // Copia de empresa.organizacion_activa_id al momento del cambio. Nullable porque una tabla
    // futura puede no tenerla.
    idOrganizacion: integer('id_organizacion'),
  },
  (t) => [
    // "Que le paso a esta cuenta": el acceso normal.
    index('idx_auditoria_registro').on(t.tabla, t.idRegistro, t.cambiadoEn),
    // "Todas las transiciones de estado_notion desde X": el acceso de medicion, el que hoy no
    // se puede responder.
    index('idx_auditoria_campo_fecha').on(t.tabla, t.campo, t.cambiadoEn),
  ],
);

// Seguimiento que estaba programado y NO se ejecuto: se corrio a otra fecha. Una fila por
// aplazo, append-only (nunca se actualiza ni se borra: cada corrimiento es un evento nuevo).
//
// Existe porque cambiarCadencia PISA empresa.proximo_follow_up_fecha, asi que la fecha
// incumplida se pierde y no se puede responder cuantas veces se corrio una cuenta. La tool
// registraba lo que se hizo y nada de lo que no se hizo.
//
// Solo eventos crudos: no hay contador de rachas ni "veces aplazada" en la base. Quien lee
// cuenta las filas; una columna derivada se desincroniza sola (mismo criterio que los
// marcadores del embudo y que empresa_estado_historial).
export const seguimientoAplazado = sqliteTable('seguimiento_aplazado', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  // La fecha que estaba programada y se incumplio (el valor que tenia
  // empresa.proximo_follow_up_fecha antes del aplazo). Sin ella no hay evento: si la empresa
  // no tenia follow-up programado, aplazarSeguimiento falla en vez de inventarla.
  fechaIncumplida: text('fecha_incumplida').notNull(),
  fechaNueva: text('fecha_nueva').notNull(),
  // Motivo ACOTADO, uno de MOTIVOS_APLAZO (app/db/validation.ts): plan_irreal |
  // dia_atravesado | tiempo_no_usado | cuenta_evitada. Se guarda como texto y lo enforza
  // Zod, mismo patron que canal/resultado en `toque` (un CHECK en SQLite no se puede
  // ampliar despues sin recrear la tabla, ver docs/playbook-migraciones.md).
  // NULL = no lo dijo. No se infiere.
  motivo: text('motivo'),
  // El detalle en prosa, aparte del motivo y opcional. Es contexto para un humano; no se
  // agrupa ni se cuenta por aca.
  nota: text('nota'),
  // Mismo criterio que toque.ejecutado_por: NULL = no atribuido, nunca se asume el owner.
  aplazadoPor: text('aplazado_por'),
  idOrganizacion: integer('id_organizacion').notNull(),
  createdAt: text('created_at'),
});

// Fase 2 reconciliacion Notion (T7): clasificacion "el no gana" -- una empresa sale
// del balde 'isp' si CUALQUIER flag aqui esta en 1 (DB o Notion, union nunca resta).
// Una fila por empresa (PK = id_empresa). La vista empresa_categoria (ya existe en
// isps.db, no se toca aca) lee esta tabla y decide la categoria final. `fuente`
// registra quien escribio por ultima vez (no es un flag de veto en si mismo).
export const empresaClasificacion = sqliteTable('empresa_clasificacion', {
  idEmpresa: text('id_empresa').primaryKey(),
  esCarrier: integer('es_carrier').notNull().default(0),
  esCorporativoGrande: integer('es_corporativo_grande').notNull().default(0),
  esUtilityNoIsp: integer('es_utility_no_isp').notNull().default(0),
  esExtranjero: integer('es_extranjero').notNull().default(0),
  esNoIspConfirmado: integer('es_no_isp_confirmado').notNull().default(0),
  alianzaSaePlus: integer('alianza_sae_plus').notNull().default(0),
  motivo: text('motivo'),
  fuente: text('fuente'),
  actualizadoEn: text('actualizado_en').notNull(),
  actualizadoPor: text('actualizado_por'),
});

// Fase 2 reconciliacion Notion (T8): vista SQL YA existente en isps.db (no se crea
// migracion para esto, .existing() le dice a drizzle-kit que no la incluya en un
// futuro `generate`). Deriva la categoria real desde empresa_clasificacion via CASE;
// la app lee categoria de aca, nunca de la columna plana empresa.categoria (stale,
// solo ~8% de las filas se clasifico ahi alguna vez).
export const empresaCategoriaView = sqliteView('empresa_categoria', {
  idEmpresa: text('id_empresa').primaryKey(),
  nombreOficial: text('nombre_oficial'),
  categoria: text('categoria'),
  atacable: integer('atacable'),
}).existing();
