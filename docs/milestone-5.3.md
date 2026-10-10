# Milestone 5.3 — calendario recurrente y allocations

Implementado en D:/Escritorio/isipici, sin branch/worktree, commit, push, deploy ni ejecución de SQL remoto. Se conservaron cambios locales previos y migraciones 10–15. La numeración solicitada 14 ya estaba aplicada al resumen del dashboard: se usa **20261016_payment_allocations.sql**.

## Archivos de esta entrega

Creados:
- supabase/migrations/20261016_payment_allocations.sql
- src/lib/payments/calendar.ts
- src/lib/payments/receipts.ts
- tests/payment-allocations-db.test.mjs
- tests/payment-calendar.test.mjs
- docs/milestone-5.3.md

Modificados:
- src/lib/payments/types.ts, validation.ts, lifecycle.ts, service.ts
- src/app/api/clients/[id]/subscription/route.ts
- src/app/api/payments/route.ts
- src/app/dashboard/components/RangeCalendar.tsx, NewPaymentModal.tsx, SubscriptionPanel.tsx, ClientDetailModal.tsx
- src/app/dashboard/page.tsx (tipo de historial)
- src/lib/emails/templates/payment-receipt.ts, dispatch.ts, installment-reminders.ts
- tests/payment-domain.test.mjs, subscription-lifecycle.test.mjs (fixtures/contracts)
- package.json (test:allocations)
- docs/payment-architecture.md

Otros archivos que aparecen en git status pertenecen a trabajo anterior y se conservaron.

## Schema y transacciones

payment_allocations contiene id, owner_id, client_id, payment_id, recurring_installment_id, recurring_agreement_id, currency, amount_applied, discount_applied, created_at. FK compuestas aseguran owner/client/agreement/currency de ambos extremos. Unique payment/installment impide duplicados. CHECK evita importes negativos/allocations vacías. Índices por installment, owner/client/payment y owner/client/período para consultas del calendario. RLS habilitada y tabla/RPC privadas para service_role; APIs validan sesión, cliente y owner explícitamente.

payments añade allocation_selection (ids ordenados) y allocation_intent (intención normalizada para verificar replays). recurring_agreements añade plan_name nullable, reutilizando texto/presets existentes; no tabla Plans. Se conserva recurring_installment_id legacy. Cuotas canceladas conservan su fila; un índice parcial permite reemplazar una fecha cancelada sin borrar historia.

La transacción bloquea owner/client/agreement/cuotas, recalcula saldos y valida todos los IDs. Escribe UN payment con el cash real y el descuento total. Recorre cuotas seleccionadas por due_date/id: usa cash primero y después bonificación hasta completar cada cuota. Si alcanza solo parte de una cuota, esta queda abierta/parcial. No genera pagos por saldo ni por allocation. Ejemplo: 3 × 50 con cash 120 => allocations 50 / 50 / 20. Cash 130 + descuento 20 => 50 / 50 / 50 cubiertos, ingreso 130.

Los triggers bloquean sobreasignación de cash/bonificación, sobrecobertura y cambios de allocations/pagos asignados. Un constraint trigger diferido exige que la suma de cada componente corresponda al payment al confirmar la transacción. Se mantienen locks y validación de provider_payment_id, sin conectar Stripe/MP. Replays comparan la misma intención y retornan el mismo payment incluso si luego se pausa/archiva.

Backfill: solamente pagos con recurring_installment_id inequívoco. Verifica contexto y cobertura; ante inconsistencias aborta toda la migración con REVIEW_REQUIRED. No inventa allocations para pagos legacy sin vínculo. Lecturas suman allocations y añaden fallback de pagos vinculados SOLO cuando ese payment no tiene allocations. Un trigger adapta también writes históricos de una sola cuota y creación de primera cuota.

## Calendario y flujo

