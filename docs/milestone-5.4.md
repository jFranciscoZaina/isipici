# Entrega milestone 5.4 — Planes y cambios de suscripción

## Auditoría local previa

Repo D:/Escritorio/isipici limpio al comenzar, adelantado respecto del historial inicial de esta conversación. Migraciones 10–17 presentes; 16 allocations/multicuotas/same-id, 17 deuda de únicos; cola persistente 15 y tracking existentes. Formulario one_off por defecto, SubscriptionPanel con edición inmediata, PLANS hardcoded sin consumidores. No se modificaron migraciones anteriores ni lógica de puntos/fecha/deuda de únicos.

## Archivos

Creados: supabase/migrations/20261018_plans_and_subscription_changes.sql; src/lib/payments/plans.ts y plan-types.ts; src/app/api/plans/route.ts; src/app/dashboard/components/PlansModal.tsx y PlanFields.tsx; tests/plans-db.test.mjs y plans.test.mjs; este reporte.

Modificados: src/lib/payments/lifecycle.ts, types.ts, validation.ts, calendar.ts; src/app/dashboard/components/TopBar.tsx, SubscriptionPanel.tsx, NewPaymentModal.tsx; src/app/dashboard/page.tsx; src/lib/emails/installment-reminders.ts; tests/helpers/load-ts.mjs (inyección de globals solo para tests de componente); package.json (test:plans); docs/payment-architecture.md.

## Schema y APIs

plans: id, owner_id, name, frequency, archived_at, created_at, updated_at. Sin provider/precio único.

plan_prices: id, plan_id, owner_id, amount, currency, effective_from, created_at; unique plan/fecha; append-only.

subscription_changes: owner/client/agreement, source/target plan opcionales, snapshot nombre/importe/moneda/frecuencia, effective_from, starts_on, scheduled/applied/cancelled, price_id para lote/replay, timestamps. Índice parcial de un scheduled por acuerdo, índice agreement/price para retry masivo e historial no destructivo.

Agreements agregan plan_id nullable, cancel_at_period_end, cancellation_boundary. FKs compuestas respetan ownership. Acuerdos legacy conservan null sin backfill heurístico; Personalizado sigue independiente del catálogo.

Owner currency guard contempla planes/precios. Precios derivan moneda server-side. Entidades nuevas RLS enabled, revokes y grants service_role. API GET/POST /api/plans, API /api/clients/:id/subscription ampliada para cambios/cancelación. RPCs privadas list_plan_catalog, plan_catalog_operation, resolve_plan, schedule_subscription_change, subscription_change_start, lifecycle y generación. Funciones previas se conservan versionadas como wrappers para compatibilidad.

## Comportamiento

Planes en TopBar/menú abre modal con nombre/frecuencia/precio actual/siguiente/uso y crear/renombrar/precio nuevo/archivo. Precios actuales o futuros por vigencia; nuevos-only default, existing opt-in explícito. Plan utilizado no cambia frecuencia.

Crear/cambiar suscripción ofrece Plan o Personalizado, fecha y resumen. Plan resuelto en DB; no confía en precio/cadencia del browser. Cambio individual conserva agreement.id, un pending editable/cancelable, sin prorrateo. Anticipos/partials/waived/current/overdue/allocations se protegen; starts_on informa postergación. Aumento masivo omite pendientes/baja/archivados y devuelve conteos sin fallar por ellos; replay idéntico no duplica.

Cambio futuro no se activa por navegar calendario: hasta vigencia se detiene nueva generación antes del boundary. Las cuotas existentes siguen válidas; si se pagan, pueden postergar el cambio. Desde vigencia, ensure materializa/configura ciclo editable y marca applied sin registrar dinero. Legacy sin cuotas debe adoptar antes del cambio programado.

Baja ahora terminal; baja end mantiene active hasta boundary (incluye anticipos protegidos), impide futuros después, permite undo previo y termina mediante generación/cron existente. No scheduler nuevo. Cron también atiende baja seguida de pausa; pause por sí misma sigue temporal. Pagos/deuda/historial se conservan.

NewPaymentModal recalcula default una vez por cliente: active/paused/pending recurrente; resto único. Elección manual se respeta en navegación/refresh. Sin nuevo acuerdo simultáneo. Únicos con deuda/fecha/puntos, allocations y cola mantienen comportamiento.

## SQL manual exacto

