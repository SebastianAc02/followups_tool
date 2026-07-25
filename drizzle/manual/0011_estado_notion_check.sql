-- 0011: ampliar el CHECK de empresa.estado_notion de 8 a 10 valores.
-- Agrega 'firma_pendiente' y 'contrato_firmado', las dos etapas de cierre que Notion
-- tiene y la base rechazaba. Hasta hoy mapeoEstados.ts las colapsaba a
-- 'cierre_documentacion' (ver app/core/reconciliacion/mapeoEstados.ts:34-35), lo que
-- perdia las dos etapas donde se gana la plata.
--
-- ESTE ARCHIVO NO ES UNA MIGRACION DE DRIZZLE Y NO DEBE SERLO.
-- Vive fuera de drizzle/meta/_journal.json a proposito, asi que `npm run migrate` lo
-- ignora. La razon esta medida contra una copia de la base real, no supuesta:
--   1. El migrator de drizzle envuelve TODOS los statements en BEGIN/COMMIT
--      (node_modules/drizzle-orm/sqlite-core/dialect.cjs:676 -> session.run(sql`BEGIN`)).
--   2. `PRAGMA foreign_keys` es no-op dentro de una transaccion. Medido: sigue en 1.
--   3. better-sqlite3 abre con foreign_keys = 1 por defecto, y app/db/index.ts nunca lo
--      apaga (solo setea journal_mode = WAL).
-- Resultado medido de correr el DROP TABLE por esa via: revienta con
-- SQLITE_CONSTRAINT_FOREIGNKEY y drizzle hace ROLLBACK. No se pierde una fila, pero la
-- migracion no aplica y el deploy se cae: .github/workflows/deploy.yml corre
-- `npm run migrate` ANTES de recrear los contenedores.
--
-- El error viene de que `cliente` y `prospeccion` apuntan a empresa con ON DELETE NO
-- ACTION. Eso frena el borrado, pero es un accidente del esquema, no una red de
-- seguridad: las otras 14 hijas (toque, contacto, empresa_alias, acceso_historico,
-- empresa_web, empresa_gmaps, empresa_crm, empresa_clasificacion, empresa_mintic,
-- empresa_usuarios, empresa_telefono, empresa_email, empresa_municipio) estan en
-- ON DELETE CASCADE. El dia que alguien afloje esas dos FK, el mismo DROP se lleva
-- ~48.000 filas y commitea sin ruido.
--
-- COMO SE CORRE (y solo asi): con las FK apagadas y FUERA de toda transaccion previa.
--   sqlite3 /ruta/isps.db < drizzle/manual/0011_estado_notion_check.sql
-- Backup antes. Verificar el foreign_key_check del final: tiene que salir con las 20
-- huerfanas que ya trae la base (11 empresa_alias, 8 empresa_usuarios, 1 empresa_email)
-- y ninguna mas. Si aparecen otras, restaurar backup.

PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

BEGIN;

-- Las 3 vistas leen empresa. Se caen primero porque el RENAME de mas abajo reparsea el
-- esquema y revienta con "no such table: main.empresa" si quedan colgando.
DROP VIEW IF EXISTS empresa_resumen;
DROP VIEW IF EXISTS empresa_pipeline;
DROP VIEW IF EXISTS empresa_categoria;

