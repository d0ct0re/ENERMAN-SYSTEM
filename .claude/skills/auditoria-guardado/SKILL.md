---
name: auditoria-guardado
description: "Encuentra y corrige bugs de \"esto no se guardó\" / \"se revirtió solo\" / \"desapareció después de un rato\" / \"reapareció algo que ya había borrado\" / \"lo edité y sigue saliendo lo viejo\" en Projectra (ENERMAN-SYSTEM). Empieza SIEMPRE con el protocolo de localización (¿está bien en la BD? ¿la API contesta bien? ¿el frontend lo normaliza mal?) antes de tocar el backend — la causa real puede estar del lado del cliente (normalizeUsers y similares), no en save_state. Úsala cuando el usuario reporte cualquiera de esas frases, cuando se agregue un endpoint atómico nuevo (create_/update_/delete_/add_*), o antes de un deploy importante / demo en vivo para auditar el sistema completo de punta a punta."
---

# Auditoría de guardado atómico vs. save_state (Projectra / ENERMAN-SYSTEM)

Esta skill encapsula un patrón de bug que ya se encontró y corrigió varias veces en este
proyecto (usuarios el 2026-09-14, proyectos — expenses/invoices/comments/history/participants —
el mismo día). Es MUY probable que el mismo patrón exista sin descubrir en otras áreas. El
trabajo de esta skill es: (1) explicar el patrón, (2) dar el método exacto para auditar
cualquier área nueva, (3) listar qué ya se revisó y qué no, y (4) fijar cómo reportar y
desplegar el hallazgo — porque el usuario es no-técnico, tiene una presentación en vivo
inminente, y sube todo a mano por FTP/hPanel (no hay CI/CD ni deploy automático).

## PRIMERO: localiza en qué capa está el bug — antes de tocar el backend

Lección cara del 2026-09-14: se pasaron ~5 horas revisando el backend (locking, save_state,
triggers, WAF, caché de MySQL) para un reporte de "edité el correo y sigue saliendo el viejo",
cuando la causa real era UNA línea en el FRONTEND (`normalizeUsers()` en `src/App.tsx`) que
forzaba el correo de los 21 usuarios "seed" originales a un valor hardcodeado, sin importar lo
que dijera la base de datos — el backend guardaba perfecto desde el principio de todo.

Antes de escribir una sola línea de PHP, corre este diagnóstico barato (~5 minutos, no 5 horas):

1. **¿El dato YA está bien en la BD ahora mismo?** Pide una consulta directa en phpMyAdmin
   (`SELECT ... JSON_UNQUOTE(JSON_EXTRACT(payload, '$.campo')) ...`) o una prueba funcional que
   dependa de ese dato (ej.: si es un correo, pide iniciar sesión con el valor nuevo). **Si la
   BD ya tiene el valor correcto, el bug NO es de guardado — es de lectura/normalización/render
   en el frontend. Deja de tocar `api/` de inmediato y salta al paso 3.**
2. **¿La API contesta con el dato correcto?** Mira la respuesta cruda del endpoint atómico
   (Network → Response), o pide un refresco completo (F5) justo después de guardar. Si el
   servidor contesta bien pero la pantalla sigue mostrando lo viejo incluso después de un F5
   limpio, tampoco es caché del navegador — es cómo el código de React transforma esos datos
   antes de pintarlos.
3. **Busca funciones de "normalización"/"merge con seed"/"merge con default" en el frontend**
   que reciban el dato del servidor y lo combinen con algo local/hardcodeado. `grep` por
   `usersSeed`, `normalizeUsers`, o cualquier patrón `{ ...seed, ...incoming, campo: seed.campo }`
   (preferir el valor fijo sobre el que manda el servidor) — eso es exactamente el bug que costó
   5 horas encontrar. Revisa TODOS los campos de esa función, no solo el que falla: si un campo
   estaba hardcodeado al seed en vez de usar `incoming?.campo ?? seed.campo`, es sospechoso que
   otros campos parecidos tengan el mismo error (en este caso solo `email` lo tenía; `firstName`,
   `lastName`, `isActive`, `password` ya preferían correctamente el valor del servidor).

**Regla dura: si el paso 1 confirma que la BD ya tiene el dato correcto, no sigas investigando
el backend para ESE reporte.** Las mejoras de arquitectura que se hicieron ese día en paralelo
(locking, sacar `users` de `save_state`, verificación de correo duplicado) siguen siendo válidas
y vale la pena mantenerlas — pero no eran la causa de ese bug puntual, y perseguirlas primero,
en vez de localizar la capa correcta desde el inicio, fue el error que hizo perder horas y la
confianza del usuario.

