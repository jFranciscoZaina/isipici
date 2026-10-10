# Suscripciones, cuotas y pagos — ISIPICI

```text
Cliente
 ├── Suscripción vigente (0..1): pending/active/paused
 │    ├── Cuota → uno o varios pagos
 │    └── Cuotas siguientes, aunque la anterior siga impaga
 ├── Suscripciones terminales y deuda conservada
 └── N pagos únicos, con fechas iguales/superpuestas permitidas
```

agreements = reglas recurrentes. installments = obligaciones. payments = dinero confirmado; un intento fallido o deuda no crea un pago ficticio. Stripe Australia/Mercado Pago Argentina no están integrados: charge_paid se normalizará a canonical payment, charge_failed conserva cuota open sin cambiar el acuerdo a failed.

## Fechas y moneda

created_at es la fecha real del pago; period_from/to es el período de servicio inclusive; billing_anchor_date conserva la fecha original de la cadencia; next_charge_at es el cursor operativo de cuotas aún no generadas. clients.next_payment_date incluye las cuotas abiertas de un acuerdo activo. El recibo de cuota utiliza ese vencimiento operativo tras confirmar el pago, sin anunciar cobros de acuerdos pausados/terminales.

weekly → week x1 (7 días), biweekly → week x2 (14 días), monthly → month x1. schedule.ts y SQL conservan el día original: 31/01 → 28/02 o 29/02 → 31/03 → 30/04. YYYY-MM-DD es fecha de calendario sin desplazamiento UTC/local. RangeCalendar se reutiliza: single en agenda, range para únicos, próximas fechas gris oscuro con n6. No se pide frecuencia/anchor al pagar una cuota existente.

Owner activo determina ARS/AUD en servidor; payments.currency es snapshot inmutable. No hay conversión, variables nuevas ni dependencias. Se mantienen ownership explícito, cuenta de proveedor conectada, RLS/revokes/service_role, locks e idempotencia externa. Los IDs del browser nunca sustituyen la cuenta autenticada.

## Lifecycle

Un índice único parcial owner/client impide dos acuerdos pending/active/paused, incluso de proveedores diferentes. cancelled/failed permiten crear otro. La migración da REVIEW_REQUIRED si ya hay duplicados; no elige qué borrar.

- Crear: acuerdo manual active + primera cuota, transaccional. Sin payment ni ingreso hasta recibir dinero. El formulario también permite crear y pagar parcialmente la primera cuota en una transacción.
- Pausar: paused, conserva configuración/historia/deuda. Cancela futuras open sin cobertura; conserva vencidas y parcialmente pagadas.
- Reanudar: acción explícita y vencimiento >= hoy válido en la cadencia original. No cambia anchor ni crea ciclos retroactivos de la pausa. Una cuota terminal no se reabre: elegir otra fecha válida.
- Cancelar: cancelled + cancelled_at, definitivo; conserva deuda. No admite resume.
- Cambiar plan: cancela anterior y crea otro active con importe/frecuencia/anchor nuevos, en una transacción que revierte completa si falla. Deuda anterior no se transfiere.
- failed: fallo estructural del acuerdo; un cobro individual fallido no lo provoca.

DB bloquea cambios de configuración histórica y reactivación de terminales. Lifecycle ordinario admite manual; no hace llamadas a providers. Archive pausa también acuerdos externos en el dominio local; la futura sincronización real con providers requiere un adapter.

## Cuotas y parciales

recurring_installments: owner/client/agreement, due_date, período, amount_due, currency, status open/paid/waived/cancelled y timestamps. Unique(agreement,due_date), FKs compuestas de contexto sin cascadas que destruyan cuotas. Importe/fechas/contexto son inmutables.

payments.recurring_installment_id es nullable para legacy y siempre null en one_off. Muchos payments cubren una cuota; un payment no se distribuye entre varias.

covered = SUM(amount + discount); remaining = MAX(amount_due - covered,0); ingreso = SUM(amount). Cuota100, pagos60 y20+descuento20: paid, ingreso80. Locks + guard impiden sobreaplicación concurrente. Paid se establece al cubrir todo. Los pagos vinculados no se editan/borran.

