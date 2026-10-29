"use client"
import {useSubmissionLock} from "./useSubmissionLock"
import InlineLoader from "./InlineLoader"
import {useState} from "react"
import {useConfirm} from "./ConfirmProvider"
import {useToast} from "./ToastProvider"
import {useRemoteData} from "./useRemoteData"
import Modal from "./Modal"
import RangeCalendar from "./RangeCalendar"
import {priceForDate,type PlanSummary} from "@/lib/payments/plan-types"
import {FREQUENCY_LABELS,RECURRING_FREQUENCIES,toCalendarDate,fromCalendarDate,formatCalendarDate,type RecurringFrequency} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
import {validPaymentMoneyDraft} from "@/lib/payments/validation"
import {frequencyLabel} from "@/lib/i18n"
import {useI18n} from "../../I18nProvider"
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function PlansModal({onClose}:{onClose:()=>void}){
 const {t,locale}=useI18n()
 const submission=useSubmissionLock()
 const toast=useToast(),confirm=useConfirm()
 const remote=useRemoteData<PlanSummary[]>("/api/plans",t("plans.loading"),t("plans.loadError"))
 const plans=remote.data??[],refresh=remote.refresh
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false)
 const [form,setForm]=useState<"create"|"edit"|null>(null),[id,setId]=useState(""),[name,setName]=useState(""),[frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[amount,setAmount]=useState(""),[date,setDate]=useState(toCalendarDate(new Date())),[existing,setExisting]=useState(false),[scheduled,setScheduled]=useState(false)
 const begin=(p?:PlanSummary)=>{setForm(p?"edit":"create");setId(p?.id??"");setName(p?.name??"");setFrequency(p?.frequency??"monthly");setAmount("");setDate(toCalendarDate(new Date()));setExisting(false);setScheduled(false);setError("");setMessage("")}
 const save=async(action:string)=>{if(busy)return;if(!submission.acquire())return;const operation=toast.start(t("plans.saving"));setBusy(true);setError("");try{const r=await fetch("/api/plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...(id?{planId:id}:{}),...(action!=="archive"?{name,frequency,...(amount?{amount:Number(amount),effectiveFrom:form==="create"?undefined:scheduled?date:toCalendarDate(new Date()),applyExisting:existing}:{})}:{})})});if(r.status===401){window.location.href="/login";operation.close();return}const b=await r.json();if(!r.ok)throw new Error(t("plans.saveError"));operation.success(action==="archive"?t("plans.archivedToast"):form==="create"?t("plans.createdToast"):amount?(scheduled||existing?t("plans.priceScheduled"):t("plans.priceUpdated")):t("plans.updatedToast"));setMessage(existing?`${b.scheduled??0} ${t("plans.scheduled")} ${b.skipped??0} ${t("plans.skipped")}`:t("plans.saved"));setForm(null);await refresh()}catch{setError(t("plans.saveError"));operation.error(t("plans.saveError"))}finally{submission.release();operation.close();setBusy(false)}}
 const today=toCalendarDate(new Date()),used=plans.find(p=>p.id===id)?.used??false
 return <Modal
  size="large"
  onClose={()=>{if(!busy)onClose()}}
  header={<div className="text-center"><h2 className="fs-20 font-semibold text-app">{t("plans.title")}</h2><p className="fs-12 text-app-secondary mt-p5">{t("plans.subtitle")}</p></div>}
  secondaryAction={{disabled:busy,label:form?t("plans.cancel"):t("plans.close"),onClick:()=>form?setForm(null):onClose()}}
  primaryAction={form?{label:t("plans.save"),onClick:()=>save(form),disabled:busy||remote.loading||!name.trim()||form==="create"&&(!amount||!date)||Boolean(amount)&&(!validPaymentMoneyDraft(amount)||Number(amount)<=0||!date)}:undefined}
 >
  <div className="space-y-p20" aria-busy={remote.loading}>
   {remote.loading&&<InlineLoader text={remote.data?t("plans.refreshing"):t("plans.loading")}/>}
   {remote.error&&<div className="rounded-br10 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}><p className="fs-14 text-app-secondary">{t("plans.loadError")}</p><button className="btn-primary mt-p10" onClick={()=>void refresh()}>{t("plans.retry")}</button></div>}
   {error&&<div role="alert" className="rounded-br10 border p-p10 fs-14 text-danger" style={{borderColor:"var(--color-state-danger)",backgroundColor:"color-mix(in srgb, var(--color-state-danger) 6%, var(--n) 94%)"}}>{error}</div>}
   {message&&<div role="status" className="rounded-br10 border border-n1 p-p10 fs-14 text-app" style={{backgroundColor:"var(--color-accent-primary-soft)"}}>{message}</div>}

   {!form?<>
    {remote.status==="success"&&plans.length===0?(
     <div className="flex min-h-[340px] items-center justify-center">
      <div className="max-w-md text-center space-y-p20">
       <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full fs-20 font-semibold" style={{backgroundColor:"var(--color-accent-primary-soft)",color:"var(--color-accent-primary)"}}>+</div>
       <div>
        <p className="fs-20 font-semibold text-app">{t("plans.first")}</p>
        <p className="fs-14 text-app-secondary mt-p5">{t("plans.firstHelp")}</p>
       </div>
       <button className="btn-primary" disabled={busy} onClick={()=>begin()}>{t("plans.new")}</button>
      </div>
     </div>
    ):plans.length>0&&<>
     <div className="flex flex-wrap items-center justify-between gap-p10">
      <div><p className="fs-16 font-semibold text-app">{t("plans.active")}</p><p className="fs-12 text-app-secondary mt-p5">{plans.length} {plans.length===1?t("plans.availableOne"):t("plans.available")}</p></div>
      <button className="btn-primary" disabled={remote.loading||busy} onClick={()=>begin()}>{t("plans.new")}</button>
     </div>
     <div className="grid gap-p10">
      {plans.map(p=>{
       const current=priceForDate(p,today),next=p.prices.find(price=>price.effective_from>today)
       return <article key={p.id} className="rounded-br15 border border-n1 p-p20" style={{backgroundColor:"var(--n)"}}>
        <div className="flex flex-col gap-p20 md:flex-row md:items-center md:justify-between">
         <div className="min-w-0 space-y-p10">
          <div className="flex flex-wrap items-center gap-p10">
           <h3 className="fs-16 font-semibold text-app">{p.name}</h3>
           <span className="rounded-full px-p10 py-p5 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg1)"}}>{frequencyLabel(locale,p.frequency)}</span>
           <span className="rounded-full px-p10 py-p5 fs-12 text-app-secondary" style={{backgroundColor:"var(--color-bg-bg1)"}}>{p.subscriptions} {p.subscriptions===1?t("plans.subscription"):t("plans.subscriptions")}</span>
          </div>
          <p className="fs-20 font-semibold text-app">{current?formatPaymentMoney(current.amount,current.currency):t("plans.noPrice")}</p>
          {next&&<p className="fs-12 text-app-secondary">{t("plans.nextPrice")} {formatPaymentMoney(next.amount,next.currency)} {t("common.from")} {formatCalendarDate(next.effective_from)}</p>}
         </div>
         <button
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-n2 px-p20 py-p10 fs-14 font-medium text-app transition-colors hover:bg-bg1 disabled:opacity-50"
          style={{backgroundColor:"var(--color-bg-bg0)"}}
          disabled={remote.loading||busy}
          onClick={()=>begin(p)}
         >
          Editar plan
         </button>
        </div>
       </article>
      })}
     </div>
    </>}
   </>:<div className="space-y-p20">
    <div className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
     <div>
      <p className="fs-16 font-semibold text-app">{form==="create"?t("plans.newTitle"):t("plans.editTitle")}</p>
      <p className="fs-12 text-app-secondary mt-p5">{form==="create"?t("plans.newHelp"):t("plans.editHelp")}</p>
     </div>
     <div className="grid gap-p20 md:grid-cols-2">
      <label className="fs-12 text-app-secondary">{t("common.name")}<input className={inputClass} value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
      <label className="fs-12 text-app-secondary">{t("plans.frequency")}<select className={inputClass} value={frequency} disabled={used} onChange={e=>setFrequency(e.target.value as RecurringFrequency)}>{RECURRING_FREQUENCIES.map(f=><option key={f} value={f}>{frequencyLabel(locale,f)}</option>)}</select>{used&&<span className="block mt-p5">{t("plans.frequencyLocked")}</span>}</label>
     </div>
     <label className="fs-12 text-app-secondary">{form==="create"?t("plans.initialPrice"):t("plans.newPrice")}<input className={inputClass} type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
     {form==="create"&&<p className="fs-12 text-app-secondary">{t("plans.initialPriceHelp")}</p>}
    </div>

    {amount&&form==="edit"&&<section className="rounded-br15 border border-n1 p-p20 space-y-p20" style={{backgroundColor:"var(--n)"}}>
     <div><p className="fs-16 font-semibold text-app">{t("plans.priceApplication")}</p><p className="fs-12 text-app-secondary mt-p5">{t("plans.priceApplicationHelp")}</p></div>
     <div className="grid gap-p20 md:grid-cols-2">
      <label className="fs-12 text-app-secondary">{t("plans.when")}<select className={inputClass} value={scheduled?"scheduled":"now"} onChange={e=>setScheduled(e.target.value==="scheduled")}><option value="now">{t("plans.now")}</option><option value="scheduled">{t("plans.schedule")}</option></select></label>
      <label className="fs-12 text-app-secondary">{t("plans.applyTo")}<select className={inputClass} value={existing?"existing":"new"} onChange={e=>setExisting(e.target.value==="existing")}><option value="new">{t("plans.newSubs")}</option><option value="existing">{t("plans.existingSubs")}</option></select></label>
     </div>
     {scheduled&&<div><p className="fs-12 text-app-secondary mb-p10">{t("plans.effective")}</p><RangeCalendar selectionMode="single" value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))}/></div>}
    </section>}

    {form==="edit"&&<section className="rounded-br15 border border-n1 p-p20 space-y-p10" style={{backgroundColor:"var(--n)"}}>
     <div><p className="fs-16 font-semibold text-app">{t("plans.history")}</p><p className="fs-12 text-app-secondary mt-p5">{t("plans.historyHelp")}</p></div>
     <div className="space-y-p5">{plans.find(p=>p.id===id)?.prices.map(price=><div key={price.id} className="flex items-center justify-between rounded-br10 px-p10 py-p10 fs-12" style={{backgroundColor:"var(--color-bg-bg0)"}}><span className="text-app">{formatPaymentMoney(price.amount,price.currency)}</span><span className="text-app-secondary">desde {formatCalendarDate(price.effective_from)}</span></div>)}</div>
     <div className="pt-p10 border-t border-n1">
      <button
       className="inline-flex items-center justify-center rounded-full border px-p20 py-p10 fs-14 font-medium disabled:opacity-50"
       style={{color:"var(--color-state-danger)",borderColor:"var(--color-state-danger)",backgroundColor:"var(--n)"}}
       disabled={busy}
       onClick={async()=>{if(await confirm({title:t("plans.archiveTitle"),message:t("plans.archiveMessage"),confirmLabel:t("plans.archive")}))void save("archive")}}
      >
       Archivar plan
      </button>
     </div>
    </section>}
   </div>}
  </div>
 </Modal>
}
