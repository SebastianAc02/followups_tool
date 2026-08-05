-- 0024: el trigger de auditoria de `empresa`, recreado para cubrir las cuatro columnas de
-- aliado que agrego la 0023.
--
-- POR QUE UNA MIGRACION APARTE Y NO DENTRO DE LA 0023. Un archivo que hace ALTER TABLE ADD COLUMN
-- no se puede volver a correr sobre una base que ya los tiene, y este trigger si: es DROP +
-- CREATE, idempotente, y la prueba que lo vigila (app/db/auditoria-campo.test.ts) ejecuta los
-- .sql de auditoria sobre una base de prueba que YA trae las columnas en su DDL. Mezclarlos
-- obligaria a la prueba a tragarse un "duplicate column name" para poder leer el trigger.
--
-- POR QUE SE RECREA ENTERO Y NO SE "AGREGAN" LAS RAMAS. SQLite no sabe alterar un trigger: se
-- reemplaza con DROP + CREATE y ninguna fila se mueve. Mismo criterio que los triggers de
-- vocabulario del toque.
--
-- LO QUE PASA SI ESTO NO EXISTE: las cuatro columnas cambiarian sin dejar rastro. Sobre `aliado`
-- eso es peor que sobre cualquier otra: la columna existe para que una clasificacion se pueda
-- auditar, y una auditoria que no registra quien cambio el dato no audita nada. La prueba de
-- cobertura del trigger lo agarro en rojo antes de que llegara a produccion.

DROP TRIGGER IF EXISTS `empresa_auditoria_campo`;--> statement-breakpoint
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
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'aliado', OLD.aliado, NEW.aliado, NEW.organizacion_activa_id
    WHERE OLD.aliado IS NOT NEW.aliado
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'aliado_fuente', OLD.aliado_fuente, NEW.aliado_fuente, NEW.organizacion_activa_id
    WHERE OLD.aliado_fuente IS NOT NEW.aliado_fuente
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'aliado_fecha', OLD.aliado_fecha, NEW.aliado_fecha, NEW.organizacion_activa_id
    WHERE OLD.aliado_fecha IS NOT NEW.aliado_fecha
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'aliado_quien', OLD.aliado_quien, NEW.aliado_quien, NEW.organizacion_activa_id
    WHERE OLD.aliado_quien IS NOT NEW.aliado_quien
  UNION ALL SELECT 'empresa', NEW.id_empresa, 'created_at', OLD.created_at, NEW.created_at, NEW.organizacion_activa_id
    WHERE OLD.created_at IS NOT NEW.created_at;
END;
