"use client"
import {useSubmissionLock} from "./useSubmissionLock"
import InlineLoader from "./InlineLoader"
import {useConfirm} from "./ConfirmProvider"
import {useToast} from "./ToastProvider"
import {useRemoteData} from "./useRemoteData"
import PlanFields from "./PlanFields"
import {calendarWindow} from "@/lib/payments/calendar"
import {useState} from "react"
import RangeCalendar from "./RangeCalendar"
import {frequencyFromInterval,formatCalendarDate,fromCalendarDate,toCalendarDate,type RecurringFrequency} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
import {frequencyLabel} from "@/lib/i18n"
import {useI18n} from "../../I18nProvider"
import type {SubscriptionState} from "@/lib/payments/types"

const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"

export default function SubscriptionPanel({clientId,onChanged}:{clientId:string;onChanged:()=>void}){
 const {t,locale}=useI18n()
 const submission=useSubmissionLock()
 const toast=useToast(),confirm=useConfirm()
 const [error,setError]=useState(""),[busy,setBusy]=useState(false)
 const [form,setForm]=useState<"create"|"change"|"resume"|"adopt"|null>(null)
 const [frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[amount,setAmount]=useState(""),[date,setDate]=useState(""),[planName,setPlanName]=useState("")
 const [planId,setPlanId]=useState(""),[cancelForm,setCancelForm]=useState(false),[cancelMode,setCancelMode]=useState("now"),[message,setMessage]=useState("")
 const calendar=calendarWindow()
 const url=`/api/clients/${clientId}/subscription?from=${calendar.from}&to=${calendar.to}`
 const remote=useRemoteData<SubscriptionState>(url,t("subscription.loading"),t("subscription.error"))
 const state=remote.data,refresh=remote.refresh,pending=busy||remote.loading
 const a=state?.current,f=a?frequencyFromInterval(a.interval_unit,a.interval_count):null

 const act=async(action:string,extra:Record<string,unknown>={})=>{
  if(pending||!submission.acquire())return
  const operation=toast.start(t("subscription.saving"))
  setBusy(true);setError("")
  try{
   const r=await fetch(`/api/clients/${clientId}/subscription`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...extra})})
   if(r.status===401){window.location.href="/login";operation.close();return}
   const b=await r.json()
   if(!r.ok)throw new Error(t("subscription.error"))
   const success:Record<string,string>={
    create:t("subscription.createdToast"),change:t("subscription.changeToast"),pause:t("subscription.pausedToast"),resume:t("subscription.resumedToast"),
    cancel:t("subscription.cancelledToast"),cancel_end:t("subscription.cancelEndToast"),undo_cancel_end:t("subscription.undoCancelToast"),
    cancel_change:t("subscription.cancelChangeToast"),archive:t("subscription.archivedToast"),reactivate:t("subscription.reactivatedToast"),waive:t("subscription.waivedToast")
   }
   operation.success(success[action]??t("subscription.updatedToast"))
   setForm(null);setCancelForm(false)
   if(b.startsOn)setMessage(`${t("subscription.scheduledFor")} ${formatCalendarDate(b.startsOn)}${b.delayed?`. ${t("subscription.delayedHelp")}`:""}`)
   await refresh();onChanged()
  }catch{
   setError(t("subscription.error"));operation.error(t("subscription.error"))
  }finally{
   submission.release();operation.close();setBusy(false)
  }
 }

 const begin=(kind:typeof form)=>{
  const change=kind==="change"?state?.scheduledChange:null
  setForm(kind)
  setPlanId(kind==="change"?(change?change.target_plan_id??"":a?.plan_id??""):"")
  setAmount(change?String(change.new_amount):a?String(a.amount):"")
  setDate(kind==="change"?change?.effective_from??toCalendarDate(new Date()):"")
  setPlanName(change?.new_plan_name??a?.plan_name??"")
  if(change)setFrequency(change.new_frequency);else if(f)setFrequency(f)
 }

 const statusLabel=a?.status==="paused"?t("subscription.statusPaused"):a?.status==="pending"?t("subscription.statusPending"):t("subscription.statusActive")
 const installmentLabel=(i:SubscriptionState["installments"][number])=>i.status==="paid"?t("subscription.paid"):i.status==="cancelled"?t("subscription.cancelled"):i.status==="waived"?t("subscription.waived"):i.partially_paid?t("subscription.partial"):i.overdue?t("subscription.overdue"):t("subscription.pending")

 return <section className="space-y-p20 border-t border-n1 pt-p20">
  <div className="flex items-center justify-between gap-p10">
   <div><h3 className="fs-16 font-semibold text-app">{t("subscription.title")}</h3><p className="fs-12 text-app-secondary mt-p5">{t("subscription.subtitle")}</p></div>
  </div>

  {message&&<div role="status" className="rounded-br10 border border-n1 p-p10 fs-14 text-app" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>{message}</div>}
  {error&&<div className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}} role="alert">{error}</div>}
  {remote.loading&&state&&<InlineLoader text={t("subscription.refreshing")}/>}
  {remote.error&&<button className="btn-primary" onClick={()=>void refresh()}>{t("common.retry")}</button>}

  {!state?remote.loading?<InlineLoader text={t("subscription.loading")}/>:null:<>
   <article className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
    <div className="flex flex-col gap-p10 sm:flex-row sm:items-start sm:justify-between">
     <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-p10">
       <p className="fs-16 font-semibold text-app">{a?.plan_name??(a?t("subscription.title"):t("subscription.none"))}</p>
       {a&&<span className="rounded-full px-p10 py-p5 fs-12 font-medium" style={{backgroundColor:a.status==="active"?"var(--color-accent-primary-soft)":"var(--color-bg-bg1)",color:a.status==="active"?"var(--color-accent-primary)":"var(--color-text-secondary)"}}>{statusLabel}</span>}
       {state.archivedAt&&<span className="rounded-full px-p10 py-p5 fs-12 font-medium text-danger" style={{backgroundColor:"color-mix(in srgb, var(--color-state-danger) 7%, var(--n) 93%)"}}>{t("subscription.archivedClient")}</span>}
      </div>
      {a?<p className="fs-20 font-semibold text-app mt-p10">{formatPaymentMoney(a.amount,a.currency)} <span className="fs-12 font-normal text-app-secondary">· {f?frequencyLabel(locale,f):t("subscription.legacySchedule")}</span></p>:<p className="fs-14 text-app-secondary mt-p10">{t("subscription.noRecurring")}</p>}
      {a?.status==="active"&&a.next_charge_at&&<p className="fs-12 text-app-secondary mt-p5">{t("subscription.nextDue")} {formatCalendarDate(a.next_charge_at.slice(0,10))}</p>}
     </div>
     {!state.archivedAt&&!a&&<button className="btn-primary shrink-0" onClick={()=>begin("create")} disabled={pending}>{t("subscription.create")}</button>}
    </div>

    {a&&!a.installments_enabled&&<div className="rounded-br10 border border-n1 p-p10 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg0)"}}>{t("subscription.legacyAgreement")}</div>}

    {(a||state.archivedAt)&&<div className="flex flex-wrap gap-p10 border-t border-n1 pt-p20">
     {!state.archivedAt&&a?.provider==="manual"&&<>
      {a.status==="active"&&<button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={()=>act("pause",{agreementId:a.id})}>{t("subscription.pause")}</button>}
      {a.status==="paused"&&<button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={()=>begin("resume")}>{t("subscription.resume")}</button>}
      {a.status==="active"&&!a.installments_enabled&&a.billing_anchor_date&&<button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} onClick={()=>begin("adopt")} disabled={pending}>{t("subscription.startInstallments")}</button>}
      <button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50" style={{borderColor:"var(--color-accent-primary)",color:"var(--color-accent-primary)",backgroundColor:"var(--color-accent-primary-soft)"}} onClick={()=>begin("change")} disabled={pending}>{state.scheduledChange?t("subscription.editScheduled"):t("subscription.change")}</button>
      <button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50" style={{color:"var(--color-state-danger)",borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>{setCancelMode("now");setCancelForm(true)}}>{t("subscription.cancel")}</button>
     </>}
     <button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50" style={{color:state.archivedAt?"var(--color-text)":"var(--color-state-danger)",borderColor:state.archivedAt?"var(--n2)":"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={async()=>{if(state.archivedAt)void act("reactivate");else if(await confirm({title:t("subscription.archiveClient"),message:t("subscription.archiveClientMessage"),confirmLabel:t("dashboard.archiveConfirm")}))void act("archive")}}>{state.archivedAt?t("subscription.reactivateClient"):t("subscription.archiveClient")}</button>
    </div>}
   </article>

   {state.scheduledChange&&<div className="rounded-br15 border border-n1 p-p20 space-y-p10" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>
    <div><p className="fs-14 font-semibold text-app">{t("subscription.scheduledChange")}</p><p className="fs-12 text-app-secondary mt-p5">{state.scheduledChange.new_plan_name??t("subscription.custom")} · {formatPaymentMoney(state.scheduledChange.new_amount,state.scheduledChange.currency)} · {frequencyLabel(locale,state.scheduledChange.new_frequency)} {t("common.from")} {formatCalendarDate(state.scheduledChange.starts_on)}.</p></div>
    <button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-12 font-medium text-app" style={{backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>act("cancel_change",{agreementId:a?.id,changeId:state.scheduledChange?.id})}>{t("subscription.cancelScheduledChange")}</button>
   </div>}

   {a?.cancel_at_period_end&&<div className="rounded-br15 border border-n1 p-p20 space-y-p10" style={{backgroundColor:"var(--color-bg-bg0)"}}>
    <div><p className="fs-14 font-semibold text-app">{t("subscription.scheduledCancel")}</p><p className="fs-12 text-app-secondary mt-p5">{t("subscription.endsAt")} {formatCalendarDate(a.cancellation_boundary??"")}.</p></div>
    <button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-12 font-medium text-app" style={{backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>act("undo_cancel_end",{agreementId:a.id})}>{t("subscription.cancelScheduledCancel")}</button>
   </div>}

   {cancelForm&&<div className="space-y-p20 border border-n1 rounded-br15 p-p20" style={{backgroundColor:"var(--n)"}}>
    <div><p className="fs-16 font-semibold text-app">{t("subscription.cancelTitle")}</p><p className="fs-12 text-app-secondary mt-p5">{t("subscription.cancelHelp")}</p></div>
    <label className="fs-12 text-app-secondary">{t("subscription.cancelWhen")}<select className={inputClass} value={cancelMode} onChange={e=>setCancelMode(e.target.value)}><option value="now">{t("subscription.now")}</option>{a?.status==="active"&&a.installments_enabled&&<option value="end">{t("subscription.endPeriod")}</option>}</select></label>
    <div className="flex gap-p10"><button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={()=>setCancelForm(false)}>{t("common.back")}</button><button className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}} disabled={pending} onClick={()=>act(cancelMode==="end"?"cancel_end":"cancel",{agreementId:a?.id})}>{t("subscription.confirmCancel")}</button></div>
   </div>}

   {form&&<div className="space-y-p20 rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
    <div><h4 className="fs-16 font-semibold text-app">{form==="create"?t("subscription.createTitle"):form==="change"?t("subscription.changeTitle"):form==="adopt"?t("subscription.adoptTitle"):t("subscription.resumeTitle")}</h4><p className="fs-12 text-app-secondary mt-p5">{form==="change"?t("subscription.changeHelp"):form==="resume"?t("subscription.resumeHelp"):t("subscription.createHelp")}</p></div>
    {(form==="create"||form==="change")&&<><PlanFields planId={planId} onPlanId={setPlanId} date={date} amount={amount} onAmount={setAmount} frequency={frequency} onFrequency={setFrequency} name={planName} onName={setPlanName}/><p className="fs-12 text-app-secondary">{t("subscription.paymentMethod")}. {t("subscription.noProration")} {t("subscription.changeStarts")}</p></>}
    <div><label className="fs-12 text-app-secondary">{form==="resume"||form==="adopt"?t("subscription.nextValid"):form==="change"?t("subscription.effectiveDate"):t("payment.firstDue")}</label><div className="mt-p10"><RangeCalendar disabled={pending} selectionMode="single" numberOfMonths={2} value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))} recurrence={date?{frequency:form==="resume"||form==="adopt"?f??frequency:frequency,anchorDate:form==="resume"||form==="adopt"?a?.billing_anchor_date??date:date}:undefined}/></div></div>
    <div className="flex gap-p10 border-t border-n1 pt-p20"><button className="inline-flex items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app" style={{backgroundColor:"var(--color-bg-bg0)"}} onClick={()=>setForm(null)} disabled={pending}>{t("common.cancel")}</button><button className="btn-primary" disabled={pending||!date||(form==="create"||form==="change")&&!planId} onClick={()=>act(form,form==="create"||form==="change"?{...(a?{agreementId:a.id}:{}),...(planId?{planId}:{frequency,amount:Number(amount),planName:planName.trim()||undefined}),anchorDate:date,...(form==="change"&&state.scheduledChange?{replaceChangeId:state.scheduledChange.id}:{})}:{agreementId:a?.id,nextDueDate:date})}>{t("subscription.confirm")}</button></div>
   </div>}

   {state.installments.length>0&&<section className="space-y-p10">
    <div><h4 className="fs-16 font-semibold text-app">{t("subscription.installments")}</h4><p className="fs-12 text-app-secondary mt-p5">{t("subscription.installmentsHelp")}</p></div>
    <div className="space-y-p10">{state.installments.map(i=><div key={i.id} className="flex flex-col gap-p10 rounded-br10 border border-n1 p-p10 sm:flex-row sm:items-center sm:justify-between" style={{backgroundColor:"var(--n)"}}>
     <div className="flex flex-wrap items-center gap-p10"><span className="fs-14 font-medium text-app">{formatCalendarDate(i.due_date)}</span><span className="rounded-full px-p10 py-p5 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg1)"}}>{installmentLabel(i)}</span><span className="fs-12 text-app-secondary">{formatPaymentMoney(i.remaining,i.currency)} {t("subscription.remaining")}</span></div>
     {i.status==="open"&&<button className="inline-flex shrink-0 items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-12 font-medium text-app hover:bg-bg1 disabled:opacity-50" style={{backgroundColor:"var(--color-bg-bg0)"}} disabled={pending} onClick={async()=>{if(await confirm({title:t("subscription.waiveTitle"),message:t("subscription.waiveMessage"),confirmLabel:t("subscription.waive")}))void act("waive",{installmentId:i.id})}}>{t("subscription.waive")}</button>}
    </div>)}</div>
   </section>}

   {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length>0&&<p className="fs-12 text-app-secondary">{t("subscription.previous")} {state.agreements.filter(x=>x.status==="cancelled"||x.status==="failed").length}.</p>}
  </>}
 </section>
}