## El patrón del bug (causa raíz — SOLO si el paso 1 de arriba confirmó que el dato SÍ se
revierte o se pierde también en la base de datos, no solo en pantalla)

El backend PHP (`api/`) tiene DOS mecanismos de guardado que compiten entre sí:

1. **Endpoints atómicos** — `create_user`, `update_user`, `delete_user`, `update_project`,
   `add_project_expense`, `delete_project_expense`, `add_project_invoice`,
   `update_project_invoice`, `add_project_comment`, `create_request`, `update_request`,
   `delete_request`, etc. Cada uno hace un cambio quirúrgico y puntual, normalmente con
   `SELECT ... FOR UPDATE` o un `array_merge` sobre solo los campos que cambiaron.
2. **`save_state`** (`api/routes/state.php`) — un "respaldo de seguridad" que el frontend
   dispara solo con un debounce de 3s (`src/App.tsx`, el `useEffect` que llama a
   `saveAppState({ users, projects, requests, notifications })`) cada vez que CUALQUIER cosa
   cambia en el estado local de CUALQUIER sesión abierta (no solo la del Gestor).

El bug ocurre cuando `save_state` manda una copia COMPLETA de un arreglo (`users`, `projects`)
que quedó desactualizada en el navegador de alguna sesión — porque esa sesión hizo su propio
cambio local (bump de `updatedAt`) sin haberse enterado todavía (por polling) de un cambio
atómico que otra sesión acaba de hacer. Si `save_state` no protege ese campo específico, la
copia vieja pisa o borra el cambio nuevo en la base de datos — de forma silenciosa, sin error
visible para nadie.

Dos variantes del mismo bug, igual de importantes:

- **Reversión de campo**: un campo (correo, nombre, un gasto, una factura, un comentario)
  vuelve a su valor anterior unos segundos/minutos después de guardarlo bien.
- **Borrado fantasma**: una fila que se acaba de crear atómicamente (ej. un usuario nuevo)
  desaparece de la base de datos porque una pestaña vieja, sin saber que existe, mandó su
  `save_state` con un arreglo que no la incluye, y el sync hizo `DELETE ... WHERE id NOT IN (...)`.

## Método para auditar CUALQUIER área (nueva o vieja)

Para cada tipo de entidad (proyectos, usuarios, solicitudes, notificaciones, mensajes de chat,
facturas, gastos, `app_settings`, lo que sea nuevo que se agregue):

1. **Lista los endpoints atómicos** que existen para esa entidad — busca en `api/routes/*.php`
   con `grep -n "\$action === '"` filtrando por el nombre de la entidad. Anota qué campo(s)
   toca cada uno.
2. **Busca si esa misma tabla/arreglo también se sincroniza en bloque** en `save_state`
   (`api/routes/state.php`) o en `restore_backup` (`api/routes/admin.php`). Si NO se sincroniza
   ahí (como ya pasa con `requests` y `notifications`), esa área está a salvo de este bug por
   diseño — confírmalo y sigue.
3. Si SÍ se sincroniza en bloque, para cada campo/sub-arreglo que tiene su propio endpoint
   atómico (paso 1), verifica que `save_state` NUNCA lo tome del payload del cliente — debe
   quedarse siempre con el valor de la BD (`$before[...]`), exactamente como ya está hecho para
   `files`, y desde el 2026-09-14 también para `expenses`, `invoices`, `comments`, `history`,
   `participants` de proyectos. Si falta esa protección, agrégala siguiendo ese mismo patrón.
4. Si la sincronización en bloque usa `syncRows()` (upsert + `DELETE ... WHERE id NOT IN`),
   pregúntate: ¿esta llamada puede llegar con un arreglo incompleto de una sesión desactualizada
   en circunstancias normales? Si sí (como pasaba con `app_users` en `save_state`), esa función
   NUNCA debe borrar — usa un upsert-only como `syncUserRows()`/`syncProjectRows()` (en
   `api/core/functions.php`) en vez de `syncRows()`. Reserva `syncRows()` (con delete) solo para
   operaciones explícitas de restauración total desde backup, donde SÍ se quiere reemplazar todo.
