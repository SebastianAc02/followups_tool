// Setup global de la suite: se carga con --import antes de cada archivo de test (node
// --test corre cada archivo en su propio proceso, asi que esto aplica a todos).
//
// Por que existe: esModoPrueba() no tiene default y lanza si nadie declaro el modo (ver
// app/lib/modo-prueba.ts). Los tests llegan al Proxy del db transitivamente -- via
// repository.ts y los adaptadores -- asi que sin esto ~59 archivos tendrian que repetir
// la misma linea de ruido diciendo "no me importa el modo". Se declara una vez, aca.
//
// Los tests corren contra ISPS_DB_PATH=:memory: y PRUEBAS_DB_PATH=:memory: (ver el script
// `test` en package.json), asi que "real" aca es una base en memoria, no isps.db.
//
// El unico test que NO puede usar este setup es el del throw en si (necesita un proceso
// sin marca, y enterWith marca el contexto raiz para siempre): vive en app/db/aislado/ y
// corre con `npm run test:aislado`, encadenado al final de `npm test`.
import { marcarModoPrueba } from '../app/lib/modo-prueba.ts';

marcarModoPrueba(false);
