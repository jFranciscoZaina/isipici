"use client"
import {useToast} from "./ToastProvider"
import {useRemoteData} from "./useRemoteData"
import PlanFields from "./PlanFields"
import {calendarWindow} from "@/lib/payments/calendar"
import { useState } from "react"
import RangeCalendar from "./RangeCalendar"
import { FREQUENCY_LABELS, frequencyFromInterval, formatCalendarDate, fromCalendarDate, toCalendarDate, type RecurringFrequency } from "@/lib/payments/schedule"
import { formatPaymentMoney } from "@/lib/payments/format"
import type { SubscriptionState } from "@/lib/payments/types"
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function SubscriptionPanel({clientId,onChanged}:{clientId:string;onChanged:()=>void}) {
 const toast=useToast()
 const [error,setError]=useState(""),[busy,setBusy]=useState(false)
 const [form,setForm]=useState<"create"|"change"|"resume"|"adopt"|null>(null),[frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[amount,setAmount]=useState(""),[date,setDate]=useState(""),[planName,setPlanName]=useState("")
 const [planId,setPlanId]=useState(""),[cancelForm,setCancelForm]=useState(false),[cancelMode,setCancelMode]=useState("now"),[message,setMessage]=useState("")
 const calendar=calendarWindow();const url=`/api/clients/${clientId}/subscription?from=${calendar.from}&to=${calendar.to}`
 const remote=useRemoteData<SubscriptionState>(url,"Cargando suscripción...","No se pudo cargar la suscripción.")
 const state=remote.data,refresh=remote.refresh,pending=busy||remote.loading
 const a=state?.current, f=a?frequencyFromInterval(a.interval_unit,a.interval_count):null
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  if(pending)return;const operation=toast.start("Guardando cambios...");setBusy(true);setError("");try{const r=await fetch(`/api/clients/${clientId}/subscription`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});if(r.status===401){window.location.href="/login";operation.close();return}const b=await r.json();if(!r.ok)throw new Error("No se pudo actualizar la suscripción.");const success:Record<string,string>={create:"Suscripción creada.",change:"Cambio programado.",pause:"Suscripción pausada.",resume:"Suscripción reanudada.",cancel:"Suscripción dada de baja.",cancel_end:"Baja programada.",undo_cancel_end:"Baja programada cancelada.",cancel_change:"Cambio programado cancelado.",archive:"Cliente dado de baja.",reactivate:"Cliente reactivado.",waive:"Saldo condonado."};operation.success(success[action]??"Suscripción actualizada.");setForm(null);setCancelForm(false);if(b.startsOn)setMessage(`Cambio programado para ${formatCalendarDate(b.startsOn)}${b.delayed?". Se respeta la agenda y los períodos protegidos.":""}`);await refresh();onChanged()}catch{setError("No se pudo actualizar la suscripción.");operation.error("No se pudo actualizar la suscripción.")}finally{operation.close();setBusy(false)}
 }
 const begin=(kind:typeof form)=>{const change=kind==="change"?state?.scheduledChange:null;setForm(kind);setPlanId(kind==="change"?(change?change.target_plan_id??"":a?.plan_id??""):"");setAmount(change?String(change.new_amount):a?String(a.amount):"");setDate(kind==="change"?change?.effective_from??toCalendarDate(new Date()):"");setPlanName(change?.new_plan_name??a?.plan_name??"");if(change)setFrequency(change.new_frequency);else if(f)setFrequency(f)}
 return <section className="space-y-p10 border-t border-n1 pt-p20">
  <h3 className="fs-16 font-semibold">Suscripción</h3>
  {message&&<p role="status" className="fs-14">{message}</p>}
  {error&&<p className="fs-14 text-app-secondary" role="alert">{error}</p>}
  {remote.error&&<button className="btn-secondary" onClick={()=>void refresh()}>Reintentar</button>}
  {!state?<div className="min-h-10" aria-busy={remote.loading}/>:<>
   {state.archivedAt&&<p className="fs-14 font-semibold">Cliente dado de baja</p>}
   <p className="fs-14">{a?`${a.plan_name?`${a.plan_name} · `:""}${a.status==="paused"?"Suscripción pausada":a.status==="pending"?"Suscripción pendiente":"Suscripción activa"}: ${f?FREQUENCY_LABELS[f]:"Agenda legacy"} · ${formatPaymentMoney(a.amount,a.currency)}`:remote.status==="success"?"Sin suscripción":null}</p>
   {a?.status==="active"&&a.next_charge_at&&<p className="fs-14 text-app-secondary">Próxima fecha de agenda: {formatCalendarDate(a.next_charge_at.slice(0,10))}</p>}
   {a&&!a.installments_enabled&&<p className="fs-14 text-app-secondary">Acuerdo anterior: elegí desde qué vencimiento empezar a registrar cuotas. Los pagos y la deuda anteriores se conservan.</p>}
   <div className="flex flex-wrap gap-p10">
    {!state.archivedAt&&!a&&<button className="btn-secondary" onClick={()=>begin("create")} disabled={pending}>Crear suscripción</button>}
    {!state.archivedAt&&a?.provider==="manual"&&<>
     {a.status==="active"&&<button className="btn-secondary" disabled={pending} onClick={()=>act("pause",{agreementId:a.id})}>Pausar</button>}
     {a.status==="paused"&&<button className="btn-secondary" disabled={pending} onClick={()=>begin("resume")}>Reanudar suscripción</button>}
     {a.status==="active"&&!a.installments_enabled&&a.billing_anchor_date&&<button className="btn-secondary" onClick={()=>begin("adopt")} disabled={pending}>Empezar cuotas</button>}
     <button className="btn-secondary" onClick={()=>begin("change")} disabled={pending}>{state.scheduledChange?"Editar cambio programado":"Cambiar suscripción"}</button>
     <button className="btn-secondary" disabled={pending} onClick={()=>{setCancelMode("now");setCancelForm(true)}}>Dar de baja suscripción</button>
    </>}
    <button className="btn-secondary" disabled={pending} onClick={()=>{if(state.archivedAt)void act("reactivate");else if(window.confirm("Al dar de baja al cliente se pausarán futuros cobros y vencimientos. Los pagos, cuotas parciales y deudas existentes se conservarán."))void act("archive")}}>{state.archivedAt?"Reactivar cliente":"Dar de baja cliente"}</button>
   </div>
   {state.scheduledChange&&<div className="space-y-p5"><p className="fs-14">Hay un cambio programado: {state.scheduledChange.new_plan_name??"Personalizado"} · {formatPaymentMoney(state.scheduledChange.new_amount,state.scheduledChange.currency)} · {FREQUENCY_LABELS[state.scheduledChange.new_frequency]} desde {formatCalendarDate(state.scheduledChange.starts_on)}.</p><button className="btn-secondary" disabled={pending} onClick={()=>act("cancel_change",{agreementId:a?.id,changeId:state.scheduledChange?.id})}>Cancelar cambio programado</button></div>}
   {a?.cancel_at_period_end&&<div className="space-y-p5"><p className="fs-14">Baja al finalizar el período: {formatCalendarDate(a.cancellation_boundary??"")}.</p><button className="btn-secondary" disabled={pending} onClick={()=>act("undo_cancel_end",{agreementId:a.id})}>Cancelar baja programada</button></div>}
   {cancelForm&&<div className="space-y-p10 border border-n1 rounded-br15 p-p20"><label className="fs-12 text-app-secondary">Dar de baja<select className={inputClass} value={cancelMode} onChange={e=>setCancelMode(e.target.value)}><option value="now">Ahora</option>{a?.status==="active"&&a.installments_enabled&&<option value="end">Al finalizar el período actual</option>}</select></label><p className="fs-12 text-app-secondary">La deuda y los pagos se conservan. La baja efectiva es definitiva.</p><button className="btn-secondary" disabled={pending} onClick={()=>setCancelForm(false)}>Regresar</button><button className="btn-primary" disabled={pending} onClick={()=>act(cancelMode==="end"?"cancel_end":"cancel",{agreementId:a?.id})}>Confirmar baja</button></div>}
   {form&&<div className="space-y-p10 rounded-br15 border border-n1 p-p20">
    <h4 className="fs-14 font-semibold">{form==="create"?"Crear suscripción":form==="change"?"Cambiar suscripción":form==="adopt"?"Primer vencimiento con cuotas":"Reanudar suscripción"}</h4>
    <p className="fs-14 text-app-secondary">{form==="change"?"Se conserva la misma suscripción. Las cuotas pagadas, parciales y vencidas no cambian. La nueva configuración afecta solo ciclos futuros sin pagos.":form==="resume"?"Los ciclos omitidos durante la pausa no se cobrarán.":"Crear una cuota no registra un pago ni cuenta como ingreso."}</p>
    {(form==="create"||form==="change")&&<><PlanFields planId={planId} onPlanId={setPlanId} date={date} amount={amount} onAmount={setAmount} frequency={frequency} onFrequency={setFrequency} name={planName} onName={setPlanName}/><p className="fs-12 text-app-secondary">Método de cobro: Manual. No hay prorrateo. El cambio comienza en la primera cuota futura editable desde la fecha elegida; los anticipos pueden postergarlo.</p></>}
    <label className="fs-12 text-app-secondary">{form==="resume"||form==="adopt"?"Próximo vencimiento válido de la agenda original":form==="change"?"Fecha efectiva del cambio":"Primer vencimiento"}</label>
    <RangeCalendar disabled={pending} selectionMode="single" numberOfMonths={2} value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))} recurrence={date?{frequency:form==="resume"||form==="adopt"?f??frequency:frequency,anchorDate:form==="resume"||form==="adopt"?a?.billing_anchor_date??date:date}:undefined}/>
    <div className="flex gap-p10"><button className="btn-secondary" onClick={()=>setForm(null)} disabled={pending}>Cancelar</button><button className="btn-primary" disabled={pending||!date||(form==="create"||form==="change")&&!planId} onClick={()=>act(form,form==="create"||form==="change"?{...(a?{agreementId:a.id}:{}),...(planId?{planId}:{frequency,amount:Number(amount),planName:planName.trim()||undefined}),anchorDate:date,...(form==="change"&&state.scheduledChange?{replaceChangeId:state.scheduledChange.id}:{})}:{agreementId:a?.id,nextDueDate:date})}>Confirmar</button></div>
   </div>}
   {state.installments.length>0&&<div className="space-y-p5"><h4 className="fs-14 font-semibold">Cuotas</h4>{state.installments.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-p10 fs-14 border-b border-n1 py-p10"><span>{formatCalendarDate(i.due_date)} · {i.status==="paid"?"Pagada":i.status==="cancelled"?"Cancelada":i.status==="waived"?"Condonada":i.partially_paid?"Pago parcial":i.overdue?"Vencida":"Pendiente"} · {formatPaymentMoney(i.remaining,i.currency)} pendiente</span>{i.status==="open"&&<button className="btn-secondary" disabled={pending} onClick={()=>{if(window.confirm("¿Condonar el saldo de esta cuota? No se registrará dinero recibido."))void act("waive",{installmentId:i.id})}}>Condonar saldo</button>}</div>)}</div>}
   {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length>0&&<p className="fs-12 text-app-secondary">Suscripciones anteriores conservadas: {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length}.</p>}
  </>}
 </section>
}
