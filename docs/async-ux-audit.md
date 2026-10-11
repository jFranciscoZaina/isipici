# Auditoría UX async

Trabajo local en `D:\Escritorio\isipici`. Sin dependencias, SQL nuevo, env, commit, push ni deploy.

## Implementación

- `ToastProvider` y `useToast` reutilizan `Snackbar`; operación identificada por id, loading sin vencimiento ni X, misma notificación pasa a success/error. Un solo toast visible, prioridad a mutations pendientes, operaciones concurrentes independientes. Timers se limpian al desmontar.
- `useRemoteData` distingue idle/loading/success/error, conserva datos del mismo recurso durante refresh y separa identidades de clientes. GET inicia toast después de 300 ms, cierra al terminar, errores seguros y retry. Abort/desmontaje no comunica error ni permite sobrescritura tardía.
- PlansModal/PlanFields: vacío solo tras success vacío; precios viajan con catálogo, sin otra request ficticia de historial. Crear/editar/precio/archivar tienen feedback inmediato y bloqueo.
- SubscriptionPanel: sin suscripción solo después de respuesta exitosa, mutations inmediatas para todas las acciones, cuotas y cambios previos conservados durante refresh.
- NewPaymentModal: consulta suscripción e historial en paralelo como UNA carga; espera ambos antes de decidir el tipo. Cambio de cliente oculta información anterior; navegar conserva datos/markers del mismo cliente mientras carga. Selección manual de tipo persiste. Pago pendiente bloquea selección, cierre y doble envío.
- ClientDetailModal: pagos/emails usan estados explícitos, conservan historial durante refresh/error y cancelan al cambiar pestaña. Editar perfil usa el mismo sistema.
- Dashboard: no comunica cero antes de la primera carga válida; métricas/paginación muestran `—`, tabla conserva layout. Refresh/filtros conservan clientes y valores conocidos; retry en error. Nueva búsqueda de clientes no abre antes de carga inicial válida. Registrar/dar de baja/reactivar cliente integrados.
- TopBar usa `—` durante identificación, en vez de afirmar que es un invitado. Auth/PIN conservan su flujo local sin ruido de toasts para consultas auxiliares.
- Snackbar incluye status/polite o alert/assertive, spinner aria-hidden y texto; estilo inferior centrado existente.

## Cobertura de los 20 escenarios pedidos

`tests/async-ux.test.mjs` agrupa pruebas de componente, hook real y reloj controlado. Casos 1–4: planes loading/empty/data/error. 5–6: suscripción pending/ausente. 7–10: pago espera ambos recursos, default activo/sin acuerdo y selección manual; complementado por `tests/plans.test.mjs`. 11: hook, dashboard e historial conservan datos. 12–16: delay 300 ms, cierre/error/abort y carreras. 17–19: mutation real de planes deshabilita acción, actualiza mismo id y recupera UI. 20: métricas/tabla iniciales neutras. Extras: accesibilidad, concurrencia, timers y ausencia de errores técnicos en UI.

## Comprobación manual sugerida

En DevTools → Network → Slow 3G: abrir Planes, ficha, Pagos/Emails y pago. No deben aparecer vacíos ni ceros prematuros; loader tras 300 ms. Navegar calendario/cambiar cliente/tab rápidamente: no deben aparecer resultados anteriores ni errores por abort. Crear/editar plan y registrar pago: loading inmediato, botones bloqueados y una sola notificación que cambia de estado. Simular error/offline, reintentar, revisar móvil y lector de pantalla.

No se realizó una sesión visual autenticada en navegador. La cobertura automatizada usa componentes/hooks con fetch y reloj controlados; no sustituye ese smoke test de red lenta.

## Validación automática

Suite general: 90/90 antes del último ajuste de confirmación de baja; regresión específica de baja y suite async verificadas después. TypeScript, lint y build de producción aprobados. No requiere migración adicional.
