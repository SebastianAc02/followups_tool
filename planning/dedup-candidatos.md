# Candidatos a gemelo (Fase 0, T3)

Generado por `scripts/dedup_reporte.ts`. Solo lectura, no funde nada.

## Decision de Sebastian (2026-07-14) — revisado a mano, listo para T4

Politica de nombre (decision nueva, cambia el spec original): el sobreviviente de
cada fusion usa el nombre de NOTION como `nombre_oficial` (lo que se ve en toda la
app). El nombre legal del NIT se guarda aparte en `empresa.nombre_legal` (columna
nueva, solo referencia/auditoria, no se muestra en la UI).

**Aprobados para fundir en T4** (NIT id -> sinteticos a absorber):
- 901715847 (Celsia Internet S.A.S.) <- ntn-8119deb48bf9, ntn-1e376ceb9dfb (dos sinteticos, mismo NIT)
- 901403469 (WINS SOLUCIONES SAS) <- ntn-8ea10df5716e
- 901734417 (K.G.B. TELECOMUNICACIONES S.A.S) <- 9990000123
- 901421445 (TELECOM PLUS SAS) <- 9990000084
- 900482761 (WIRELESS COLOMBIA S.A.S.) <- 9990000164
- 900014381 (CABLE NET S.A.S.) <- 9990000002
- 901132952 (INTTEL GO S A S) <- 9990000043
- 900780620 (SERVICIOS INFORMATICOS DEL CHOCO SAS) <- ntn-0d6b7fe647a4
- 901174053 (GLOBAL IP TELECOMUNICACIONES S.A.S.) <- ntn-73a5b38a0a21
- 901734607 (HOLA TELECOMUNICACIONES COLOMBIA S.A.S) <- ntn-0de334ef3e49 (confirmado: mismo Bogota)
- 800179562 (LEGON TELECOMUNICACIONES S.A.S.) <- 9990000130
- 805006014 (DIRECTV COLOMBIA LTDA) <- ntn-3e3b995fe19c
- 901118187 (CONEXION ISP SAS) <- ntn-4157c57ed48a
- 900806620 (MUNDO + S.A.S) <- 9990000117
- 900511109 (CLICK-CONECTIVIDAD SIN FRONTERAS S.A.S) <- 9990000088
- 901009357 (IPCOM SISTEMAS S.A.S) <- 9990000159
- 900734423 (CALLTOPBX S.A.S.) <- 9990000152
- 901279098 (Enternet Comunicaciones sas) <- ntn-9aeb2696d2f8
- 901714003 (FIBERMAT E INGENIERIA S.A.S) <- ntn-ffac89d56571 (Fibermax, confirmado typo)
- 900770495 (SPECTRA TELECOMUNICACIONES SAS) <- 9990000037 (Espectra, dup ya conocido)
- 901423454 (SPEED RED.NET S.A.S) <- ntn-677cb0cc1b6d (Hola - Red Net, confirmado)
- 901419071 (NET.DIGITAL S.A.S) <- ninguno sintetico (Hola - Digital Net queda como link normal, no gemelo; ver T5)

**Rechazados (NO fundir, quedan como registros separados):**
Tricom/Wiicom, Mega comunicaciones/EGA Comunicaciones, SAT Comunicaciones/DSAM,
Fibernet Ingenieria/FIBERMAT E INGENIERIA (ojo: el NIT si funde con "Fibermat",
ver arriba — son 3 nombres Fiber-* distintos, no 2), FXN Comunicaciones/SUN,
FERMAC/JERSAL, BYTM/BLUE, JASZ/OASIS, CYD/CPM, TV Colombia Digital/TV Chinacota
Digital (ciudades no cruzadas, nombres de ciudad literalmente distintos), Super
Cable/CABLE SAS, Empresa de Energia del Putumayo/Empresa de Comunicaciones del
Putumayo (energia vs comunicaciones, sectores distintos), Satelital/Telecom J&C,
Comunicamos+/S&E, Hola - PRT Telecomunicaciones/HOLANET (sin evidencia suficiente),
Sur Conexion Colombia/Conexion Digital Colombia (Ipiales-Nariño vs
Girardot-Cundinamarca, geografia opuesta).

**Sin resolver (no fundir por ahora, falta evidencia):** el cluster Wisp
Telecomunicaciones / VIVO TELECOMUNICACIONES / VISS Telecomunicaciones — Sebastian
rechazo el par principal (VISS<->WISP) pero VIVO tambien reclama el mismo
sintetico VISS (9990000018) y no hay forma de saber cual, si alguno, es el
correcto sin mas señal (telefono, ciudad). Los tres quedan como registros
separados hasta tener mas dato.

**No era un caso real:** CJC Telecomunicaciones ya tenia su propio NIT con match
exacto (1.00); el "KGB" que aparecio al lado era ruido del agrupador (KGB ya
tiene su propio par correcto arriba). Fuera de la lista, no necesita fusion.

---

## Gemelos ambiguos (todo lo que encontro el matcher, sin filtrar por Sebastian): 48

Estos SI son candidatos reales a fusion (T4). Marca con [x] los que apruebas fundir.

| empresa Notion | id NIT | nombre NIT (score) | id sintetico | nombre sintetico (score) |
|---|---|---|---|---|
| CELSIA INTERNET | 901715847 | Celsia Internet S.A.S. (1.00) | ntn-8119deb48bf9 | CELSIA INTERNET S.A.S. (1.00) |
| WINS SOLUCIONES SAS | 901403469 | WINS SOLUCIONES SAS (1.00) | ntn-8ea10df5716e | WINS SOLUCIONES SAS (1.00) |
| Mega comunicaciones | 901385119 | EGA COMUNICACIONES S.A.S. (0.95) | ntn-ae946bf5c405 | Mega comunicaciones (1.00) |
| Tricom Telecomunicaciones | 901821220 | WIICOM TELECOMUNICACIONES SAS (0.92) | 9990000076 | Tricom Telecomunicaciones (1.00) |
| KGB TELECOMUNICACIONES | 901734417 | K.G.B. TELECOMUNICACIONES S.A.S (0.92) | 9990000123 | KGB TELECOMUNICACIONES (1.00) |
| Telecomplus | 901421445 | TELECOM PLUS SAS (0.92) | 9990000084 | Telecomplus (1.00) |
| Wisp telecomunicaciones | 900867741 | WISP TELECOMUNICACIONES SAS (1.00) | 9990000018 | VISS Telecomunicaciones S.A.S (0.91) |
| VIVO TELECOMUNICACIONES S.A.S. | 900979388 | VIVO TELECOMUNICACIONES S.A.S. (1.00) | 9990000018 | VISS Telecomunicaciones S.A.S (0.91) |
| VISS TELECOMUNICACIONES S.A.S | 900867741 | WISP TELECOMUNICACIONES SAS (0.91) | 9990000018 | VISS Telecomunicaciones S.A.S (1.00) |
| WIRELESS COLOMBIA S.A.S. | 900482761 | WIRELESS COLOMBIA S.A.S. (1.00) | 9990000164 | S3WIRELESS COLOMBIA S.A (0.89) |
| S3WIRELESS COLOMBIA S.A | 900482761 | WIRELESS COLOMBIA S.A.S. (0.89) | 9990000164 | S3WIRELESS COLOMBIA S.A (1.00) |
| SAT Comunicaciones | 901365779 | DSAM COMUNICACIONES S.A.S (0.89) | 9990000058 | SAT Comunicaciones (1.00) |
| Fibernet ingenieria  | 901714003 | FIBERMAT E INGENIERIA S.A.S (0.89) | 9990000116 | Fibernet Ingeniería (1.00) |
| CABLENET SAS | 900014381 | CABLE NET S.A.S. (0.89) | 9990000002 | Cablenet SAS (1.00) |
| Intel Go | 901132952 | INTTEL GO S A S (0.89) | 9990000043 | Intel Go (1.00) |
| INTTEL GO SAS | 901132952 | INTTEL GO S A S (1.00) | 9990000043 | Intel Go (0.89) |
| FXN Comunicaciones | 901138762 | SUN COMUNICACIONES S.A.S (0.89) | 9990000008 | FXN Comunicaciones (1.00) |
| Hola - PRT Telecomunicaciones | 901387527 | HOLANET TELECOMUNICACIONES S.A.S (0.89) | ntn-3bb75421949d | Hola - PRT Telecomunicaciones (1.00) |
| FERMAC TELECOMUNICACIONES S.A.S | 901044364 | JERSAL TELECOMUNICACIONES S.A.S (0.88) | 9990000165 | FERMAC TELECOMUNICACIONES S.A.S (1.00) |
| Servicios Informáticos del Choco (SIC) | 900780620 | SERVICIOS INFORMATICOS DEL CHOCO SAS (0.88) | ntn-0d6b7fe647a4 | Servicios Informáticos del Choco (SIC) (1.00) |
| BLUE TELECOMUNICACIONES | 900999305 | BLUE TELECOMUNICACIONES S.A.S. (1.00) | 9990000023 | BYTM TELECOMUNICACIONES (0.87) |
| BYTM TELECOMUNICACIONES  | 900999305 | BLUE TELECOMUNICACIONES S.A.S. (0.87) | 9990000023 | BYTM TELECOMUNICACIONES (1.00) |
| CJC Telecomunicaciones | 901641486 | CJC Telecomunicaciones (1.00) | 9990000123 | KGB TELECOMUNICACIONES (0.86) |
| JASZ COMUNICACIONES | 901776947 | OASIS COMUNICACIONES S.A.S (0.85) | 9990000045 | JASZ COMUNICACIONES (1.00) |
| CYD telecomunicaciones | 901619498 | CPM TELECOMUNICACIONES S.A.S (0.91) | 9990000023 | BYTM TELECOMUNICACIONES (0.87) |
| Global IP  | 901174053 | GLOBAL IP TELECOMUNICACIONES S.A.S. (0.67) | ntn-73a5b38a0a21 | Global IP (1.00) |
| Hola - Hola Telecomunicaciones | 901734607 | HOLA TELECOMUNICACIONES COLOMBIA S.A.S (0.67) | ntn-0de334ef3e49 | Hola - Hola Telecomunicaciones (1.00) |
| CELSIA | 901715847 | Celsia Internet S.A.S. (0.50) | ntn-1e376ceb9dfb | CELSIA (1.00) |
| TV COLOMBIA DIGITAL SAS | 900548752 | TV COLOMBIA DIGITAL SAS (1.00) | ntn-85545f35d987 | TV CHINACOTA DIGITAL (0.50) |
| TV CHINACOTA DIGITAL | 900548752 | TV COLOMBIA DIGITAL SAS (0.50) | ntn-85545f35d987 | TV CHINACOTA DIGITAL (1.00) |
| Legon Telecomunicaciones | 800179562 | LEGON TELECOMUNICACIONES S.A.S. (1.00) | 9990000130 | Legon (0.50) |
| SUR CONEXIÓN COLOMBIA | 901420524 | CONEXION DIGITAL COLOMBIA S.A.S (0.50) | 9990000153 | SUR CONEXIÓN COLOMBIA (1.00) |
| DIRECTV | 805006014 | DIRECTV COLOMBIA LTDA (0.50) | ntn-3e3b995fe19c | DIRECTV (1.00) |
| Conexión Digital - One ISP | 901118187 | CONEXION ISP SAS (0.50) | ntn-4157c57ed48a | Conexión Digital - One ISP (1.00) |
| Mundo Mas | 900806620 | MUNDO + S.A.S (0.50) | 9990000117 | Mundo Mas (1.00) |
| Click Conectividad | 900511109 | CLICK-CONECTIVIDAD SIN FRONTERAS S.A.S (0.50) | 9990000088 | Click Conectividad (1.00) |
| Super Cable | 900706805 | CABLE SAS (0.50) | ntn-722f3326f27c | Super Cable (1.00) |
| EMPRESA DE ENERGIA DEL PUTUMAYO | 901568486 | EMPRESA DE COMUNICACIONES DEL PUTUMAYO S.A.S (0.50) | ntn-dc064fac5937 | EMPRESA DE ENERGIA DEL PUTUMAYO (1.00) |
| SATELITAL TELECOMUNICACIONES S.A.C | 901688739 | TELECOMUNICACIONES J&C S.A.S. (0.50) | 9990000170 | SATELITAL TELECOMUNICACIONES S.A.C (1.00) |
| Hola - Red Net | 901423454 | SPEED RED.NET S.A.S (0.50) | ntn-677cb0cc1b6d | Hola - Red Net (1.00) |
| IPCOM SISTEMAS | 901009357 | IPCOM SISTEMAS S.A.S (1.00) | 9990000159 | IPCom (0.50) |
| CALLTOPBX S.A.S. VIVERCOM | 900734423 | CALLTOPBX S.A.S. (0.50) | 9990000152 | CALLTOPBX S.A.S. VIVERCOM (1.00) |
| COMUNICAMOS + TELECOMUNICACIONES SAS | 901882671 | S&E TELECOMUNICACIONES S.A.S. (0.50) | 9990000167 | COMUNICAMOS + TELECOMUNICACIONES SAS (1.00) |
| ENTERNET | 901279098 | Enternet Comunicaciones sas (0.50) | ntn-9aeb2696d2f8 | ENTERNET (1.00) |
| Fibermat | 901714003 | FIBERMAT E INGENIERIA S.A.S (0.50) | ntn-ffac89d56571 | Fibermax (0.88) |
| SPECTRA | 900770495 | SPECTRA TELECOMUNICACIONES SAS (0.50) | 9990000037 | Espectra (0.88) |
| Hola - Punto Red Telecomunicaciones | 900637681 | PUNTO RED TELECOMUNICACIONES S.A.S (0.75) | ntn-0de334ef3e49 | Hola - Hola Telecomunicaciones (0.50) |
| Hola - Digital Net | 901419071 | NET.DIGITAL S.A.S (0.67) | ntn-677cb0cc1b6d | Hola - Red Net (0.50) |

## Todos los pares (umbral 0.5), para referencia: 980