5. Cualquier comparación de `updatedAt` para decidir "quién gana" debe usar `strtotime()` en PHP,
   nunca comparar los strings crudos — PHP emite `...+00:00` (`gmdate('c')`) y JS emite `...Z`
   (`toISOString()`), y comparando como texto el de JS gana por formato aunque el de PHP sea en
   realidad más reciente (bug ya resuelto una vez para proyectos, ver
   `tech_debt_timestamps.md` en memoria).
6. **Verifica el borrado en cascada**: cuando exista un `delete_X` atómico, confirma que limpia
   TODAS las referencias cruzadas (notificaciones relacionadas, mensajes de chat, archivos
   físicos, IDs enlazados en otras entidades, listas de `participants`) dentro de ESE MISMO
   request — no dejarlo para que el frontend "eventualmente" lo sincronice, porque eso es
   exactamente lo que causaba el borrado fantaso de participantes al eliminar un usuario.
7. **Segundo patrón, distinto pero relacionado — "lost update" entre DOS endpoints atómicos.**
   Este NO es el bug de save_state, es otra causa raíz que se encontró auditando el mismo día:
   varios endpoints atómicos hacen `SELECT payload → modificar en PHP → UPDATE payload` SIN
   `FOR UPDATE` ni transacción. Si dos requests casi simultáneos tocan el MISMO row (ej. alguien
   sube un archivo mientras otro agrega un gasto al mismo proyecto), ambos leen el mismo payload
   viejo y el que escribe último pisa por completo lo que dejó el primero — aunque cada endpoint
   sea "atómico" en el sentido de tener su propio action dedicado. La corrección es mecánica:
   envolver en `$pdo->beginTransaction()` + `SELECT ... FOR UPDATE` + `$pdo->commit()` (con
   `rollBack()` en cada salida temprana), copiando el patrón ya probado en `update_project`
   (`api/routes/projects.php`). Se corrigió el 2026-09-14 en `add_project_comment`,
   `add_project_expense`, `delete_project_expense`, `add_project_invoice`,
   `update_project_invoice` (`projects.php`), `upload_file`, `delete_file`, `set_file_status`
   (`uploads.php`), y `update_request` (`requests.php`). **Al auditar una entidad nueva, revisa
   TAMBIÉN esto**: cualquier endpoint con `SELECT payload FROM <tabla> WHERE id = ?` sin
   `FOR UPDATE` seguido de un `UPDATE ... SET payload = :p` es candidato a este mismo hueco.

## Estado conocido — última auditoría: 2026-09-14

No confíes ciegamente en esta lista: el código pudo cambiar desde entonces. Antes de decirle
al usuario "esto ya está resuelto", vuelve a leer el archivo/línea citada.

- ✅ **Bug real del 2026-09-14 (correo de usuario "no se guardaba")**: NO era del backend.
  `normalizeUsers()` en `src/App.tsx` (~línea 2800) mezcla lo que manda el servidor con
  `usersSeed` (los 21 usuarios originales hardcodeados) y tenía `email: seed.email` — forzaba
  SIEMPRE el correo viejo hardcodeado para esos 21 usuarios, sin importar la BD. Por eso crear
  un usuario nuevo funcionaba (no está en `usersSeed`) pero editar el correo de uno de los 21
  originales nunca se reflejaba, aunque la BD ya tuviera el valor correcto (confirmable con
  login). Corregido a `email: incoming?.email ?? seed.email` — mismo patrón que ya usaban
  `firstName`/`lastName`/`isActive`/`password` en esa misma función. Si aparece un bug similar
  con OTRO campo de usuario que "no se refleja", sospecha primero de esta función.

- ✅ **Usuarios** (`app_users`): protegido por `updatedAt` + `syncUserRows` (upsert-only) en
  `api/routes/state.php` / `api/core/functions.php`. `delete_user` también limpia
  `participants` en todos los proyectos (`api/routes/users.php`).
- ✅ **Proyectos — campo raíz**: ya tenía protección por `updatedAt` (`syncProjectRows`).
- ✅ **Proyectos — expenses/invoices/comments/history/participants**: BD siempre gana en
  `save_state` (`api/routes/state.php`, bloque "BD siempre gana para estos campos").
- ✅ **Proyectos — files**: ya protegido desde antes (mismo bloque).
- ✅ **Solicitudes (`requests`)**: excluidas por diseño de `save_state` — 100% atómicas
  (`create_request`/`update_request`/`delete_request`). Confirmar que se mantenga así si se
  agrega algún endpoint nuevo de solicitudes.