RangeCalendar admite single, range, multiple; mantiene value/onChange para fechas y agrega periods, selectedIds, onSelectInstallment, onVisibleRangeChange para cuotas. numberOfMonths=2 en todos los formularios de escritorio; el segundo mes se oculta con el breakpoint md en mobile. No componente duplicado ni dependencias nuevas; se reutilizan tokens/clases actuales.

Paid: punto oscuro durante el período. Deuda: fondo gris. Parcial: borde. Próxima: gris oscuro. Selected: estado negro existente. El vencimiento se refuerza en negrita. Click en cualquier día del período selecciona su cuota. Cuotas saldadas/canceladas/condonadas no pueden seleccionarse.

Pago único es el default sencillo, con concepto y rango opcional. Nueva suscripción conserva frecuencia/importe/primer vencimiento, modo single y primera cuota; el pago crea su allocation. Una suscripción existente muestra resumen/frecuencia/importe y calendario, sin pedir ancla/frecuencia nuevamente.

Selección múltiple es un prefijo de cuotas pendientes DEL MISMO agreement: elegir una futura incluye las anteriores; quitar una excluye esa y las posteriores. El servidor aplica la misma regla y rechaza saltos. Resumen compacto: cantidad, total pendiente y períodos. La operación admite hasta 100 cuotas; para atrasos mayores se cobran primero las más antiguas en lotes. Importes con más de dos decimales, negativos, sobrecobertura o selección vacía deshabilitan guardar. Al navegar se limpia explícitamente la selección y se consulta el nuevo rango.

GET subscription?from=YYYY-MM-DD&to=YYYY-MM-DD carga períodos que intersectan la ventana y deuda abierta anterior para no ocultarla. Genera idempotentemente hasta fin del segundo mes. Ventana máxima 70 días; horizonte futuro máximo 180 días. Paused/cancelled/failed/archived no generan futuro. El catch-up original tiene límite 400 ciclos por llamada; si lo excede requiere revisión, sin truncar deuda silenciosamente.

Pagar una cuota antigua/partial con agreement pausado o terminal no reanuda ni crea otro acuerdo. Crear una relación nueva tras baja se mantiene separado; historia y deuda anteriores siguen en ficha/selector. Los pagos únicos no crean allocations/acuerdos/cuotas ni modifican deuda.

## Editar plan

Acción separada en ficha, conserva agreement.id. Permite nombre, amount, frequency, fecha efectiva. Default: primer ciclo editable después de todos los períodos vencidos, pagados, condonados o con cualquier allocation. El owner ve esa fecha y explicación de anticipos.

Se rechazan fechas pasadas/hoy, más allá del horizonte o que solapen una obligación anterior. Cuotas paid, overdue, partial y con cualquier allocation no cambian. Solo futuras abiertas sin cobertura desde la fecha efectiva se cancelan; se conserva la fila histórica. Se actualiza la configuración del MISMO agreement y se regenera con el nuevo calendario; paused conserva estado y no genera hasta reanudar. Se conserva la semántica del día 31 y meses cortos.

La próxima fecha del agreement es el cursor de generación; el snapshot del cliente incluye el próximo saldo real abierto y cursor. current_debt suma deuda legacy separada y remaining vencido/al vencimiento; futuro abierto no cuenta como deuda y descuento no cuenta como ingreso.

## Emails y recordatorios

Un payment => un comprobante/email con varias líneas de períodos, cash/bonificación aplicados y saldo parcial. El historial muestra varias allocations dentro de un único pago. La cola guarda un solo payload y la misma clave por payment; también recupera períodos en preparación tras una interrupción. Fallas de email no revierten el ledger.

Recordatorios usan installment_coverage; una cuota futura pagada no recibe recordatorio. Paused/terminal/archived no generan ni reciben recordatorios futuros; deuda anterior continúa cobrable. Configuración/env/webhook existentes no cambian.

## Pasos manuales de Supabase y publicación

