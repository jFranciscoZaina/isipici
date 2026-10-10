"use client"
import {validPaymentMoneyDraft} from "@/lib/payments/validation"
import {calendarWindow} from "@/lib/payments/calendar"
import { useEffect, useState } from "react"
import RangeCalendar from "./RangeCalendar"
import { FREQUENCY_LABELS, RECURRING_FREQUENCIES, frequencyFromInterval, formatCalendarDate, fromCalendarDate, toCalendarDate, type RecurringFrequency } from "@/lib/payments/schedule"
import { formatPaymentMoney } from "@/lib/payments/format"
import type { SubscriptionState } from "@/lib/payments/types"
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function SubscriptionPanel({clientId,onChanged}:{clientId:string;onChanged:()=>void}) {
 const [state,setState]=useState<SubscriptionState|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false)
 const [form,setForm]=useState<"create"|"change"|"resume"|"adopt"|null>(null),[frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[amount,setAmount]=useState(""),[date,setDate]=useState(""),[planName,setPlanName]=useState("")
 const calendar=calendarWindow();const url=`/api/clients/${clientId}/subscription?from=${calendar.from}&to=${calendar.to}`
 const refresh=async()=>{const r=await fetch(url);if(r.status===401){window.location.href="/login";return}const b=await r.json();if(!r.ok)throw new Error(b.error);setState(b)}
 useEffect(()=>{let alive=true;fetch(url).then(async r=>{if(r.status===401){window.location.href="/login";return}const b=await r.json();if(!r.ok)throw new Error(b.error);if(alive)setState(b)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[clientId,url])
 const a=state?.current, f=a?frequencyFromInterval(a.interval_unit,a.interval_count):null
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  setBusy(true);setError("");try{const r=await fetch(`/api/clients/${clientId}/subscription`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});if(r.status===401){window.location.href="/login";return}const b=await r.json();if(!r.ok)throw new Error(b.error);setForm(null);await refresh();onChanged()}catch(e){setError(e instanceof Error?e.message:"No se pudo completar")}finally{setBusy(false)}
 }
 const begin=(kind:typeof form)=>{setForm(kind);setAmount(a?String(a.amount):"");setDate(kind==="change"?state?.editEffectiveDate??"":"");setPlanName(a?.plan_name??"");if(f)setFrequency(f)}
 return <section className="space-y-p10 border-t border-n1 pt-p20">
  <h3 className="fs-16 font-semibold">Suscripción</h3>
  {error&&<p className="fs-14 text-app-secondary" role="alert">{error}</p>}
  {!state?<p className="fs-14 text-app-secondary">Cargando suscripción…</p>:<>
   {state.archivedAt&&<p className="fs-14 font-semibold">Cliente dado de baja</p>}
   <p className="fs-14">{a?`${a.plan_name?`${a.plan_name} · `:""}${a.status==="paused"?"Suscripción pausada":a.status==="pending"?"Suscripción pendiente":"Suscripción activa"}: ${f?FREQUENCY_LABELS[f]:"Agenda legacy"} · ${formatPaymentMoney(a.amount,a.currency)}`:"Sin suscripción"}</p>
   {a?.status==="active"&&a.next_charge_at&&<p className="fs-14 text-app-secondary">Próxima fecha de agenda: {formatCalendarDate(a.next_charge_at.slice(0,10))}</p>}
   {a&&!a.installments_enabled&&<p className="fs-14 text-app-secondary">Acuerdo anterior: elegí desde qué vencimiento empezar a registrar cuotas. Los pagos y la deuda anteriores se conservan.</p>}
   <div className="flex flex-wrap gap-p10">
    {!state.archivedAt&&!a&&<button className="btn-secondary" onClick={()=>begin("create")} disabled={busy}>Crear suscripción</button>}
    {!state.archivedAt&&a?.provider==="manual"&&<>
     {a.status==="active"&&<button className="btn-secondary" disabled={busy} onClick={()=>act("pause",{agreementId:a.id})}>Pausar</button>}
     {a.status==="paused"&&<button className="btn-secondary" disabled={busy} onClick={()=>begin("resume")}>Reanudar suscripción</button>}
     {a.status==="active"&&!a.installments_enabled&&a.billing_anchor_date&&<button className="btn-secondary" onClick={()=>begin("adopt")} disabled={busy}>Empezar cuotas</button>}
     <button className="btn-secondary" onClick={()=>begin("change")} disabled={busy}>Editar plan</button>
     <button className="btn-secondary" disabled={busy} onClick={()=>{if(window.confirm("Dar de baja la suscripción es definitivo. La deuda pendiente se conservará."))void act("cancel",{agreementId:a.id})}}>Dar de baja suscripción</button>
    </>}
    <button className="btn-secondary" disabled={busy} onClick={()=>{if(state.archivedAt)void act("reactivate");else if(window.confirm("Al dar de baja al cliente se pausarán futuros cobros y vencimientos. Los pagos, cuotas parciales y deudas existentes se conservarán."))void act("archive")}}>{state.archivedAt?"Reactivar cliente":"Dar de baja cliente"}</button>
   </div>
   {form&&<div className="space-y-p10 rounded-br15 border border-n1 p-p20">
    <h4 className="fs-14 font-semibold">{form==="create"?"Crear suscripción":form==="change"?"Editar plan":form==="adopt"?"Primer vencimiento con cuotas":"Reanudar suscripción"}</h4>
    <p className="fs-14 text-app-secondary">{form==="change"?"Se conserva la misma suscripción. Las cuotas pagadas, parciales y vencidas no cambian. La nueva configuración afecta solo ciclos futuros sin pagos.":form==="resume"?"Los ciclos omitidos durante la pausa no se cobrarán.":"Crear una cuota no registra un pago ni cuenta como ingreso."}</p>
    {form==="change"&&<><label className="fs-12 text-app-secondary">Nombre del plan<input className={inputClass} maxLength={200} value={planName} onChange={e=>setPlanName(e.target.value)}/></label><p className="fs-12 text-app-secondary">Primer ciclo editable: {state.editEffectiveDate?formatCalendarDate(state.editEffectiveDate):"seleccionar fecha futura"}. Si hay cuotas anticipadas, el cambio comienza después del último período aplicado.</p></>}
    {(form==="create"||form==="change")&&<><label className="fs-12 text-app-secondary">Frecuencia<select className={inputClass} value={frequency} onChange={e=>setFrequency(e.target.value as RecurringFrequency)}>{RECURRING_FREQUENCIES.map(x=><option key={x} value={x}>{FREQUENCY_LABELS[x]}</option>)}</select></label><label className="fs-12 text-app-secondary">Importe de cada cuota<input className={inputClass} type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label></>}
    <label className="fs-12 text-app-secondary">{form==="resume"||form==="adopt"?"Próximo vencimiento válido de la agenda original":form==="change"?"Fecha efectiva del cambio":"Primer vencimiento"}</label>
    <RangeCalendar selectionMode="single" numberOfMonths={2} value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))} recurrence={date?{frequency:form==="resume"||form==="adopt"?f??frequency:frequency,anchorDate:form==="resume"||form==="adopt"?a?.billing_anchor_date??date:date}:undefined}/>
    <div className="flex gap-p10"><button className="btn-secondary" onClick={()=>setForm(null)} disabled={busy}>Cancelar</button><button className="btn-primary" disabled={busy||!date||(form==="create"||form==="change")&&(!validPaymentMoneyDraft(amount)||Number(amount)<=0)} onClick={()=>act(form,form==="create"||form==="change"?{...(a?{agreementId:a.id}:{}),frequency,amount:Number(amount),anchorDate:date,planName:planName.trim()||undefined}:{agreementId:a?.id,nextDueDate:date})}>Confirmar</button></div>
   </div>}
   {state.installments.length>0&&<div className="space-y-p5"><h4 className="fs-14 font-semibold">Cuotas</h4>{state.installments.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-p10 fs-14 border-b border-n1 py-p10"><span>{formatCalendarDate(i.due_date)} · {i.status==="paid"?"Pagada":i.status==="cancelled"?"Cancelada":i.status==="waived"?"Condonada":i.partially_paid?"Pago parcial":i.overdue?"Vencida":"Pendiente"} · {formatPaymentMoney(i.remaining,i.currency)} pendiente</span>{i.status==="open"&&<button className="btn-secondary" disabled={busy} onClick={()=>{if(window.confirm("¿Condonar el saldo de esta cuota? No se registrará dinero recibido."))void act("waive",{installmentId:i.id})}}>Condonar saldo</button>}</div>)}</div>}
   {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length>0&&<p className="fs-12 text-app-secondary">Suscripciones anteriores conservadas: {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length}.</p>}
  </>}
 </section>
}