| score | DB id (tipo) | nombre DB | Notion page_id | nombre Notion | campos en conflicto |
|---|---|---|---|---|---|
| 1.00 | 901715847 (nit) | Celsia Internet S.A.S. | 37695153c5cd8025b707ea64f3fbd60a | CELSIA INTERNET | nombre |
| 1.00 | 900548646 (nit) | CONEXION DIGITAL EXPRESS SAS | (sin page_id) | CONEXIÓN DIGITAL EXPRESS | nombre |
| 1.00 | 901558549 (nit) | FIBRAZO S.A.S | 30c95153c5cd81079c7ee73f06b4fb59 | Fibrazo | nombre |
| 1.00 | 901464013 (nit) | SOMOS NETWORKS COLOMBIA S.A.S. BIC | (sin page_id) | SOMOS NETWORKS COLOMBIA S.A.S. BIC | - |
| 1.00 | 900886219 (nit) | RURALINK S.A.S | 32595153c5cd81179453c8a64b3394d1 | Ruralink | nombre |
| 1.00 | 900313208 (nit) | INSITEL S.A.S. | (sin page_id) | INSITEL S.A.S. | - |
| 1.00 | 900548752 (nit) | TV COLOMBIA DIGITAL SAS | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | - |
| 1.00 | 900163149 (nit) | SP SISTEMAS PALACIOS LTDA. | 30c95153c5cd81448905ff2265ab110c | SP SISTEMAS PALACIOS LTDA | nombre |
| 1.00 | 900776951 (nit) | VELONET S.A.S | 28b95153c5cd804a9920d1b69f623c0a | Velonet | nombre |
| 1.00 | 900943073 (nit) | M@STV PRODUCCIONES SAS | (sin page_id) | M@STV PRODUCCIONES S.A.S | nombre |
| 1.00 | 800179562 (nit) | LEGON TELECOMUNICACIONES S.A.S. | 29d95153c5cd8070915be09a7f1bb9b7 | Legon Telecomunicaciones | nombre |
| 1.00 | 805000582 (nit) | CODISERT S.A. | 32595153c5cd81c99c1ff99b2291a95f | Codisert SA | nombre |
| 1.00 | 900550968 (nit) | CABLE EXITO SAS | (sin page_id) | Cable Éxito | nombre |
| 1.00 | 900539589 (nit) | CABLEMAS S.A.S | 28f95153c5cd80959a8bd2131dbc9f8c | Cablemas | nombre |
| 1.00 | 901269582 (nit) | INTERCOL WISP S.A.S. | (sin page_id) | INTERCOL WISP S.A.S. | - |
| 1.00 | 901105368 (nit) | HS NETWORKS SAS | 30c95153c5cd81a2b138f5b231a80256 | HS NETWORKS SAS | - |
| 1.00 | 901544934 (nit) | GIGA FIBRA SAS | 30c95153c5cd81ce9669de770c627aa7 | GIGA FIBRA SAS | - |
| 1.00 | 900971687 (nit) | HUGHES DE COLOMBIA S.A.S. | (sin page_id) | HUGHES DE COLOMBIA S.A.S. | - |
| 1.00 | 900502634 (nit) | NET ISP SAS | (sin page_id) | NET ISP S.A.S | nombre |
| 1.00 | 830502580 (nit) | FUTURE SOLUTIONS DEVELOPMENT S.A.S. | 30c95153c5cd812094fbdbbe121c9c8d | FUTURE SOLUTIONS DEVELOPMENT SAS | nombre |
| 1.00 | 900813668 (nit) | AMERICANA DE TECNOLOGIA Y COMUNICACIONES SAS | 30c95153c5cd81269ef3f66c24d0c042 | AMERICANA DE TECNOLOGIA Y COMUNICACIONES SAS | - |
| 1.00 | 900867741 (nit) | WISP TELECOMUNICACIONES SAS | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 1.00 | 901289465 (nit) | INTERCARIBE TV S.A.S. | (sin page_id) | INTERCARIBE TV S.A.S. | - |
| 1.00 | 900291713 (nit) | AVIDTEL E.U. | (sin page_id) | AVIDTEL E.U. | - |
| 1.00 | 900641220 (nit) | KALU DE COLOMBIA SAS | 30c95153c5cd81c3a279c4ec31ed3e13 | KALU DE COLOMBIA SAS | - |
| 1.00 | 900356400 (nit) | SERVICIOS PROFESIONALES WICOM S.A.S | (sin page_id) | SERVICIOS PROFESIONALES WICOM S.A.S. | nombre |
| 1.00 | 900482761 (nit) | WIRELESS COLOMBIA S.A.S. | (sin page_id) | WIRELESS COLOMBIA S.A.S. | - |
| 1.00 | 900644312 (nit) | INTERCOMM DE NARIÑO SAS | 30c95153c5cd81ecbeeae949603fae60 | INTERCOMM DE NARINO SAS | nombre |
| 1.00 | 900704791 (nit) | GRUPO TV MAX S.A.S. | 31995153c5cd80998acfc9a89d62bf62 | GRUPO TV MAX | nombre |
| 1.00 | 900554142 (nit) | SERVYCOM COLOMBIA SAS | (sin page_id) | SERVYCOM COLOMBIA S.A.S | nombre |
| 1.00 | 901201509 (nit) | GUAJIRANET ISP SAS | (sin page_id) | GUAJIRANET ISP S.A.S. | nombre |
| 1.00 | 900068083 (nit) | TIERRANET S.A.S. | (sin page_id) | Tierranet S.A.S. | nombre |
| 1.00 | 901320436 (nit) | WAYIRA NET S.A.S | (sin page_id) | WAYIRA NET S.A.S. | nombre |
| 1.00 | 900609431 (nit) | BETEL SOLUCIONES S.A.S. | (sin page_id) | BETEL SOLUCIONES S.A.S | nombre |
| 1.00 | 900194953 (nit) | REDETEK SAS | 30c95153c5cd81f7b764f017a6bc2501 | REDETEK SAS | - |
| 1.00 | 900381389 (nit) | SISTEMAS AVANZADOS EN TELECOMUNICACIONES S.A.S | (sin page_id) | SISTEMAS AVANZADOS EN TELECOMUNICACIONES S.A.S | - |
| 1.00 | 901290797 (nit) | FIBRANETPLUS S.A.S. | (sin page_id) | FIBRANETPLUS S.A.S. | - |
| 1.00 | 900411710 (nit) | ITELKOM S.A.S. | 30c95153c5cd81af89c6d262ac72e220 | ITELKOM | nombre |
| 1.00 | 901169030 (nit) | WALIX S.A.S. | 29395153c5cd807fb0d9e2b6e37c1fcf | Walix | nombre |
| 1.00 | 901306623 (nit) | IMPORIENTE SOLUCIONES GLOBALES S.A.S | 30c95153c5cd81efba28fd21f9927256 | IMPORIENTE SOLUCIONES GLOBALES SAS | nombre |
| 1.00 | 901233453 (nit) | CHANNEL PLUS S.A.S | 29695153c5cd80f49929f5ed0060c499 | Channel Plus | nombre |
| 1.00 | 901798042 (nit) | SURFLINK SAS | 32695153c5cd801bbc53f0c14ce282aa | Surflink | nombre |
| 1.00 | 900999305 (nit) | BLUE TELECOMUNICACIONES S.A.S. | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 1.00 | 901303131 (nit) | GRUPO SERVINET S.A.S. | 32f95153c5cd802c926efadeed9cfebc | Grupo servinet | nombre |
| 1.00 | 901132952 (nit) | INTTEL GO S A S | 30c95153c5cd8174b950d127129d4ff7 | INTTEL GO SAS | nombre |
| 1.00 | 901419315 (nit) | HOLA WE DIGITAL S.A.S | (sin page_id) | HOLA WE DIGITAL S.A.S. | nombre |
| 1.00 | 900989681 (nit) | SUNNOVA SAS | 30c95153c5cd8135a5c8dac236ee0773 | SUNNOVA SAS | - |
| 1.00 | 900536302 (nit) | COLOMBIATEL TELECOMUNICACIONES S.A.S. | 30c95153c5cd81059e4dc86ff6f069a5 | COLOMBIATEL TELECOMUNICACIONES | nombre |
| 1.00 | 901183331 (nit) | UNICABLE H.D. SAS | (sin page_id) | UNICABLE H.D. SAS | - |
| 1.00 | 900553863 (nit) | INTERMEGAMUNDO PARTNERS SAS | (sin page_id) | INTERMEGAMUNDO PARTNERS S.A.S. | nombre |
| 1.00 | 830136839 (nit) | VISION SATELITAL COMUNICACIONES S.A.S. | (sin page_id) | VISION SATELITAL COMUNICACIONES S.A.S. | - |
| 1.00 | 900598459 (nit) | AYSATEC TELECOMUNICACIONES S.A.S. | (sin page_id) | AYSATEC TELECOMUNICACIONES S.A.S. | - |
| 1.00 | 900165920 (nit) | INTERLANS S.A.S. | (sin page_id) | INTERLANS S.A.S | nombre |
| 1.00 | 901106096 (nit) | CABLENETBAG S.A.S | 32595153c5cd81478f36d6761a4c15f7 | Cablenetbag SAS | nombre |
| 1.00 | 815001640 (nit) | CABLE CAUCA COMUNICACIONES SA | (sin page_id) | CABLE CAUCA COMUNICACIONES S.A.S. | nombre |
| 1.00 | 900245045 (nit) | IP TECHNOLOGIES SAS | 2ed95153c5cd8041a34de133209292d7 | IP Technologies | nombre |
| 1.00 | 901600331 (nit) | INTERNET Y TELEVISION S.A.S. | (sin page_id) | Internet y Televisión SAS | nombre |
| 1.00 | 900601506 (nit) | RED PLANET TELECOMUNICACIONES SAS | (sin page_id) | RED PLANET TELECOMUNICACIONES S.A.S. | nombre |
| 1.00 | 901299882 (nit) | INTERYA S.A.S | (sin page_id) | INTERYA S.A.S | - |
| 1.00 | 900979388 (nit) | VIVO TELECOMUNICACIONES S.A.S. | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | - |
| 1.00 | 900009246 (nit) | CONECTECH C3J S.A.S. | 34295153c5cd80758b6ced883a62d086 | CONECTECH C3J | nombre |
| 1.00 | 901419454 (nit) | GRUPO COLIBRI S.A.S | (sin page_id) | Grupo Colibrí SAS | nombre |
| 1.00 | 827000325 (nit) | TV ISLA LTDA | 32395153c5cd804db4b3fc74bc627d61 | TV Isla | nombre |
| 1.00 | 900435353 (nit) | MEGARED DE COLOMBIA SAS | (sin page_id) | MEGARED DE COLOMBIA S.A.S. | nombre |
| 1.00 | 900476610 (nit) | GENIONET TELECOMUNICACIONES SAS | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 1.00 | 901584978 (nit) | FIBRARED PLUS TELECOMUNICACIONES S.A.S. | (sin page_id) | FIBRARED PLUS TELECOMUNICACIONES S.A.S. | - |
| 1.00 | 901399109 (nit) | BUHO NETWORK SAS | (sin page_id) | BUHO NETWORK S.A.S | nombre |
| 1.00 | 900588322 (nit) | GLOBAL RAICES S.A.S | 28b95153c5cd80e4bee6d8426781cb24 | Global Raices | nombre |
| 1.00 | 900516657 (nit) | COMERCIALIZADORA ENTRETENIMIENTO Y COMUNICACIONES SAS | 30c95153c5cd81ff9ae1dc1238e14dd5 | COMERCIALIZADORA ENTRETENIMIENTO Y COMUNICACIONES | nombre |
| 1.00 | 900238624 (nit) | CENTRAL DE SERVICIOS DIGITALES S.A.S. | (sin page_id) | CENTRAL DE SERVICIOS DIGITALES S.A.S. | - |
| 1.00 | 901172674 (nit) | DIGITAL DOT GROUP S.A.S | 30c95153c5cd81f18c62e25aaa6e1625 | DIGITAL DOT GROUP SAS | nombre |
| 1.00 | 901240001 (nit) | QUALITY NET JM S.A.S. ZOMAC | (sin page_id) | QUALITY NET JM S.A.S. ZOMAC | - |
| 1.00 | 901173290 (nit) | PLANET TELECOM COLOMBIA S.A.S. | (sin page_id) | PLANET TELECOM COLOMBIA S.A.S | nombre |
| 1.00 | 901492313 (nit) | ANTIOQUEÑA DE TELECOMUNICACIONES S.A.S. | (sin page_id) | ANTIOQUENA DE TELECOMUNICACIONES S.A.S. | nombre |
| 1.00 | 900474867 (nit) | ENTER TELECOMUNICACIONES BANDA ANCHA SAS | 30c95153c5cd817298f8e327dad2b80d | ENTER TELECOMUNICACIONES BANDA ANCHA SAS | - |
| 1.00 | 900295100 (nit) | M&M INVERSIONES MORENO S.A.S | 30c95153c5cd810c96efe4044379c4d8 | M&M INVERSIONES MORENO SAS | nombre |
| 1.00 | 901328339 (nit) | POLINET TELECOMUNICACIONES COLOMBIA SAS | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | - |
| 1.00 | 901776948 (nit) | BITEL DE COLOMBIA S.A.S. | (sin page_id) | BITEL DE COLOMBIA S.A.S | nombre |
| 1.00 | 901324311 (nit) | DIGITAL COAST S.A.S. | 38a95153c5cd81b99380d5227160b6de | DIGITAL COAST SAS | nombre |
| 1.00 | 900758601 (nit) | GLOBALTRONIK S.A.S | 30c95153c5cd81cabedae0158c5cd1cf | GLOBALTRONIK SAS | nombre |
| 1.00 | 900298747 (nit) | ACCESS DIGITAL S.A.S | 30c95153c5cd81ac9b82f707c4694f85 | ACCESS DIGITAL SAS | nombre |
| 1.00 | 901452751 (nit) | AMO COMUNICACIONES S.A.S. | 28d95153c5cd80e5820ddac9d3e7bb92 | Amo Comunicaciones | nombre |
| 1.00 | 901144723 (nit) | JASTANET SAS | 38295153c5cd811f9923d033f6cb09ae | JASTANET SAS | - |
| 1.00 | 901221916 (nit) | REGIONAL DE SERVICIOS DE TELECOMUNICACIONES ZOMAC S.A.S | 30c95153c5cd816e9db4fe9967dba73f | REGIONAL DE SERVICIOS TELECOMUNICACIONES ZOMAC | nombre |
| 1.00 | 901397346 (nit) | AJ GLOBAL PROYECTOS NET S.A.S. | 32595153c5cd81fc98e6e581dc2d0b84 | AJ Global Proyectos Net SAS | nombre |
| 1.00 | 830119051 (nit) | AXESAT S.A. | (sin page_id) | AXESAT S.A | nombre |
| 1.00 | 901372998 (nit) | CONEXIÓN TOTAL A INTERNET S.A.S | (sin page_id) | CONEXION TOTAL A INTERNET S.A.S. | nombre |
| 1.00 | 901062418 (nit) | TELENET DIGITAL S.A.S. | (sin page_id) | TELENET DIGITAL S.A.S | nombre |
| 1.00 | 901334409 (nit) | FIBERNET ISP ZOMAC SAS | 32595153c5cd801188ebedcc5a2b67a0 | Fibernet - isp | nombre |
| 1.00 | 900626134 (nit) | WISP INTEGRADORES S.A.S | 34b95153c5cd8058874bf88871ac4090 | Wisp integradores | nombre |
| 1.00 | 900374679 (nit) | REDSI TELECOMUNICACIONES S.A.S. | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 1.00 | 900887241 (nit) | GLOBALWIFI SAS | 33c95153c5cd80389840f5230fc7c2b0 | Globalwifi | nombre |
| 1.00 | 900757906 (nit) | TELECOMUNICACIONES E INTERNET DE COLOMBIA SAS | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 1.00 | 900987372 (nit) | VALLE TELECOMUNICACIONES SAS | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | - |
| 1.00 | 900704716 (nit) | SISTEMAS COMPUTARIZADOS DEL HUILA S.A.S. | (sin page_id) | SISTEMAS COMPUTARIZADOS DEL HUILA S.A.S. | - |
| 1.00 | 901306546 (nit) | CLIK TELECOMUNICACIONES SAS | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 1.00 | 901192982 (nit) | MEGAENLACES SAS | (sin page_id) | Megaenlaces S.A.S. | nombre |
| 1.00 | 901110526 (nit) | SIMECT GROUP REDES E INTERNET SAS | (sin page_id) | SIMECT GROUP REDES E INTERNET S.A.S | nombre |
| 1.00 | 900972509 (nit) | CARIBETECH S.A.S. | 28d95153c5cd8008b92cfc3c3c0c8808 | Caribetech | nombre |
| 1.00 | 900982066 (nit) | ZONALIBRE INGENIERIA S.A.S | (sin page_id) | ZONALIBRE INGENIERIA S.A.S. | nombre |
| 1.00 | 900710665 (nit) | JEFFERSON AFE S.A.S | 28b95153c5cd803b9de1deca73bcebdf | Jefferson AFE SAS | nombre |
| 1.00 | 901227818 (nit) | SITELINKS SAS | 28f95153c5cd807db38ef2d575dcf903 | Sitelinks | nombre |
| 1.00 | 900785014 (nit) | TERAWI S.A.S | 32795153c5cd805fa000c12c69227e75 | TERAWI | nombre |
| 1.00 | 901782048 (nit) | DIGITAL RED S.A.S | (sin page_id) | Digital Red  | nombre |
| 1.00 | 900823789 (nit) | CAMPOCOM SAS | 32595153c5cd81f48537ea9c43b63eb3 | CAMPOCOM SAS | - |
| 1.00 | 900676962 (nit) | COMUNICACIONES WIFI COLOMBIA S.A.S. | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 1.00 | 901328030 (nit) | DISTRIBUCIÓN, EFICIENCIA Y CALIDAD S.A.S. | (sin page_id) | Distribución, Eficiencia y Calidad S.A.S. | nombre |
| 1.00 | 901309372 (nit) | WIFI ALTERNATIVO VALLE S.A.S | 35795153c5cd80cd9623e1c8fa9bef5c | Wifi Alternativo Valle | nombre |
| 1.00 | 900882438 (nit) | MAKRO SISTEM S.A.S | 29e95153c5cd809491c5cf697037fa6d | Makro Sistem | nombre |
| 1.00 | 900882990 (nit) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | - |
| 1.00 | 900541689 (nit) | ITEC SOLUTIONS SAS | (sin page_id) | ITEC SOLUTIONS S.A.S. | nombre |
| 1.00 | 900999224 (nit) | RENTIC S.A.S. | (sin page_id) | RENTIC S.A.S. | - |
| 1.00 | 900195679 (nit) | GTD COLOMBIA S.A.S. | (sin page_id) | GTD COLOMBIA S.A.S | nombre |
| 1.00 | 901257274 (nit) | TRANSPORTE DE INTERNET Y MEDIOS TECNOLOGICOS S.A.S | 30c95153c5cd817c9997ef58a2e31d46 | TRANSPORTE DE INTERNET Y MEDIOS TECNOLOGICOS | nombre |
| 1.00 | 900677172 (nit) | EVERNET S.A.S. | 30c95153c5cd8114a680f26c2082a49e | EVERNET SAS | nombre |
| 1.00 | 901170983 (nit) | TOTAL BAND COMUNICACIONES S.A.S | 30c95153c5cd81ff9434eb842ad4355b | TOTAL BAND COMUNICACIONES SAS | nombre |
| 1.00 | 805030547 (nit) | REDES TV SAT S.A.S | 33695153c5cd80ada30edcfa78d9d5ca | REDES TV SAT | nombre |
| 1.00 | 901436411 (nit) | LA RED.G TELECOMUNICACIONES S.A.S | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 1.00 | 901403469 (nit) | WINS SOLUCIONES SAS | 32595153c5cd81a7bd75f8bb4e7ce630 | WINS SOLUCIONES SAS | - |
| 1.00 | 901275489 (nit) | NETSLINK S.A.S | 2aa95153c5cd80368d9fe89b216432bd | NETSLINK | nombre |
| 1.00 | 901340122 (nit) | FIBER NET COMUNICACIÓN SUPERIOR S.A.S | (sin page_id) | FIBER NET COMUNICACIÓN SUPERIOR | nombre |
| 1.00 | 901582277 (nit) | INGENIANET SAS | 32595153c5cd81a19bcaf6605b6f7083 | Ingenianet SAS | nombre |
| 1.00 | 900495230 (nit) | NETWORK CONNEXIONS SAS | 30c95153c5cd81f8a6cbc3bf45486211 | NETWORK CONNEXIONS SAS | - |
| 1.00 | 823002917 (nit) | TV MOJANA S.A.S | 32595153c5cd81159a04f4dfa3d10323 | TV Mojana SAS | nombre |
| 1.00 | 901393892 (nit) | U2RED S.A.S | 28b95153c5cd8055883de988aac88467 | U2Red | nombre |
| 1.00 | 901274410 (nit) | SERVINET REDES Y SISTEMAS SAS ZOMAC | 32595153c5cd8136b7c4e3afb2ecf80e | Servinet Redes y Sistemas SAS | nombre |
| 1.00 | 900837789 (nit) | SERVIRED 3D SAS | 28b95153c5cd80708d1afbb542d643de | Servired 3D | nombre |
| 1.00 | 901250955 (nit) | TELEPUEBLORRICO S.A.S. | 32995153c5cd80058bc7e74516606894 | Telepueblorrico | nombre |
| 1.00 | 901273425 (nit) | FIBRAWISP S.A.S | 34195153c5cd80e79e58fc72d3db18bb | Fibrawisp | nombre |
| 1.00 | 901434853 (nit) | MEDIOS TV.NET S.A.S | 32595153c5cd8170a3dac979a92ff888 | Medios TV Net | nombre |
| 1.00 | 901162945 (nit) | BITEM COMUNICACIONES SAS | (sin page_id) | BITEM COMUNICACIONES S.A.S. | nombre |
| 1.00 | 901048373 (nit) | SINURED SOLUCIONES S.A.S. | 30c95153c5cd81af8b9eec9b46eba779 | SINURED SOLUCIONES SAS | nombre |
| 1.00 | 800139802 (nit) | GENESIS DATA LTDA | 30c95153c5cd81b7b632ec39a4ab34ee | Genesis Data SAS | nombre |
| 1.00 | 900630575 (nit) | WIFIMAX S.A.S. | 2b195153c5cd8095b236d46304903f81 | Wifimax | nombre |
| 1.00 | 901527535 (nit) | COBERNET SAS | 32595153c5cd80e7816cc4842b6593ed | Cobernet | nombre |
| 1.00 | 901188532 (nit) | REDINET COMUNICACIONES S.A.S | 32595153c5cd8130b781c2af98d5c525 | Redinet Comunicaciones | nombre |
| 1.00 | 900652376 (nit) | TELECOMUNICACIONES DEL CATATUMBO S.A.S. | (sin page_id) | TELECOMUNICACIONES DEL CATATUMBO S.A.S | nombre |
| 1.00 | 901384645 (nit) | INTERREDES SOLUCIONES INTEGRALES S.A.S. | 30c95153c5cd8109b861c421216fc34a | INTERREDES SOLUCIONES INTEGRALES SAS | nombre |
| 1.00 | 900369578 (nit) | AULAS DIGITALES DE COLOMBIA LTDA | 30c95153c5cd8193ad97ed0b4f0f5c15 | AULAS DIGITALES DE COLOMBIA SAS | nombre |
| 1.00 | 901254159 (nit) | CIBERFIBRA S.A.S | 28d95153c5cd80238c78d47298e012dc | Ciberfibra | nombre |
| 1.00 | 901778452 (nit) | JFB COMUNICACIONES S.A.S | 32595153c5cd81a5b838df2ece40cdc3 | JFB COMUNICACIONES | nombre |
| 1.00 | 901490938 (nit) | GLOBAL NET TV ZOMAC S.A.S | (sin page_id) | GLOBAL NET TV ZOMAC S.A.S | - |
| 1.00 | 901301680 (nit) | MACK WIFI S.A.S | 32595153c5cd817eb104da3838625572 | Mack Wifi SAS | nombre |
| 1.00 | 901009357 (nit) | IPCOM SISTEMAS S.A.S | 31995153c5cd802486f3c0de8a9eca47 | IPCOM SISTEMAS | nombre |
| 1.00 | 901466076 (nit) | IRP - ONE S.A.S | (sin page_id) | IRP - ONE S.A.S. | nombre |
| 1.00 | 900669501 (nit) | JIGARTEL S.A.S. | 33b95153c5cd80e7a392e2e5a3c20a5f | Jigartel | nombre |
| 1.00 | 901282287 (nit) | LEOWISP SAS | 30c95153c5cd8111897ad7bd7979b056 | LEOWISP SAS | - |
| 1.00 | 901749661 (nit) | WAO INTERNET S.A.S | (sin page_id) | WAO INTERNET S.A.S. | nombre |
| 1.00 | 900645312 (nit) | LINAGE COMUNICACIONES SAS | 28b95153c5cd80a6b95cfe67f73d1319 | Linage Comunicaciones | nombre |
| 1.00 | 901837690 (nit) | COLOMBIACOM S.A.S. | 37695153c5cd80fc87b9c58d2c097c55 | Colombiacom | nombre |
| 1.00 | 900161298 (nit) | NET&COM LTDA. | (sin page_id) | NET&COM LTDA. | - |
| 1.00 | 901366169 (nit) | ZAFIRO TELECOMUNICACIONES SAS | 2a395153c5cd801d80fbfcf3add7e4b0 | Zafiro Telecomunicaciones | nombre |
| 1.00 | 800255754 (nit) | SENCINET LATAM COLOMBIA S.A | (sin page_id) | SENCINET LATAM COLOMBIA S.A. | nombre |
| 1.00 | 901204922 (nit) | GEDCOM S.A.S | (sin page_id) | GEDCOM S.A.S | - |
| 1.00 | 901234851 (nit) | AIM CONNECT SAS | 32595153c5cd81db87a0fb132d4cdc5f | AIM Connect | nombre |
| 1.00 | 901498720 (nit) | RED ONLINE MST S.A.S. | 32595153c5cd819f85eefffd31a463f8 | RED ONLINE MST | nombre |
| 1.00 | 901396499 (nit) | SERVINET MED SAS | 35a95153c5cd80d28b36cc063ffc2be6 | Servinet Med | nombre |
| 1.00 | 830030718 (nit) | MERCANET SAS | 30c95153c5cd811d96d1d447e5658f11 | MERCANET LTDA | nombre |
| 1.00 | 900721017 (nit) | WISPER INTERNET INALAMBRICO S.A.S | (sin page_id) | WISPER INTERNET INALAMBRICO S.A.S | - |
| 1.00 | 901685399 (nit) | UICOM S.A.S | (sin page_id) | UICOM S.A.S. | nombre |
| 1.00 | 901862736 (nit) | FIBERCOM COLOMBIA S.A.S | (sin page_id) | FIBERCOM COLOMBIA S.A.S | - |
| 1.00 | 901010072 (nit) | REDES Y TELECOMUNICACIONES INGENIERÍA SAS | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 1.00 | 900258177 (nit) | GLOBENET CABOS SUBMARINOS COLOMBIA S.A.S. | 30c95153c5cd8176bea1c7b79de5bb2d | GlobeNet Cabos Submarinos Colombia | nombre |
| 1.00 | 901721244 (nit) | DLRNETWORK TELECOMUNICACIONES SAS BIC | 28e95153c5cd806b82e1dfbe1909c573 | dlrnetwork telecomunicaciones | nombre |
| 1.00 | 901252680 (nit) | TV&MÁS S.A.S | (sin page_id) | TV&MAS S.A.S | nombre |
| 1.00 | 901414077 (nit) | CABLE NETWORKLEK SAS | 32595153c5cd81e9a6e8d65ce753f7a5 | CABLE NETWORKLEK SAS | - |
| 1.00 | 901483116 (nit) | WEB MASTER COLOMBIA SAS | 30c95153c5cd81a58fcbd41429bb577a | WEB MASTER COLOMBIA SAS | - |
| 1.00 | 900321279 (nit) | COMSSET COMUNICACIONES SAS | 30c95153c5cd816791f3ca7eba8d2330 | COMSSET COMUNICACIONES SAS | - |
| 1.00 | 901686550 (nit) | EXPERTOS EN TECNOLOGIA Y TELECOMUNICACIONES S.A.S | 30c95153c5cd81478f73f93036d31010 | EXPERTOS EN TECNOLOGIA Y TELECOMUNICACIONES | nombre |
| 1.00 | 901323159 (nit) | IN QUALITY TELECOMUNICATIONS S.A.S. ZOMAC BIC | (sin page_id) | IN QUALITY TELECOMUNICATIONS S.A.S. | nombre |
| 1.00 | 830092170 (nit) | DIGITEL | 30c95153c5cd81f4a8f6faa8c2ff9cb5 | DIGITEL | - |
| 1.00 | 900349030 (nit) | CDNEXT | 30c95153c5cd81958b0cc71cbd3ab3e6 | CDNEXT | - |
| 1.00 | 901804122 (nit) | OMIX SAS | 30c95153c5cd81668914d6c66d1a3ec9 | OMIX SAS | - |
| 1.00 | 901160151 (nit) | CONEXION FIBRA S.A.S | (sin page_id) | CONEXION FIBRA S.A.S | - |
| 1.00 | 901637227 (nit) | ORINOCO VENTURES GROUP SAS | 30c95153c5cd8197b72cc2f634ba3e01 | ORINOCO VENTURES GROUP SAS | - |
| 1.00 | 901688947 (nit) | VALLE ISP S.A.S. | (sin page_id) | VALLE ISP S.A.S. | - |
| 1.00 | 825000630 (nit) | TV CABLE VILLANUEVA S.A.S TVIDIGITAL | (sin page_id) | TV CABLE VILLANUEVA S.A.S TVIDIGITAL | - |
| 1.00 | 800233552 (nit) | CORPORACION CAPSOS TELECOMUNICACIONES | 30c95153c5cd81dbb013e658f7018865 | CORPORACION CAPSOS TELECOMUNICACIONES | - |
| 1.00 | 800204278 (nit) | METROTEL SA ESP | 30c95153c5cd810d9218cfdad69569d5 | Metrotel SA ESP | nombre |
| 1.00 | 900738230 (nit) | FIBERTIC S.A.S. | (sin page_id) | FIBERTIC S.A.S. | - |
| 1.00 | 900747460 (nit) | TERABYTE COMUNICACIONES SAS | (sin page_id) | TERABYTE COMUNICACIONES S.A.S | nombre |
| 1.00 | 901336762 (nit) | NEXXT-WISP S.A.S | 33c95153c5cd8021a7dffa471cffd06d | Nexxt Wisp | nombre |
| 1.00 | 900457160 (nit) | SIMPLE COMUNICACIONES SAS | (sin page_id) | SIMPLE COMUNICACIONES S.A.S.  | nombre |
| 1.00 | 901960145 (nit) | EMCOLTEC | 30b95153c5cd8019aaf3f831bc15824b | Emcoltec | nombre |
| 1.00 | MB_019d02c2-9463-7257-a3d7-4cf02104c633 (metabase_uuid) | CONECTV | (sin page_id) | ConecTV  | nombre |
| 1.00 | 9990000020 (interno) | Fidelity network | 32595153c5cd8008af33dc0791d146fb | Fidelity network | - |
| 1.00 | 9990000050 (interno) | Novacom | 2cb95153c5cd804aa1bbe2a778ba232c | Novacom | - |
| 1.00 | 9990000043 (interno) | Intel Go | 29b95153c5cd8085a762f91132df8c8b | Intel Go | - |
| 1.00 | 9990000047 (interno) | Macro Redes | 28d95153c5cd8015b6bef45e4380ca5f | Macro Redes | - |
| 1.00 | 9990000031 (interno) | Don Pago | 28c95153c5cd8076ba85fc17be2db78c | Don Pago | - |
| 1.00 | 9990000022 (interno) | Balcom SAS | 32595153c5cd81748575e58ab8e83395 | Balcom SAS | - |
| 1.00 | 9990000070 (interno) | Sumec Navigator | 32595153c5cd81d5bf0cce205a8047a7 | Sumec Navigator | - |
| 1.00 | 9990000081 (interno) | You Internet | 2f795153c5cd8097b8c3d13e9f882139 | You Internet | - |
| 1.00 | 9990000069 (interno) | Soy Net | 29595153c5cd8083b760d921dd00e719 | Soy Net | - |
| 1.00 | 9990000049 (interno) | Netpro | 28d95153c5cd8001a990e1fdf90f96e6 | Netpro | - |
| 1.00 | 9990000052 (interno) | Ospicom | 29995153c5cd8074ba4ac21296fdbc98 | Ospicom | - |
| 1.00 | 9990000029 (interno) | Cristian Padua ISP | 28d95153c5cd80a581ecf3ffe8e8282a | Cristian Padua ISP | - |
| 1.00 | 9990000071 (interno) | Sur Conexión | (sin page_id) | Sur Conexión | - |
| 1.00 | 9990000021 (interno) | AlpaSurfnet | 2a595153c5cd80fda55cf5db5d7c874f | AlpaSurfnet | - |
| 1.00 | 9990000075 (interno) | Telepon | 28d95153c5cd80aa963bf4c3532fe01f | Telepon | - |
| 1.00 | 9990000028 (interno) | Conexiones Dedicadas SAS | 32595153c5cd81d7aa19df4b90b217dd | Conexiones Dedicadas SAS | - |
| 1.00 | 9990000061 (interno) | Servicios y Suministros NYD LTDA | 32595153c5cd81169a89e463b1e7a19d | Servicios y Suministros NYD LTDA | - |
| 1.00 | 9990000057 (interno) | Sato | 29295153c5cd80f38c98eb8d93b4492f | Sato | - |
| 1.00 | 9990000072 (interno) | Systelcomunicaciones | 32595153c5cd8147bb74ca7b2ee4c8e5 | Systelcomunicaciones | - |
| 1.00 | 9990000046 (interno) | Latic | 29495153c5cd80a1a6a1f1634aeee321 | Latic | - |
| 1.00 | 9990000077 (interno) | Ubanet SAS | 32595153c5cd8109af72dd5fa07ac0de | Ubanet SAS | - |
| 1.00 | 9990000066 (interno) | SITI CONEXION SAS | 32595153c5cd81f89abfdc28bbc5f7a4 | SITI CONEXION SAS | - |
| 1.00 | 9990000079 (interno) | Wifigo | 32595153c5cd81bd8a55ee0c6ef9709f | Wifigo | - |
| 1.00 | 9990000040 (interno) | Fastnet PTX | 2a495153c5cd8034b12bdaf3c78b08c1 | Fastnet PTX | - |
| 1.00 | 9990000058 (interno) | SAT Comunicaciones | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | - |
| 1.00 | 9990000024 (interno) | Camara de Comercio Pereira | 2a795153c5cd80d58f3bf83e7c35388b | Camara de Comercio Pereira | - |
| 1.00 | 9990000026 (interno) | Colomtel | 28d95153c5cd80a0967fe108488b98c7 | Colomtel | - |
| 1.00 | 9990000036 (interno) | Esmitel | 28d95153c5cd8020b3ccf9025a81f5ec | Esmitel | - |
| 1.00 | 9990000023 (interno) | BYTM TELECOMUNICACIONES | (sin page_id) | BYTM TELECOMUNICACIONES  | - |
| 1.00 | 9990000083 (interno) | Zomac S.A.S | (sin page_id) | Zomac S.A.S | - |
| 1.00 | 9990000042 (interno) | Innovación y Progreso | (sin page_id) | Innovación y Progreso | - |
| 1.00 | 9990000060 (interno) | Serkoi | 2b595153c5cd800d812fc6e3dba0457c | Serkoi | - |
| 1.00 | 9990000044 (interno) | Interconexiones Tecnológicas del Caribe SAS | (sin page_id) | Interconexiones Tecnológicas del Caribe SAS | - |
| 1.00 | 9990000068 (interno) | Solutronic SAS | 32595153c5cd81a5b7c1e641cb5d0b63 | Solutronic SAS | - |
| 1.00 | 9990000033 (interno) | Edutecnica | 34b95153c5cd80ff87e2d6d41bdeaef8 | Edutecnica | - |
| 1.00 | 9990000034 (interno) | EPM | 34295153c5cd80fdbb6fceca8d701e5f | EPM | - |
| 1.00 | 9990000065 (interno) | SISTEMAS CONEMTEL SAS | 32595153c5cd8168850df7c1684a9f81 | SISTEMAS CONEMTEL SAS | - |
| 1.00 | 9990000059 (interno) | Segitel | 33495153c5cd8008a683e369c10fa1e9 | Segitel | - |
| 1.00 | 9990000048 (interno) | Megas Exprés Telecomunicaciones | (sin page_id) | Megas Exprés Telecomunicaciones | - |
| 1.00 | 9990000064 (interno) | Siscohuila | 2ff95153c5cd8088913ad83e30fc10ae | Siscohuila | - |
| 1.00 | 9990000045 (interno) | JASZ COMUNICACIONES | 32595153c5cd812aa73ccc4c9afbb4e4 | JASZ COMUNICACIONES | - |
| 1.00 | 9990000054 (interno) | Promovision | 32595153c5cd81e28e5ed2089ad0bc08 | Promovision | - |
| 1.00 | 9990000035 (interno) | ESMITECL S.A.S ZOMAC | (sin page_id) | ESMITECL S.A.S ZOMAC | - |
| 1.00 | 9990000067 (interno) | Solunet ISP | 34c95153c5cd803fac3bf5eef32fcfe3 | Solunet ISP | - |
| 1.00 | 9990000076 (interno) | Tricom Telecomunicaciones | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | - |
| 1.00 | 9990000008 (interno) | FXN Comunicaciones | 32595153c5cd815dbf85dce3d2ed207e | FXN Comunicaciones | - |
| 1.00 | 9990000015 (interno) | S&HURTADO | 31995153c5cd80c9ba98e8f906719dbb | S&HURTADO | - |
| 1.00 | 9990000007 (interno) | Emtel | 28d95153c5cd80838ed2f324f6b6a6e2 | Emtel | - |
| 1.00 | 9990000012 (interno) | Nova | 31895153c5cd801faee7f04640822671 | Nova | - |
| 1.00 | 9990000018 (interno) | VISS Telecomunicaciones S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 1.00 | 9990000002 (interno) | Cablenet SAS | 32595153c5cd814d85b2e9be8b012cb5 | CABLENET SAS | nombre |
| 1.00 | 9990000019 (interno) | Vivercom | (sin page_id) | Vivercom  | - |
| 1.00 | 9990000016 (interno) | Teleconect | 29d95153c5cd809c973defc32b900606 | TELECONECT | nombre |
| 1.00 | 9990000005 (interno) | Emcali (ISP) | 29695153c5cd808aa39dd626b853a432 | Emcali (ISP) | - |
| 1.00 | 9990000017 (interno) | Telin Colombia | 32595153c5cd8161a0cee6bb703845fa | TELIN COLOMBIA | nombre |
| 1.00 | 9990000003 (interno) | Contecom (Superlink) | 28d95153c5cd80e1a877f80a5e5837a9 | Contecom (Superlink) | - |
| 1.00 | 9990000006 (interno) | Empresa de Recursos Tecnologicos S.A E.S.P | (sin page_id) | EMPRESA DE RECURSOS TECNOLÓGICOS S.A E.S.P | nombre |
| 1.00 | 9990000010 (interno) | Linking Net | 32595153c5cd812f9e1fe089dafbd067 | LINKING NET | nombre |
| 1.00 | 9990000084 (interno) | Telecomplus | 29295153c5cd80b18316c01956b34890 | Telecomplus | - |
| 1.00 | 9990000088 (interno) | Click Conectividad | 32595153c5cd8190b9f6cf104b856443 | Click Conectividad | - |
| 1.00 | 9990000109 (interno) | Onred | 28e95153c5cd80be8eedc01b0148f239 | ONRED | nombre |
| 1.00 | 9990000111 (interno) | Interconectados | 34995153c5cd80d3a701dfb3d98b45b3 | Interconectados | - |
| 1.00 | 9990000112 (interno) | Nueva Era Soluciones | 33b95153c5cd80d7a7a0f379db5d237d | Nueva Era Soluciones | - |
| 1.00 | 9990000116 (interno) | Fibernet Ingeniería | (sin page_id) | Fibernet ingenieria  | nombre |
| 1.00 | 9990000117 (interno) | Mundo Mas | 32595153c5cd816bb12af4775da5b455 | Mundo Mas | - |
| 1.00 | 9990000119 (interno) | Befast | 35f95153c5cd800ea163fcc7b69c1c2f | Befast | - |
| 1.00 | 9990000122 (interno) | Redex | 33e95153c5cd804e919ff58c48305435 | Redex | - |
| 1.00 | 901641486 (nit) | CJC Telecomunicaciones | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | - |
| 1.00 | 9990000123 (interno) | KGB TELECOMUNICACIONES | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | - |
| 1.00 | 9990000124 (interno) | LIWA | 28d95153c5cd80849097fab5c0eff9b7 | LIWA | - |
| 1.00 | 9990000125 (interno) | UNIVERSIDAD MILITAR NUEVA GRANADA | 30c95153c5cd816d9fe6d1fa44f1e663 | UNIVERSIDAD MILITAR NUEVA GRANADA | - |
| 1.00 | 9990000126 (interno) | UNIVERSIDAD EAFIT | 30c95153c5cd81f9bc30cc50fee210e0 | UNIVERSIDAD EAFIT | - |
| 1.00 | 9990000127 (interno) | ESCUELA COLOMBIANA DE INGENIERIA JULIO GARAVITO | 30c95153c5cd81669e23dc419df9160a | ESCUELA COLOMBIANA DE INGENIERIA JULIO GARAVITO | - |
| 1.00 | 9990000128 (interno) | Universidad Autónoma de Bucaramanga | (sin page_id) | Universidad Autónoma de Bucaramanga | - |
| 1.00 | 9990000129 (interno) | PONTIFICIA UNIVERSIDAD JAVERIANA | 30c95153c5cd81539639f6b7a3a273d7 | PONTIFICIA UNIVERSIDAD JAVERIANA | - |
| 1.00 | 9990000132 (interno) | DataWare Sistemas S.A.S. | (sin page_id) | DataWare Sistemas S.A.S. | - |
| 1.00 | 9990000133 (interno) | RENOCA GROUP SRL | 30c95153c5cd817590ebc40b2e281e45 | RENOCA GROUP SRL | - |
| 1.00 | 9990000135 (interno) | ASESORIAS Y SERVICIOS TIC S.A.S | (sin page_id) | ASESORIAS Y SERVICIOS TIC S.A.S | - |
| 1.00 | 9990000136 (interno) | INTEGRA MULTISOLUTIONS S.A.S. | (sin page_id) | INTEGRA MULTISOLUTIONS S.A.S. | - |
| 1.00 | 9990000137 (interno) | CATON | 30c95153c5cd8178bbf5cedbd965d923 | CATON | - |
| 1.00 | 9990000138 (interno) | ITPROXIMUS | 30c95153c5cd81e79a9bce9126f481ae | ITPROXIMUS | - |
| 1.00 | 9990000139 (interno) | SCALAXY-AS | 30c95153c5cd8162a3cad6de8e967b29 | SCALAXY-AS | - |
| 1.00 | 9990000140 (interno) | INTEGRA TIC SOLUCIONES S.A.S. | (sin page_id) | INTEGRA TIC SOLUCIONES S.A.S. | - |
| 1.00 | 9990000141 (interno) | M247 | 30c95153c5cd816ca442e25a6ee55d9f | M247 | - |
| 1.00 | 9990000142 (interno) | EA-BOGOTA Electronic Arts Inc. | (sin page_id) | EA-BOGOTA Electronic Arts Inc. | - |
| 1.00 | 9990000143 (interno) | NETSKOPE Inc | 30c95153c5cd81ebb76dddeef18d2687 | NETSKOPE Inc | - |
| 1.00 | 9990000144 (interno) | Grupo Galaxia | 28e95153c5cd80018879c80e8403d097 | GRUPO GALAXIA | nombre |
| 1.00 | 9990000145 (interno) | GCP-ENTERPRISE Google LLC | 30c95153c5cd810ebac5e5a2e1ecfced | GCP-ENTERPRISE Google LLC | - |
| 1.00 | 9990000146 (interno) | NETPROTECT-DP Strong Technology LLC | 30c95153c5cd816daa54f22c57b91eeb | NETPROTECT-DP Strong Technology LLC | - |
| 1.00 | 9990000147 (interno) | ESSA | 35795153c5cd80c1a68bd51c711a06d3 | ESSA | - |
| 1.00 | 9990000147 (interno) | ESSA | 35795153c5cd80c1a68bd51c711a06d3 | ESSA | - |
| 1.00 | 9990000148 (interno) | T.V. SANV S A S ALPAVISION HD | (sin page_id) | T.V. SANV S A S ALPAVISION HD | - |
| 1.00 | 9990000149 (interno) | Sociedad Portuaria Regional de Cartagena | 30c95153c5cd81498562c32e4d81d528 | Sociedad Portuaria Regional de Cartagena | - |
| 1.00 | 9990000150 (interno) | ZEN-ECN Zenlayer Inc | 30c95153c5cd81ccbd3be4030c72ff70 | ZEN-ECN Zenlayer Inc | - |
| 1.00 | 9990000151 (interno) | SONDATECH S.A.S. | (sin page_id) | SONDATECH S.A.S. | - |
| 1.00 | 9990000152 (interno) | CALLTOPBX S.A.S. VIVERCOM | (sin page_id) | CALLTOPBX S.A.S. VIVERCOM | - |
| 1.00 | 9990000153 (interno) | SUR CONEXIÓN COLOMBIA | (sin page_id) | SUR CONEXIÓN COLOMBIA | - |
| 1.00 | 9990000154 (interno) | Inexa | 28d95153c5cd8058af43e8db2bb04863 | Inexa | - |
| 1.00 | 9990000155 (interno) | HISPASAT MEXICO S.A. de C.V. | (sin page_id) | HISPASAT MEXICO S.A. de C.V. | - |
| 1.00 | 9990000156 (interno) | Red Universitaria Alta Velocidad Valle del Cauca | 30c95153c5cd813397ebdf7826623281 | Red Universitaria Alta Velocidad Valle del Cauca | - |
| 1.00 | 9990000158 (interno) | AS-PEERING LATAM | 30c95153c5cd8187a136c0e4aaa330ac | AS-PEERING LATAM | - |
| 1.00 | 9990000160 (interno) | LINKUP INTERNET SRL | 30c95153c5cd8197a738eda1c2a1365e | LINKUP INTERNET SRL | - |
| 1.00 | 9990000161 (interno) | PACKETHUBSA PacketHub S.A. | (sin page_id) | PACKETHUBSA PacketHub S.A. | - |
| 1.00 | 9990000162 (interno) | SAMM TECNOLOGIA E TELECOMUNICACOES S.A | (sin page_id) | SAMM TECNOLOGIA E TELECOMUNICACOES S.A | - |
| 1.00 | 9990000163 (interno) | TELEMEDELLIN | 30c95153c5cd81ee9ca1e3133d3ab067 | TELEMEDELLIN | - |
| 1.00 | 9990000164 (interno) | S3WIRELESS COLOMBIA S.A | (sin page_id) | S3WIRELESS COLOMBIA S.A | - |
| 1.00 | 9990000165 (interno) | FERMAC TELECOMUNICACIONES S.A.S | (sin page_id) | FERMAC TELECOMUNICACIONES S.A.S | - |
| 1.00 | 9990000166 (interno) | KUATRO COMUNICACIONES | 30c95153c5cd8115bc79f6549232999c | KUATRO COMUNICACIONES | - |
| 1.00 | 9990000167 (interno) | COMUNICAMOS + TELECOMUNICACIONES SAS | 30c95153c5cd8132b0eff0f971dc7a7b | COMUNICAMOS + TELECOMUNICACIONES SAS | - |
| 1.00 | 9990000168 (interno) | COLOMBIANET | 30c95153c5cd81e28d4bf6b64dc5817c | COLOMBIANET | - |
| 1.00 | 9990000169 (interno) | CONSURED S.A.S. | (sin page_id) | CONSURED S.A.S. | - |
| 1.00 | 811016051 (nit) | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | - |
| 1.00 | 9990000170 (interno) | SATELITAL TELECOMUNICACIONES S.A.C | (sin page_id) | SATELITAL TELECOMUNICACIONES S.A.C | - |
| 1.00 | ntn-4157c57ed48a (interno) | Conexión Digital - One ISP | (sin page_id) | Conexión Digital - One ISP | - |
| 1.00 | ntn-266e1e294bd0 (interno) | Hola - Tu Fibra Grupo | 28b95153c5cd806a9ba5c3186024ec78 | Hola - Tu Fibra Grupo | - |
| 1.00 | ntn-3bb75421949d (interno) | Hola - PRT Telecomunicaciones | 28b95153c5cd80a8b28ff7ff9da90d3e | Hola - PRT Telecomunicaciones | - |
| 1.00 | ntn-677cb0cc1b6d (interno) | Hola - Red Net | 28b95153c5cd80879d81d3d064dc2d7a | Hola - Red Net | - |
| 1.00 | ntn-0de334ef3e49 (interno) | Hola - Hola Telecomunicaciones | 28b95153c5cd80dc8b33e9539d109955 | Hola - Hola Telecomunicaciones | - |
| 1.00 | ntn-fa074d8804b6 (interno) | Hola - Conectando Regiones | 28b95153c5cd805b84b7e7afd2029695 | Hola - Conectando Regiones | - |
| 1.00 | ntn-789a3b7e6711 (interno) | ÚLTIMO KILÓMETRO | (sin page_id) | ÚLTIMO KILÓMETRO | - |
| 1.00 | ntn-ee36b6572699 (interno) | Vivetel | 28d95153c5cd806ba1a0f9bbf215f6f4 | Vivetel | - |
| 1.00 | ntn-66b8e5141c67 (interno) | Sitimax/Imax | (sin page_id) | Sitimax/Imax | - |
| 1.00 | ntn-0d6b7fe647a4 (interno) | Servicios Informáticos del Choco (SIC) | (sin page_id) | Servicios Informáticos del Choco (SIC) | - |
| 1.00 | ntn-722f3326f27c (interno) | Super Cable | 29495153c5cd80aa9417f9f30a0b1310 | Super Cable | - |
| 1.00 | ntn-00c5ebd352be (interno) | Emcali (ISP) | 29695153c5cd808aa39dd626b853a432 | Emcali (ISP) | - |
| 1.00 | ntn-5887f164fb50 (interno) | HVTV | 2cd95153c5cd8033897dd6ea7c5e5fa8 | HVTV | - |
| 1.00 | ntn-8119deb48bf9 (interno) | CELSIA INTERNET S.A.S. | 37695153c5cd8025b707ea64f3fbd60a | CELSIA INTERNET | nombre |
| 1.00 | ntn-56d300c3766c (interno) | LATITUDE-SH http://Latitude.sh | (sin page_id) | LATITUDE-SH http://Latitude.sh | - |
| 1.00 | ntn-c7d71eb06108 (interno) | EA-BOGOTA Electronic Arts Inc. | (sin page_id) | EA-BOGOTA Electronic Arts Inc. | - |
| 1.00 | ntn-85545f35d987 (interno) | TV CHINACOTA DIGITAL | 32595153c5cd806096c2cbfd7b4c9329 | TV CHINACOTA DIGITAL | - |
| 1.00 | ntn-8ea10df5716e (interno) | WINS SOLUCIONES SAS | 32595153c5cd81a7bd75f8bb4e7ce630 | WINS SOLUCIONES SAS | - |
| 1.00 | ntn-d403435962ac (interno) | Megas Exprés Telecomunicaciones | (sin page_id) | Megas Exprés Telecomunicaciones | - |
| 1.00 | ntn-1d9b4b056846 (interno) | Elkinet | 32595153c5cd81d9b604f9caf06268dc | Elkinet | - |
| 1.00 | ntn-9aeb2696d2f8 (interno) | ENTERNET | 33b95153c5cd807ca4fffcf7f372540f | ENTERNET | - |
| 1.00 | ntn-ddf8ba1321aa (interno) | ALCANOS DE COLOMBIA | 34195153c5cd8028b051fea87768b647 | ALCANOS DE COLOMBIA | - |
| 1.00 | ntn-01549b0bb930 (interno) | ENEL | 34295153c5cd80319c18ea521fcd1295 | ENEL | - |
| 1.00 | ntn-95d73afd145f (interno) | GASES DEL CARIBE | 34295153c5cd8080a222c3d0c8c8b3f8 | GASES DEL CARIBE | - |
| 1.00 | ntn-84321bb97389 (interno) | AFINIA | 34295153c5cd8005b4e2c726f0abee26 | AFINIA | - |
| 1.00 | ntn-43f2d4a22e71 (interno) | EMCALI | 34295153c5cd80a4b167ce5fc4db83d9 | EMCALI | - |
| 1.00 | ntn-63aaeb64cd0d (interno) | CHEC | 34295153c5cd8019a108cf8ee3e9bf4f | CHEC | - |
| 1.00 | ntn-e29e3a19af23 (interno) | CENS | 34295153c5cd80c29948d1a07f4c6fdf | CENS | - |
| 1.00 | ntn-f8b26a629020 (interno) | AQUALIA COLOMBIA | 34295153c5cd8098a5a5d7ce7cb27324 | AQUALIA COLOMBIA | - |
| 1.00 | ntn-66f1f45439ed (interno) | TRIPLE A | 34295153c5cd80e6b002fba2bc73d5f5 | TRIPLE A | - |
| 1.00 | ntn-13769928cf0f (interno) | ETB | 34a95153c5cd80dcb5edc08926d48796 | ETB | - |
| 1.00 | ntn-8345a9168c67 (interno) | AGUAS DE CARTAGENA | 34a95153c5cd8066be19e769849bcad0 | AGUAS DE CARTAGENA | - |
| 1.00 | ntn-e8737d000e4f (interno) | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE VILLAVICENCIO | (sin page_id) | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE VILLAVICENCIO | - |
| 1.00 | ntn-6c572727b088 (interno) | CLARO | 34a95153c5cd80738e71d7e1e52968b6 | CLARO | - |
| 1.00 | ntn-da1fd3f1a6ef (interno) | TIGO | 34a95153c5cd80df8664da7f2ff7e9d1 | TIGO | - |
| 1.00 | ntn-e06c3945b7e2 (interno) | METROGAS DE COLOMBIA | 34a95153c5cd80b7bce1e22166b41fb0 | METROGAS DE COLOMBIA | - |
| 1.00 | ntn-1e376ceb9dfb (interno) | CELSIA | 34a95153c5cd803b9529e523b08bbb89 | CELSIA | - |
| 1.00 | ntn-ef01a94f9f36 (interno) | EDEQ | 34a95153c5cd8048b32fcb208a9673a4 | EDEQ | - |
| 1.00 | ntn-eb07d235467d (interno) | ACUEDUCTO METROPOLITANO DE BUCARAMANGA | 34a95153c5cd80a0b9dbe6fcc7025965 | ACUEDUCTO METROPOLITANO DE BUCARAMANGA | - |
| 1.00 | ntn-a1f84cedd2eb (interno) | VATIA | 34a95153c5cd808dba63e00c867a8b66 | VATIA | - |
| 1.00 | ntn-7e448a9fffeb (interno) | ENERTOTAL | 34a95153c5cd80b0ad74cbcc3814d46c | ENERTOTAL | - |
| 1.00 | ntn-f79c7e8d8a35 (interno) | EMSERFUSA | 34a95153c5cd808bac86d20795d6e35e | EMSERFUSA | - |
| 1.00 | ntn-b6b07c1e434d (interno) | COSERVICIOS | 34a95153c5cd80ff91a0d832322149ee | COSERVICIOS | - |
| 1.00 | ntn-2b8919162428 (interno) | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTA | 34a95153c5cd80af9c56da361816c664 | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTA | - |
| 1.00 | ntn-12bea9af3747 (interno) | EMPRESAS PUBLICAS DE ARMENIA | 34a95153c5cd8051be50f8c797d3754d | EMPRESAS PUBLICAS DE ARMENIA | - |
| 1.00 | ntn-5d5bf37a9684 (interno) | SAAAB | 34a95153c5cd80feac0af2fbeb109600 | SAAAB | - |
| 1.00 | ntn-3e3b995fe19c (interno) | DIRECTV | 34a95153c5cd80c3a1fae1c227f893b7 | DIRECTV | - |
| 1.00 | ntn-57a124d4485d (interno) | WOM | 34a95153c5cd80fe8444e5f7cffa9486 | WOM | - |
| 1.00 | ntn-0b08bd98d279 (interno) | WIN | 34a95153c5cd80ae89f0cc7d90f922bf | WIN | - |
| 1.00 | ntn-420105b2bd0d (interno) | EIS CUCUTA | 34a95153c5cd808f9951dbe816aaff95 | EIS CUCUTA | - |
| 1.00 | ntn-17968229d7f1 (interno) | ELECTROHUILA | 35a95153c5cd80a899b3d5706d799da5 | ELECTROHUILA | - |
| 1.00 | ntn-e017a0fbc7ed (interno) | LAS CEIBAS – EMPRESAS PUBLICAS DE NEIVA | 35a95153c5cd801ca365e9f807f9cd1c | LAS CEIBAS – EMPRESAS PUBLICAS DE NEIVA | - |
| 1.00 | ntn-8b280a706e5a (interno) | GASES DE LA GUAJIRA | 35a95153c5cd804ca9e3c2f1f747acbe | GASES DE LA GUAJIRA | - |
| 1.00 | ntn-4924e298f255 (interno) | IBAL | 35a95153c5cd80fe8725dfad1c4f7aae | IBAL | - |
| 1.00 | ntn-73f75aea76eb (interno) | ACUAVALLE | 35a95153c5cd805086b8c69965e0f34a | ACUAVALLE | - |
| 1.00 | ntn-2deedf0ae5ef (interno) | RUITOQUE | 35a95153c5cd80a7b9e8fa0bd75d1bac | RUITOQUE | - |
| 1.00 | ntn-7fc26d2207ab (interno) | EEBP | 35a95153c5cd80f2a473edf04f2bd3cc | EEBP | - |
| 1.00 | ntn-8846f7b977dc (interno) | ENERCER | 35a95153c5cd80c08f4ae0a383f77a06 | ENERCER | - |
| 1.00 | ntn-f1c13633aac8 (interno) | ESPIGAS | 35a95153c5cd80c28fdde55001ca8f8a | ESPIGAS | - |
| 1.00 | ntn-f60d14e6ca20 (interno) | LLANOGAS | 35a95153c5cd8059bb68e47717b5a735 | LLANOGAS | - |
| 1.00 | ntn-fc942ea10619 (interno) | REDEGAS DOMICILIARIO | 35a95153c5cd8074b8b4f16816a66ca6 | REDEGAS DOMICILIARIO | - |
| 1.00 | ntn-c1a45a54ade2 (interno) | SOPESA | 35a95153c5cd803f97b4f0a5a021a29a | SOPESA | - |
| 1.00 | ntn-281a6febd874 (interno) | SURCOLOMBIANA DE GAS - SURGAS | 35a95153c5cd8068a2f6f6e063cfbe77 | SURCOLOMBIANA DE GAS - SURGAS | - |
| 1.00 | ntn-ee1e8b94fc85 (interno) | AGUAS DE BARRANCABERMEJA | 35a95153c5cd80f4824efcdac72953ca | AGUAS DE BARRANCABERMEJA | - |
| 1.00 | ntn-1300be046494 (interno) | ELECTRIFICADORA DEL META | 35a95153c5cd807da0a5f62a1160e7fa | ELECTRIFICADORA DEL META | - |
| 1.00 | ntn-895df2355fc5 (interno) | AGUAS Y AGUAS DE PEREIRA | 35a95153c5cd8031921fdb32ed346b65 | AGUAS Y AGUAS DE PEREIRA | - |
| 1.00 | ntn-720130a8bf9c (interno) | EMPOCALDAS | 35a95153c5cd80dcbbfcf6175a991ac5 | EMPOCALDAS | - |
| 1.00 | ntn-3a8a3a22be11 (interno) | EBSA | 35a95153c5cd805cb4f1e7c38329215e | EBSA | - |
| 1.00 | ntn-822782f08f0c (interno) | SERVICIUDAD (DOSQUEBRADAS) | 35a95153c5cd8009ae20ec73c6c58b91 | SERVICIUDAD (DOSQUEBRADAS) | - |
| 1.00 | ntn-b8acfd7f8758 (interno) | AQUAOCCIDENTE | 35a95153c5cd8057ae37ee3c60563344 | AQUAOCCIDENTE | - |
| 1.00 | ntn-d4b3ca8cdf5e (interno) | GASES DEL CUSIANA | 35a95153c5cd805ba9d8e9b47fe81fb0 | GASES DEL CUSIANA | - |
| 1.00 | ntn-d0011e88fc6a (interno) | ELECTRO CAQUETA | 35a95153c5cd8051b120ecf5a6ef7450 | ELECTRO CAQUETA | - |
| 1.00 | ntn-321006b1b059 (interno) | EMPOPASTO | 35a95153c5cd8001837dfc7d3e5bf1ca | EMPOPASTO | - |
| 1.00 | ntn-7c9dcfab5b98 (interno) | EMPRESA DE ACUEDUCTO, ALCANTARILLADO Y ASEO DE YOPAL (EAAAY) | (sin page_id) | EMPRESA DE ACUEDUCTO, ALCANTARILLADO Y ASEO DE YOPAL (EAAAY) | - |
| 1.00 | ntn-51736c69a61f (interno) | EMPRESA DE ENERGIA DE PEREIRA | 35a95153c5cd8079a58de6e4cbd9ca1f | EMPRESA DE ENERGIA DE PEREIRA | - |
| 1.00 | ntn-aabe5d6b0e12 (interno) | EMPRESA REGIONAL AGUAS DEL TEQUENDAMA (ERAT) | 35a95153c5cd803c8098d806186d8502 | EMPRESA REGIONAL AGUAS DEL TEQUENDAMA (ERAT) | - |
| 1.00 | ntn-dc064fac5937 (interno) | EMPRESA DE ENERGIA DEL PUTUMAYO | 35a95153c5cd802388f1e7efd3441ca2 | EMPRESA DE ENERGIA DEL PUTUMAYO | - |
| 1.00 | ntn-e583f05037de (interno) | EMPRESA DE ENERGIA ELECTRICA DEL DEPARTAMENTO DEL GUAVIARE | (sin page_id) | EMPRESA DE ENERGIA ELECTRICA DEL DEPARTAMENTO DEL GUAVIARE | - |
| 1.00 | ntn-69dc8f5dd0ac (interno) | ENELAR | 35a95153c5cd808b95e4ce598fca497a | ENELAR | - |
| 1.00 | ntn-bfc8d0b9f7a7 (interno) | EMPRESA OFICIAL DE SERVICIOS PUBLICOS DE YUMBO (ESPY) | (sin page_id) | EMPRESA OFICIAL DE SERVICIOS PUBLICOS DE YUMBO (ESPY) | - |
| 1.00 | ntn-247898002ee2 (interno) | AGUAS DE BUGA | 35a95153c5cd80b49ea3dcc56fbbeafb | AGUAS DE BUGA | - |
| 1.00 | ntn-228b4697ede8 (interno) | ESPUCAL (LA CALERA) | 35a95153c5cd80ffb123de2f75806763 | ESPUCAL (LA CALERA) | - |
| 1.00 | ntn-5f82a12a4d1e (interno) | EMSERVILLA | 35a95153c5cd802ab90bf0b958e05c9e | EMSERVILLA | - |
| 1.00 | ntn-9db8bf034a54 (interno) | EMPRESAS PUBLICAS DE ZIPAQUIRA (EPZ / EAAAZ) | (sin page_id) | EMPRESAS PUBLICAS DE ZIPAQUIRA (EPZ / EAAAZ) | - |
| 1.00 | ntn-b401809fdc2c (interno) | EMSER (LIBANO, TOLIMA) | 35a95153c5cd803aaa5bcae7259722e0 | EMSER (LIBANO, TOLIMA) | - |
| 1.00 | ntn-d10105b69624 (interno) | Gigacable E.S.P | (sin page_id) | Gigacable E.S.P | - |
| 1.00 | ntn-3fdea7e61e73 (interno) | Invercol | 36695153c5cd8086a3a1e6b2170621d7 | Invercol | - |
| 1.00 | ntn-b0e4209d26b7 (interno) | VALLENET S.A.S | (sin page_id) | VALLENET S.A.S | - |
| 1.00 | ntn-ffac89d56571 (interno) | Fibermax | 37495153c5cd803cb98fe23af0f46ef6 | Fibermax | - |
| 1.00 | ntn-73a5b38a0a21 (interno) | Global IP | (sin page_id) | Global IP  | - |
| 1.00 | ntn-165266089f4f (interno) | Sisaat sas | (sin page_id) | Sisaat sas  | - |
| 1.00 | ntn-ae946bf5c405 (interno) | Mega comunicaciones | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | - |
| 1.00 | ntn-fed1148d07c7 (interno) | ULTRAFIBER | 37a95153c5cd8053bf11f13b426dc6df | ULTRAFIBER | - |
| 1.00 | ntn-8a6fa225b87d (interno) | Unete comunicaciones | 37a95153c5cd80f6bd1ff8c3b7c8abb1 | Unete comunicaciones | - |
| 1.00 | ntn-faa7f64ad300 (interno) | Vanti | 37b95153c5cd80899b61f49e11cc3036 | Vanti | - |
| 1.00 | ntn-d13413d77fac (interno) | SPACOM | 37c95153c5cd80f5bbccde51cc160f04 | SPACOM | - |
| 1.00 | ntn-577f4ffb9c47 (interno) | FIX COMUNICACIÓN | (sin page_id) | FIX COMUNICACIÓN | - |
| 1.00 | ntn-c259a64e33a0 (interno) | ULTRALINK | 37c95153c5cd8026a793e8d6c5ced9cd | ULTRALINK | - |
| 1.00 | ntn-a7a649fd4459 (interno) | SIDITEL | 37c95153c5cd80d28d2eee4dfee37ca9 | SIDITEL | - |
| 1.00 | ntn-900249fee9cf (interno) | Interccom | 38195153c5cd80159f76cd0ba88d2d5e | Interccom | - |
| 0.97 | 900104400 (nit) | DOBLECLICK SOFTWARE E INGENIERIA S.A.S. | 30c95153c5cd81838733e80d54ae8de4 | DOBLECLICK SOFTWARE E INGENERIA | nombre |
| 0.96 | 901707684 (nit) | CONECTA2 TELECOMUNICACIONES SAS | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.96 | 901223283 (nit) | FAST NET COMUNICACIONES ISP SAS | 30c95153c5cd817e9df3f2d3e9c82771 | FASTNET COMUNICACIONES ISP SAS | nombre |
| 0.96 | 900927852 (nit) | TECH NET COMUNICACIONES S.A.S | 38295153c5cd81e7bcf2f5510a752be8 | TechNet Comunicaciones SAS | nombre |
| 0.96 | 900871095 (nit) | VIVE TELECOMUNICACIONES SAS | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.96 | 900958679 (nit) | BLU TELECOMUNICACIONES S.A.S. | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.95 | 901385119 (nit) | EGA COMUNICACIONES S.A.S. | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.94 | 900373099 (nit) | SOL CABLE VISION S. A. S. - E. S. P. | (sin page_id) | Sol Cablevision S.A.S E.S.P | nombre |
| 0.94 | 900632211 (nit) | WORLD CONNECTIONS S.A.S. | 2b695153c5cd8035b100e948c71f24eb | World Connection | nombre |
| 0.94 | 900644312 (nit) | INTERCOMM DE NARIÑO SAS | (sin page_id) | Intercom  de nariño | nombre |
| 0.93 | 900669038 (nit) | ASONET COLOMBIA LTDA | 28d95153c5cd80eaad73eb86822f4e3c | @SONET COLOMBIA SAS | nombre |
| 0.93 | 901522541 (nit) | ANTIOQUIA TELECOMUNICACIONES S.A.S | (sin page_id) | ANTIOQUENA DE TELECOMUNICACIONES S.A.S. | nombre |
| 0.92 | 901821220 (nit) | WIICOM TELECOMUNICACIONES SAS | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.92 | 901421445 (nit) | TELECOM PLUS SAS | 29295153c5cd80b18316c01956b34890 | Telecomplus | nombre |
| 0.92 | 901734417 (nit) | K.G.B. TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.92 | 900374679 (nit) | REDSI TELECOMUNICACIONES S.A.S. | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.92 | 901436411 (nit) | LA RED.G TELECOMUNICACIONES S.A.S | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 0.91 | 901111047 (nit) | SINET TELECOMUNICACIONES COLOMBIA SAS | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.91 | 900867741 (nit) | WISP TELECOMUNICACIONES SAS | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.91 | 900979388 (nit) | VIVO TELECOMUNICACIONES S.A.S. | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.91 | 900871095 (nit) | VIVE TELECOMUNICACIONES SAS | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.91 | 901280754 (nit) | ISPA TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.91 | 901481635 (nit) | TECNONET COMUNICACIONES SAS. | 38295153c5cd81e7bcf2f5510a752be8 | TechNet Comunicaciones SAS | nombre |
| 0.91 | 901477349 (nit) | LINK TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.91 | 901291209 (nit) | VIRA TELECOMUNICACIONES S.A.S. | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.91 | 901291209 (nit) | VIRA TELECOMUNICACIONES S.A.S. | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.91 | 9990000018 (interno) | VISS Telecomunicaciones S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.91 | 9990000018 (interno) | VISS Telecomunicaciones S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.91 | 901196026 (nit) | SERVISYSTEN SAS | 32595153c5cd81089e3bdd881c1a2300 | Servisystem | nombre |
| 0.91 | 901619498 (nit) | CPM TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.91 | 901619498 (nit) | CPM TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.91 | 901412119 (nit) | DSC TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.91 | 901305156 (nit) | C & B TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.91 | 901305156 (nit) | C & B TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.91 | 901305156 (nit) | C & B TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.91 | 901798538 (nit) | ADC TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.91 | 901637261 (nit) | GS TELECOMUNICACIONES S.A.S. | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.91 | 901382770 (nit) | JK. TELECOMUNICACIONES S.A.S ZOMAC | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.91 | 901477688 (nit) | 5G TELECOMUNICACIONES SAS ZOMAC | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.91 | 901641486 (nit) | CJC Telecomunicaciones | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.90 | 901800921 (nit) | MEDIA LINK S.A.S. | 35995153c5cd80fe94e6d36d60a043b3 | MediaLink | nombre |
| 0.90 | 901178084 (nit) | MUNDO CAM S.A.S. | 32595153c5cd81f6b0a9e04ffa807ecc | Mundo Cams SAS | nombre |
| 0.90 | 901692609 (nit) | SUROS COMUNICACIONES SAS ZOMAC | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.90 | 901544269 (nit) | CONECTIC TELECOMUNICACIONES S.A.S | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.90 | 900876369 (nit) | CONNECT TELECOMUNICACIONES SAS | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.89 | 900482761 (nit) | WIRELESS COLOMBIA S.A.S. | (sin page_id) | S3WIRELESS COLOMBIA S.A | nombre |
| 0.89 | 901714003 (nit) | FIBERMAT E INGENIERIA S.A.S | (sin page_id) | Fibernet ingenieria  | nombre |
| 0.89 | 901452751 (nit) | AMO COMUNICACIONES S.A.S. | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.89 | 900998897 (nit) | PIPE COMUNICACIONES S.A.S | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.89 | 901365779 (nit) | DSAM COMUNICACIONES S.A.S | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.89 | 901601822 (nit) | VIBO COMUNICACIONES S.A.S | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.89 | 804008044 (nit) | ANS COMUNICACIONES LTDA | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.89 | 901370380 (nit) | MORA COMUNICACIONES SAS | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.89 | 900903217 (nit) | Sean Comunicaciones Sas | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.89 | 9990000164 (interno) | S3WIRELESS COLOMBIA S.A | (sin page_id) | WIRELESS COLOMBIA S.A.S. | nombre |
| 0.89 | 901544269 (nit) | CONECTIC TELECOMUNICACIONES S.A.S | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.89 | 900876369 (nit) | CONNECT TELECOMUNICACIONES SAS | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.89 | 901111828 (nit) | CONÉCTATE TELECOMUNICACIONES S.A.S | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.89 | 900014381 (nit) | CABLE NET S.A.S. | 32595153c5cd814d85b2e9be8b012cb5 | CABLENET SAS | nombre |
| 0.89 | 901132952 (nit) | INTTEL GO S A S | 29b95153c5cd8085a762f91132df8c8b | Intel Go | nombre |
| 0.89 | 900481404 (nit) | IT COMUNICACIONES SAS | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.89 | 900481404 (nit) | IT COMUNICACIONES SAS | 34495153c5cd80adaddcdc78050c68e0 | Zii comunicaciones | nombre |
| 0.89 | 901138762 (nit) | SUN COMUNICACIONES S.A.S | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.89 | 901138762 (nit) | SUN COMUNICACIONES S.A.S | 32595153c5cd815dbf85dce3d2ed207e | FXN Comunicaciones | nombre |
| 0.89 | 900389021 (nit) | CONECTTIC S A S | 29495153c5cd808b9b31e45a09b40093 | Conectic | nombre |
| 0.89 | 900946829 (nit) | FCF COMUNICACIONES S.A.S. | 32595153c5cd815dbf85dce3d2ed207e | FXN Comunicaciones | nombre |
| 0.89 | 901327802 (nit) | FC COMUNICACIONES S.A.S | 32595153c5cd815dbf85dce3d2ed207e | FXN Comunicaciones | nombre |
| 0.89 | 901327802 (nit) | FC COMUNICACIONES S.A.S | 32595153c5cd81a5b838df2ece40cdc3 | JFB COMUNICACIONES | nombre |
| 0.89 | 900578528 (nit) | RYO COMUNICACIONES S.A.S | 28d95153c5cd80e5820ddac9d3e7bb92 | Amo Comunicaciones | nombre |
| 0.89 | 900578528 (nit) | RYO COMUNICACIONES S.A.S | 2ce95153c5cd806c9bbeef1723c8e4ad | R&R Comunicaciones | nombre |
| 0.89 | 901854532 (nit) | A3V COMUNICACIONES S.A.S. | 28d95153c5cd80e5820ddac9d3e7bb92 | Amo Comunicaciones | nombre |
| 0.89 | 901387527 (nit) | HOLANET TELECOMUNICACIONES S.A.S | 28b95153c5cd80a8b28ff7ff9da90d3e | Hola - PRT Telecomunicaciones | nombre |
| 0.89 | 901369654 (nit) | P & B COMUNICACIONES S.A.S. | 2ce95153c5cd806c9bbeef1723c8e4ad | R&R Comunicaciones | nombre |
| 0.89 | 901369654 (nit) | P & B COMUNICACIONES S.A.S. | 32595153c5cd81a5b838df2ece40cdc3 | JFB COMUNICACIONES | nombre |
| 0.89 | 901419312 (nit) | SERVICTEK S.A.S | 37695153c5cd80c2aadaf85f2fde6b62 | SERVITEK | nombre |
| 0.89 | 901637950 (nit) | M&M COMUNICACIONES SAS | 2ce95153c5cd806c9bbeef1723c8e4ad | R&R Comunicaciones | nombre |
| 0.89 | 901468722 (nit) | ANCLANET TELECOMUNICACIONES DE COLOMBIA SAS | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.89 | 901468722 (nit) | ANCLANET TELECOMUNICACIONES DE COLOMBIA SAS | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.89 | 804008044 (nit) | ANS COMUNICACIONES LTDA | 28d95153c5cd80e5820ddac9d3e7bb92 | Amo Comunicaciones | nombre |
| 0.89 | 900380224 (nit) | STC COMUNICACIONES S. A. S. | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.89 | 9990000043 (interno) | Intel Go | 30c95153c5cd8174b950d127129d4ff7 | INTTEL GO SAS | nombre |
| 0.89 | 901161363 (nit) | WINET TELECOMUNICACIONES E INGENIERÍA S.A.S. ZOMAC | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.88 | 900614700 (nit) | TVCABLE TELECOMUNICACIONES S.A.S. | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 901816044 (nit) | SATEL TELECOMUNICACIONES SAS | (sin page_id) | AYSATEC TELECOMUNICACIONES S.A.S. | nombre |
| 0.88 | 901355150 (nit) | ISATEL TELECOMUNICACIONES S.A.S. | (sin page_id) | AYSATEC TELECOMUNICACIONES S.A.S. | nombre |
| 0.88 | 900406277 (nit) | SILCOM TELECOMUNICACIONES S.A.S. | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.88 | 901163436 (nit) | EDCOM TELECOMUNICACIONES S.A.S. | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.88 | 901044364 (nit) | JERSAL TELECOMUNICACIONES S.A.S | (sin page_id) | FERMAC TELECOMUNICACIONES S.A.S | nombre |
| 0.88 | 901315672 (nit) | BARULE TELECOMUNICACIONES S.A.S. | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.88 | 901315672 (nit) | BARULE TELECOMUNICACIONES S.A.S. | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 901610997 (nit) | VELNET TELECOMUNICACIONES S.A.S | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 901111047 (nit) | SINET TELECOMUNICACIONES COLOMBIA SAS | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.88 | 901418312 (nit) | CONNECTION TELECOMUNICACIONES ISP S.A.S | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.88 | 900999305 (nit) | BLUE TELECOMUNICACIONES S.A.S. | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 900871095 (nit) | VIVE TELECOMUNICACIONES SAS | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 900780620 (nit) | SERVICIOS INFORMATICOS DEL CHOCO SAS | (sin page_id) | Servicios Informáticos del Choco (SIC) | nombre |
| 0.88 | 900987372 (nit) | VALLE TELECOMUNICACIONES SAS | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.88 | 900843258 (nit) | CSSI TELECOMUNICACIONES SAS | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 0.88 | 844004979 (nit) | VESGA TELECOMUNICACIONES SAS | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.88 | 901737774 (nit) | GALGO TELECOMUNICACIONES S.A.S. | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 901419405 (nit) | E-GPON TELECOMUNICACIONES S.A.S. | 29d95153c5cd8070915be09a7f1bb9b7 | Legon Telecomunicaciones | nombre |
| 0.88 | 901412119 (nit) | DSC TELECOMUNICACIONES S.A.S | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 0.88 | 900908547 (nit) | RIVER TELECOMUNICACIONES S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.88 | 901483159 (nit) | SIPFO TELECOMUNICACIONES S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.88 | 901404834 (nit) | GIGARED COLOMBIA SAS | (sin page_id) | MEGARED DE COLOMBIA S.A.S. | nombre |
| 0.88 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 0.88 | 901528587 (nit) | REITO TELECOMUNICACIONES S.A.S. | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.88 | 901528587 (nit) | REITO TELECOMUNICACIONES S.A.S. | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 0.88 | 901528587 (nit) | REITO TELECOMUNICACIONES S.A.S. | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.88 | 901848054 (nit) | MYRED TELECOMUNICACIONES S.A.S. | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.88 | 901734607 (nit) | HOLA TELECOMUNICACIONES COLOMBIA S.A.S | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.88 | 901361674 (nit) | MEGATEL DE COLOMBIA S.A.S. | (sin page_id) | MEGARED DE COLOMBIA S.A.S. | nombre |
| 0.88 | 901422974 (nit) | ALNET TELECOMUNICACIONES S.A.S | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.88 | 901422974 (nit) | ALNET TELECOMUNICACIONES S.A.S | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.88 | 9990000037 (interno) | Espectra | 34995153c5cd8035b816ef8774dc4d69 | SPECTRA | nombre |
| 0.88 | 9990000036 (interno) | Esmitel | (sin page_id) | ESMITECL S.A.S ZOMAC | nombre |
| 0.88 | 9990000035 (interno) | ESMITECL S.A.S ZOMAC | 28d95153c5cd8020b3ccf9025a81f5ec | Esmitel | nombre |
| 0.88 | ntn-ffac89d56571 (interno) | Fibermax | 32595153c5cd81febc18c5d22a115c38 | Fibermat | nombre |
| 0.87 | 900867741 (nit) | WISP TELECOMUNICACIONES SAS | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.87 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.87 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901527531 (nit) | ONE TELECOMUNICACIONES S.A.S | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.87 | 900999305 (nit) | BLUE TELECOMUNICACIONES S.A.S. | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 900999305 (nit) | BLUE TELECOMUNICACIONES S.A.S. | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 900979388 (nit) | VIVO TELECOMUNICACIONES S.A.S. | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 900871095 (nit) | VIVE TELECOMUNICACIONES SAS | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 900871095 (nit) | VIVE TELECOMUNICACIONES SAS | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.87 | 901280754 (nit) | ISPA TELECOMUNICACIONES S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901765446 (nit) | W@I TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901765446 (nit) | W@I TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.87 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 900843258 (nit) | CSSI TELECOMUNICACIONES SAS | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 900843258 (nit) | CSSI TELECOMUNICACIONES SAS | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 900843258 (nit) | CSSI TELECOMUNICACIONES SAS | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 900843258 (nit) | CSSI TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.87 | 900843258 (nit) | CSSI TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.87 | 901619498 (nit) | CPM TELECOMUNICACIONES S.A.S | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 901619498 (nit) | CPM TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901306546 (nit) | CLIK TELECOMUNICACIONES SAS | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.87 | 901306546 (nit) | CLIK TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.87 | 901306546 (nit) | CLIK TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.87 | 900958679 (nit) | BLU TELECOMUNICACIONES S.A.S. | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 900958679 (nit) | BLU TELECOMUNICACIONES S.A.S. | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901573609 (nit) | PRT-TELECOMUNICACIONES S.A.S ZOMAC | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.87 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901412119 (nit) | DSC TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901412119 (nit) | DSC TELECOMUNICACIONES S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901714644 (nit) | L&M TELECOMUNICACIONES S.A.S | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 901714644 (nit) | L&M TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901714644 (nit) | L&M TELECOMUNICACIONES S.A.S | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.87 | 901706683 (nit) | RAM TELECOMUNICACIONES SAS | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 901305156 (nit) | C & B TELECOMUNICACIONES SAS | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.87 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901477349 (nit) | LINK TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901477349 (nit) | LINK TELECOMUNICACIONES S.A.S | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.87 | 901477349 (nit) | LINK TELECOMUNICACIONES S.A.S | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901415497 (nit) | OPP TELECOMUNICACIONES S.A.S | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901637261 (nit) | GS TELECOMUNICACIONES S.A.S. | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901637261 (nit) | GS TELECOMUNICACIONES S.A.S. | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.87 | 901382770 (nit) | JK. TELECOMUNICACIONES S.A.S ZOMAC | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901113679 (nit) | ARM TELECOMUNICACIONES SAS | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 901291209 (nit) | VIRA TELECOMUNICACIONES S.A.S. | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.87 | 901335533 (nit) | COTV@S TELECOMUNICACIONES S.A.S | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.87 | 901335533 (nit) | COTV@S TELECOMUNICACIONES S.A.S | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 901335533 (nit) | COTV@S TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.87 | 901335533 (nit) | COTV@S TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.87 | 9990000023 (interno) | BYTM TELECOMUNICACIONES | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.87 | 9990000023 (interno) | BYTM TELECOMUNICACIONES | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.87 | 901641486 (nit) | CJC Telecomunicaciones | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.87 | 900548102 (nit) | AZTECA COMUNICACIONES COLOMBIA S.A.S | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.87 | 900154335 (nit) | CONEXXION WI-FI LTDA | (sin page_id) | Conexión Wifi | nombre |
| 0.87 | 901397963 (nit) | NEONET.COLOMBIA S.A.S | 28d95153c5cd80eaad73eb86822f4e3c | @SONET COLOMBIA SAS | nombre |
| 0.86 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901527531 (nit) | ONE TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901527531 (nit) | ONE TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901527531 (nit) | ONE TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 900724195 (nit) | BARAK TECNOLOGIA INFORMACION Y COMUNICACIONES SAS | (sin page_id) | TICCOL - Tecnología Información y Comunicaciones | nombre |
| 0.86 | 901765446 (nit) | W@I TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901765446 (nit) | W@I TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901765446 (nit) | W@I TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901160636 (nit) | ANDYNET COMUNICACIONES SAS | 32595153c5cd8130b781c2af98d5c525 | Redinet Comunicaciones | nombre |
| 0.86 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901285103 (nit) | ZII TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901619498 (nit) | CPM TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 900958679 (nit) | BLU TELECOMUNICACIONES S.A.S. | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 900958679 (nit) | BLU TELECOMUNICACIONES S.A.S. | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 900958679 (nit) | BLU TELECOMUNICACIONES S.A.S. | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901573609 (nit) | PRT-TELECOMUNICACIONES S.A.S ZOMAC | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901573609 (nit) | PRT-TELECOMUNICACIONES S.A.S ZOMAC | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901573609 (nit) | PRT-TELECOMUNICACIONES S.A.S ZOMAC | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901389138 (nit) | SIR Telecomunicaciones S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901234188 (nit) | TORNET COMUNICACIONES S.A.S | 38295153c5cd81e7bcf2f5510a752be8 | TechNet Comunicaciones SAS | nombre |
| 0.86 | 901412119 (nit) | DSC TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901412119 (nit) | DSC TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 900518637 (nit) | SRG TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 900518637 (nit) | SRG TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 900518637 (nit) | SRG TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901188532 (nit) | REDINET COMUNICACIONES S.A.S | 38295153c5cd81e7bcf2f5510a752be8 | TechNet Comunicaciones SAS | nombre |
| 0.86 | 901092295 (nit) | MCA TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901092295 (nit) | MCA TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901092295 (nit) | MCA TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901714644 (nit) | L&M TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901714644 (nit) | L&M TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901714644 (nit) | L&M TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901635841 (nit) | ADN TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901635841 (nit) | ADN TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901635841 (nit) | ADN TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901706683 (nit) | RAM TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901706683 (nit) | RAM TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901706683 (nit) | RAM TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901319028 (nit) | FW TELECOMUNICACIONES ZOMAC S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901319028 (nit) | FW TELECOMUNICACIONES ZOMAC S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901319028 (nit) | FW TELECOMUNICACIONES ZOMAC S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901798538 (nit) | ADC TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901798538 (nit) | ADC TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901184939 (nit) | EVS TELECOMUNICACIONES S.A.S. | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901055088 (nit) | MEGARED COMUNICACIONES S.A.S. | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.86 | 901415497 (nit) | OPP TELECOMUNICACIONES S.A.S | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901415497 (nit) | OPP TELECOMUNICACIONES S.A.S | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901415497 (nit) | OPP TELECOMUNICACIONES S.A.S | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901637261 (nit) | GS TELECOMUNICACIONES S.A.S. | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901637261 (nit) | GS TELECOMUNICACIONES S.A.S. | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901382770 (nit) | JK. TELECOMUNICACIONES S.A.S ZOMAC | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901382770 (nit) | JK. TELECOMUNICACIONES S.A.S ZOMAC | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901477688 (nit) | 5G TELECOMUNICACIONES SAS ZOMAC | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901477688 (nit) | 5G TELECOMUNICACIONES SAS ZOMAC | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901822257 (nit) | J&L TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901822257 (nit) | J&L TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901822257 (nit) | J&L TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901113679 (nit) | ARM TELECOMUNICACIONES SAS | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 901113679 (nit) | ARM TELECOMUNICACIONES SAS | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 901113679 (nit) | ARM TELECOMUNICACIONES SAS | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 901641486 (nit) | CJC Telecomunicaciones | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.86 | 9990000123 (interno) | KGB TELECOMUNICACIONES | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.86 | 9990000123 (interno) | KGB TELECOMUNICACIONES | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.86 | 900543894 (nit) | ALIADOS EN COMUNICACIONES NET S.A.S. | 32595153c5cd81f49eadd275a92ed867 | Aliados en Comunicaciones SAS | nombre |
| 0.86 | 901111828 (nit) | CONÉCTATE TELECOMUNICACIONES S.A.S | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.86 | 901707684 (nit) | CONECTA2 TELECOMUNICACIONES SAS | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.86 | 901095218 (nit) | CONECTADOS TELECOMUNICACIONES S.A.S | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.86 | 901095218 (nit) | CONECTADOS TELECOMUNICACIONES S.A.S | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.86 | 901328339 (nit) | POLINET TELECOMUNICACIONES COLOMBIA SAS | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.86 | 901111047 (nit) | SINET TELECOMUNICACIONES COLOMBIA SAS | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.86 | 900882990 (nit) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.86 | 901517670 (nit) | RED HOGAR TELECOMUNICACIONES SAS | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.86 | 901328339 (nit) | POLINET TELECOMUNICACIONES COLOMBIA SAS | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.86 | 901903031 (nit) | ARCOOM COMUNICACIONES S.A.S | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.86 | 900854264 (nit) | NET2COM SAS | (sin page_id) | NET&COM LTDA. | nombre |
| 0.86 | 901400706 (nit) | CONEXA TELECOMUNICACIONES S.A.S | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.86 | 900998897 (nit) | PIPE COMUNICACIONES S.A.S | (sin page_id) | SIMPLE COMUNICACIONES S.A.S.  | nombre |
| 0.86 | 901600315 (nit) | TARNET S.A.S. | 32595153c5cd814ebe9bc2216631c2bb | Starnet | nombre |
| 0.86 | 901614812 (nit) | TECONECTA TELECOMUNICACIONES SAS | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.86 | 901734607 (nit) | HOLA TELECOMUNICACIONES COLOMBIA S.A.S | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.86 | 830092170 (nit) | DIGITEL | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.86 | 900652145 (nit) | NAVEGA COMUNICACIONES SAS | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.86 | 901305818 (nit) | LIBRE COMUNICACIONES SAS | 28b95153c5cd80a6b95cfe67f73d1319 | Linage Comunicaciones | nombre |
| 0.86 | 901455707 (nit) | SILOE COMUNICACIONES S.A.S | (sin page_id) | SIMPLE COMUNICACIONES S.A.S.  | nombre |
| 0.86 | 811016051 (nit) | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.86 | ntn-3bb75421949d (interno) | Hola - PRT Telecomunicaciones | 28b95153c5cd80dc8b33e9539d109955 | Hola - Hola Telecomunicaciones | nombre |
| 0.86 | ntn-0de334ef3e49 (interno) | Hola - Hola Telecomunicaciones | 28b95153c5cd80a8b28ff7ff9da90d3e | Hola - PRT Telecomunicaciones | nombre |
| 0.85 | 901307191 (nit) | A UN CLICK TELECOMUNICACIONES SAS | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.85 | 901472522 (nit) | FIBRATEC TELECOMUNICACIONES S.A.S | (sin page_id) | AYSATEC TELECOMUNICACIONES S.A.S. | nombre |
| 0.85 | 901356067 (nit) | WIFINET TELECOMUNICACIONES S.A.S | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 900528576 (nit) | INTERMAX TELECOMUNICACIONES S.A.S | (sin page_id) | FERMAC TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 901254435 (nit) | MEGANET TELECOMUNICACIONES S.A.S | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 900989354 (nit) | INTELCOM TELECOMUNICACIONES S.A.S | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.85 | 901610997 (nit) | VELNET TELECOMUNICACIONES S.A.S | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 901436812 (nit) | SILNET TELECOMUNICACIONES SAS | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 901701417 (nit) | ETHERCOM TELECOMUNICACIONES S.A.S ZOMAC | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.85 | 901564457 (nit) | GALANET TELECOMUNICACIONES S.A.S. | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 901350160 (nit) | INTERCOM DE TELECOMUNICACIONES S.A.S | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.85 | 901527778 (nit) | MEC NET TELECOMUNICACIONES SAS | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.85 | 901387690 (nit) | VILLAWEB TELECOMUNICACIONES SAS | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.85 | 900163149 (nit) | SP SISTEMAS PALACIOS LTDA. | 2cb95153c5cd80718362e91a26781e41 | Sistemas Palacios | nombre |
| 0.85 | 901283944 (nit) | SPACE COMUNICACIONES S.A.S. | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.85 | 900481404 (nit) | IT COMUNICACIONES SAS | (sin page_id) | BITEM COMUNICACIONES S.A.S. | nombre |
| 0.85 | 901776947 (nit) | OASIS COMUNICACIONES S.A.S | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.85 | 901776947 (nit) | OASIS COMUNICACIONES S.A.S | 32595153c5cd812aa73ccc4c9afbb4e4 | JASZ COMUNICACIONES | nombre |
| 0.85 | 901411430 (nit) | JHEDA COMUNICACIONES SAS | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.85 | 901271966 (nit) | FIBER COMUNICACIONES S.A.S. | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.85 | 901271966 (nit) | FIBER COMUNICACIONES S.A.S. | (sin page_id) | BITEM COMUNICACIONES S.A.S. | nombre |
| 0.85 | 900998897 (nit) | PIPE COMUNICACIONES S.A.S | (sin page_id) | BITEM COMUNICACIONES S.A.S. | nombre |
| 0.85 | 901162945 (nit) | BITEM COMUNICACIONES SAS | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.85 | 900798992 (nit) | CORES COMUNICACIONES SAS | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.85 | 901263426 (nit) | SSTAR COMUNICACIONES S.A.S | 2da95153c5cd80f8a3dcf5f3d622629c | SAT Comunicaciones | nombre |
| 0.85 | 901411791 (nit) | MICEL COMUNICACIONES S.A.S | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.85 | 901411791 (nit) | MICEL COMUNICACIONES S.A.S | (sin page_id) | BITEM COMUNICACIONES S.A.S. | nombre |
| 0.85 | 901305818 (nit) | LIBRE COMUNICACIONES SAS | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.85 | 901455707 (nit) | SILOE COMUNICACIONES S.A.S | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.80 | 900292810 (nit) | TECNOLOGIA INFORMACION Y COMUNICACIONES DE COLOMBIA SAS TICCOL | (sin page_id) | TICCOL - Tecnología Información y Comunicaciones | nombre |
| 0.75 | 900637681 (nit) | PUNTO RED TELECOMUNICACIONES S.A.S | 28b95153c5cd803989ade8e7e627b90f | Hola - Punto Red Telecomunicaciones | nombre |
| 0.75 | 900206693 (nit) | CALDAS DATA COMPANY LTDA CADCOM | 30c95153c5cd81b2b4f8c4d72c58a429 | Caldas Data Company LTDA | nombre |
| 0.75 | 900437268 (nit) | HYDRA SOLUCIONES EMPRESARIALES INGENIERIA SAS | 30c95153c5cd81cd8647cdc3055722f0 | Hydra Soluciones Empresariales | nombre |
| 0.75 | 901028579 (nit) | SISTEMAS TELECOMUNICACIONES Y BIOMEDICOS DE COLOMBIA SAS | 30c95153c5cd81a28eb2fb25025a6f2d | SISTEMAS TELECOMUNICACIONES Y BIOMEDICOS | nombre |
| 0.75 | 900552398 (nit) | CABLE Y TELECOMUNICACIONES DE COLOMBIA S.A.S CABLETELCO | 30c95153c5cd815c8d6ef89c3a7fd2df | CABLE Y TELECOMUNICACIONES CABLETELCO | nombre |
| 0.67 | 900544861 (nit) | COLOMBIA MAS TV SAS | 28d95153c5cd80e08372d52fb49e9379 | COLOMBIA MAS | nombre |
| 0.67 | 900544861 (nit) | COLOMBIA MAS TV SAS | (sin page_id) | TV&MAS S.A.S | nombre |
| 0.67 | 830006960 (nit) | MONITOR SPACE LIMITADA | 32595153c5cd81d49930d16badd0b880 | Monitor Space SAS | nombre |
| 0.67 | 900888246 (nit) | INVERSIONES ZULUAGA SEJIN S.A.S. | (sin page_id) | Inversiones Zuluaga  | nombre |
| 0.67 | 900976610 (nit) | @DIGITAL GROUP SAS | 30c95153c5cd81f18c62e25aaa6e1625 | DIGITAL DOT GROUP SAS | nombre |
| 0.67 | 830136839 (nit) | VISION SATELITAL COMUNICACIONES S.A.S. | (sin page_id) | VISIÓN SATELITAL | nombre |
| 0.67 | 901172674 (nit) | DIGITAL DOT GROUP S.A.S | 2c795153c5cd806ba4b7c2c33b26baa8 | Digital DOT | nombre |
| 0.67 | 901174053 (nit) | GLOBAL IP TELECOMUNICACIONES S.A.S. | (sin page_id) | Global IP  | nombre |
| 0.67 | 901080933 (nit) | MAX TV SAS | 31995153c5cd80998acfc9a89d62bf62 | GRUPO TV MAX | nombre |
| 0.67 | 900180499 (nit) | AROS COMUNICACIONES LIMITADA | 30c95153c5cd8113b2bfe1d423b7e43e | AROS COMUNICACIONES SAS | nombre |
| 0.67 | 901605578 (nit) | FIBRA VALLE TELECOMUNICACIONES SAS | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.67 | 901573609 (nit) | PRT-TELECOMUNICACIONES S.A.S ZOMAC | 28b95153c5cd80a8b28ff7ff9da90d3e | Hola - PRT Telecomunicaciones | nombre |
| 0.67 | 901759133 (nit) | NAAMIKU.NET S.A.S. ZOMAC | (sin page_id) | http://naamiku.net SAS | nombre |
| 0.67 | 900631673 (nit) | WIFI ALTERNATIVO S.A.S | 28b95153c5cd804b8d1ac8d0b8cecc4a | Hola - Wifi Alternativo | nombre |
| 0.67 | 900631673 (nit) | WIFI ALTERNATIVO S.A.S | 35795153c5cd80cd9623e1c8fa9bef5c | Wifi Alternativo Valle | nombre |
| 0.67 | 900023231 (nit) | COMUNICACIONES ESTELARES DE COLOMBIA  S.A.S. | 28d95153c5cd80acb086ecf731b5d724 | Comunicaciones Estelares | nombre |
| 0.67 | 901154878 (nit) | NET.TV S.A.S. | (sin page_id) | GLOBAL NET TV ZOMAC S.A.S | nombre |
| 0.67 | 901154878 (nit) | NET.TV S.A.S. | 32595153c5cd8170a3dac979a92ff888 | Medios TV Net | nombre |
| 0.67 | 901723106 (nit) | SOMOS TV+INTERNET SAS | 29b95153c5cd80b3b65be242eb0f8266 | SOMOS TV | nombre |
| 0.67 | 901883145 (nit) | MEGA INTERNET COMUNICACIONES S.A.S. | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.67 | 901419071 (nit) | NET.DIGITAL S.A.S | 28b95153c5cd80cea21ce0271cb2b226 | Hola - Digital Net | nombre |
| 0.67 | 900791843 (nit) | RED DIGITAL TELECOMUNICACIONES S.A.S. | (sin page_id) | Digital Red  | nombre |
| 0.67 | 901495669 (nit) | MEGA RED COMUNICACIONES SAS | 37695153c5cd80bead2ad72486b8404b | Mega comunicaciones | nombre |
| 0.67 | 901451840 (nit) | ISP FIBRA NET S.A.S. | (sin page_id) | NET ISP S.A.S | nombre |
| 0.67 | 901600882 (nit) | NET COMUNICACIONES ISP S.A.S | (sin page_id) | NET ISP S.A.S | nombre |
| 0.67 | 901477894 (nit) | FIBERNET INGENIERIA Y TELECOMUNICACIONES SAS | (sin page_id) | Fibernet ingenieria  | nombre |
| 0.67 | 901633996 (nit) | CONEXION WIFI RF S.A.S | (sin page_id) | Conexión Wifi | nombre |
| 0.67 | 901646937 (nit) | INTERNET-REDES Y TELEVISION S.A.S | (sin page_id) | Internet y Televisión SAS | nombre |
| 0.67 | 901734607 (nit) | HOLA TELECOMUNICACIONES COLOMBIA S.A.S | 28b95153c5cd80dc8b33e9539d109955 | Hola - Hola Telecomunicaciones | nombre |
| 0.67 | 901675987 (nit) | PROYECTO 22 TELECOMUNICACIONES S.A.S | 28d95153c5cd8015b0b1ec5236d72757 | Proyecto 22 | nombre |
| 0.67 | 900949305 (nit) | VIVE INFORMATICA Y COMUNICACIONES SAS | (sin page_id) | Vive Comunicaciones  | nombre |
| 0.67 | 9990000071 (interno) | Sur Conexión | (sin page_id) | SUR CONEXIÓN COLOMBIA | nombre |
| 0.67 | 9990000153 (interno) | SUR CONEXIÓN COLOMBIA | (sin page_id) | Sur Conexión | nombre |
| 0.67 | 9990000157 (interno) | LATITUDE-SH | (sin page_id) | LATITUDE-SH http://Latitude.sh | nombre |
| 0.60 | 900047715 (nit) | CABLE Y TV  YOPAL S.A.S. INTERNET INALAMBRICO | (sin page_id) | CABLE & TV YOPAL S.A.S | nombre |
| 0.60 | 901390549 (nit) | PUNTO RED TELECOMUNICACIONES GUAVIARE SAS ZOMAC | 28b95153c5cd803989ade8e7e627b90f | Hola - Punto Red Telecomunicaciones | nombre |
| 0.60 | 901390549 (nit) | PUNTO RED TELECOMUNICACIONES GUAVIARE SAS ZOMAC | 28b95153c5cd80dca0ecf339f9219184 | Hola - Punto Red Guaviare | nombre |
| 0.60 | 900232917 (nit) | TECNOLOGIA, INFORMACION Y COMUNICACIONES LIMITADA | (sin page_id) | TICCOL - Tecnología Información y Comunicaciones | nombre |
| 0.60 | 901688739 (nit) | TELECOMUNICACIONES J&C S.A.S. | (sin page_id) | C&J Telecomunicaciones/Xtreme Networks | nombre |
| 0.60 | 901556000 (nit) | SISTEMAS DE INGENIERIA EN TELECOMUNICACIONES Y REDES SAS | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.60 | 901624804 (nit) | PUNTO RED TELECOMUNICACIONES GAITAN S.A.S ZOMAC | 28b95153c5cd803989ade8e7e627b90f | Hola - Punto Red Telecomunicaciones | nombre |
| 0.60 | 901395491 (nit) | Punto Red Telecomunicaciones Guaviare | 28b95153c5cd803989ade8e7e627b90f | Hola - Punto Red Telecomunicaciones | nombre |
| 0.60 | 901395491 (nit) | Punto Red Telecomunicaciones Guaviare | 28b95153c5cd80dca0ecf339f9219184 | Hola - Punto Red Guaviare | nombre |
| 0.60 | ntn-e8737d000e4f (interno) | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE VILLAVICENCIO | 34a95153c5cd80af9c56da361816c664 | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTA | nombre |
| 0.60 | ntn-2b8919162428 (interno) | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE BOGOTA | (sin page_id) | EMPRESA DE ACUEDUCTO Y ALCANTARILLADO DE VILLAVICENCIO | nombre |
| 0.50 | 830122566 (nit) | COLOMBIA TELECOMUNICACIONES S.A. E.S.P. | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.50 | 830122566 (nit) | COLOMBIA TELECOMUNICACIONES S.A. E.S.P. | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.50 | 830122566 (nit) | COLOMBIA TELECOMUNICACIONES S.A. E.S.P. | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.50 | 901715847 (nit) | Celsia Internet S.A.S. | 34a95153c5cd803b9529e523b08bbb89 | CELSIA | nombre |
| 0.50 | 900544861 (nit) | COLOMBIA MAS TV SAS | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | nombre |
| 0.50 | 819003851 (nit) | DIALNET DE COLOMBIA S.A   ESP. | 30c95153c5cd81f3900eedf6d06682e3 | Dialnet | nombre |
| 0.50 | 900548752 (nit) | TV COLOMBIA DIGITAL SAS | 32595153c5cd806096c2cbfd7b4c9329 | TV CHINACOTA DIGITAL | nombre |
| 0.50 | 900103793 (nit) | SINERGY SOLUCIONES INTEGRALES S.A.S | 30c95153c5cd8109b861c421216fc34a | INTERREDES SOLUCIONES INTEGRALES SAS | nombre |
| 0.50 | 900548102 (nit) | AZTECA COMUNICACIONES COLOMBIA S.A.S | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 901420524 (nit) | CONEXION DIGITAL COLOMBIA S.A.S | (sin page_id) | CONEXIÓN DIGITAL EXPRESS | nombre |
| 0.50 | 901420524 (nit) | CONEXION DIGITAL COLOMBIA S.A.S | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | nombre |
| 0.50 | 901420524 (nit) | CONEXION DIGITAL COLOMBIA S.A.S | (sin page_id) | SUR CONEXIÓN COLOMBIA | nombre |
| 0.50 | 901000731 (nit) | STARNET.NET S.A.S. | 32595153c5cd814ebe9bc2216631c2bb | Starnet | nombre |
| 0.50 | 805006014 (nit) | DIRECTV COLOMBIA LTDA | 34a95153c5cd80c3a1fae1c227f893b7 | DIRECTV | nombre |
| 0.50 | 900334829 (nit) | ATENEA TELECOMUNICACIONES S.A.S. | 2a295153c5cd804b9042cce3d376f2a6 | Atenea | nombre |
| 0.50 | 900976610 (nit) | @DIGITAL GROUP SAS | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 830078515 (nit) | COLUMBUS NETWORKS DE COLOMBIA LTDA | (sin page_id) | SOMOS NETWORKS COLOMBIA S.A.S. BIC | nombre |
| 0.50 | 900760531 (nit) | HIZ TELECOMUNICACIONES S.A.S | 28b95153c5cd8059bf2df4846837f6db | HIZ | nombre |
| 0.50 | 900637681 (nit) | PUNTO RED TELECOMUNICACIONES S.A.S | (sin page_id) | RED PLANET TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 900637681 (nit) | PUNTO RED TELECOMUNICACIONES S.A.S | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.50 | 901118187 (nit) | CONEXION ISP SAS | (sin page_id) | Conexión Digital - One ISP | nombre |
| 0.50 | 830058677 (nit) | IFX NETWORKS COLOMBIA S.A.S. | (sin page_id) | SOMOS NETWORKS COLOMBIA S.A.S. BIC | nombre |
| 0.50 | 901593819 (nit) | INTEGRADOS S&S.NET SAS | 28d95153c5cd80ea9a22e06ee5362179 | Integrados | nombre |
| 0.50 | 901544269 (nit) | CONECTIC TELECOMUNICACIONES S.A.S | 29495153c5cd808b9b31e45a09b40093 | Conectic | nombre |
| 0.50 | 800193670 (nit) | PROMOTORA DE TELEVISION. INTERNET Y COMUNICACIONES SAS | (sin page_id) | Internet y Televisión SAS | nombre |
| 0.50 | 901517670 (nit) | RED HOGAR TELECOMUNICACIONES SAS | (sin page_id) | RED PLANET TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901419315 (nit) | HOLA WE DIGITAL S.A.S | 28b95153c5cd80cea21ce0271cb2b226 | Hola - Digital Net | nombre |
| 0.50 | 804003326 (nit) | SISTEMAS Y TELECOMUNICACIONES DEL ORIENTE SAS | 30c95153c5cd81a28eb2fb25025a6f2d | SISTEMAS TELECOMUNICACIONES Y BIOMEDICOS | nombre |
| 0.50 | 900536302 (nit) | COLOMBIATEL TELECOMUNICACIONES S.A.S. | 28f95153c5cd80328393d34dcefa5cdd | Colombiatel | nombre |
| 0.50 | 901358482 (nit) | TELNET DE OCCIDENTE S.A.S. ZOMAC | 29595153c5cd800cbdcbefbd39c21c3d | Telnet | nombre |
| 0.50 | 900601506 (nit) | RED PLANET TELECOMUNICACIONES SAS | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.50 | 901103178 (nit) | CABLENET ENTERTAINMENT S.A.S. | 32595153c5cd814d85b2e9be8b012cb5 | CABLENET SAS | nombre |
| 0.50 | 900873821 (nit) | SERVICIOS DE TELECOMUNICACIONES E INFORMATICA SAS | 30c95153c5cd816e9db4fe9967dba73f | REGIONAL DE SERVICIOS TELECOMUNICACIONES ZOMAC | nombre |
| 0.50 | 900292948 (nit) | UNIMOS EMPRESA MINICIPAL DE TELECOMUNICACIONES DE IPIALES S.A. E.S.P. | 30c95153c5cd812e8dd3d70759a261d1 | UNIMOS TELECOMUNICACIONES IPIALES | nombre |
| 0.50 | 901714003 (nit) | FIBERMAT E INGENIERIA S.A.S | 32595153c5cd81febc18c5d22a115c38 | Fibermat | nombre |
| 0.50 | 900471812 (nit) | TELNET WIRELESS SAS | 29595153c5cd800cbdcbefbd39c21c3d | Telnet | nombre |
| 0.50 | 901207561 (nit) | CORPORACION DE TELECOMUNICACIONES MARIALABAJA | 30c95153c5cd81dbb013e658f7018865 | CORPORACION CAPSOS TELECOMUNICACIONES | nombre |
| 0.50 | 901207561 (nit) | CORPORACION DE TELECOMUNICACIONES MARIALABAJA | (sin page_id) | Corp. Telecomunicaciones Marialabaja | nombre |
| 0.50 | 900806620 (nit) | MUNDO + S.A.S | 32595153c5cd816bb12af4775da5b455 | Mundo Mas | nombre |
| 0.50 | 900806620 (nit) | MUNDO + S.A.S | 32595153c5cd81f6b0a9e04ffa807ecc | Mundo Cams SAS | nombre |
| 0.50 | 800226788 (nit) | ASOCIACION COMUNITARIA DE TELECOMUNICACIONES | 30c95153c5cd81daa533cffbf766aab0 | ASOCIACION COMUNITARIA TELEBOYACA | nombre |
| 0.50 | 900389021 (nit) | CONECTTIC S A S | 2a495153c5cd8054811de935cb0d9d0d | Conecttic PTX | nombre |
| 0.50 | 901373972 (nit) | GB NET TV SAS | (sin page_id) | GLOBAL NET TV ZOMAC S.A.S | nombre |
| 0.50 | 901373972 (nit) | GB NET TV SAS | 32595153c5cd8170a3dac979a92ff888 | Medios TV Net | nombre |
| 0.50 | 900934848 (nit) | COMUNICACIONES TERRESTRES DE COLOMBIA S.A.S | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 900934848 (nit) | COMUNICACIONES TERRESTRES DE COLOMBIA S.A.S | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 900511109 (nit) | CLICK-CONECTIVIDAD SIN FRONTERAS S.A.S | 32595153c5cd8190b9f6cf104b856443 | Click Conectividad | nombre |
| 0.50 | 900969984 (nit) | TURBO REDES TELECOMUNICACIONES S.A.S. | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 901230376 (nit) | CABLENET PLUS S.A.S. ZOMAC | 32595153c5cd814d85b2e9be8b012cb5 | CABLENET SAS | nombre |
| 0.50 | 901324311 (nit) | DIGITAL COAST S.A.S. | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 900298747 (nit) | ACCESS DIGITAL S.A.S | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 800256449 (nit) | ALFASURT TV CABLE SAS. | (sin page_id) | CABLE & TV YOPAL S.A.S | nombre |
| 0.50 | 900858516 (nit) | TELNET ISP S.A.S. | 29595153c5cd800cbdcbefbd39c21c3d | Telnet | nombre |
| 0.50 | 900406277 (nit) | SILCOM TELECOMUNICACIONES S.A.S. | 34895153c5cd8024b7f3c199ba93b454 | Silcom | nombre |
| 0.50 | 901014185 (nit) | TELECOMUNICACIONES INGENIERÍA Y MERCADEO S.A.S. | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 901190453 (nit) | WISPER COMUNICACIONES S.A.S. | 28d95153c5cd806bb297e8759486aeed | Wisper | nombre |
| 0.50 | 901062418 (nit) | TELENET DIGITAL S.A.S. | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901062418 (nit) | TELENET DIGITAL S.A.S. | 32795153c5cd8001a645cec27261b182 | Telenet | nombre |
| 0.50 | 901144362 (nit) | TVI DIGITAL S.A.S. | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 900757906 (nit) | TELECOMUNICACIONES E INTERNET DE COLOMBIA SAS | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.50 | 900757906 (nit) | TELECOMUNICACIONES E INTERNET DE COLOMBIA SAS | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.50 | 901009969 (nit) | INTELCOM CALI SAS | 32595153c5cd81b79dcbdd5ff869fe3b | Intelcom | nombre |
| 0.50 | 900770495 (nit) | SPECTRA TELECOMUNICACIONES SAS | 34995153c5cd8035b816ef8774dc4d69 | SPECTRA | nombre |
| 0.50 | 901738562 (nit) | NOVA LINK TELECOMUNICACIONES S. A. S. | 2ac95153c5cd808bae9fc9c05e2cd5ff | Nova Link ISP | nombre |
| 0.50 | 900706805 (nit) | CABLE SAS | (sin page_id) | Cable Éxito | nombre |
| 0.50 | 900706805 (nit) | CABLE SAS | 29495153c5cd80aa9417f9f30a0b1310 | Super Cable | nombre |
| 0.50 | 900706805 (nit) | CABLE SAS | 32595153c5cd81e9a6e8d65ce753f7a5 | CABLE NETWORKLEK SAS | nombre |
| 0.50 | 901149481 (nit) | ETAZLA SOLUCIONES S.A.S | 34195153c5cd80a88259c2c57d11c788 | Etazla | nombre |
| 0.50 | 900327821 (nit) | NOVATEL COMUNICACIONES ISP ESP SAS | 30c95153c5cd817e9df3f2d3e9c82771 | FASTNET COMUNICACIONES ISP SAS | nombre |
| 0.50 | 901105703 (nit) | ERC EXPLORER REDES Y COMUNICACIONES SAS | 34295153c5cd80ec9cc0c92ab4ba81cf | ERC EXPLORER | nombre |
| 0.50 | 901014982 (nit) | CONEXION TOTAL DE OCCIDENTE S.A.S | (sin page_id) | CONEXION TOTAL A INTERNET S.A.S. | nombre |
| 0.50 | 901171521 (nit) | EASYTEC COMUNICACIONES SAS | 29695153c5cd804784d0eeee5e27bfc4 | EasyTec | nombre |
| 0.50 | 901782048 (nit) | DIGITAL RED S.A.S | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 811019612 (nit) | ASOCIACION DE TELEVISION TELEBOYACA | 30c95153c5cd81daa533cffbf766aab0 | ASOCIACION COMUNITARIA TELEBOYACA | nombre |
| 0.50 | 901073605 (nit) | INVERSIONES Y COMUNICACIONES R.M. SAS | 2ce95153c5cd806c9bbeef1723c8e4ad | R&R Comunicaciones | nombre |
| 0.50 | 901872413 (nit) | NOVARED COMUNICACIONES SAS | 28b95153c5cd80708a14f5d211d9701d | Novared | nombre |
| 0.50 | 900676962 (nit) | COMUNICACIONES WIFI COLOMBIA S.A.S. | 28b95153c5cd80e5a63ce9cc17e06dad | Hola - Comunicaciones Wifi | nombre |
| 0.50 | 900676962 (nit) | COMUNICACIONES WIFI COLOMBIA S.A.S. | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 901309372 (nit) | WIFI ALTERNATIVO VALLE S.A.S | 28b95153c5cd804b8d1ac8d0b8cecc4a | Hola - Wifi Alternativo | nombre |
| 0.50 | 901631259 (nit) | ULTRANET COLOMBIA S.A.S | 28b95153c5cd80f88c70e3fa1a290f26 | Ultranet | nombre |
| 0.50 | 900864309 (nit) | AC REDES Y TELECOMUNICACIONES S.A.S | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 900882990 (nit) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.50 | 901180971 (nit) | STARNET TECHNOLOGY S.A.S | 32595153c5cd814ebe9bc2216631c2bb | Starnet | nombre |
| 0.50 | 901811243 (nit) | CONECTATE PLUS S.A.S. | 35895153c5cd803bb8d4eb579a5517ab | Conectate | nombre |
| 0.50 | 901545381 (nit) | TV SUR COLOMBIA S.A.S | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | nombre |
| 0.50 | 901545381 (nit) | TV SUR COLOMBIA S.A.S | (sin page_id) | SUR CONEXIÓN COLOMBIA | nombre |
| 0.50 | 832001618 (nit) | TV CABLE CAQUEZA | (sin page_id) | CABLE & TV YOPAL S.A.S | nombre |
| 0.50 | 901859678 (nit) | WIFIMAX TELECOMUNICACIONES S.A.S | 2b195153c5cd8095b236d46304903f81 | Wifimax | nombre |
| 0.50 | 901494257 (nit) | ZONA WIFI INTERNETJHONF S.A.S | (sin page_id) | Vanet ( Zona wifi )  | nombre |
| 0.50 | 901436411 (nit) | LA RED.G TELECOMUNICACIONES S.A.S | (sin page_id) | RED PLANET TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901111828 (nit) | CONÉCTATE TELECOMUNICACIONES S.A.S | 35895153c5cd803bb8d4eb579a5517ab | Conectate | nombre |
| 0.50 | 901398985 (nit) | TU RED TELECOMUNICACIONES SAS | (sin page_id) | RED PLANET TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901398985 (nit) | TU RED TELECOMUNICACIONES SAS | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.50 | 901235360 (nit) | COMUNICACIONES Y SISTEMAS DE COLOMBIA S.A.S | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 901235360 (nit) | COMUNICACIONES Y SISTEMAS DE COLOMBIA S.A.S | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 900940211 (nit) | TEKCOM TECNOLOGIA Y COMUNICACIONES SAS | 30c95153c5cd81269ef3f66c24d0c042 | AMERICANA DE TECNOLOGIA Y COMUNICACIONES SAS | nombre |
| 0.50 | 901249030 (nit) | SYSTEM REDES TELECOMUNICACIONES S.A.S | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 824003884 (nit) | COMUNICAR SAS | 32595153c5cd81b180e7e53c84357fc4 | Grupo Comunicar SAS | nombre |
| 0.50 | 901486031 (nit) | COSMONET COMUNICACIONES COLOMBIA S.A.S. | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 901486031 (nit) | COSMONET COMUNICACIONES COLOMBIA S.A.S. | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 901909795 (nit) | VELOCIDAD DIGITAL SAS | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901396809 (nit) | OPTICLINE PLUS TELECOMUNICACIONES S.A.S. | (sin page_id) | FIBRARED PLUS TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901434853 (nit) | MEDIOS TV.NET S.A.S | (sin page_id) | GLOBAL NET TV ZOMAC S.A.S | nombre |
| 0.50 | 901379494 (nit) | NOVANET DIGITAL S.A.S | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901193998 (nit) | CONVERGENCIA DIGITAL S.A.S. | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901776540 (nit) | INGENIERIA Y TELECOMUNICACIONES TELNEXT S.A.S. | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 901443212 (nit) | QUALITY NET COMUNICACIONES S.A.S. | (sin page_id) | QUALITY NET JM S.A.S. ZOMAC | nombre |
| 0.50 | 901568486 (nit) | EMPRESA DE COMUNICACIONES DEL PUTUMAYO S.A.S | 35a95153c5cd802388f1e7efd3441ca2 | EMPRESA DE ENERGIA DEL PUTUMAYO | nombre |
| 0.50 | 901337214 (nit) | A&S SOLUCIONES S.A.S | (sin page_id) | BETEL SOLUCIONES S.A.S | nombre |
| 0.50 | 901337214 (nit) | A&S SOLUCIONES S.A.S | 30c95153c5cd81af8b9eec9b46eba779 | SINURED SOLUCIONES SAS | nombre |
| 0.50 | 901337214 (nit) | A&S SOLUCIONES S.A.S | 32595153c5cd81a7bd75f8bb4e7ce630 | WINS SOLUCIONES SAS | nombre |
| 0.50 | 901688739 (nit) | TELECOMUNICACIONES J&C S.A.S. | (sin page_id) | SATELITAL TELECOMUNICACIONES S.A.C | nombre |
| 0.50 | 901511793 (nit) | SERVICOSTA.NET S.A.S | 32595153c5cd80e98baaed3dad4537f7 | Servicosta | nombre |
| 0.50 | 901490938 (nit) | GLOBAL NET TV ZOMAC S.A.S | 32595153c5cd8170a3dac979a92ff888 | Medios TV Net | nombre |
| 0.50 | 901842751 (nit) | NARENET DIGITAL SAS | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901423454 (nit) | SPEED RED.NET S.A.S | 28b95153c5cd80879d81d3d064dc2d7a | Hola - Red Net | nombre |
| 0.50 | 901223283 (nit) | FAST NET COMUNICACIONES ISP SAS | (sin page_id) | NET ISP S.A.S | nombre |
| 0.50 | 901370128 (nit) | MUNDO DIGITAL TV S.A.S. | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | nombre |
| 0.50 | 901370128 (nit) | MUNDO DIGITAL TV S.A.S. | 32595153c5cd806096c2cbfd7b4c9329 | TV CHINACOTA DIGITAL | nombre |
| 0.50 | 901494727 (nit) | SISTEMAS Y REDES OPTICOM S.A.S. | 32595153c5cd8136b7c4e3afb2ecf80e | Servinet Redes y Sistemas SAS | nombre |
| 0.50 | 901516842 (nit) | WIMCO INTERNET COLOMBIA SAS | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.50 | 900989354 (nit) | INTELCOM TELECOMUNICACIONES S.A.S | 32595153c5cd81b79dcbdd5ff869fe3b | Intelcom | nombre |
| 0.50 | 901585546 (nit) | SISTEMAS TECNOLOGICOS Y DE TELECOMUNICACIONES DEL VALLE S.A.S. | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.50 | 900734423 (nit) | CALLTOPBX S.A.S. | (sin page_id) | CALLTOPBX S.A.S. VIVERCOM | nombre |
| 0.50 | 900023231 (nit) | COMUNICACIONES ESTELARES DE COLOMBIA  S.A.S. | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 900023231 (nit) | COMUNICACIONES ESTELARES DE COLOMBIA  S.A.S. | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 900268784 (nit) | WIRELESS COMMUNICATIONS COLOMBIA S.A.S. - WIRLCOMM S.A.S. | (sin page_id) | WIRELESS COLOMBIA S.A.S. | nombre |
| 0.50 | 901254880 (nit) | SOLUCIONES ISP Y COMUNICACIONES SAS | 30c95153c5cd817e9df3f2d3e9c82771 | FASTNET COMUNICACIONES ISP SAS | nombre |
| 0.50 | 901221315 (nit) | S&E INVERSIONES SAS | (sin page_id) | Inversiones Zuluaga  | nombre |
| 0.50 | 900731003 (nit) | TV CABLE EL CENTRO SAS | (sin page_id) | CABLE & TV YOPAL S.A.S | nombre |
| 0.50 | 901087729 (nit) | OSPINA COMUNICACIONES DE COLOMBIA S.A.S | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 901087729 (nit) | OSPINA COMUNICACIONES DE COLOMBIA S.A.S | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 901173300 (nit) | CABLE SUR TELECOMUNICACIONES S.A.S | 30c95153c5cd815c8d6ef89c3a7fd2df | CABLE Y TELECOMUNICACIONES CABLETELCO | nombre |
| 0.50 | 901051040 (nit) | SISTEMAS Y TELECOMUNICACIONES DEL CARIBE S.A.S | 30c95153c5cd81a28eb2fb25025a6f2d | SISTEMAS TELECOMUNICACIONES Y BIOMEDICOS | nombre |
| 0.50 | 901419071 (nit) | NET.DIGITAL S.A.S | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 900791843 (nit) | RED DIGITAL TELECOMUNICACIONES S.A.S. | (sin page_id) | RED PLANET TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 900791843 (nit) | RED DIGITAL TELECOMUNICACIONES S.A.S. | (sin page_id) | LA RED .G TELECOMUNICACIONES | nombre |
| 0.50 | 901305156 (nit) | C & B TELECOMUNICACIONES SAS | (sin page_id) | SATELITAL TELECOMUNICACIONES S.A.C | nombre |
| 0.50 | 901253577 (nit) | TELNET TV SAS | 29595153c5cd800cbdcbefbd39c21c3d | Telnet | nombre |
| 0.50 | 901424257 (nit) | WINET COLOMBIA COMUNICACIONES SAS | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 901424257 (nit) | WINET COLOMBIA COMUNICACIONES SAS | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 900053050 (nit) | TELEDATA COLOMBIA S.A.S | 29695153c5cd805d85e7d8a2367d0108 | Teledata | nombre |
| 0.50 | 901096152 (nit) | CONEXIONES TV DIGITAL S.A.S | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | nombre |
| 0.50 | 901096152 (nit) | CONEXIONES TV DIGITAL S.A.S | 32595153c5cd806096c2cbfd7b4c9329 | TV CHINACOTA DIGITAL | nombre |
| 0.50 | 901063606 (nit) | INTERMAX INTERNET INALAMBRICO S.A.S | (sin page_id) | WISPER INTERNET INALAMBRICO S.A.S | nombre |
| 0.50 | 901859732 (nit) | VIRUS COMUNICACIONES DEL CAUCA S.A.S | (sin page_id) | CABLE CAUCA COMUNICACIONES S.A.S. | nombre |
| 0.50 | 901176899 (nit) | ASOCIACIÓN COMUNITARIA ALFATV | 30c95153c5cd81daa533cffbf766aab0 | ASOCIACION COMUNITARIA TELEBOYACA | nombre |
| 0.50 | 901862468 (nit) | RF CONEXION DIGITAL S.A.S ZOMAC | (sin page_id) | CONEXIÓN DIGITAL EXPRESS | nombre |
| 0.50 | 901237614 (nit) | BIOCONEXION DIGITAL SAS | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901232118 (nit) | WIFIMAX NETWORK S.A.S | 2b195153c5cd8095b236d46304903f81 | Wifimax | nombre |
| 0.50 | 901469756 (nit) | FIBERLINK TECNOLOGIA Y COMUNICACIONES SAS | 30c95153c5cd81269ef3f66c24d0c042 | AMERICANA DE TECNOLOGIA Y COMUNICACIONES SAS | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 28b95153c5cd80dc8b33e9539d109955 | Hola - Hola Telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | BYTM TELECOMUNICACIONES  | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 28e95153c5cd806b82e1dfbe1909c573 | dlrnetwork telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 29295153c5cd8074bb62e1a60c9a5910 | Clik telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 29d95153c5cd8070915be09a7f1bb9b7 | Legon Telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 2a395153c5cd801d80fbfcf3add7e4b0 | Zafiro Telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 2a395153c5cd808d997be1547eee594a | Wisp telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 2cb95153c5cd80ffa1a3cc05d215497e | BLUE TELECOMUNICACIONES | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 30c95153c5cd81059e4dc86ff6f069a5 | COLOMBIATEL TELECOMUNICACIONES | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | TELECOMUNICACIONES DEL CATATUMBO S.A.S | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | AYSATEC TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | VIVO TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | ANTIOQUENA DE TELECOMUNICACIONES S.A.S. | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 30c95153c5cd816f97d4f9e8d4bc1bcb | VALLE TELECOMUNICACIONES SAS | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | GENIONET TELECOMUNICACIONES S.A.S | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | FERMAC TELECOMUNICACIONES S.A.S | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 30c95153c5cd81e9a8e6fe06d45a294a | REDSI TELECOMUNICACIONES | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 30c95153c5cd8132b0eff0f971dc7a7b | COMUNICAMOS + TELECOMUNICACIONES SAS | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 31995153c5cd80dc9260e6f773b97030 | KGB TELECOMUNICACIONES | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | (sin page_id) | VISS TELECOMUNICACIONES S.A.S | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 32795153c5cd804fb453f997b7b7bc81 | CJC Telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 34c95153c5cd807bbd30cea31bbf8d92 | Contecta2 telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 35895153c5cd80d18b4ac7a010c66eda | Tricom Telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 36f95153c5cd80c9b1b1da3e4e502b74 | CYD telecomunicaciones | nombre |
| 0.50 | 901882671 (nit) | S&E TELECOMUNICACIONES S.A.S. | 37a95153c5cd8014ab5fefa71a5a7e75 | Connection Telecomunicaciones | nombre |
| 0.50 | 901661083 (nit) | CONECTATE TIC S.A.S. | 35895153c5cd803bb8d4eb579a5517ab | Conectate | nombre |
| 0.50 | 901600882 (nit) | NET COMUNICACIONES ISP S.A.S | 30c95153c5cd817e9df3f2d3e9c82771 | FASTNET COMUNICACIONES ISP SAS | nombre |
| 0.50 | 901931660 (nit) | REDES Y TELECOMUNICACIONES DAGUA S.A.S. | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 901335735 (nit) | TELENET DE COLOMBIA COMUNICACIONES SAS | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 901335735 (nit) | TELENET DE COLOMBIA COMUNICACIONES SAS | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 901468722 (nit) | ANCLANET TELECOMUNICACIONES DE COLOMBIA SAS | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.50 | 901482844 (nit) | ULTRANET TELECOMUNICACIONES SAS | 28b95153c5cd80f88c70e3fa1a290f26 | Ultranet | nombre |
| 0.50 | 901477894 (nit) | FIBERNET INGENIERIA Y TELECOMUNICACIONES SAS | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 800134978 (nit) | INFORMACION Y TECNOLOGIA S.A. | (sin page_id) | TICCOL - Tecnología Información y Comunicaciones | nombre |
| 0.50 | 901734607 (nit) | HOLA TELECOMUNICACIONES COLOMBIA S.A.S | 28b95153c5cd80a8b28ff7ff9da90d3e | Hola - PRT Telecomunicaciones | nombre |
| 0.50 | 901734607 (nit) | HOLA TELECOMUNICACIONES COLOMBIA S.A.S | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.50 | 901338782 (nit) | CONEXION TOTAL COLOMBIA S.A.S. | (sin page_id) | SUR CONEXIÓN COLOMBIA | nombre |
| 0.50 | 901338782 (nit) | CONEXION TOTAL COLOMBIA S.A.S. | (sin page_id) | CONEXION TOTAL A INTERNET S.A.S. | nombre |
| 0.50 | 901381286 (nit) | NOVARED T&S SAS | 28b95153c5cd80708a14f5d211d9701d | Novared | nombre |
| 0.50 | 901950794 (nit) | REDES Y COMUNICACIONES R&C SAS | 2ce95153c5cd806c9bbeef1723c8e4ad | R&R Comunicaciones | nombre |
| 0.50 | 901314148 (nit) | DIGITAL HOLDINGS SAS | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901297314 (nit) | SISTEMAS, TELECOMUNICACIONES & SEGURIDAD S.A.S | 30c95153c5cd81a28eb2fb25025a6f2d | SISTEMAS TELECOMUNICACIONES Y BIOMEDICOS | nombre |
| 0.50 | 901556000 (nit) | SISTEMAS DE INGENIERIA EN TELECOMUNICACIONES Y REDES SAS | (sin page_id) | SISTEMAS AVANZADOS EN TELECOMUNICACIONES S.A.S | nombre |
| 0.50 | 901509714 (nit) | CONECTATE CALI S.A.S | 35895153c5cd803bb8d4eb579a5517ab | Conectate | nombre |
| 0.50 | 901043536 (nit) | INGENIERIA Y TELECOMUNICACIONES BET-EL S.A.S | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 901711176 (nit) | AMAZONAS DIGITAL SAS | 28d95153c5cd8014babbdcc5fa6b3555 | @Digital | nombre |
| 0.50 | 901621800 (nit) | ALFA REDES TELECOMUNICACIONES SAS | (sin page_id) | Redes y Telecomunicaciones Ingeniería SAS | nombre |
| 0.50 | 900656852 (nit) | GLOBALSAT COLOMBIA TELECOMUNICACIONES LTDA | 30c95153c5cd81e286a5f6ce8579ba17 | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | nombre |
| 0.50 | 900656852 (nit) | GLOBALSAT COLOMBIA TELECOMUNICACIONES LTDA | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.50 | 900656852 (nit) | GLOBALSAT COLOMBIA TELECOMUNICACIONES LTDA | 30c95153c5cd8177a4effd27adc981e4 | POLINET TELECOMUNICACIONES COLOMBIA SAS | nombre |
| 0.50 | 900901457 (nit) | R&R | 2ce95153c5cd806c9bbeef1723c8e4ad | R&R Comunicaciones | nombre |
| 0.50 | 901387189 (nit) | COMFIBRA X S.A.S | (sin page_id) | COMFIBRA  | nombre |
| 0.50 | 900560608 (nit) | ISP COLOMBIA COMUNICACIONES SAS | (sin page_id) | COMUNICACIONES WIFI COLOMBIA S.A.S | nombre |
| 0.50 | 900560608 (nit) | ISP COLOMBIA COMUNICACIONES SAS | 30c95153c5cd818195ddf141cc7e2307 | ZUMA COMUNICACIONES DE COLOMBIA SAS | nombre |
| 0.50 | 900560608 (nit) | ISP COLOMBIA COMUNICACIONES SAS | 30c95153c5cd817e9df3f2d3e9c82771 | FASTNET COMUNICACIONES ISP SAS | nombre |
| 0.50 | 901279098 (nit) | Enternet Comunicaciones sas | 33b95153c5cd807ca4fffcf7f372540f | ENTERNET | nombre |
| 0.50 | 901597377 (nit) | Alianxa Group SAS | 32595153c5cd803c9249f4aed5788a92 | Alianxa | nombre |
| 0.50 | 901639629 (nit) | TELEREDES DE COLOMBIA S.A.S | 28d95153c5cd80dca2bec4cb51dc055f | Teleredes | nombre |
| 0.50 | 902054916 (nit) | MEDIALINK TELECOMUNICACIONES S.A.S. | 35995153c5cd80fe94e6d36d60a043b3 | MediaLink | nombre |
| 0.50 | 9990000050 (interno) | Novacom | (sin page_id) | NOVACOM TIC S.A.S | nombre |
| 0.50 | 9990000019 (interno) | Vivercom | (sin page_id) | CALLTOPBX S.A.S. VIVERCOM | nombre |
| 0.50 | 9990000005 (interno) | Emcali (ISP) | 34295153c5cd80a4b167ce5fc4db83d9 | EMCALI | nombre |
| 0.50 | 9990000130 (interno) | Legon | 29d95153c5cd8070915be09a7f1bb9b7 | Legon Telecomunicaciones | nombre |
| 0.50 | 9990000152 (interno) | CALLTOPBX S.A.S. VIVERCOM | (sin page_id) | Vivercom  | nombre |
| 0.50 | 9990000159 (interno) | IPCom | 31995153c5cd802486f3c0de8a9eca47 | IPCOM SISTEMAS | nombre |
| 0.50 | 811016051 (nit) | PSI TELECOMUNICACIONES DE COLOMBIA LTDA | (sin page_id) | INTERNET Y TELECOMUNICACIONES DE COLOMBIA S.A.S. | nombre |
| 0.50 | ntn-677cb0cc1b6d (interno) | Hola - Red Net | 28b95153c5cd80cea21ce0271cb2b226 | Hola - Digital Net | nombre |
| 0.50 | ntn-0de334ef3e49 (interno) | Hola - Hola Telecomunicaciones | 28b95153c5cd803989ade8e7e627b90f | Hola - Punto Red Telecomunicaciones | nombre |
| 0.50 | ntn-00c5ebd352be (interno) | Emcali (ISP) | 34295153c5cd80a4b167ce5fc4db83d9 | EMCALI | nombre |
| 0.50 | ntn-8119deb48bf9 (interno) | CELSIA INTERNET S.A.S. | 34a95153c5cd803b9529e523b08bbb89 | CELSIA | nombre |
| 0.50 | ntn-85545f35d987 (interno) | TV CHINACOTA DIGITAL | 30c95153c5cd81428a34c00a3f7dcc54 | TV COLOMBIA DIGITAL SAS | nombre |
| 0.50 | ntn-43f2d4a22e71 (interno) | EMCALI | 29695153c5cd808aa39dd626b853a432 | Emcali (ISP) | nombre |
| 0.50 | ntn-1e376ceb9dfb (interno) | CELSIA | 37695153c5cd8025b707ea64f3fbd60a | CELSIA INTERNET | nombre |
| 0.50 | ntn-51736c69a61f (interno) | EMPRESA DE ENERGIA DE PEREIRA | 35a95153c5cd802388f1e7efd3441ca2 | EMPRESA DE ENERGIA DEL PUTUMAYO | nombre |
| 0.50 | ntn-dc064fac5937 (interno) | EMPRESA DE ENERGIA DEL PUTUMAYO | 35a95153c5cd8079a58de6e4cbd9ca1f | EMPRESA DE ENERGIA DE PEREIRA | nombre |
