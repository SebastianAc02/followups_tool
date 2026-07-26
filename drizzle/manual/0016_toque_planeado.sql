-- 0016: `toque_planeado`, el plan del dia como dato. PROPUESTA, NO APLICADA (2026-07-26).
--
-- Responde "se planearon 10 y se hicieron 3", que hoy no tiene respuesta porque el plan del dia
-- vive en un markdown fuera de la base. La tool registra lo que se hizo (`toque`, 287 filas en
-- produccion) y lo que se corrio de fecha (`seguimiento_aplazado`, 4 filas), pero nunca lo que
-- se iba a hacer.
--
-- ESTE ARCHIVO NO ES UNA MIGRACION DE DRIZZLE Y NO SE APLICA CORRIENDOLO A MANO.
-- Vive en drizzle/manual/ y fuera de drizzle/meta/_journal.json a proposito (mismo lugar y misma
-- razon que 0011_estado_notion_check.sql): `npm run migrate` solo ejecuta lo que esta en el
-- journal, asi que este archivo no entra en ningun deploy. El camino real para aplicarlo, cuando
-- el dueno del repo lo decida, es el de docs/playbook-migraciones.md: agregar la tabla a
-- app/db/schema.ts, correr `npx drizzle-kit generate`, LEER el .sql generado, agregar el DDL a
-- app/db/test-helpers.ts (la base de prueba no se construye con migraciones) y dejar que el
-- deploy la corra. El SQL de abajo es el contenido esperado de esa migracion, no un atajo.
--
-- ── Por que una tabla y no columnas nuevas en `toque` ─────────────────────────────────────────
-- Un toque planeado que nunca se ejecuto no es un toque. Meterlo en `toque` con una bandera
-- "planeado" contamina de una las 287 filas que hoy significan "esto paso": cualquier conteo de
-- actividad tendria que acordarse de filtrar, y el dia que alguien lo olvide el numero infla.
-- Mismo criterio con el que `seguimiento_aplazado` nacio aparte en vez de como columna de
-- `empresa`: el evento que no ocurrio es una entidad distinta del hecho que si ocurrio.
--
-- ── Por que NO hay columna de estado (ejecutado/pendiente/vencido) ────────────────────────────
-- El estado se deriva del cruce con `toque`, y esa es la unica forma de que "lo no hecho" no
-- dependa de que alguien lo marque. Un flag `ejecutado` tiene que escribirlo alguien; el dia que
-- no lo escriba, el plan miente en la direccion comoda (todo aparece hecho). El cruce, en cambio,
-- falla en la direccion incomoda: un toque que no quedo registrado aparece como no ejecutado, y
-- eso se corrige registrando el toque, que es justo lo que se quiere que pase.
-- Mismo criterio que la nota de `seguimiento_aplazado` en schema.ts: solo eventos crudos, ningun
-- contador derivado que se desincronice solo.
--
-- ── Por que hay DOS caminos de cruce y no uno ────────────────────────────────────────────────
-- `id_toque` es el enlace explicito: lo escribe registrarToque() cuando el toque nace desde el
-- plan del dia. Es exacto y es el que manda.
-- El fallback es el match por (id_empresa, fecha_dia): sirve para el toque que el operador hizo
-- por fuera del plan, o que registro dictandole al brain sin pasar por la fila planeada, que hoy
-- son la mayoria (de 287 toques, 24 tienen fuente 'cockpit' y 4 'brain'; 242 son seed de Notion).
-- Sin el fallback, la medicion diria "planeado y no hecho" sobre toques que si se hicieron.
--
-- ── Vocabularios acotados, enforzados por Zod y no por CHECK ─────────────────────────────────
-- `tipo`, `origen` y `motivo_no_ejecutado` son texto con lista cerrada en app/db/validation.ts,
-- mismo patron que canal/resultado en `toque` y motivo en `seguimiento_aplazado`. Un CHECK en
-- SQLite no se puede ampliar sin recrear la tabla (docs/playbook-migraciones.md), y esta lista va
-- a crecer: el primer tipo que falte obligaria a la recreacion.
--   tipo:   frio | seguimiento | cierre
--   origen: cadencia | rodado | manual
--   motivo_no_ejecutado: reusa MOTIVOS_APLAZO tal cual, ya existente
--                        (plan_irreal | dia_atravesado | tiempo_no_usado | cuenta_evitada).
--                        No se inventa un vocabulario paralelo para la misma pregunta.

