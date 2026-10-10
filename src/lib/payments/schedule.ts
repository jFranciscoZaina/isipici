export const RECURRING_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const
export type RecurringFrequency = typeof RECURRING_FREQUENCIES[number]
export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = { weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual" }
export function frequencyInterval(frequency: RecurringFrequency) {
  if (!RECURRING_FREQUENCIES.includes(frequency)) throw new Error("Frecuencia inválida")
  return { unit: frequency === "monthly" ? "month" as const : "week" as const, count: frequency === "biweekly" ? 2 : 1 }
}
export function frequencyFromInterval(unit: string, count: number): RecurringFrequency | null {
  return unit === "month" && count === 1 ? "monthly" : unit === "week" && count === 1 ? "weekly" : unit === "week" && count === 2 ? "biweekly" : null
}
export function calendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31") throw new Error("Fecha de calendario inválida")
  const [y,m,d]=value.split("-").map(Number)
  const date=new Date(Date.UTC(y,m-1,d))
  if(date.getUTCFullYear()!==y || date.getUTCMonth()!==m-1 || date.getUTCDate()!==d) throw new Error("Fecha de calendario inválida")
  return value
}
function utcDate(value: string) { const [y,m,d]=calendarDate(value).split("-").map(Number); return new Date(Date.UTC(y,m-1,d)) }
function isoDate(value: Date) { return calendarDate(value.toISOString().slice(0,10)) }
export function addCalendarDays(value: string, days: number): string {
  if(!Number.isSafeInteger(days)) throw new Error("Cantidad de días inválida")
  const date=utcDate(value);date.setUTCDate(date.getUTCDate()+days);return isoDate(date)
}
function monthlyDate(anchorDate: string, monthOffset: number) {
  const anchor=utcDate(anchorDate), first=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+monthOffset,1))
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate()
  first.setUTCDate(Math.min(anchor.getUTCDate(),last));return isoDate(first)
}
// Próximo vencimiento estrictamente posterior a currentDate; siempre relativo al anchor ORIGINAL.
export function getNextRecurringDate({ frequency, anchorDate, currentDate = anchorDate }: { frequency: RecurringFrequency; anchorDate: string; currentDate?: string }): string {
  calendarDate(anchorDate);calendarDate(currentDate);frequencyInterval(frequency)
  if(currentDate < anchorDate) return anchorDate
  if(frequency !== "monthly") {
    const step=frequency === "weekly" ? 7 : 14
    const days=Math.round((utcDate(currentDate).getTime()-utcDate(anchorDate).getTime())/86400000)
    return addCalendarDays(anchorDate,(Math.floor(days/step)+1)*step)
  }
  const anchor=utcDate(anchorDate),current=utcDate(currentDate)
  const offset=(current.getUTCFullYear()-anchor.getUTCFullYear())*12+current.getUTCMonth()-anchor.getUTCMonth()
  const candidate=monthlyDate(anchorDate,offset)
  return candidate > currentDate ? candidate : monthlyDate(anchorDate,offset+1)
}
export function getRecurringPeriod({frequency,anchorDate,cycleDate}: {frequency: RecurringFrequency;anchorDate: string;cycleDate: string}) {
  if(cycleDate < anchorDate || cycleDate !== anchorDate && getNextRecurringDate({frequency,anchorDate,currentDate:addCalendarDays(cycleDate,-1)})!==cycleDate) throw new Error("La fecha no corresponde a un vencimiento de esta recurrencia")
  const nextPaymentDate=getNextRecurringDate({frequency,anchorDate,currentDate:cycleDate})
  return {periodFrom:cycleDate,periodTo:addCalendarDays(nextPaymentDate,-1),nextPaymentDate}
}
// Puente con RangeCalendar: componentes locales, sin parsear YYYY-MM-DD como timestamp UTC.
export function toCalendarDate(value?: Date): string { return value ? calendarDate(`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`) : "" }
export function fromCalendarDate(value?: string | null): Date | undefined { if(!value)return undefined;const [y,m,d]=calendarDate(value).split("-").map(Number);return new Date(y,m-1,d) }
export function formatCalendarDate(value: string): string { return utcDate(value).toLocaleDateString("es-AR",{timeZone:"UTC",day:"2-digit",month:"2-digit",year:"numeric"}) }
export function formatPaymentPeriod(from?: string | null,to?: string | null,legacyServiceDate?: string | null): string | null {
  if(from && to) return from === to ? formatCalendarDate(from) : `${formatCalendarDate(from)} – ${formatCalendarDate(to)}`
  return legacyServiceDate ? formatCalendarDate(legacyServiceDate) : null
}
