-- 0023: de quien es la cuenta, con su procedencia. Ver ALIADOS en app/db/validation.ts.
--
-- LAS 476 FILAS QUEDAN EN NULL Y ESO ES CORRECTO. NULL significa sin_verificar, jamas
-- "no es aliado". Backfillear a ninguno_verificado seria fabricar de un golpe, sobre toda la
-- base, el mismo dato negativo que el 2026-08-04 metio dos cuentas de SAE Plus (Fiesta
-- Telecomunicaciones y Tunortetv) a una lista de llamadas y obligo a rehacerla entera.
--
-- Nadie lee la columna cruda: se lee por clasificarAliado(), que traduce el NULL a sin_verificar
-- y le cuelga su advertencia. Una cuenta sin verificar SALE en las listas, marcada; no se
-- esconde ni se aprueba.
--
-- Las tres columnas de procedencia no son opcionales de facto: marcarAliado exige fuente y quien,
-- porque un aliado sin quien lo dijo es exactamente el dato que despues nadie puede auditar, y
-- esta columna nace de un error de auditoria.
ALTER TABLE `empresa` ADD `aliado` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `aliado_fuente` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `aliado_fecha` text;--> statement-breakpoint
ALTER TABLE `empresa` ADD `aliado_quien` text;
