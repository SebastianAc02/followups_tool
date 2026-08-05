-- 0030: la procedencia del origen del lead.
--
-- La columna `fuente_lead` YA existia desde la 0010 y nunca tuvo camino de escritura: verificado el
-- 2026-08-05, ningun codigo la llenaba, asi que las 1.956 filas estan vacias. Es el mismo patron de
-- las tres columnas de transcript, que vivieron meses en la tabla sin que nada las escribiera. Lo
-- que entra ahora es la accion que la llena, y estas tres columnas que la hacen auditable.
--
-- `procedencia` y no `fuente`: la columna del dato ya se llama fuente_lead, y un fuente_lead_fuente
-- seria ilegible en cualquier consulta. fuente_lead es DE DONDE VINO LA CUENTA; procedencia es DE
-- DONDE SALIO EL DATO.
--
-- Las filas quedan en NULL y ahi es donde importa no hacer nada: NULL significa que NADIE registro
-- el origen, jamas outbound. Backfillear a outbound seria comodo porque casi toda la prospeccion es
-- fria, y destruiria justo la medicion para la que la columna existe.
ALTER TABLE `empresa` ADD `fuente_lead_procedencia` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `fuente_lead_fecha` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `fuente_lead_quien` text;
