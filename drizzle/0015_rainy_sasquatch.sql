CREATE TABLE `auditoria_campo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tabla` text NOT NULL,
	`id_registro` text NOT NULL,
	`campo` text NOT NULL,
	`valor_anterior` text,
	`valor_nuevo` text,
	`cambiado_en` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`id_organizacion` integer
);
--> statement-breakpoint
CREATE INDEX `idx_auditoria_registro` ON `auditoria_campo` (`tabla`,`id_registro`,`cambiado_en`);--> statement-breakpoint
CREATE INDEX `idx_auditoria_campo_fecha` ON `auditoria_campo` (`tabla`,`campo`,`cambiado_en`);
--> statement-breakpoint
-- Bitacora de campo a nivel de BASE. Una fila en `auditoria_campo` por cada columna de
-- `empresa` que cambio de valor, con el antes y el despues.
--
-- POR QUE UN TRIGGER Y NO CODIGO: la instrumentacion a nivel de aplicacion ya fallo. Global IP
-- (901174053) paso a on_hold y su historial en empresa_estado_historial tiene una sola linea,
-- del 15-jul a cierre_documentacion: el cambio se escribio sin pasar por actualizarEstadoNotion
-- y para efectos de medicion esa transicion no existe. Un log que solo corre cuando el cambio
-- pasa por el camino instrumentado tiene ese mismo punto ciego. El trigger dispara en cualquier
-- UPDATE, venga del MCP, de un script, de una migracion o de alguien conectado al archivo.
-- Dimension del hueco al 2026-07-25: 63 filas en empresa_estado_historial, 57 de ellas backfill
-- en ocho lotes de timestamp identico, y nada escrito despues del 21-jul.
--
-- POR QUE LAS 44 COLUMNAS Y NO LAS 7 QUE MUEVEN LA MEDICION: una columna fuera del trigger es
-- un punto ciego por la misma razon por la que lo era un camino de escritura fuera del log. No
-- se puede predecir cual se va a mover por fuera; predecirlo mal es justo lo que dejo a Global
-- IP sin rastro. Enumerarlas cuesta esta migracion una vez. La unica excluida es `updated_at`
-- (abajo).
--
-- POR QUE `updated_at` QUEDA FUERA, Y POR QUE ESO MATA LA RECURSION: sobre `empresa` ya hay un
-- trigger AFTER UPDATE, `empresa_updated_at`, que a su vez hace UPDATE sobre la misma tabla
-- para estampar la hora. Son dos redes distintas contra el ruido y contra el bucle:
--   1. `recursive_triggers` esta en 0 (default de SQLite, verificado en produccion 2026-07-25),
--      asi que el UPDATE interno de ese trigger no dispara ningun trigger, este incluido.
--   2. Aunque alguien prenda el pragma, ese UPDATE interno solo mueve `updated_at`, que no
--      tiene rama aca: las 44 comparaciones dan falso, el INSERT ... SELECT devuelve cero filas
--      y no hay nada que escribir ni bucle que seguir. `auditoria_campo` ademas no tiene
--      triggers propios, asi que la cadena termina ahi de todas formas.
-- Auditar `updated_at` habria hecho lo contrario: una fila de ruido por cada UPDATE de la base.
--
-- `IS NOT` y no `<>`: es la comparacion null-safe de SQLite. Con `<>`, pasar owner de NULL a
-- 'Sebastian' (el caso mas comun al asignar cartera) no registra nada, porque cualquier
-- comparacion contra NULL da NULL y el WHERE la descarta.
--
-- Un solo INSERT ... SELECT con UNION ALL y no 44 INSERT: agregar una columna despues es pegar
-- dos lineas, y el test de cobertura (app/db/auditoria-campo.test.ts) revienta si alguien agrega
-- una columna a `empresa` y se olvida de este trigger.
--
-- `cambiado_en` NO se nombra: lo pone el DEFAULT de la tabla, en ISO UTC con milisegundos.
CREATE TRIGGER `empresa_auditoria_campo`
AFTER UPDATE ON `empresa`
FOR EACH ROW
BEGIN
  INSERT INTO auditoria_campo (tabla, id_registro, campo, valor_anterior, valor_nuevo, id_organizacion)
  SELECT 'empresa', NEW.id_empresa, 'estado_notion', OLD.estado_notion, NEW.estado_notion, NEW.organizacion_activa_id
    WHERE OLD.estado_notion IS NOT NEW.estado_notion
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'estado_comercial', OLD.estado_comercial, NEW.estado_comercial, NEW.organizacion_activa_id
    WHERE OLD.estado_comercial IS NOT NEW.estado_comercial
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'owner', OLD.owner, NEW.owner, NEW.organizacion_activa_id
    WHERE OLD.owner IS NOT NEW.owner
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'es_cliente', OLD.es_cliente, NEW.es_cliente, NEW.organizacion_activa_id
    WHERE OLD.es_cliente IS NOT NEW.es_cliente
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'proximo_paso', OLD.proximo_paso, NEW.proximo_paso, NEW.organizacion_activa_id
    WHERE OLD.proximo_paso IS NOT NEW.proximo_paso
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'proximo_follow_up_fecha', OLD.proximo_follow_up_fecha, NEW.proximo_follow_up_fecha, NEW.organizacion_activa_id
    WHERE OLD.proximo_follow_up_fecha IS NOT NEW.proximo_follow_up_fecha
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'proximo_canal', OLD.proximo_canal, NEW.proximo_canal, NEW.organizacion_activa_id
    WHERE OLD.proximo_canal IS NOT NEW.proximo_canal
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'id_empresa', OLD.id_empresa, NEW.id_empresa, NEW.organizacion_activa_id
    WHERE OLD.id_empresa IS NOT NEW.id_empresa
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'tipo_id', OLD.tipo_id, NEW.tipo_id, NEW.organizacion_activa_id
    WHERE OLD.tipo_id IS NOT NEW.tipo_id
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'nombre_oficial', OLD.nombre_oficial, NEW.nombre_oficial, NEW.organizacion_activa_id
    WHERE OLD.nombre_oficial IS NOT NEW.nombre_oficial
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'nombre_normalizado', OLD.nombre_normalizado, NEW.nombre_normalizado, NEW.organizacion_activa_id
    WHERE OLD.nombre_normalizado IS NOT NEW.nombre_normalizado
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'nombre_notion', OLD.nombre_notion, NEW.nombre_notion, NEW.organizacion_activa_id
    WHERE OLD.nombre_notion IS NOT NEW.nombre_notion
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'nombre_legal', OLD.nombre_legal, NEW.nombre_legal, NEW.organizacion_activa_id
    WHERE OLD.nombre_legal IS NOT NEW.nombre_legal
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'metabase_uid', OLD.metabase_uid, NEW.metabase_uid, NEW.organizacion_activa_id
    WHERE OLD.metabase_uid IS NOT NEW.metabase_uid
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'notion_page_id', OLD.notion_page_id, NEW.notion_page_id, NEW.organizacion_activa_id
    WHERE OLD.notion_page_id IS NOT NEW.notion_page_id
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'opera_bajo_id', OLD.opera_bajo_id, NEW.opera_bajo_id, NEW.organizacion_activa_id
    WHERE OLD.opera_bajo_id IS NOT NEW.opera_bajo_id
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'id_empresa_matriz', OLD.id_empresa_matriz, NEW.id_empresa_matriz, NEW.organizacion_activa_id
    WHERE OLD.id_empresa_matriz IS NOT NEW.id_empresa_matriz
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'ciudad_principal', OLD.ciudad_principal, NEW.ciudad_principal, NEW.organizacion_activa_id
    WHERE OLD.ciudad_principal IS NOT NEW.ciudad_principal
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'departamento', OLD.departamento, NEW.departamento, NEW.organizacion_activa_id
    WHERE OLD.departamento IS NOT NEW.departamento
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'ubicacion_fuente', OLD.ubicacion_fuente, NEW.ubicacion_fuente, NEW.organizacion_activa_id
    WHERE OLD.ubicacion_fuente IS NOT NEW.ubicacion_fuente
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'en_conversacion', OLD.en_conversacion, NEW.en_conversacion, NEW.organizacion_activa_id
    WHERE OLD.en_conversacion IS NOT NEW.en_conversacion
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'crm_software', OLD.crm_software, NEW.crm_software, NEW.organizacion_activa_id
    WHERE OLD.crm_software IS NOT NEW.crm_software
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'pasarela_actual', OLD.pasarela_actual, NEW.pasarela_actual, NEW.organizacion_activa_id
    WHERE OLD.pasarela_actual IS NOT NEW.pasarela_actual
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'categoria', OLD.categoria, NEW.categoria, NEW.organizacion_activa_id
    WHERE OLD.categoria IS NOT NEW.categoria
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'pbx_forma', OLD.pbx_forma, NEW.pbx_forma, NEW.organizacion_activa_id
    WHERE OLD.pbx_forma IS NOT NEW.pbx_forma
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'score_outbound', OLD.score_outbound, NEW.score_outbound, NEW.organizacion_activa_id
    WHERE OLD.score_outbound IS NOT NEW.score_outbound
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'prioridad_comercial', OLD.prioridad_comercial, NEW.prioridad_comercial, NEW.organizacion_activa_id
    WHERE OLD.prioridad_comercial IS NOT NEW.prioridad_comercial
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'organizacion_activa_id', OLD.organizacion_activa_id, NEW.organizacion_activa_id, NEW.organizacion_activa_id
    WHERE OLD.organizacion_activa_id IS NOT NEW.organizacion_activa_id
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'notas_discovery', OLD.notas_discovery, NEW.notas_discovery, NEW.organizacion_activa_id
    WHERE OLD.notas_discovery IS NOT NEW.notas_discovery
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'brief', OLD.brief, NEW.brief, NEW.organizacion_activa_id
    WHERE OLD.brief IS NOT NEW.brief
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'id_plan', OLD.id_plan, NEW.id_plan, NEW.organizacion_activa_id
    WHERE OLD.id_plan IS NOT NEW.id_plan
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'pct_digital', OLD.pct_digital, NEW.pct_digital, NEW.organizacion_activa_id
    WHERE OLD.pct_digital IS NOT NEW.pct_digital
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'fuente_lead', OLD.fuente_lead, NEW.fuente_lead, NEW.organizacion_activa_id
    WHERE OLD.fuente_lead IS NOT NEW.fuente_lead
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'fecha_primer_contacto', OLD.fecha_primer_contacto, NEW.fecha_primer_contacto, NEW.organizacion_activa_id
    WHERE OLD.fecha_primer_contacto IS NOT NEW.fecha_primer_contacto
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'fecha_ultimo_contacto', OLD.fecha_ultimo_contacto, NEW.fecha_ultimo_contacto, NEW.organizacion_activa_id
    WHERE OLD.fecha_ultimo_contacto IS NOT NEW.fecha_ultimo_contacto
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'razon_perdida', OLD.razon_perdida, NEW.razon_perdida, NEW.organizacion_activa_id
    WHERE OLD.razon_perdida IS NOT NEW.razon_perdida
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'contactado', OLD.contactado, NEW.contactado, NEW.organizacion_activa_id
    WHERE OLD.contactado IS NOT NEW.contactado
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'respondio', OLD.respondio, NEW.respondio, NEW.organizacion_activa_id
    WHERE OLD.respondio IS NOT NEW.respondio
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'agendado', OLD.agendado, NEW.agendado, NEW.organizacion_activa_id
    WHERE OLD.agendado IS NOT NEW.agendado
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'se_presento', OLD.se_presento, NEW.se_presento, NEW.organizacion_activa_id
    WHERE OLD.se_presento IS NOT NEW.se_presento
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'califica', OLD.califica, NEW.califica, NEW.organizacion_activa_id
    WHERE OLD.califica IS NOT NEW.califica
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'tier', OLD.tier, NEW.tier, NEW.organizacion_activa_id
    WHERE OLD.tier IS NOT NEW.tier
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'tipo_empresa', OLD.tipo_empresa, NEW.tipo_empresa, NEW.organizacion_activa_id
    WHERE OLD.tipo_empresa IS NOT NEW.tipo_empresa
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'created_at', OLD.created_at, NEW.created_at, NEW.organizacion_activa_id
    WHERE OLD.created_at IS NOT NEW.created_at;
END;
