# Hito 5: dominio común de pagos

## Auditoría y alcance

Antes, `POST /api/payments` validaba importes, insertaba el ledger, actualizaba al cliente en otra operación y enviaba el email. Las métricas sumaban importes sin moneda. El último pago reemplazaba período/plan aunque fuera un servicio único. Las migraciones existentes cubren owner activo, RLS, admin y tracking de emails; no contienen el DDL original de owners/clients/payments. No se consultó ni modificó el esquema remoto.

Ahora `src/lib/payments/service.ts` concentra el registro y el comprobante. `validation.ts` valida entradas; `types.ts` define el contrato neutral y las acciones futuras; `format.ts` se comparte con UI y emails. No se instaló ningún SDK de pagos ni se crearon conexiones, cobros o webhooks externos.

## Proveedor y tipo son independientes

- `provider`: cómo se procesa (`manual`, `stripe`, `mercadopago`).
- `payment_type`: qué se paga (`recurring`, `one_off`).

`payments` sigue siendo el ledger canónico de pagos registrados. No agrega un campo de estado que permita confundir cargos pendientes/fallidos con ingresos. `registerManualPayment` sirve a la API actual. `registerConfirmedProviderPayment` es exclusivamente server-side y exige resultado `paid`; nunca se llama desde una ruta externa en este hito. Los futuros estados pendientes/fallidos y autorización revocada se tratarán fuera del ledger. No se creó un dominio Events.

## Datos y operación transaccional

- `payments`: agrega provider, currency, payment_type, concept (200), service_date, receipt_note (1000), provider_payment_id, recurring_agreement_id y payment_provider_account_id.
- `payment_provider_accounts`: cuenta por owner/proveedor, estado, país, moneda e identificación externa. Sin secretos, tokens ni credenciales.
- `recurring_agreements`: owner/cliente/cuenta, IDs neutrales de customer/acuerdo, estado, importe/moneda, intervalo, próximas fechas y timestamps.
- `clients.currency`: moneda del snapshot de deuda y pagos. No agrega otra relación `payments → clients`, evitando ambigüedad en el embed actual de PostgREST.

La RPC `register_canonical_payment` verifica owner activo, propiedad del cliente (owner_id o gym_id legacy), cuenta, moneda y acuerdo. Bloquea el cliente, inserta el pago y actualiza el snapshot en una transacción. Un error de snapshot revierte la inserción, evitando éxito parcial. El envío ocurre después del commit y jamás revierte un pago. Errores del proveedor, SMTP o de logs no deben mostrarse como fallo del registro.

Los acuerdos tienen guard de ownership y FKs compuestas que vinculan cuenta/owner/proveedor/moneda. Los pagos ligados a acuerdos usan FK compuesta para impedir otro owner/cliente/proveedor/moneda. Los servicios futuros con service_role deben utilizar la RPC y no hacer inserts directos en el ledger.

## Pagos únicos y recurrentes

Un pago único requiere concepto o el plan legacy, pero no acuerdo ni período. Ejemplo: concepto «Cena de fin de año», fecha 2026-11-07, importe ARS 50000, nota «Mesa para dos». La UI pide concepto para los únicos y permite omitir fecha/nota. Nunca borra el próximo vencimiento recurrente. Si se omite deuda, conserva la deuda total existente del cliente; si se especifica, es el saldo total posterior al pago (mismo contrato legacy), no una deuda por evento.

Un recurrente puede utilizar el plan actual o un concepto y opcionalmente un acuerdo. La UI conserva el calendario y la operación de Pago deuda. La API sigue admitiendo pagos legacy sin fechas, como antes. Los registros anteriores con payment_type NULL se consideran legacy para derivar su vencimiento, sin afirmar retrospectivamente que eran subscriptions. El dashboard deriva plan/vencimiento del último pago recurrente o legacy y el saldo del último pago; incluye servicios únicos en los ingresos.

No se administra el ciclo de vida de acuerdos desde la UI ni se conecta una cuenta en este hito. La fecha del servicio es metadata: no genera automáticamente deuda ni recordatorios de un evento.

## Monedas

ARS conserva el formato y la suposición histórica anterior. AUD usa código explícito; comprobante, deuda, recordatorio e historial reciben su moneda. Los ingresos se muestran separados por moneda, sin conversión. Las métricas mantienen el filtro actual de clientes activos/inactivos; no se modificó su alcance.

Cada cliente tiene una moneda porque el modelo legacy tiene una sola deuda. Puede elegirse AUD en el primer pago si no hay ledger/deuda; después queda bloqueada, con verificación transaccional. Un owner puede tener clientes ARS y AUD. Multimoneda dentro de un mismo cliente requiere un futuro saldo por moneda; no sumar ni convertir monedas a ciegas. Antes de migrar, confirmar que los datos históricos efectivamente sean ARS.

## Idempotencia

Índice único parcial `(provider, provider_payment_id)` y advisory lock por esa identidad. Un replay devuelve el mismo pago con duplicate=true sin actualizar nuevamente el snapshot. Si cambia owner/cliente/cuenta/acuerdo/importe/moneda/contexto/período/deuda explícita, falla con conflicto. La propiedad se vuelve a verificar. El email conserva su clave `payment-receipt:<owner>:<payment>` y la deduplicación de email_logs. Dos pagos manuales sin ID externo son registros distintos; no hay deduplicación por importe o fecha. No se prometen transacciones distribuidas con providers.

## Seguridad y compatibilidad