-- Copia exacta del DDL fisico vigente: mismo orden de columnas, mismos CHECK, mismos
-- DEFAULT, misma FK reflexiva. Lo unico que cambia es la lista de estado_notion.
-- Incluye las 11 columnas de 0010_crm_portable_empresa.sql, que ya corrio.
CREATE TABLE empresa_nueva (
    id_empresa            TEXT PRIMARY KEY,
    tipo_id               TEXT NOT NULL CHECK (tipo_id IN ('nit','interno','metabase_uuid')),
    nombre_oficial        TEXT NOT NULL,
    nombre_normalizado    TEXT NOT NULL,
    metabase_uid          TEXT,
    opera_bajo_id         TEXT REFERENCES empresa(id_empresa) ON DELETE SET NULL,
    ciudad_principal      TEXT,
    departamento          TEXT,
    ubicacion_fuente      TEXT,
    es_cliente            INTEGER NOT NULL DEFAULT 0 CHECK (es_cliente IN (0,1)),
    en_conversacion       INTEGER NOT NULL DEFAULT 0 CHECK (en_conversacion IN (0,1)),
    crm_software          TEXT,
    estado_comercial      TEXT NOT NULL CHECK (estado_comercial IN
        ('cliente','negociacion','contactado','pausado','lead','descartado')),
    estado_notion         TEXT CHECK (estado_notion IS NULL OR estado_notion IN
        ('lead','contacto_iniciado','oportunidad','reunion_agendada',
         'cierre_documentacion','enviar_contrato','on_hold','firma_pago',
         'firma_pendiente','contrato_firmado')),
    score_outbound        REAL,
    prioridad_comercial   INTEGER,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    pasarela_actual       TEXT,
    categoria             TEXT,
    proximo_follow_up_fecha TEXT,
    proximo_paso          TEXT,
    owner                 TEXT,
    proximo_canal         TEXT,
    notion_page_id        TEXT,
    organizacion_activa_id INTEGER NOT NULL DEFAULT 1,
    pbx_forma             TEXT,
    nombre_legal          TEXT,
    id_empresa_matriz     TEXT,
    notas_discovery       TEXT,
    brief                 TEXT,
    id_plan               INTEGER,
    pct_digital           REAL,
    fuente_lead           TEXT,
    fecha_primer_contacto TEXT,
    fecha_ultimo_contacto TEXT,
    razon_perdida         TEXT,
    contactado            INTEGER,
    respondio             INTEGER,
    agendado              INTEGER,
    se_presento           INTEGER,
    califica              INTEGER,
    tier                  TEXT,
    tipo_empresa          TEXT
);

-- Columnas nombradas una por una a proposito: un SELECT * aqui se rompe en silencio el
-- dia que alguien agregue una columna en otro orden.
INSERT INTO empresa_nueva (
    id_empresa, tipo_id, nombre_oficial, nombre_normalizado, metabase_uid, opera_bajo_id,
    ciudad_principal, departamento, ubicacion_fuente, es_cliente, en_conversacion,
    crm_software, estado_comercial, estado_notion, score_outbound, prioridad_comercial,
    created_at, updated_at, pasarela_actual, categoria, proximo_follow_up_fecha,
    proximo_paso, owner, proximo_canal, notion_page_id, organizacion_activa_id, pbx_forma,
    nombre_legal, id_empresa_matriz, notas_discovery, brief, id_plan, pct_digital,
    fuente_lead, fecha_primer_contacto, fecha_ultimo_contacto, razon_perdida, contactado,
    respondio, agendado, se_presento, califica, tier, tipo_empresa
)
SELECT
    id_empresa, tipo_id, nombre_oficial, nombre_normalizado, metabase_uid, opera_bajo_id,
    ciudad_principal, departamento, ubicacion_fuente, es_cliente, en_conversacion,
    crm_software, estado_comercial, estado_notion, score_outbound, prioridad_comercial,
    created_at, updated_at, pasarela_actual, categoria, proximo_follow_up_fecha,
    proximo_paso, owner, proximo_canal, notion_page_id, organizacion_activa_id, pbx_forma,
    nombre_legal, id_empresa_matriz, notas_discovery, brief, id_plan, pct_digital,
    fuente_lead, fecha_primer_contacto, fecha_ultimo_contacto, razon_perdida, contactado,
    respondio, agendado, se_presento, califica, tier, tipo_empresa
FROM empresa;

DROP TABLE empresa;
ALTER TABLE empresa_nueva RENAME TO empresa;