- ✅ **Notificaciones**: excluidas por diseño de `save_state` — gestionadas por sus propios
  endpoints (`create`/`delete`/`mark_read`).
- ✅ **Chat de proyecto** (`project_messages`): tabla completamente aparte, no vive dentro del
  payload JSON de `projects` y `save_state` nunca la toca. `send_message` solo hace INSERT
  (no hay edición/borrado individual de mensajes), `get_messages` es lectura con cursor `since`.
  Ya se limpia junto con el proyecto en `delete_project`. Sin riesgo de este patrón.
- ✅ **Solicitudes en corrección**: confirmado — los 5 call sites de `apiUpdateRequest`
  (`handleApproveRequest`/`handleCorrectionRequest`/`handleRejectRequest`/
  `handleReactivateRequest`/`handleResubmitRequest` en `src/App.tsx`) mandan solo 2-6 campos
  puntuales, nunca la solicitud completa. Sumado a que `requests` está excluido de `save_state`,
  esta área está a salvo del patrón principal. Hallazgo APARTE (patrón del punto 7, no éste):
  `update_request` no tenía `FOR UPDATE` — corregido el 2026-09-14.
- ✅ **`importantDates`** de proyectos: mismo hueco que expenses/invoices — sí viajaba dentro
  del objeto proyecto completo en `save_state` sin protección. Agregado a la lista "BD siempre
  gana" en `api/routes/state.php` el 2026-09-14.
- ✅ **`app_settings`** (switches del Gestor: facturas, cobros): confirmado por lectura directa
  de `save_state` — nunca se referencia `app_settings` ahí ni en `restore_backup`. Mecanismo
  100% separado (`get_app_settings`/`set_app_setting`). Sin riesgo de este patrón.
- ℹ️ **Bajo riesgo, no urgente**: `deleted_items_archive` (solo se inserta, nunca se
  sincroniza en bloque) y `sequence_counters` (ya es un contador atómico con su propio
  endpoint).
- ⚠️ **NO AUDITADO TODAVÍA — sistema de notificaciones leído/descartado** (marcadores
  `isReadMarker`/`isDismissMarker` en `api/routes/notifications.php`, y el "tercer nivel" de
  `dismissedNotifKeys`/`readNotifKeys` embebido en cada usuario). Esto es la causa raíz PARADA
  desde antes ([[project_notification_redesign_pending]] en memoria) de un bug distinto y ya
  conocido ("no se pudo guardar el marcar como leído"). No se tocó hoy — el usuario ya decidió
  esperar a mandar su propio diagrama para rediseñarlo, no parchearlo más.
- ⚠️ **NO AUDITADO — `restore_backup`** (`api/routes/admin.php`): usa `syncRows()` (con delete)
  para `app_users`/`projects`/`requests`/`notifications`, lo cual es correcto para una
  restauración explícita total — pero no se verificó línea por línea que la restauración en sí
  no tenga otro problema (ej. no perder `password` hasheado de usuarios activos si el backup es
  viejo). Bajo riesgo porque es una acción manual y rara, no automática.

## Cómo reportar y desplegar (reglas fijas de este proyecto)

- El usuario es no-técnico y escribe en español casual, a veces con errores de dictado por voz.
  Explica el bug en términos de "qué se puede perder y cuándo" (ej. "si dos personas tocan el
  mismo proyecto casi al mismo tiempo, uno de los cambios se puede perder"), no en jerga de
  concurrencia.
- Nunca hagas deploy tú mismo — no hay FTP ni acceso al servidor. Siempre termina diciendo
  EXACTAMENTE qué archivos subir. Si solo tocaste PHP (`api/`), aclara que NO hace falta
  `npm run build`. Si tocaste algo en `src/`, corre `npm run build` y da el nombre del bundle
  con hash nuevo.
- Después de que el usuario confirme que subió los archivos, verifica con `curl` (hash del
  bundle en `https://ampr.site/`, o el status HTTP de rutas públicas) — nunca des por buena una
  subida solo porque el usuario dijo "ya subí".
- Si la duda es sobre integridad de datos (¿de verdad se guardó el valor correcto en la BD?),
  ofrece verificar vía phpMyAdmin (el usuario tiene acceso y ha corrido queries SQL cuando se le
  ha pedido en este proyecto antes).
- No agrupes correcciones chicas para deployar después — pero SÍ agrupa varias correcciones de
  esta auditoría en un solo lote de archivos a subir si se encontraron en la misma sesión de
  trabajo, para no pedirle 5 subidas seguidas.
