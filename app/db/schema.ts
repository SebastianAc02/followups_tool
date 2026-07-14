import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Refleja las tablas que YA existen en isps.db (no se crean aquí). Solo las que usa el cockpit.

export const empresa = sqliteTable('empresa', {
  idEmpresa: text('id_empresa').primaryKey(),
  tipoId: text('tipo_id').notNull(),
  nombreOficial: text('nombre_oficial').notNull(),
  nombreNormalizado: text('nombre_normalizado').notNull(),
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
  owner: text('owner'),
  proximoFollowUpFecha: text('proximo_follow_up_fecha'),
  proximoPaso: text('proximo_paso'),
  proximoCanal: text('proximo_canal'),
  // Bucle PBX (enriquecimiento del decisor): la forma actual (vocabulario de
  // FormaPaso en app/core/pbx.ts), null cuando la empresa no esta en el bucle. Los
  // intentos NO se persisten aqui, se cuentan desde `toque`.
  pbxForma: text('pbx_forma'),
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
  notas: text('notas'),
  esPrincipal: integer('es_principal').notNull().default(0),
  fuente: text('fuente').notNull(),
});

export const empresaUsuarios = sqliteTable('empresa_usuarios', {
  idEmpresa: text('id_empresa').primaryKey(),
  usuariosEstimados: real('usuarios_estimados'),
  usuariosEfectivos: real('usuarios_efectivos'),
});

export const toque = sqliteTable('toque', {
  idToque: integer('id_toque').primaryKey({ autoIncrement: true }),
  idEmpresa: text('id_empresa').notNull(),
  idContacto: integer('id_contacto'),
  fecha: text('fecha'),
  canal: text('canal'),
  resultado: text('resultado'),
  quePaso: text('que_paso'),
  proximoPaso: text('proximo_paso'),
  proximoFollowUpFecha: text('proximo_follow_up_fecha'),
  transcriptProveedor: text('transcript_proveedor'),
  transcriptId: text('transcript_id'),
  transcriptUrl: text('transcript_url'),
  razonPerdida: text('razon_perdida'),
  objecion: text('objecion'),
  fuente: text('fuente').notNull(),
  // Multi-organización (Parte 1): de qué organización es este toque. A diferencia de
  // empresa.organizacionActivaId (mutable, "quién tiene la relación ahora"), este campo
  // es inmutable: el toque queda para siempre de la organización que lo registró.
  idOrganizacion: integer('id_organizacion').notNull(),
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
  motivoFin: text('motivo_fin'),
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
  idOrganizacion: integer('id_organizacion').notNull().default(1),
});
