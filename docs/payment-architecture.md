# Arquitectura de pagos y agenda — ISIPICI

## Modelo e invariantes

PaymentType es recurring o one_off. Provider es manual, stripe o mercadopago, independientemente del tipo de pago. payments sigue siendo el ledger de pagos registrados/cobrados correctamente: eventos pending/failed, autorizaciones revocadas y acuerdos pendientes no son ingresos.

La moneda operativa es owners.default_currency (ARS/AUD), controlada desde admin. El servicio la obtiene del owner autenticado; se rechaza currency del navegador. payments.currency conserva un snapshot inmutable. No puede cambiarse la moneda de un owner con pagos, deuda, acuerdos o cuentas de proveedor. clients.currency permanece legacy, sin configurar moneda. Historial/comprobantes usan la moneda del pago; dashboard/deuda usan la cuenta. No hay conversiones ni variables de entorno nuevas.

registerManualPayment y registerConfirmedProviderPayment siguen usando register_canonical_payment. El segundo es solo servidor y exige paid tras verificar el proveedor. El registro verifica owner activo, cliente propietario, cuenta conectada y acuerdo compatible con owner/cliente/proveedor/moneda. RLS, revokes, SECURITY INVOKER, FKs compuestas, índices únicos y advisory lock siguen vigentes. Los emails se envían después del commit; sus fallos no revierten el pago.

## Cuatro fechas diferentes

- created_at: timestamp real del registro/cobro del pago.
- period_from / period_to: período de servicio cubierto, inclusivo.
- next_payment_date: próximo vencimiento de ese pago recurrente y snapshot operativo del cliente.
- recurring_agreements.billing_anchor_date: primer vencimiento original, estable, del que se deriva la agenda. next_charge_at conserva el siguiente ciclo operativo del acuerdo como timestamp UTC.

started_at ya existía pero es un timestamp del acuerdo, no un día de facturación. Se agrega únicamente billing_anchor_date DATE; no se inventan anchors para acuerdos/pagos históricos. No se agrega otro campo frequency a la base: se reutilizan interval_unit e interval_count.

## Recurrencias

| Frecuencia UI | interval_unit | interval_count | Ejemplo |
| --- | --- | --- | --- |
| Semanal / weekly | week | 1 | 14/10 → 21/10 → 28/10 |
| Quincenal / biweekly | week | 2 | 14/10 → 28/10 → 11/11 |
| Mensual / monthly | month | 1 | 10/10 → 10/11 → 10/12 |

No se ofrecen daily/yearly en UI. El schema neutral previo conserva otras unidades para el futuro; el contrato de agenda de este hito acepta solo estas tres.

El usuario elige frecuencia y primer vencimiento. No elige día de semana ni billing day: se derivan de esa fecha. El pago cubre desde el vencimiento del ciclo hasta el día anterior al siguiente vencimiento. Ejemplos:

- Mensual: 10/10/2026–09/11/2026; siguiente 10/11/2026.
- Quincenal: 14/10/2026–27/10/2026; siguiente 28/10/2026.
- Semanal: 14/10/2026–20/10/2026; siguiente 21/10/2026.

Fin de mes: el día original se conserva siempre. Anchor 31/01/2026 → 28/02 → 31/03 → 30/04 → 31/05. En 2028, febrero es 29 y marzo vuelve a 31. No se calcula marzo tomando el día ajustado de febrero como nuevo anchor.

El helper puro src/lib/payments/schedule.ts centraliza validación, fechas de calendario, mapping, siguiente vencimiento, período y presentación. getNextRecurringDate devuelve el vencimiento estrictamente posterior a currentDate; getRecurringPeriod exige que cycleDate sea un vencimiento válido de la agenda original. UI y servidor usan el mismo helper; comprobantes/historial solo presentan fechas canónicas. La autoridad transaccional SQL payment_next_recurring_date replica ese contrato para verificar datos dentro del bloqueo de owner/cliente/acuerdo; las pruebas comparan resultados TS/PostgreSQL en varias zonas horarias.

## Acuerdos y pagos manuales

El primer pago manual con frecuencia crea, dentro de la misma transacción, un recurring_agreement manual activo con anchor e intervalo. Esto registra una agenda; no cobra automáticamente ni crea una subscription externa. Su importe inicial representa pago + bonificación + saldo declarado del ciclo. No es una configuración final de precios/autocobro.

