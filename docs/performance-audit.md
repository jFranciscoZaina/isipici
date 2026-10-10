# Rendimiento y activación — 10/10/2026

Cambios en `D:/Escritorio/isipici`. No se hizo commit, push, despliegue ni ejecución de SQL remoto. Se conservaron los cambios previos de suscripciones y todas las migraciones anteriores, incluida la 13. No se modificó `.env.local`, no hay variables ni dependencias nuevas.

## Cuellos de botella corregidos

- Tabla con paginación real de 25/50/100 filas; controles también en celular. Buscar/ordenar opera sobre la lista completa. Métricas y selector de clientes mantienen su alcance completo.
- Modales/calendarios en chunks separados; emails consultados solo al abrir su pestaña. Requests de clientes anteriores se cancelan para no sobrescribir resultados recientes.
- Lecturas independientes de la suscripción en paralelo, después del control de ownership. La generación de agenda sigue antes de las lecturas dependientes. Snapshot redundante eliminado; deuda pausada/archivada sigue actualizándose.
- Cron reutiliza owner dentro de cada ejecución y evita refrescar deuda repetidamente por acuerdos históricos.
- Formateadores de moneda reutilizados; selector/PIN sin efectos que generaban renders innecesarios; shader con tipos y referencias correctos y sin conservar drawing buffer GPU.
- **Dashboard agregado en PostgreSQL:** índices por owner/cliente/fecha; últimos pagos mediante consultas limitadas; ingresos mensuales con SUM; deuda con saldos de cuotas vencidas/hoy. La respuesta contiene un resumen por cliente, sin arrays históricos de pagos/cuotas. La prueba con 5.000 pagos históricos devolvió menos de 4 KB para ese cliente y mantuvo ingresos/deuda.
- **Comprobantes fuera de la respuesta del pago:** el pago confirmado prepara un trabajo persistido en `email_logs`; la API devuelve `receipt_status: queued`. `after` despacha después de responder. Un fallo de cola/proveedor nunca revierte el pago confirmado.

## Comprobantes y recuperación

La migración 15 extiende `email_logs`, sin tabla duplicada. Guarda el request original de Resend (from/to/subject/html), estado de despacho, intentos, disponibilidad, lease y token. El payload solo se consulta por servicios privados; las APIs de historial conservan su selección explícita y no lo exponen. No se guardan API keys.

El claim usa `FOR UPDATE SKIP LOCKED` y lease de dos minutos. Un token viejo no puede finalizar un claim nuevo. Cada intento reutiliza payload y clave de idempotencia; el SDK instalado permite abortar el envío a los 15 segundos. Después de responder hay como máximo un reintento inmediato, con espera de 5,5 segundos. El scheduler procesa hasta tres trabajos por invocación, con backoff y máximo cinco intentos.

`payments.receipt_requested_at` se añade sin backfill y con default para inserciones futuras. Así, si el proceso se corta entre confirmar un pago y encolar su email, el cron puede recuperar hasta tres comprobantes faltantes por ejecución. Solo revisa intenciones recientes (siete días), omite importaciones históricas y cualquier pago con una clave de email ya registrada. La recuperación deriva owner/cliente desde la DB y usa el contacto/nombre/vencimiento vigentes cuando prepara el trabajo; una vez encolado, el request queda congelado.

La API mantiene el flujo anterior si la RPC nueva realmente no existe. Errores de permisos/DB no disparan ese fallback. Los pagos históricos y logs antiguos no se reenvían.

Los envíos de resultado incierto con primer intento de más de 23 horas, o que agotan los intentos, quedan en `dispatch_state=review` con estado de entrega pendiente. Resend conserva idempotencia durante 24 horas; no se reenvían automáticamente después de esa ventana. Revisar Resend antes de decidir un reenvío manual. Un error definitivo queda como fallido.

## Pasos manuales para activar

1. Tener aplicada la migración 13 y respaldo. No repetir migraciones históricas.
2. Supabase → SQL Editor → nueva consulta: copiar y ejecutar completo `supabase/migrations/20261014_dashboard_summary.sql`.
3. Nueva consulta separada: copiar y ejecutar completo `supabase/migrations/20261015_email_dispatch.sql`. Ambas incluyen transacción y recarga de PostgREST. Si falla una, conservar el error y no publicar todavía.
4. Verificar que existan `dashboard_client_summary`, `enqueue_payment_receipt`, `claim_email_dispatch`, `finish_email_dispatch`, `unqueued_payment_receipts` y los nuevos campos. Los permisos de RPC y cola quedan limitados a service_role.
5. Ejecutar `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; después hacer el commit/push habitual para publicar. El agente no publica.
6. Verificar en DevTools → Network que `/api/clients` incluya `X-Dashboard-Source: summary`. `legacy` significa que todavía está usando la compatibilidad anterior. `Server-Timing` expone duración del handler del dashboard y registro de pagos, sin datos personales.
7. Registrar un pago de prueba: debe responder con pago confirmado y comprobante en cola; reabrir historial de emails para comprobar enviado/entregado. Confirmar que ingresos y deuda coincidan y que paginar no cambie las métricas.

## Scheduler

El cron diario existente `/api/reminders/upcoming` recupera y despacha la cola después de su respuesta; `/due` conserva la misma compatibilidad. `vercel.json` no cambia.

Para recuperación frecuente existe **GET `/api/emails/dispatch`**, protegido por `Authorization: Bearer <CRON_SECRET>`. En un plan que permita frecuencia mayor, añadir manualmente un cron cada cinco minutos con expresión `*/5 * * * *`, o usar un scheduler externo con ese header. No publicar el secreto ni ponerlo en query strings. Hobby limita los cron a una ejecución diaria: la recuperación diaria sigue disponible, pero los fallos ambiguos pueden llegar a revisión antes del siguiente cron. El reintento inmediato no requiere cambiar de plan.

## Validación y límites

Suite completa: 60 pruebas. Incluye migraciones secuenciales en PostgreSQL local, historial grande, propietario extranjero/inactivo, roles anon, ausencia de reenvíos históricos, recuperación del corte pago/cola, deduplicación, leases/reclaims, token viejo, reintentos, ventana de idempotencia, eventos tempranos y errores de email sin perder el pago. Lint, TypeScript y build se ejecutan sobre el código final.

No se midió producción ni se ejecutó EXPLAIN en la DB remota. El resumen elimina transporte de historiales, pero conserva una fila por cliente para métricas/selector; los historiales individuales siguen completos cuando se piden. La latencia de red/regiones, arranque de funciones y carga GPU en un dispositivo real necesitan comprobación posterior al despliegue. No se afirma un porcentaje de aceleración.

Fuentes oficiales del mecanismo: [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after), [Resend idempotencia](https://resend.com/changelog/idempotency-keys), [límites de cron de Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