CREATE TABLE `toque_planeado` (
	`id_toque_planeado` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id_empresa` text NOT NULL,
	-- El DIA para el que se planeo, ISO YYYY-MM-DD y nada mas. Mismo formato y mismo criterio
	-- que toque.fecha_dia, que es la columna sobre la que se cuenta. Es lo que hace que el cruce
	-- planeado vs ejecutado sea un JOIN y no una heuristica de parseo: `toque.fecha` es texto
	-- libre historico (de 285 filas, 97 en NULL y 3 en prosa tipo "~inicios jun").
	`fecha_dia` text NOT NULL,
	-- NULL = se planeo tocar la cuenta sin decidir el canal. No se infiere el canal del paso de
	-- cadencia ni de empresa.proximo_canal: si no se dijo, no se sabe.
	`canal` text,
	`tipo` text NOT NULL,
	`origen` text NOT NULL,
	-- Puntero al paso real cuando origen='cadencia'. Es lo que evita duplicar el motor: la
	-- cadencia ya instancia sus pasos en `paso_inscripcion` con fecha_programada (86 filas en
	-- produccion, 81 pendientes entre el 27 y el 31 de julio). Esta tabla no reemplaza eso,
	-- lo referencia. NULL en todo lo que no salio de una cadencia.
	`id_paso_inscripcion` integer,
	-- Cuando origen='rodado', apunta a la fila del dia anterior de la que se rodo. La cadena se
	-- sigue hacia atras y se cuenta cuantos dias lleva rodando una cuenta sin una columna
	-- contador que se desincronice. NULL en todo lo demas.
	`id_planeado_origen` integer,
	-- El enlace explicito al toque ejecutado. NULL no significa "no se hizo": significa "no hay
	-- enlace explicito", y ahi entra el fallback por (id_empresa, fecha_dia). Ver la consulta de
	-- abajo, que es la definicion operativa de ejecutado y de no ejecutado.
	`id_toque` integer,
	-- Por que no se hizo. Lo dice el operador, uno de MOTIVOS_APLAZO. NULL = no lo dijo, jamas
	-- se infiere (mismo criterio que seguimiento_aplazado.motivo, que hoy tiene sus 4 filas con
	-- motivo NULL y el contexto en `nota`).
	`motivo_no_ejecutado` text,
	-- El detalle en prosa, aparte del motivo. Contexto para un humano; no se agrupa ni se cuenta.
	`nota` text,
	-- Cuando el no-ejecutado ademas movio la fecha de follow-up, apunta al evento de aplazo. El
	-- motivo NO se copia: se escribe una vez, aca, y el aplazo es su consecuencia. NULL cuando el
	-- toque no se hizo y nadie corrio ninguna fecha, que es un caso distinto y hoy invisible.
	`id_seguimiento_aplazado` integer,
	-- Quien armo el plan. Mismo criterio que toque.ejecutado_por: NULL = no atribuido, nunca se
	-- asume el owner (en produccion, 285 de 287 toques tienen ejecutado_por en NULL).
	`planeado_por` text,
	`id_organizacion` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
-- Idempotencia del plan: replanear el mismo dia no duplica filas. COALESCE(canal,'') porque en
-- SQLite dos NULL son distintos para un UNIQUE, asi que sin eso "tocar a X el martes, canal sin
-- decidir" entraria dos veces. Es la misma idea del toggle idempotente de segmento_exclusion.
CREATE UNIQUE INDEX `ux_toque_planeado_dia_empresa_canal`
	ON `toque_planeado` (`fecha_dia`,`id_empresa`,COALESCE(`canal`,''));--> statement-breakpoint
-- "Que se planeo hoy": el acceso del brief de la manana y del conteo del dia.
CREATE INDEX `idx_toque_planeado_dia` ON `toque_planeado` (`fecha_dia`,`id_organizacion`);--> statement-breakpoint
-- "Que se le planeo a esta cuenta": el acceso de la ficha y de la cadena de rodados.
CREATE INDEX `idx_toque_planeado_empresa` ON `toque_planeado` (`id_empresa`,`fecha_dia`);--> statement-breakpoint
-- Parcial: la cola de lo que todavia no tiene enlace explicito, que es sobre lo que corre la
-- derivacion diaria. Indice parcial y no completo porque la tabla crece con el tiempo y lo
-- pendiente siempre es un pedazo chico.
CREATE INDEX `idx_toque_planeado_sin_toque` ON `toque_planeado` (`fecha_dia`) WHERE `id_toque` IS NULL;
--> statement-breakpoint
-- `toque` no tiene UN SOLO indice en produccion (verificado 2026-07-26: sqlite_master no
-- devuelve ninguno para tbl_name='toque'). Con 287 filas da igual, pero el cruce de esta tabla
-- contra `toque` es exactamente por (id_empresa, fecha_dia) y se va a correr todos los dias.
-- El indice cuesta unos KB ahora y evita el full scan cuando la tabla crezca.
CREATE INDEX `idx_toque_empresa_dia` ON `toque` (`id_empresa`,`fecha_dia`);

-- ── La consulta que responde la pregunta ─────────────────────────────────────────────────────
-- No se crea como vista a proposito: las tres vistas que ya existen en isps.db (empresa_categoria,
-- empresa_pipeline, empresa_resumen) nacieron fuera de drizzle y estan marcadas .existing() en
-- schema.ts. Agregar una cuarta por este camino suma superficie que drizzle-kit no maneja. Vive
-- aca como definicion operativa; si hace falta en la app, va como funcion del Repository.
--
--   SELECT p.fecha_dia,
--          COUNT(*)                                            AS planeados,
--          COUNT(t.id_toque)                                   AS ejecutados,
--          COUNT(*) - COUNT(t.id_toque)                        AS no_ejecutados,
--          SUM(p.motivo_no_ejecutado IS NULL AND t.id_toque IS NULL) AS sin_motivo
--     FROM toque_planeado p
--     LEFT JOIN toque t
--            ON t.id_toque = p.id_toque
--            OR (p.id_toque IS NULL
--                AND t.id_empresa = p.id_empresa
--                AND t.fecha_dia  = p.fecha_dia)
--    WHERE p.fecha_dia BETWEEN ? AND ?
--    GROUP BY p.fecha_dia
--    ORDER BY p.fecha_dia DESC;
--
-- `sin_motivo` esta en la consulta a proposito: es la unica metrica que mide la calidad del
-- registro en vez de la del operador. Un dia con muchos no ejecutados sin motivo no es un mal
-- dia de ventas, es un dia mal registrado, y las dos cosas se arreglan distinto.
--
-- ── Lo que esta tabla NO hace, y no se disimula ──────────────────────────────────────────────
-- 1. No llena el plan sola. Sin un escritor (accion del MCP o paso de /dia-sales que inserte el
--    plan de la manana) la tabla queda vacia y la pregunta sigue sin respuesta. El esquema es la
--    mitad barata del problema.
-- 2. El fallback por (id_empresa, fecha_dia) no distingue canal: si se planearon llamada y
--    whatsapp a la misma cuenta el mismo dia y solo se hizo uno, el JOIN da los dos por hechos.
--    Se acota exigiendo el enlace explicito cuando hay mas de una fila planeada para esa
--    cuenta-dia; queda dicho porque es el borde real, no una hipotesis.
-- 3. No propaga nada a Notion. `CambioNotion` (app/core/ports/sync.ts) no tiene campo de plan, y
--    el conector de Notion no tiene credencial en produccion. El plan es dato interno de la base.