partially_paid y overdue se derivan: open con cobertura parcial, u open con due_date<hoy y saldo. Deuda operativa incluye due_date<=hoy. Futuras no cuentan; paid/waived/cancelled tampoco. Condonar saldo es explícito, sin ingreso.

## Generación y legacy

ensure_recurring_installments_through genera fechas faltantes en active + installments_enabled, independiente del pago anterior. Usa anchor/cursor/unique. Máximo horizonte hoy UTC+90 días y 400 iteraciones por transacción; backlog mayor requiere revisión/catch-up con horizontes menores. La primera cuota se crea explícitamente, sin generar años anticipados.

Consulta de ficha/formulario y cron existente aseguran horizonte de cinco días. Paused/cancelled/failed/archived no generan ciclos. Snapshots se refrescan en operaciones/lecturas/cron; dashboard deriva saldo vencido adicionalmente. Sin lecturas ni cron un snapshot puede quedar desactualizado al cambiar el día.

clients.legacy_debt_amount separa el saldo histórico: se inicializa desde current_debt al empezar operaciones nuevas, sin inventar cuotas. Deuda total = legacy + remaining de cuotas open vencidas. Pago deuda legacy sigue disponible después de pagos modernos y con cliente archivado.

Acuerdos anteriores reciben installments_enabled=false, sin backfill. “Empezar cuotas” pide fecha futura explícita en la agenda de un legacy activo con anchor. Sin anchor/cadencia compatible, revisar o Cambiar plan; pagos/deuda quedan intactos. Reanudar un acuerdo con anchor adopta cuotas desde la fecha elegida. pending bloquea crear otro; archivo lo deja paused.

register_legacy_payment es adaptador privado de servidor, no API pública. Mantiene llamadas legacy sin cuota cuando no generan obligaciones sobre un acuerdo moderno. Historial sin recurring_installment_id y service_date fallback siguen funcionando. One-off opcional día/rango no toca deuda/agreement/cuota/agenda; permite superposición y cuenta ingreso.

## Archivo, UI y emails

DELETE HTTP ahora archiva transaccionalmente: archived_at + pausa vigente + cancelación de futuras sin cobertura. Un trigger prohíbe DELETE físico de clients, incluso ante cascadas legacy. Payments, agreements, cuotas, email_logs y deuda permanecen.

Reactivar solo limpia archived_at; NO reanuda suscripción. Se requiere Resume explícito. Archivado no admite nuevos únicos/obligaciones; sí pago explícito de deuda legacy o cuota vencida. El filtro Dados de baja permite consultar/reactivar/pagar deuda.

SubscriptionPanel en ficha: estado, cuotas, crear/pausar/reanudar/cancelar/cambiar/condonar y archive/reactivate. NewPaymentModal elige cuota pendiente, usa importe/moneda/agenda guardados y permite parcial/bonificación; sin acuerdo muestra Crear suscripción y registrar primera cuota.

Reminders upcoming/due conservan servicio compartido: due sigue siendo alias del reminder a cinco días; no se agregó otro cron. Generan cuotas y envían solo para active + open con saldo/fecha objetivo. Paused/terminales/archivados/paid/waived/cancelled quedan fuera. Legacy solo sin acuerdo o con active legacy. Nunca se usa período de únicos.

Dedup por installment-id + due-date, mismo Resend/logging. Se revalida estado antes de enviar; un envío de red ya iniciado no puede retirarse si se pausa simultáneamente. Una futura outbox puede coordinar providers con mayor rigor. Fallos de email no revierten pago. Receipt conserva fecha real, período, moneda histórica, dinero recibido, nota escapada y saldo de cuota; no anuncia cobro futuro de pausadas.

## Migración manual y smoke tests

Nueva y única: supabase/migrations/20261013_subscription_lifecycle.sql, BEGIN/COMMIT. 10/11/12 intactas. No aplicada a Supabase. No se editó .env.local ni se hizo commit/push/PR/branch/worktree/deploy.

1. Respaldar y confirmar proyecto correcto y migraciones 10/11/12 aplicadas.
2. En SQL Editor revisar duplicados:

```sql
select owner_id,client_id,count(*) from public.recurring_agreements
where status in ('pending','active','paused')
group by owner_id,client_id having count(*)>1;
```

Debe dar cero filas. Si hay duplicados, reconciliar manualmente cuál es vigente, conservando historia; la migración falla REVIEW_REQUIRED hasta resolverlos.
3. New query: pegar íntegra 20261013_subscription_lifecycle.sql y ejecutar una vez. No repetir anteriores.
4. Verificar archived_at/legacy_debt_amount, recurring_installments, recurring_one_current y permisos. Si PostgREST conserva cache: NOTIFY pgrst, 'reload schema';
5. Publicar solo después de verificar schema. No se realizó publicación.

Smoke manual con cliente propio de prueba:

- Crear mensual31: cuota, cero ingresos. Pagar60 y luego20+20bonificación: paid, ingreso80. Probar sobrepago: rechazo.
- Semanal/quincenal impaga: siguiente cuota igualmente generada al consultar/cron; repetir no duplica.
- Pausar con deuda/futura/parcial: deuda y parcial conservadas, futura sin cobertura cancelada, sin reminders. Resume válido: no ciclos de pausa. Fecha inválida: sin cambios.
- Cambiar plan con deuda: anterior cancelled, uno nuevo active, deuda anterior intacta; cancelada no admite resume.
- Dar de baja: historial/deuda/email intactos, suscripción paused. Reactivar: sigue paused. Deuda archivada cobrable; nuevos únicos/suscripciones rechazados.
- Únicos de mismo día/rangos superpuestos + recurring: agenda/deuda iguales, ingresos correctos, receipt sin vencimiento recurrente.
- Legacy: historial/service_date intactos, saldo anterior cobrable, adopción explícita sin cuotas retroactivas. Owner ajeno/inactivo y moneda incorrecta rechazados.
- Verificar embeds reales de PostgREST de historial/cuotas y resultados del cron. PostgreSQL aislado y mocks no sustituyen esta prueba remota.

## Archivos y validación

Creados: migración13; src/lib/payments/lifecycle.ts; src/lib/emails/installment-reminders.ts; API clients/[id]/subscription/route.ts; SubscriptionPanel.tsx; tests/subscription-lifecycle*.test.mjs.
Modificados: types/validation/service; APIs payments/clients/clients[id]; NewPaymentModal/ClientDetailModal/ClientContextMenu/SearchBarAndTabs/dashboardpage; reminders; package; tests autorización/regresión y documento. Reutiliza schedule y RangeCalendar.

48 tests aprobados; typecheck, build y lint de modificados. SQL10/11/12/13 probado secuencialmente solo en PGlite. Cobertura: unicidad/carreras en cola, cuotas impagas/idempotencia/mes31/bisiesto, parciales/descuento/sobreaplicación, deuda/futuras, lifecycle/archivo, replay externo/legacy/monedas/permisos. PGlite no simula dos conexiones PostgreSQL simultáneas; índice y locks protegen la concurrencia real.

## Despacho de comprobantes (optimización posterior)

Las migraciones 14 y 15 agregan resumen SQL del dashboard e intención/cola durable de comprobantes. La API de pagos puede responder `receipt_status: queued`; envío y recuperación suceden después de confirmar el ledger. El flujo legacy permanece hasta aplicar estas migraciones. Ver [activación y límites](performance-audit.md), especialmente scheduler, leases e idempotencia.

## Milestone 5.3: allocations y edición del plan

Esta revisión reemplaza la regla 5.2 de cancelar y crear un agreement al cambiar de plan: ahora se conserva el mismo id. El pago es una transacción real y puede aplicarse a N cuotas mediante payment_allocations. Los snapshots históricos de cuotas pagadas, vencidas, parciales o con allocations permanecen intactos.

Ver [entrega 5.3 y pasos manuales](milestone-5.3.md) para schema, calendario, algoritmo, compatibilidad, validaciones y pruebas de humo. Las migraciones 13, 14 (dashboard) y 15 (emails) ya existentes no se modifican; la nueva es 20261016_payment_allocations.sql.
