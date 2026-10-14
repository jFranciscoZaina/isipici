"use client"
import {useSubmissionLock} from "./useSubmissionLock"
import InlineLoader from "./InlineLoader"
import {useConfirm} from "./ConfirmProvider"
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
 const submission=useSubmissionLock()
 const toast=useToast(),confirm=useConfirm()
 const [error,setError]=useState(""),[busy,setBusy]=useState(false)
 const [form,setForm]=useState<"create"|"change"|"resume"|"adopt"|null>(null),[frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[amount,setAmount]=useState(""),[date,setDate]=useState(""),[planName,setPlanName]=useState("")
 const [planId,setPlanId]=useState(""),[cancelForm,setCancelForm]=useState(false),[cancelMode,setCancelMode]=useState("now"),[message,setMessage]=useState("")
 const calendar=calendarWindow();const url=`/api/clients/${clientId}/subscription?from=${calendar.from}&to=${calendar.to}`
 const remote=useRemoteData<SubscriptionState>(url,"Cargando suscripción...","No se pudo cargar la suscripción.")
 const state=remote.data,refresh=remote.refresh,pending=busy||remote.loading
 const a=state?.current, f=a?frequencyFromInterval(a.interval_unit,a.interval_count):null
 const act=async(action:string,extra:Record<string,unknown>={})=>{
  if(pending)return;if(!submission.acquire())return;const operation=toast.start("Guardando cambios...");setBusy(true);setError("");try{const r=await fetch(`/api/clients/${clientId}/subscription`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})});if(r.status===401){window.location.href="/login";operation.close();return}const b=await r.json();if(!r.ok)throw new Error("No se pudo actualizar la suscripción.");const success:Record<string,string>={create:"Suscripción creada.",change:"Cambio programado.",pause:"Suscripción pausada.",resume:"Suscripción reanudada.",cancel:"Suscripción dada de baja.",cancel_end:"Baja programada.",undo_cancel_end:"Baja programada cancelada.",cancel_change:"Cambio programado cancelado.",archive:"Cliente dado de baja.",reactivate:"Cliente reactivado.",waive:"Saldo condonado."};operation.success(success[action]??"Suscripción actualizada.");setForm(null);setCancelForm(false);if(b.startsOn)setMessage(`Cambio programado para ${formatCalendarDate(b.startsOn)}${b.delayed?". Se respeta la agenda y los períodos protegidos.":""}`);await refresh();onChanged()}catch{setError("No se pudo actualizar la suscripción.");operation.error("No se pudo actualizar la suscripción.")}finally{submission.release();operation.close();setBusy(false)}
 }
 const begin=(kind:typeof form)=>{const change=kind==="change"?state?.scheduledChange:null;setForm(kind);setPlanId(kind==="change"?(change?change.target_plan_id??"":a?.plan_id??""):"");setAmount(change?String(change.new_amount):a?String(a.amount):"");setDate(kind==="change"?change?.effective_from??toCalendarDate(new Date()):"");setPlanName(change?.new_plan_name??a?.plan_name??"");if(change)setFrequency(change.new_frequency);else if(f)setFrequency(f)}
 return <section className="space-y-p20 border-t border-n1 pt-p20">
  <div className="flex items-center justify-between gap-p10">
   <div><h3 className="fs-16 font-semibold text-app">Suscripción</h3><p className="fs-12 text-app-secondary mt-p5">Estado, próximas cuotas y acciones de la membresía del cliente.</p></div>
  </div>

  {message&&<div role="status" className="rounded-br10 border border-n1 p-p10 fs-14 text-app" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>{message}</div>}
  {error&&<div className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}} role="alert">{error}</div>}
  {remote.loading&&state&&<InlineLoader text="Actualizando suscripción..."/>}
  {remote.error&&<button className="btn-primary" onClick={()=>void refresh()}>Reintentar</button>}

  {!state?remote.loading?<InlineLoader text="Cargando suscripción..."/>:null:<>
   <article className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
    <div className="flex flex-col gap-p10 sm:flex-row sm:items-start sm:justify-between">
     <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-p10">
       <p className="fs-16 font-semibold text-app">{a?.plan_name??(a?"Suscripción":"Sin suscripción")}</p>
       {a&&<span className="rounded-full px-p10 py-p5 fs-12 font-medium" style={{backgroundColor:a.status==="active"?"var(--color-accent-primary-soft)":"var(--color-bg-bg1)",color:a.status==="active"?"var(--color-accent-primary)":"var(--color-text-secondary)"}}>{a.status==="paused"?"Pausada":a.status==="pending"?"Pendiente":"Activa"}</span>}
       {state.archivedAt&&<span className="rounded-full px-p10 py-p5 fs-12 font-medium text-danger" style={{backgroundColor:"color-mix(in srgb, var(--color-state-danger) 7%, var(--n) 93%)"}}>Cliente dado de baja</span>}
      </div>
      {a?<p className="fs-20 font-semibold text-app mt-p10">{formatPaymentMoney(a.amount,a.currency)} <span className="fs-12 font-normal text-app-secondary">· {f?FREQUENCY_LABELS[f]:"Agenda legacy"}</span></p>:<p className="fs-14 text-app-secondary mt-p10">Este cliente todavía no tiene una suscripción recurrente.</p>}
      {a?.status==="active"&&a.next_charge_at&&<p className="fs-12 text-app-secondary mt-p5">Próximo vencimiento: {formatCalendarDate(a.next_charge_at.slice(0,10))}</p>}
     </div>
     {!state.archivedAt&&!a&&<button className="btn-primary shrink-0" onClick={()=>begin("create")} disabled={pending}>Crear suscripción</button>}
    </div>

    {a&&!a.installments_enabled&&<div className="rounded-br10 border border-n1 p-p10 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg0)"}}>Acuerdo anterior: elegí desde qué vencimiento empezar a registrar cuotas. Los pagos y la deuda anteriores se conservan.</div>}

    {(a||state.archivedAt)&&<div className="flex flex-wrap gap-p10 border-t border-n1 pt-p20">
     {!state.archivedAt&&a?.provider==="manual"&&<>
      {a.status==="active"&&<button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={()=>act("pause",{agreementId:a.id})}>Pausar</button>}
      {a.status==="paused"&&<button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={()=>begin("resume")}>Reanudar</button>}
      {a.status==="active"&&!a.installments_enabled&&a.billing_anchor_date&&<button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} onClick={()=>begin("adopt")} disabled={pending}>Empezar cuotas</button>}
      <button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50" style={{borderColor:"var(--color-accent-primary)",color:"var(--color-accent-primary)",backgroundColor:"var(--color-accent-primary-soft)"}} onClick={()=>begin("change")} disabled={pending}>{state.scheduledChange?"Editar cambio programado":"Cambiar suscripción"}</button>
      <button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50" style={{color:"var(--color-state-danger)",borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>{setCancelMode("now");setCancelForm(true)}}>Dar de baja suscripción</button>
     </>}
     <button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50" style={{color:state.archivedAt?"var(--color-text)":"var(--color-state-danger)",borderColor:state.archivedAt?"var(--n2)":"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={async()=>{if(state.archivedAt)void act("reactivate");else if(await confirm({title:"Dar de baja cliente",message:"Se pausarán futuros cobros. Los pagos, cuotas parciales y deudas existentes se conservarán.",confirmLabel:"Dar de baja"}))void act("archive")}}>{state.archivedAt?"Reactivar cliente":"Dar de baja cliente"}</button>
    </div>}
   </article>

   {state.scheduledChange&&<div className="rounded-br15 border border-n1 p-p20 space-y-p10" style={{backgroundColor:"var(--color-accent-primary-soft)"}}><div><p className="fs-14 font-semibold text-app">Cambio programado</p><p className="fs-12 text-app-secondary mt-p5">{state.scheduledChange.new_plan_name??"Personalizado"} · {formatPaymentMoney(state.scheduledChange.new_amount,state.scheduledChange.currency)} · {FREQUENCY_LABELS[state.scheduledChange.new_frequency]} desde {formatCalendarDate(state.scheduledChange.starts_on)}.</p></div><button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-12 font-medium text-app" style={{backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>act("cancel_change",{agreementId:a?.id,changeId:state.scheduledChange?.id})}>Cancelar cambio programado</button></div>}

   {a?.cancel_at_period_end&&<div className="rounded-br15 border border-n1 p-p20 space-y-p10" style={{backgroundColor:"var(--color-bg-bg0)"}}><div><p className="fs-14 font-semibold text-app">Baja programada</p><p className="fs-12 text-app-secondary mt-p5">La suscripción finalizará al terminar el período actual: {formatCalendarDate(a.cancellation_boundary??"")}.</p></div><button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-12 font-medium text-app" style={{backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>act("undo_cancel_end",{agreementId:a.id})}>Cancelar baja programada</button></div>}

   {cancelForm&&<div className="space-y-p20 border border-n1 rounded-br15 p-p20" style={{backgroundColor:"var(--n)"}}><div><p className="fs-16 font-semibold text-app">Dar de baja suscripción</p><p className="fs-12 text-app-secondary mt-p5">La deuda y los pagos se conservan. La baja efectiva es definitiva.</p></div><label className="fs-12 text-app-secondary">Momento de la baja<select className={inputClass} value={cancelMode} onChange={e=>setCancelMode(e.target.value)}><option value="now">Ahora</option>{a?.status==="active"&&a.installments_enabled&&<option value="end">Al finalizar el período actual</option>}</select></label><div className="flex gap-p10"><button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={()=>setCancelForm(false)}>Regresar</button><button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>act(cancelMode==="end"?"cancel_end":"cancel",{agreementId:a?.id})}>Confirmar baja</button></div></div>}

   {form&&<div className="space-y-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
    <div><h4 className="fs-16 font-semibold text-app">{form==="create"?"Crear suscripción":form==="change"?"Cambiar suscripción":form==="adopt"?"Primer vencimiento con cuotas":"Reanudar suscripción"}</h4><p className="fs-12 text-app-secondary mt-p5">{form==="change"?"Las cuotas pagadas, parciales y vencidas no cambian. La nueva configuración afecta solo ciclos futuros sin pagos.":form==="resume"?"Los ciclos omitidos durante la pausa no se cobrarán.":"Crear una cuota no registra un pago ni cuenta como ingreso."}</p></div>
    {(form==="create"||form==="change")&&<><PlanFields planId={planId} onPlanId={setPlanId} date={date} amount={amount} onAmount={setAmount} frequency={frequency} onFrequency={setFrequency} name={planName} onName={setPlanName}/><p className="fs-12 text-app-secondary">Método de cobro: Manual. No hay prorrateo. El cambio comienza en la primera cuota futura editable desde la fecha elegida.</p></>}
    <div><label className="fs-12 text-app-secondary">{form==="resume"||form==="adopt"?"Próximo vencimiento válido de la agenda original":form==="change"?"Fecha efectiva del cambio":"Primer vencimiento"}</label><div className="mt-p10"><RangeCalendar disabled={pending} selectionMode="single" numberOfMonths={2} value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))} recurrence={date?{frequency:form==="resume"||form==="adopt"?f??frequency:frequency,anchorDate:form==="resume"||form==="adopt"?a?.billing_anchor_date??date:date}:undefined}/></div></div>
    <div className="flex gap-p10 border-t border-n1 pt-p20"><button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app" style={{backgroundColor:"var(--color-bg-bg0)"}} onClick={()=>setForm(null)} disabled={pending}>Cancelar</button><button className="btn-primary" disabled={pending||!date||(form==="create"||form==="change")&&!planId} onClick={()=>act(form,form==="create"||form==="change"?{...(a?{agreementId:a.id}:{}),...(planId?{planId}:{frequency,amount:Number(amount),planName:planName.trim()||undefined}),anchorDate:date,...(form==="change"&&state.scheduledChange?{replaceChangeId:state.scheduledChange.id}:{})}:{agreementId:a?.id,nextDueDate:date})}>Confirmar</button></div>
   </div>}

   {state.installments.length>0&&<section className="space-y-p10"><div><h4 className="fs-16 font-semibold text-app">Cuotas</h4><p className="fs-12 text-app-secondary mt-p5">Vencimientos generados para esta suscripción.</p></div><div className="space-y-p10">{state.installments.map(i=>{const label=i.status==="paid"?"Pagada":i.status==="cancelled"?"Cancelada":i.status==="waived"?"Condonada":i.partially_paid?"Pago parcial":i.overdue?"Vencida":"Pendiente";return <div key={i.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--n)"}}><div className="flex flex-wrap items-center gap-p10"><span className="fs-14 font-medium text-app">{formatCalendarDate(i.due_date)}</span><span className="rounded-full px-p10 py-p5 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg1)"}}>{label}</span><span className="fs-12 text-app-secondary">{formatPaymentMoney(i.remaining,i.currency)} pendiente</span></div>{i.status==="open"&&<button className="inline-flex shrink-0 items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-12 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={async()=>{if(await confirm({title:"Condonar saldo",message:"No se registrará dinero recibido. Esta condonación no se puede deshacer.",confirmLabel:"Condonar"}))void act("waive",{installmentId:i.id})}}>Condonar saldo</button>}</div>})}</div></section>}

   {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length>0&&<p className="fs-12 text-app-secondary">Suscripciones anteriores conservadas: {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length}.</p>}
  </>}
 </section>
}