Pagos siguientes reutilizan el acuerdo activo del cliente y mantienen su anchor original; el formulario precarga el próximo vencimiento. Un índice parcial permite solo una agenda manual activa con anchor por owner/cliente. Frecuencia/anchor establecidos no se editan implícitamente desde un pago. Cambiar la agenda exige un flujo explícito de cancelación/nuevo acuerdo, pendiente de la administración de acuerdos; no se implementa silenciosamente en este hito.

Para pagos de proveedor con agenda, el adapter deberá resolver un acuerdo existente confiable. El registro no crea acuerdos Stripe/Mercado Pago a partir de IDs del navegador. Un acuerdo legacy sin anchor puede inicializarse explícitamente con el primer vencimiento conocido, sin reinterpretar pagos históricos.

Cada pago conserva su período y siguiente vencimiento propios. El acuerdo conserva el máximo próximo ciclo confirmado, para que un evento atrasado no retroceda la agenda. Replay del mismo provider/provider_payment_id devuelve duplicate=true y el mismo pago sin modificar snapshot/agenda ni enviar otro comprobante. Replays también pueden reconocerse si el acuerdo pasó a pausado/cancelado; un pago nuevo de ese acuerdo se rechaza. La cuenta de proveedor debe seguir pasando la verificación de conexión existente.

## Deuda y snapshot del cliente

Recurrente normal: conserva el contrato de saldo total posterior al pago y actualiza current_debt, último importe/fecha y siguiente vencimiento calculado. Período cubierto y vencimiento son diferentes.

Pago deuda: el formulario identifica el último pago recurrente adeudado. La RPC comprueba propietario/cliente/moneda, saldo pendiente y vigencia del registro antes de copiar su período. Actualiza el saldo y último pago, pero conserva la agenda actual; no inicia otro ciclo ni vuelve a avanzar next_charge_at. El ID de ese pago es contexto validado, no un identificador externo.

Los callers legacy sin frequency conservan su comportamiento original y sus fechas declaradas. No se recalculan pagos históricos ni se les asignan anchors automáticamente. Un acuerdo que ya tiene anchor exige la agenda coherente para pagos nuevos; no se permite eludirla enviando un período arbitrario.

## Pagos únicos

Pueden cubrir un día, un rango de días o ningún período:

- primer clic y guardar: period_from=period_to=fecha elegida;
- dos clics: un solo pago cubre todo el rango inclusivo;
- sin fechas: ambos NULL, manteniendo la posibilidad actual de un servicio sin fecha.

No tienen recurring_agreement_id ni next_payment_date. No modifican current_debt, período/último pago recurrente ni next_payment_date del cliente. Tienen debt=0 propio y no aceptan deuda recurrente. Suman ingresos, incluso si period_to es futuro. No crean eventos diarios ni pagos por cada día.

service_date permanece para compatibilidad. Nuevos formularios usan períodos; historial/receipt priorizan period_from/to y, si faltan, muestran service_date legacy. No se elimina ni migra agresivamente esa columna.

## Calendario, dashboard, recordatorios y comprobantes

Se reutiliza RangeCalendar: recurrente single; único range; deuda previa range bloqueado. En single un segundo clic reemplaza el día. En range un solo clic puede guardarse como un día, y el segundo completa el intervalo. Mantiene marcadores, uno/dos meses según pantalla, clases/tokens existentes y navegación correcta desde días 29–31. No se agrega calendario ni selector de moneda.

Fechas de negocio viajan YYYY-MM-DD y se calculan con componentes UTC; el puente con el calendario usa componentes locales explícitos. No se parsea DATE como timestamp UTC para compararla/mostrarla localmente. Se corrigieron los consumidores de vencimientos del dashboard/historial. created_at sigue siendo timestamp.

El dashboard incluye pagos únicos en ingresos y toma la deuda del snapshot, plan/actividad recurrente del último recurrente/legacy y vencimiento de clients.next_payment_date. El fallback del pago prioriza next_payment_date sobre period_to. Un único no reactiva ni modifica la actividad de una recurrencia existente; clientes con solo servicios únicos conservan la lógica de actividad general. Las métricas mantienen el filtro active/inactive existente.

/upcoming y /due siguen delegando al mismo servicio y agenda del cliente. No se rediseña el cron: requiere un pago recurrente/legacy del owner y usa next_payment_date, no period_to de un evento. El fallback next_due legacy solo se usa si falta el vencimiento canónico. Un único con rango futuro nunca genera recordatorio ni suprime el de una recurrencia existente. Conserva owner activo y deduplicación cuenta/cliente/día.