API exige sesión de owner activo. El servicio vuelve a validar ownership y la RPC también. Browser no puede elegir proveedor externo ni suministrar identificadores externos/owner/status. UUIDs, tipos, monedas, fechas calendario reales, rangos, importes no negativos de hasta dos decimales, longitudes y caracteres de control se validan en servidor. Notas y conceptos se escapan al renderizar HTML; saltos de línea de notas se conservan. No secciones vacías en el comprobante. La UI usa tokens/clases existentes sin nuevos estilos ni rediseño.

RLS y revocación de privilegios bloquean anon/authenticated en tablas nuevas; RPC SECURITY INVOKER ejecutable solo por service_role. Service role continúa bypassing RLS: es responsabilidad de cada futuro servicio verificar ownership. No hay env vars nuevas.

Los nombres owners/clients/payments, campos de plan/deuda/período y respuesta de POST (objeto de pago + receipt_status) se conservan. Históricos reciben manual/ARS por la semántica anterior; concepto/nota/fecha del servicio/acuerdo/tipo permanecen NULL. No se crean cuentas/acuerdos artificiales. Deploy anterior seguirá escribiendo pagos legacy manual/ARS; desplegar la versión nueva solo después de la migración.

## Migración y pasos manuales de Supabase

Archivo: `supabase/migrations/20261010_payment_domain.sql`. No aplicado automáticamente. Usa transacción, CHECKs de texto, FKs, índices, RLS y triggers de updated_at/ownership. Antes de ejecutar:

1. Respaldar y revisar el esquema real: ids UUID; payments plan/amount/discount/debt/period_from/period_to/next_payment_date/created_at; clients current_debt/last_payment_amount/last_payment_date/next_payment_date y owner_id o gym_id; owners.is_active.
2. Revisar CHECKs/triggers antiguos de plan y fechas: deben permitir conceptos genéricos en plan y períodos NULL para servicios únicos. No se eliminan constraints desconocidos a ciegas.
3. Confirmar moneda histórica ARS, permisos de service_role y migraciones anteriores. Inspeccionar conteos/anomalías y ensayar en una copia antes de producción.
4. Ejecutar el SQL una sola vez en SQL Editor o migrador autorizado. No renombra ni elimina tablas/datos legacy.
5. Verificar cuentas/acuerdos vacíos, ledger histórico intacto, defaults y permisos. Luego publicar código y probar manual recurrente, único sin fechas, nota, AUD en cliente nuevo e historial/email.

Consulta inicial sin secretos:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('owners','clients','payments')
order by table_name, ordinal_position;
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.clients'::regclass,'public.payments'::regclass);
```

## Stripe 6 / Mercado Pago 7: decisiones pendientes

Ambos adapters deben verificar firmas usando raw body, resolver cuenta y owner desde IDs persistidos (sin confiar en metadata enviada por el browser), normalizar importes a unidades mayores con reglas de moneda y llamar al mismo servicio solo ante confirmación. Estados de acuerdos y revocación deben actualizar relaciones propias con ownership y eventos idempotentes, sin escribir un pago por fallos/pendientes.

Antes de Stripe: definir Connect/cuentas Australia, políticas de fees, importe bruto/neto, impuestos, refunds/chargebacks, eventos y su idempotencia, tokens cifrados con rotación, monedas de cuentas, cambios/cancelaciones de acuerdos y qué hacer con un pago confirmado después de revocar la conexión. La RPC actualmente exige cuenta connected; esa política debe revisarse para esos casos. Definir cola/reintentos de email y recuperación de un pago manual ante timeout HTTP para evitar doble registro.

Antes de Mercado Pago: flujo de conexión de owners Argentina, almacenamiento cifrado de tokens, verificación de notificaciones/consulta server-to-server y normalización de preapproval/pagos. Confirmar que IDs externos sean globales por proveedor; si un producto requiere IDs locales por cuenta, ampliar la clave única con cuenta antes de conectarlo.

Validación y límites de esta entrega se reportan junto al cambio. No se aplicó SQL remoto, no se enviaron emails de pruebas automáticamente, no se hizo commit/push/deploy.

## Archivos y validación

- Nuevos: `src/lib/payments/{types,validation,format,service}.ts`, migración, este documento, `tests/payment-domain{,-db}.test.mjs` y `tests/helpers/{load-ts,postgres}.mjs`.
- Modificados: `package.json`; API `payments/route.ts`, `clients/route.ts`; dashboard `page.tsx`, `NewPaymentModal`, `ClientDetailModal`, `ClientsTable`, `StatsGrid`; emails `format`, `reminders`, ambas plantillas; tests de autorización y tracking.
- `npm run typecheck` y `npm run build`: pasan. Sin SDKs ni dependencias nuevas de producción/desarrollo.
- `npm run test:payments`: 12 pruebas; `test:email`: 7; `test:security`: 8. Incluyen ejecución real de SQL local, legacy con gym_id, aislamiento de acuerdos/cuentas, rollback por CHECK, idempotencia sin reescribir deuda y permisos anon denegados.
- `npm run lint`: conserva 5 errores/4 advertencias preexistentes en ClientSearchSelect, ClientsTable, Dither y PinLockGate. No se ocultaron ni se desactivaron reglas. Lint del código nuevo y restantes archivos cambiados pasa.
- Fue necesario restaurar la copia local dañada del paquete de tests PGlite 0.5.8 desde un artefacto oficial de la misma versión. No cambia package-lock ni versiones. El helper permite un `PGLITE_TEST_DATA_DIR` opcional solo para tests si se dispone de un snapshot oficial de igual versión; no es una variable de la aplicación ni se configura en Vercel.
- No reemplaza QA del formulario/email en un cliente real ni el ensayo sobre una copia del esquema real. Hacer ambas verificaciones antes de publicar. Ninguna configuración de Stripe/Mercado Pago corresponde todavía.
