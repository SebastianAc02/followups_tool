-- opera_bajo_id ya existe en isps.db real (columna heredada, nunca antes mapeada
-- en Drizzle). No-op a proposito: correr el ADD COLUMN generado automaticamente
-- reventaria con "duplicate column name" contra la DB real.
SELECT 1;