Comprobante: concepto/plan, período (si from=to, una sola fecha), fecha real de pago, nota/monto/moneda; próximo vencimiento solo recurrente, tomado del campo canónico next_payment_date. Nota y concepto escapados, saltos de línea conservados, logo externo desactivado y HTML responsive anterior. email_logs y webhooks Resend firmados/idempotentes no cambian.

## Migración nueva y pasos manuales exactos

Las migraciones 20261010_payment_domain.sql y 20261011_owner_payment_rules.sql ya fueron aplicadas según confirmación del usuario y NO se modifican en este ajuste. Ejecutar únicamente la nueva supabase/migrations/20261012_payment_schedule_rules.sql, después de ambas.

La nueva migración:

1. reemplaza el CHECK que impedía períodos en one_off, conservando acuerdo/vencimiento NULL;
2. valida pares de fechas únicos ordenados;
3. agrega billing_anchor_date nullable, su guard de estabilidad y el índice de agenda manual activa;
4. agrega el helper SQL y reemplaza la RPC transaccional;
5. conserva moneda/ownership/cuenta/provider, idempotencia, privilegios y RLS;
6. no cambia importes, monedas, períodos, anchors ni datos de pagos históricos.

Pasos del usuario en Supabase:

1. Hacer respaldo y revisar que ambas migraciones anteriores están aplicadas. Confirmar UUIDs, nombres/constraints originales y acceso service_role.
2. Abrir SQL Editor en el proyecto correcto. Crear una consulta nueva y pegar el archivo 20261012_payment_schedule_rules.sql completo, incluido BEGIN/COMMIT. Ejecutarlo una sola vez. No volver a ejecutar 20261010/20261011.
3. Verificar la nueva columna billing_anchor_date y los constraints/función usando las consultas siguientes. Si el API reporta schema cache desactualizada tras aplicarlo, ejecutar NOTIFY pgrst, 'reload schema'; y volver a probar.
4. Antes de publicar este código, comprobar manualmente: recurrente semanal; quincenal; mensual con día 31; pago único de un día/rango; mismo cliente con deuda/agenda previa; historial/recibo/vencimiento y tracking de emails. Revisar que no haya otras rutas/escrituras directas legacy que eviten el servicio central.

```sql
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='recurring_agreements' and column_name='billing_anchor_date';
select conname,pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.payments'::regclass and conname like 'payments_one_off%';
select public.payment_next_recurring_date('monthly','2026-01-31'::date,'2026-02-28'::date);
-- Resultado esperado: 2026-03-31
```

La nueva migración debe preceder a la publicación del código. No se ejecutó contra Supabase, no hubo commit/push/deploy y no se leyó ni editó .env.local. Las pruebas SQL usan PostgreSQL local aislado (PGlite). Datos/snapshots legacy inconsistentes requieren conciliación manual, sin conversión/limpieza automática.

## Validación y preparación de proveedores

Pruebas existentes y nuevas: weekly/biweekly/monthly, clamp de fin de mes/bisiesto preservando anchor, paridad TS/SQL, zonas Argentina/Australia/UTC/Honolulu, único sin fecha/día/rango e ingresos, deuda/snapshot/agenda intactos, Pago deuda, replays/ownership/owner inactivo, monedas ARS/AUD, snapshot inmutable y currency lock, receipt/legacy service_date, tracking Resend y recordatorios solo recurrentes.

Comandos: npm run test:payments, npm run test:security, npm run test:email, npm run typecheck, npm run build y lint de archivos tocados. No se agregan dependencias. El lint legacy fuera de este alcance se informa por separado.

Mapping neutral preparado para Stripe Australia y Mercado Pago Argentina. Pendientes: conexión/autorización de cuentas, verificación de eventos de pagos, adapters a los contratos de provider, configuración real de precios/cobros, refunds/disputes, reconciliación y edición/cancelación explícita de acuerdos. No hay cobros automáticos implementados.

## Archivos de este ajuste

Creados:
- src/lib/payments/schedule.ts
- supabase/migrations/20261012_payment_schedule_rules.sql
- tests/payment-schedule.test.mjs
- tests/payment-schedule-db.test.mjs

Modificados:
- src/lib/payments/{types,validation,service}.ts
- src/app/api/{payments,clients}/route.ts
- src/app/dashboard/components/{NewPaymentModal,RangeCalendar,ClientDetailModal,ClientsTable}.tsx
- src/lib/emails/templates/payment-receipt.ts
- tests/{payment-domain,payment-domain-db,payment-domain-rules,email-tracking}.test.mjs
- package.json y este documento

Otros cambios presentes en git status provienen del ajuste anterior y se conservaron.
