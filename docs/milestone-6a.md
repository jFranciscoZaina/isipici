# Milestone 6A — UX Foundation

Repo local: `D:\Escritorio\isipici`.

## Auditoría inicial

ToastProvider/Snackbar/toast-state, useRemoteData y ConfirmDialog ya existían y se conservaron. Había tres cambios locales previos: espaciados del dashboard y ClientsTable, y distribución del listado de PlansModal. Se preservaron. Faltaban indicadores inline visibles, caché por categoría y centralización de tres confirmaciones nativas.

## Archivos creados

- `src/app/dashboard/components/InlineLoader.tsx`
- `src/app/dashboard/components/ConfirmProvider.tsx`
- `src/app/dashboard/components/useSubmissionLock.ts`
- `src/lib/ui/confirm-state.ts`
- `docs/milestone-6a.md`

## Archivos modificados

Dashboard `page.tsx`; componentes `ClientsTable`, `ClientDetailModal`, `NewClientModal`, `NewPaymentModal`, `PlanFields`, `PlansModal`, `SubscriptionPanel`, `ToastProvider`; tests `async-ux.test.mjs` y `plans.test.mjs`.

## Loader y toast

InlineLoader inmediato (0 ms), con spinner CSS, tokens actuales, role=status, aria-live=polite y spinner aria-hidden. Primera carga explica qué se está esperando; refresh muestra indicador pequeño y conserva contenido. Empty requiere success y datos vacíos. Error deja retry, no loader eterno ni vacío falso.

Se conserva LOADER_DELAY=300 ms, loading toast inmediato para mutations y success/error sobre el mismo id. No se recreó toast infrastructure ni se agregaron dependencias. Snackbar y useRemoteData conservan su manejo de abort y requests rápidos sin toast.

## Cache / stale data

Dashboard mantiene hasta tres snapshots en memoria del componente: active/inactive/archived. La categoría nueva sin snapshot muestra loader y métricas neutrales; no muestra filas de otra categoría. Volver a una categoría cargada muestra su snapshot inmediatamente y hace refresh. Los datos se guardan solamente tras respuesta válida. Una mutation invalida snapshots de las otras categorías y refresca la actual, evitando reutilizar conteos conocidos como obsoletos después de cambiar un cliente/pago.

Pagos y Emails ya tenían recursos independientes con cache local en useRemoteData; se reutilizaron. Volver a una tab conserva sus datos y refresca sin borrar. Suscripciones y planes conservan sus snapshots mientras actualizan. No cache global persistente ni datos compartidos entre owners.

## ConfirmProvider y native dialogs

useConfirm devuelve Promise<boolean> y reutiliza ConfirmDialog/Modal. Aceptar devuelve true; cancelar/cerrar devuelve false. Una confirmación central a la vez; solicitudes concurrentes se rechazan con false y desmontar resuelve la pendiente como cancelada.

Se eliminaron los tres window.confirm: archivar plan, archivar cliente desde SubscriptionPanel y condonar cuota. La baja desde dashboard también usa el proveedor. La baja de suscripción conserva su UI explícita de confirmación y elección ahora/fin del período. Logout conserva su ConfirmDialog previo: Auth no se modificó. No alert/prompt/confirm nativos operativos encontrados en src; test inspecciona llamadas mediante AST para evitar falsos positivos en comentarios o templates.

## Mutations / carreras

useSubmissionLock excluye el segundo envío inmediatamente, antes de un render. Se integra en crear/editar cliente, planes, acciones de suscripción, registrar pago y baja del dashboard; se libera en finally junto con el estado visual. Confirmar una acción no bloquea trivialidades con nuevos diálogos.

AbortController y comprobaciones tras JSON siguen impidiendo que una respuesta anterior sobreescriba el cliente/rango actual. Cambiar de categoría aborta la consulta anterior. Cada loader pertenece a su operación; abort no muestra error. No cambia validación ni contabilidad de pagos.

## Tests y validación

Se amplió la suite existente con confirm accept/cancel/concurrencia/desmontaje, cache por categoría y regreso a tabs, loader inline inmediato, bloqueo de doble submit y auditoría AST de diálogos. Se conservaron pruebas de vacío real, errores, GET rápido/lento, aborts, carreras, métricas neutrales y mismo toast durante mutations.

Validación final: `npm test` **94/94 aprobados**; `npm run typecheck`, `npm run lint` (sin advertencias) y `npm run build` aprobados. `git diff --check` aprobado.

## Riesgos / smoke tests manuales

La cache dura hasta desmontar el dashboard; no sincroniza cambios de otra pestaña en tiempo real. Se actualiza al seleccionar la categoría o después de mutations locales. Las pruebas de componente usan fetch/reloj simulados: falta smoke visual autenticado en navegador, teclado y móvil.

1. Slow 3G: abrir Planes, ficha/Pagos/Emails y suscripción. Inline inmediato, toast alrededor de 300 ms, nunca empty antes de success.
2. Active → Inactive → Archived por primera vez: loader y valores neutrales; ninguna fila de otra categoría. Volver a Active: snapshot inmediato y refresh.
3. Pagos → Emails → Pagos: historial previo visible mientras actualiza.
4. Cambiar clientes y calendario rápidamente: respuesta vieja no sobrescribe; cerrar modal no genera error de abort.
5. Offline/error: retry, contenido válido conservado si existe, nunca SQL/PostgREST visible.
6. Crear plan/cliente, editar, registrar pago: doble click genera una sola request, acción bloqueada, mismo toast termina en success/error.
7. Archivar plan/cliente y condonar: ConfirmDialog, Cancelar no muta, Aceptar inicia feedback inmediato. Revisar Escape/teclado y móvil.
8. Tras una mutation, volver a otra categoría y comprobar datos frescos en vez de cache anterior.

Sin cambios DB/migraciones/SQL remoto. Sin cambios en Auth, PIN ni payment domain. Sin commit, push ni deploy.