1. Confirmar que 13/14/15 terminaron correctamente. NO repetirlas.
2. Hacer backup antes de modificar el schema y revisar posibles inconsistencias legacy.
3. Abrir un SQL Editor nuevo, pegar TODO 20261016_payment_allocations.sql, ejecutar UNA vez. No copiar fragmentos. Si aparece REVIEW_REQUIRED, conservar el error y revisar los registros; no eliminar la guarda ni ejecutar el resto por separado.
4. Verificar payment_allocations con RLS enabled; columnas allocation_selection/allocation_intent en payments y plan_name en agreements; RPC recurring_calendar, edit_recurring_plan, installment_coverage, payment_receipt_allocations. La migración recarga el schema de PostgREST.
5. Con pruebas locales aprobadas, el usuario decide commit/push/publicación normal. El agente no realizó estas acciones. El código nuevo requiere migration16 para la consulta por rango y el historial de allocations.
6. No editar env ni DNS: no variables nuevas.

## Smoke test manual (pendiente de entorno autenticado)

- Desktop: dos meses visibles en pago único y alta/registro recurrente; mobile: un mes sin corte horizontal.
- Crear cliente de prueba, plan 50 mensual; confirmar primera cuota y un payment/allocation/email.
- Generar por navegación tres cuotas futuras; seleccionar última incluye anteriores. Pagar 120 sobre 150; ver dos paid y una partial con 30 pendiente, un payment y un email.
- Completar 30; comprobar tercera paid y dos pagos reales en historial.
- Otro caso: 130 cash +20 bonificación sobre150; ingreso130, tres cuotas pagadas.
- Cuota futura paid: deuda0 y sin recordatorio.
- Pausar: historial/deuda presentes, sin generación futura; cobrar deuda no reanuda.
- Editar con anticipos: default después del último período protegido; paid/partial/overdue idénticos y mismo agreement.id. Editar fecha31 y recorrer meses cortos.
- Baja terminal: no reanudar; se conserva historia/deuda. Alta nueva independiente.
- Pago único: repetir mismo día y rangos superpuestos con distintos conceptos; deuda recurrente idéntica.
- Usuario ajeno/no sesión: endpoints rechazan operaciones y lectura; moneda viene del owner.
- Revisar comprobante y estados Resend existentes; no un mail por allocation.

## Validación y límites

Validación final local: `npm test` **65/65 aprobados**, `npm run lint` completo sin errores, `npm run typecheck` y `npm run build` aprobados. Las suites de pagos, seguridad, emails y allocations también se ejecutaron por separado.

Pruebas PostgreSQL local/PGlite y componentes cubren cash/descuento, partial, 1=>2/3 cuotas, backfill, permisos, FK owner/client/currency, sobreasignación, total diferido, replay provider, edición same-id, historia protegida, replacement y fin de mes. Calendario prueba single/range previos, dos meses, multiple, estados y navegación. No se aplicó SQL a Supabase real ni se ejecutó el smoke test autenticado/visual en dispositivos reales. PGlite prueba transacciones/locks lógicos pero no representa dos conexiones PostgreSQL concurrentes; conviene revisar concurrencia real antes de Stripe.

Los anticipos se limitan a180 días por seguridad operativa. Deuda abierta anterior se carga adicionalmente a la ventana: puede crecer en cuentas con mucho atraso. El comportamiento histórico de fortnightly es14 días, sin cambiarlo a15 días arbitrariamente. Los estilos del calendario existente se preservan junto a tokens de grises; no se rediseña dashboard.

## Corrección: deuda en pagos únicos

Se recupera el campo Deuda pendiente de este pago. Se guarda en payments.debt, aparece en el comprobante y marca el período con punto amarillo. No altera clients.current_debt, legacy_debt_amount, agenda recurrente ni allocations. Dinero recibido y bonificación permanecen separados del saldo pendiente; la deuda no se cuenta como ingreso.

Aplicar manualmente **20261017_one_off_debt.sql** después de la 16, completa y una vez. Reemplaza solamente la función legacy usada para registrar pagos únicos, conserva permisos service_role y las validaciones de owner/moneda/reintentos. No modifica registros anteriores ni requiere variables nuevas. No se ejecutó en Supabase remoto.