1. Confirmar proyecto correcto y migraciones 10–17 aplicadas; hacer backup.
2. Abrir SQL Editor NUEVO y ejecutar TODO supabase/migrations/20261018_plans_and_subscription_changes.sql, una vez, BEGIN hasta COMMIT. No repetir 16/17 ni copiar fragmentos. Si falla, conservar error y revisar; no borrar guards.
3. Verificar tablas con RLS; agreement plan_id/cancel flags; índices one scheduled, unique price date; RPCs y schema recargado.
4. Sin variables env nuevas ni DNS. El agente no hizo commit/push/deploy ni SQL remoto. Código nuevo requiere 18 antes de publicarlo; el usuario controla publicación.

## Smoke tests manuales exactos

1. Plan Mensual50 vigente hoy; ver catálogo y crear cliente con primer vencimiento. Confirmar snapshot50/manual. Pago parcial20 → deuda30, un pago/allocation/comprobante.
2. Plan nuevo precio60 desde mes siguiente, solo nuevas: acuerdo actual50; nueva suscripción con inicio posterior60. Cambiar nombre no reescribe snapshots.
3. Programar también actuales: cliente con cambio individual previo se omite; resto scheduled y conteos visibles. Repetir operación idéntica no duplica.
4. Abrir calendario futuro antes de vigencia: snapshot actual sigue igual y cambio cancelable. Cancelarlo no altera cuotas/acuerdo.
5. Cliente ya pagó una cuota futura (o parcial): cambio desde hoy comienza después del último período protegido. Comparar IDs/importes/allocations históricos, y nueva frecuencia/precio desde starts_on.
6. Cambiar A→B y Personalizado→Plan→Personalizado. Misma id, sin prorrateo ni ingreso ficticio. Editar pending y cancelar pending; applied no cancelable.
7. Archivar Plan: desaparece select/nuevas asignaciones, existentes y precios históricos sobreviven. Frecuencia de plan usado bloqueada, moneda de Owner bloqueada.
8. Baja end: active hasta final de período, sin cuotas posteriores, undo regenera agenda; después fecha límite termina por cron. Deuda anterior cobrable; no resume de terminal. Baja ahora conserva historia.
9. Cliente activo/pausado/pending: modal inicia recurrente; cambiar a único y navegar no lo revierte. Sin acuerdo/terminal inicia único. Cambiar de cliente recalcula.
10. Único exige día/rango; deuda propia/comprobante/puntos amarillos; recurrente multicuotas/pago parcial/bonificación/cola/email tracking intactos. Scroll de inputs no cambia importe.
11. Segundo Owner/no sesión: planes/precios/acuerdos/cambios ajenos rechazados; moneda no viene del browser. Revisar en desktop y mobile sin rediseño.
12. Confirmar cron reminder diario activo y logs: aplica cambios desde vigencia, finaliza bajas, no email a paused/paid/archived ni deuda de únicos.

## Riesgos y límites

Fecha de negocio mantiene UTC existente, no configura timezone de Owner. Horizonte180 días/400 ciclos/100 cuotas. Antes de vigencia, nuevos anticipos posteriores al boundary esperan la configuración efectiva; cuotas preexistentes pueden pagarse conservando snapshot y postergando cambio. Un cambio ya autorizado a plan luego archivado conserva su snapshot y puede aplicarse; nuevas asignaciones no.

Requiere cron existente operativo para materializar sin UI; no llama providers. Sin pruebas visuales autenticadas en dispositivos reales ni concurrencia de dos conexiones Postgres: PGlite verifica locks/transacciones/unique/rollback, no sustituye prueba de carga. No MP/Stripe ni recordatorios de deuda de únicos.

## Validación

Suite completa `npm test`: **75/75 aprobados** (pagos, lifecycle, allocations, schedule, seguridad, emails/reminders, tracking, cola y planes). `npm run test:plans`: **7/7 aprobados** tras los últimos ajustes, con múltiples escenarios SQL y componente. `npm run typecheck`, `npm run lint` completo y build final **aprobados**, sin errores ni advertencias de lint. `git diff --check` aprobado; 13–17 sin cambios. No se realizó smoke test autenticado ni concurrencia real multiconexión.

## Ajuste de UX posterior

Nuevas suscripciones y cambios requieren plan del catálogo; se retiró Personalizado sin borrar acuerdos históricos. Crear un plan no solicita fecha: su precio inicial queda disponible desde el comienzo del calendario y cada suscripción toma su inicio del primer pago. Editar precio ofrece desde ahora o programado con calendario. El dinero recibido se completa con el precio vigente (hoy si aún no se eligió inicio), sigue editable y no se borra al navegar. No requiere otra migración.
