# Arquitectura de pagos y suscripciones — ISIPICI (estado local 5.4)

Este documento describe el modelo vigente después de las migraciones 10–18. Los reportes de hitos anteriores conservan contexto histórico, pero no sustituyen estas reglas.

## Entidades

- Owner: cuenta activa y moneda ARS/AUD definida en servidor.
- Plan: catálogo reusable de nombre + frecuencia (weekly=7 días, biweekly=14 días, monthly=mes calendario), sin provider.
- Plan price: precio inmutable con effective_from; último precio cuya vigencia no supera la fecha de inicio relevante.
- Agreement: un cliente concreto, proveedor de cobro y snapshot de nombre, importe, moneda, cadencia y anchor. plan_id es origen opcional, no una referencia para recalcular precios en tiempo real.
- Installment: obligación de un ciclo con importe/período/moneda congelados.
- Payment: dinero confirmado. Deuda/bonificación no cuentan como ingreso.
- Allocation: cash y bonificación de un pago aplicados a una cuota. Un payment puede cubrir N cuotas y una cuota puede recibir N payments.
- Subscription change: una nueva configuración explícita para un acuerdo; scheduled/applied/cancelled. Máximo un scheduled por acuerdo.

No hay Mercado Pago, Stripe, prorrateo, impuestos, promociones, invoices ni catálogo complejo. Los identificadores futuros de proveedores pertenecen a acuerdos/pagos, nunca a Plan.

## Catálogo, precios y moneda

Planes en TopBar/menú abre un modal simple. Permite crear con precio inicial y fecha, renombrar, versionar precio y archivar. Frecuencia solo cambia si el plan jamás fue asociado a un acuerdo/cambio. Precios no se editan ni eliminan: se agrega otra versión con fecha distinta. Una fecha ya registrada se rechaza, salvo replay idéntico del aumento masivo.

Archivar no elimina precios, pagos ni suscripciones. No permite nuevas asignaciones; cambios previamente autorizados conservan su snapshot. Moneda server-derived desde owner activo, sin selector. La moneda del Owner se bloquea también con planes/precios, además de pagos/deuda/acuerdos/cuentas de proveedor.

Catálogo/historial son owner-scoped. Su RPC devuelve planes, precios, uso histórico y cantidad de suscripciones actuales sin truncar por el límite de filas de REST.

## Acuerdos, legacy y Personalizado

Un índice parcial mantiene como máximo un acuerdo pending/active/paused por cliente. Cancelled/failed son terminales; se puede crear otro acuerdo sin borrar el anterior.

Creación desde Plan: servidor resuelve plan_id + anchorDate; ignora precio/cadencia enviados por browser para definir la suscripción. Creación personalizada: plan_id=null, nombre/importe/frecuencia explícitos validados. Acuerdos anteriores conservan plan_id=null sin inferencias desde payments.plan. No se crea un plan global automáticamente para condiciones especiales.

Nueva suscripción crea acuerdo + primera cuota, sin dinero ficticio. Registrar primer pago puede hacerlo en una sola transacción con rollback total si falla/sobrepaga. Método actual: Manual. Reanudar/adoptar legacy mantiene validación de agenda original; un legacy sin cuotas debe adoptar antes de programar cambios.

## Cambio individual y aumentos masivos

Cambiar suscripción en ficha es distinto de Editar plan en catálogo. Selecciona otro Plan o Personalizado + fecha efectiva. Se congela el target autorizado al programar, manteniendo agreement.id.

Solo nuevas suscripciones (default) agrega precio al catálogo sin alterar acuerdos actuales. También suscripciones actuales crea un scheduled por acuerdo elegible. Omite acuerdos con cambios pendientes, baja programada, clientes archivados o estado/proveedor incompatible. La operación devuelve programadas/omitidas. price_id y un índice único hacen idempotente su replay; no sobrescribe un cambio individual.

Editar un scheduled requiere replaceChangeId explícito: cancela la fila anterior e inserta otra, conservando historia. Cancelar scheduled no cambia acuerdo ni cuotas. Applied no puede cancelarse retroactivamente.

## Aplicación, protección y no prorrateo

Cambio empieza en la primera fecha de la cadencia original >= effective_from, futura, posterior a todos los períodos protegidos. Protegidas: vencidas/actuales consolidadas, paid, waived, partial o con cualquier cobertura/allocation. Se conservan IDs, fechas, importes, pagos y allocations. Un anticipo puede posponer el inicio; la UI informa starts_on.

No se divide un período entre viejo/nuevo precio. Al aplicar, solo se cancelan cuotas futuras open sin cobertura desde el boundary, se actualiza el snapshot del mismo acuerdo y se generan reemplazos con la nueva cadencia/anchor. Las filas canceladas quedan en historia y el índice parcial permite reemplazar su fecha.

ensure_recurring_installments_through revisa el cambio dentro de la transacción y con locks. Antes de effective_from, navegar un calendario futuro no activa el aumento: limita nuevas cuotas al boundary anterior; cuotas ya creadas conservan condiciones y anticipos pueden postergar el cambio. Desde la vigencia, la generación puede materializar el primer ciclo futuro y marcar applied. Applied significa configuración confirmada para el siguiente ciclo, no cobro realizado.

