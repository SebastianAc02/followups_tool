# Base de producción isps.db

Guía para cruzar, consultar o escribir en la base de datos de producción. Quién vaya a reconciliar empresas, auditar identidades o sincronizar datos empieza aquí.

## Sección 1: La llave para cruzar con Notion es notion_page_id

Nunca se cruza por nombre. Números medidos el 2026-07-24: cruzar 482 páginas de Notion contra 476 cuentas por nombre normalizado dio 166 páginas sin match y 160 cuentas sin match, o sea 326 falsas diferencias. El mismo cruce por `notion_page_id` dio 9. La causa: Notion guarda la marca comercial ("Atlantel", "REDVIVA", "Hola - Giganav") y la base guarda la razón social del RUES ("ATLANTEL S.A.S", "RED COLOMBIANA DE TELECOMUNICACIONES VIVA S.A.S").

Estado del mapeo: 477 de 482 páginas ya tienen su cuenta enlazada.

`empresa.notion_page_id` tiene un índice único parcial (`ux_empresa_notion_page_id`), así que una página no se puede enlazar a dos cuentas.

## Sección 2: Cuál base es cuál

Son tres archivos y confundirlos lleva a diagnósticos falsos.

- **Producción**: vive en el volumen Docker `followups_data` del VPS, se ve como `/data/isps.db` dentro de los contenedores. Es la que lee el MCP. Es la que manda.
- **Local**: `/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db`. Tiene el universo completo de ~1.956 empresas. NO refleja el estado de producción: el 2026-07-24 la local decía 141 on_hold y 102 firma_pago mientras producción tenía 125 y 87.
- **followups-tool/isps.db** dentro del repo: archivo de 0 bytes, huérfano. No sirve para nada.

Regla: para estado y existencia se le pregunta al MCP, que lee producción. Para identidad (page_id, NIT, nombres) la local sirve, es el mismo dato.

Para operar la base de producción no hay binario sqlite3 en el VPS: se usa node con better-sqlite3 desde la imagen, por ejemplo `docker exec -i followups_web node` pasándole un script por stdin.

## Sección 3: Los campos de identidad de empresa

- `id_empresa`: es la PK. Cuando `tipo_id = 'nit'` el id ES el NIT sin dígito de verificación. También existen ids sintéticos con prefijo `999` y con prefijo `ntn-` para cuentas que nacieron sin NIT.
- `nombre_oficial`: la razón social del RUES.
- `nombre_notion`: el nombre tal como aparece en Notion, la marca comercial. Nullable, se puebla al reconciliar. Columna agregada el 2026-07-25 justamente para no volver a cruzar por nombre a ciegas.
- `estado_notion`: la etapa del embudo. Puede ser NULL, y una cuenta con NULL existe pero no aparece en la tool `pipeline` del MCP. Es un CHECK de 8 valores: lead, contacto_iniciado, oportunidad, reunion_agendada, cierre_documentacion, enviar_contrato, on_hold, firma_pago.
- `owner`: texto libre, no una FK. Los valores reales son "Felipe Castro" (82 cuentas), "Sebastian Acosta Molina" (132), "Thomas Schumacher" (79), "Camilo fonseca" (12), y hay dos filas con dos owners separados por coma. 222 cuentas no tienen owner.

## Sección 4: Dónde buscar una empresa antes de crearla

La tool `buscar_empresa` del MCP cruza CUATRO frentes a la vez y es la forma correcta de saber si una cuenta ya existe: empresa (nombre oficial y normalizado), `empresa_alias`, la tabla `prospeccion` (nombre crudo, website, teléfonos) y `contacto` (teléfono, dominio del email). Devuelve cada candidato con el frente del que salió y su confianza.

La tabla `prospeccion` tiene 670 filas y es la que suele resolver los casos difíciles: REDVIVA se identificó por el dominio redviva.co y el teléfono, que estaban ahí y no en `contacto`.

Advertencia sobre `prospeccion`: la creó el ETL de Python por fuera de Drizzle, así que no estaba en los snapshots. Si `drizzle-kit generate` propone un `CREATE TABLE prospeccion`, hay que borrarlo a mano del .sql o el deploy revienta.

## Sección 5: Trampas conocidas

- `deal_historia` del MCP responde `empresa_no_encontrada` en dos casos distintos: la empresa no existe, o existe pero sin `estado_notion`. No los distingue, y eso ya causó la conclusión errada de "hay que crear esta cuenta" cuando había que enlazarla. Para distinguir, usar `buscar_empresa`.
- La tool `pipeline` solo lista cuentas CON etapa. Una cuenta sin `estado_notion` es invisible ahí aunque exista.
- `DATABASE.md` (en la carpeta padre `06_onepay/`) está desactualizado desde mayo de 2026: dice 271 cuentas en pipeline cuando son 476, y afirma que la base no tiene vistas cuando tiene 3. Sirve para entender el ETL y el universo ISP, no para el estado actual del pipeline.
- La base está en modo WAL. Copiarla con `cp` es inseguro porque no arrastra el `-wal`. Se usa `sqlite3 .backup` o el equivalente en node.