-- Los 7 indices nombrados + el unique parcial. El sqlite_autoindex del PK lo recrea
-- SQLite solo.
CREATE INDEX idx_empresa_nombre_norm   ON empresa(nombre_normalizado);
CREATE INDEX idx_empresa_departamento  ON empresa(departamento);
CREATE INDEX idx_empresa_tipo_id       ON empresa(tipo_id);
CREATE INDEX idx_empresa_estado_com    ON empresa(estado_comercial);
CREATE INDEX idx_empresa_estado_notion ON empresa(estado_notion);
CREATE INDEX idx_empresa_score         ON empresa(score_outbound);
CREATE INDEX idx_empresa_cliente       ON empresa(es_cliente) WHERE es_cliente=1;
CREATE UNIQUE INDEX ux_empresa_notion_page_id ON empresa(notion_page_id) WHERE notion_page_id IS NOT NULL;

-- El trigger se fue con el DROP TABLE.
CREATE TRIGGER empresa_updated_at
AFTER UPDATE ON empresa
FOR EACH ROW
BEGIN
    UPDATE empresa SET updated_at = datetime('now')
    WHERE id_empresa = NEW.id_empresa AND OLD.updated_at = NEW.updated_at;
END;

-- Vistas, en orden de dependencia: empresa_resumen lee empresa_categoria.
CREATE VIEW empresa_categoria AS
        SELECT e.id_empresa, e.nombre_oficial,
            CASE
                WHEN c.alianza_sae_plus      = 1 THEN 'sae_plus'
                WHEN c.es_corporativo_grande = 1 THEN 'telco_grande'
                WHEN c.es_carrier            = 1 THEN 'carrier'
                WHEN c.es_utility_no_isp     = 1 THEN 'utility'
                WHEN c.es_extranjero         = 1 THEN 'extranjero'
                WHEN c.es_no_isp_confirmado  = 1 THEN 'no_isp'
                ELSE 'isp'
            END AS categoria,
            CASE
                WHEN c.id_empresa IS NULL THEN 1
                WHEN (c.alianza_sae_plus + c.es_corporativo_grande + c.es_carrier
                      + c.es_utility_no_isp + c.es_extranjero + c.es_no_isp_confirmado) = 0 THEN 1
                ELSE 0
            END AS atacable
        FROM empresa e
        LEFT JOIN empresa_clasificacion c ON c.id_empresa = e.id_empresa;

CREATE VIEW empresa_pipeline AS
        SELECT e.id_empresa, e.nombre_oficial,
               e.estado_comercial, e.estado_notion,
               (e.estado_notion IS NOT NULL) AS en_notion,
               e.score_outbound, e.prioridad_comercial,
               u.usuarios_efectivos
        FROM empresa e
        LEFT JOIN empresa_usuarios u ON u.id_empresa = e.id_empresa;

-- OJO: esta vista hace SELECT e.*, asi que pasa de 33 a 44 columnas. Nadie en app/ la
-- consume (solo existe en la base), pero cualquier lectura posicional de afuera se corre.
CREATE VIEW empresa_resumen AS
        SELECT e.*,
               u.usuarios_reales, u.usuarios_estimados, u.usuarios_efectivos,
               u.usuarios_reales_fuente, u.usuarios_est_fuente,
               m.accesos_ultimo, m.n_municipios_ultimo, m.antiguedad_anos,
               m.primer_periodo, m.ultimo_periodo_global, m.activo_ultimo_global,
               ec.categoria, ec.atacable
        FROM empresa e
        LEFT JOIN empresa_usuarios u ON u.id_empresa = e.id_empresa
        LEFT JOIN empresa_mintic m   ON m.id_empresa = e.id_empresa
        LEFT JOIN empresa_categoria ec ON ec.id_empresa = e.id_empresa;

COMMIT;

PRAGMA legacy_alter_table = OFF;
-- Tiene que salir vacio. Si imprime algo, la base quedo con FK rotas: restaurar backup.
PRAGMA foreign_key_check;
PRAGMA integrity_check;
PRAGMA foreign_keys = ON;