El cron de reminders existente ejecuta generación; no se depende exclusivamente de abrir la UI ni se agregó otro scheduler. En paused no se genera/aplica hasta reanudar. Mantener el cron diario operativo.

## Pausa, baja y archivo

Pause es temporal: cancela futuras open sin cobertura, conserva deuda y configuración. Resume explícito elige un vencimiento válido en agenda; no genera ciclos omitidos durante la pausa. Cancel ahora es terminal y conserva deuda/pagos.

Cancel al final del período: acuerdo active con cancel_at_period_end y cancellation_boundary. Boundary conserva también períodos pagados por adelantado. Cancela futuras open sin cobertura posteriores al límite, no genera después y se vuelve terminal cuando la fecha de negocio supera el último día permitido. La baja programada se puede deshacer antes de ejecutarse; no admite fechas arbitrarias. El cron también finaliza una baja programada si luego se pausó.

Archivar cliente conserva todo, pausa acuerdo, cancela futuros sin cobertura y cancela cambios pendientes. Reactivar cliente no reanuda acuerdo automáticamente. Cliente archivado puede pagar deuda existente, no registrar nuevas obligaciones/pagos únicos. No hard delete.

## Pagos y calendarios

Dinero/bonificación se distribuyen en orden oldest-first; seleccionar una cuota incluye las pendientes anteriores del mismo acuerdo. Bloqueo, FKs compuestas y constraint diferido impiden sobrecobertura/contextos ajenos y exigen cash/discount totales exactos. Pagos/allocations vinculados son inmutables. Legacy pointer sigue disponible, con fallback solo cuando no existen allocations, sin contar dos veces.

Pago único exige fecha (día/rango, o serviceDate confiable de API), concepto y dinero/bonificación válidos. Su deuda queda en payments.debt, no modifica legacy_debt_amount ni deuda/cuotas recurrentes; saldo aparece en comprobante y puntos amarillos. Períodos superpuestos se permiten. No se implementaron recordatorios de deuda de únicos.

Calendario: desktop dos meses, mobile uno; negro en vencimientos/selección de fechas, puntos verdes para pagados, naranjas para cuotas pendientes/parciales y amarillos para únicos con deuda. Futuras sin punto. Selección recurrente con borde. Se conserva historial de únicos en ambos modos. Inputs numéricos no cambian con rueda.

Default del formulario: active/paused/pending → recurring; sin acuerdo/cancelled/failed → one_off. Se determina solo en la primera carga por cliente. Elección manual no cambia al navegar/refresh; otro cliente recalcula default.

## Fechas, generación y límites

Fechas DATE no se convierten en instantes. Meses conservan día original (31 → 28/29 → 31). Fecha de negocio SQL sigue convención existente UTC; no se agregó timezone de Owner. next_charge_at es cursor operativo, no necesariamente próxima cuota impaga. Snapshot de deuda suma legacy + saldo vencido/actual; anticipos no son deuda.

Generación: hasta hoy+180 días, máximo 400 iteraciones; selección máximo 100 cuotas. Consultas de calendario usan ventana de hasta 70 días más deuda anterior abierta. No generar futuros ilimitados. Cambio de frecuencia reancla solo desde el primer ciclo nuevo, sin cambiar historia.

## Seguridad, emails y operación

Todas las APIs usan cookie/session de Owner y ownership explícito, incluyendo Owner activo, cliente, acuerdo y plan. service_role bypassa RLS: la seguridad depende también de filtros/RPC verificados. Tablas plans/plan_prices/subscription_changes tienen RLS enabled, revokes PUBLIC/anon/authenticated y grants service_role. SQL errors se traducen a mensajes seguros; 401 redirige login. Contextos compuestos owner/client/moneda, locks de Owner/client/acuerdo y unique índices protegen carreras. No secretos en browser.

Un pago genera un comprobante/email con N períodos, sin un email por allocation. Cola durable de 15 separa confirmación del ledger del transporte; fallo de Resend no revierte pago. Webhook firmado e idempotente mantiene tracking. Reminders solo cuotas active/open con saldo; legacy compatible; no deuda de únicos. Optimización de dashboard y cola: [reporte](performance-audit.md).

## Activación y validación

Migraciones 10–17 ya existentes no se editaron. Nuevo SQL exacto: [20261018_plans_and_subscription_changes.sql](../supabase/migrations/20261018_plans_and_subscription_changes.sql). Ejecutar manualmente completo después de backup y confirmar previas aplicadas. Nunca repetir fragmentos ni modificar guards ante error. No se ejecutó SQL remoto, commit/push/deploy, branch/worktree ni cambios de env/dependencias.

Reporte, archivos, pruebas y smoke tests: [milestone 5.4](milestone-5.4.md). PGlite verifica transacciones/constraints; no simula dos conexiones PostgreSQL reales. UI autenticada y fechas del cron deben comprobarse manualmente antes de publicar.
