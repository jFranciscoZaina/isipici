"use client"
import {useSubmissionLock} from "./useSubmissionLock"
import InlineLoader from "./InlineLoader"
import React, { useCallback, useEffect, useState, useRef } from "react"
import {useToast} from "./ToastProvider"
import {useRemoteData} from "./useRemoteData"
import type { ClientRow } from "../page"
import PlanFields from "./PlanFields"
import RangeCalendar, { type DateRangeValue } from "./RangeCalendar"
import ClientSearchSelect from "./ClientSearchSelect"
import Modal from "./Modal"
import { frequencyFromInterval, formatCalendarDate, formatPaymentPeriod, toCalendarDate, fromCalendarDate, type RecurringFrequency } from "@/lib/payments/schedule"
import {validPaymentMoneyDraft} from "@/lib/payments/validation"
import {calendarWindow,defaultPaymentType,installmentPeriods,toggleInstallment,paymentHistoryMarkers,type CalendarPayment} from "@/lib/payments/calendar"
import type { PaymentType, SubscriptionState } from "@/lib/payments/types"
import { formatPaymentMoney } from "@/lib/payments/format"
import {frequencyLabel} from "@/lib/i18n"
import {useI18n} from "../../I18nProvider"
import type {BusinessTool} from "@/lib/business-tools"
type EventPaymentOption={participantId:string;eventId:string;name:string;startsAt:string;timezone:string;location:string|null;amountDue:number;currency:"ARS"|"AUD"}
type Props={clients:ClientRow[];onClose:()=>void;onCreated:()=>void;preselectedClientId?:string;enabledTools:BusinessTool[];onSuccess?:(msg:string)=>void;onError?:(msg:string)=>void}
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
function todayInTimeZone(timeZone:string){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]))
 return `${parts.year}-${parts.month}-${parts.day}`
}
export default function NewPaymentModal({clients,onClose,onCreated,preselectedClientId,enabledTools}:Props){
 const {t,locale}=useI18n()
 const allowRecurring=enabledTools.includes("plans"),allowOneOff=enabledTools.includes("payments"),allowEvents=enabledTools.includes("events")
 const [clientId,setClientId]=useState(preselectedClientId??""),[chosenType,setType]=useState<PaymentType>(allowOneOff?"one_off":"recurring")
 const submission=useSubmissionLock()
 const toast=useToast()
 const [saving,setSaving]=useState(false),[choice,setChoice]=useState(""),[eventParticipantId,setEventParticipantId]=useState(""),[eventPaymentDate,setEventPaymentDate]=useState("")
 const [amount,setAmount]=useState(""),[discount,setDiscount]=useState(""),[price,setPrice]=useState(""),[concept,setConcept]=useState(""),[note,setNote]=useState("")
 const [planId,setPlanId]=useState(""),[planName,setPlanName]=useState("")
 const onCatalogPrice=useCallback((value:number|null)=>{setPrice(value===null?"":String(value));setAmount(value===null?"":String(value))},[])
 const typeChoice=useRef({clientId:preselectedClientId??"",initialized:false,manual:false})
 const [oneOffDebt,setOneOffDebt]=useState("")
 const [frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[date,setDate]=useState(""),[range,setRange]=useState<DateRangeValue>({})
 const [selectedIds,setSelectedIds]=useState<string[]>([]),[visible,setVisible]=useState(calendarWindow)
 const loadClient=useCallback(async(signal:AbortSignal)=>{
  const [subscriptionResponse,historyResponse,eventResponse]=await Promise.all([
   fetch(`/api/clients/${clientId}/subscription?from=${visible.from}&to=${visible.to}`,{signal}),
   fetch(`/api/payments?clientId=${clientId}`,{signal}),
   allowEvents?fetch(`/api/events/payment-options?clientId=${clientId}`,{signal}):Promise.resolve(null),
  ])
  const responses=[subscriptionResponse,historyResponse,eventResponse].filter((response):response is Response=>Boolean(response))
  if(responses.some(response=>response.status===401)){window.location.href="/login";throw new DOMException("Aborted","AbortError")}
  if(responses.some(response=>!response.ok))throw new Error(t("payment.loadingClient"))
  const [subscription,history,eventBody]=await Promise.all([
   subscriptionResponse.json(),
   historyResponse.json(),
   eventResponse?eventResponse.json():Promise.resolve({options:[]}),
  ])
  return {subscription:subscription as SubscriptionState,history:history as CalendarPayment[],events:(eventBody.options??[]) as EventPaymentOption[]}
 },[clientId,visible.from,visible.to,t,allowEvents])
 const remote=useRemoteData(`/api/clients/${clientId}/subscription?from=${visible.from}&to=${visible.to}`,t("payment.loadingClient"),t("payment.loadingClient"),Boolean(clientId),clientId,loadClient)
 const state=remote.data?.subscription??null,eventOptions=remote.data?.events??[],loading=remote.loading,loadError=remote.error
 const preferredType=(current:SubscriptionState["current"]):PaymentType=>allowRecurring&&allowOneOff?defaultPaymentType(current):allowRecurring?"recurring":"one_off"
 const type=state&&!typeChoice.current.initialized&&!typeChoice.current.manual?preferredType(state.current):chosenType==="recurring"&&!allowRecurring&&allowOneOff?"one_off":chosenType==="one_off"&&!allowOneOff&&allowRecurring?"recurring":chosenType
 const selectedEvent=eventOptions.find(event=>event.participantId===eventParticipantId)??null
 const historyMarkers=paymentHistoryMarkers(remote.data?.history??[],{from:visible.from,to:visible.to})
 const onVisible=useCallback((next:{from:string;to:string})=>{if(visible.from===next.from&&visible.to===next.to)return;setVisible(next);setSelectedIds([]);setChoice("");if(!(type==="recurring"&&!state?.current)){setAmount("");setDiscount("")}},[visible.from,visible.to,type,state])
 const selectedClient=clients.find(c=>c.id===clientId), a=state?.current
 const currentFrequency=a?frequencyFromInterval(a.interval_unit,a.interval_count):null
 const installment=state?.installments.find(i=>i.id===selectedIds[0]), legacyDebt=choice==="legacy"&&Boolean(state?.legacyDebtPaymentId)
 const creating=type==="recurring"&&state&&!a&&!legacyDebt&&!installment
 const selected=state?.installments.filter(i=>selectedIds.includes(i.id))??[]
 const periods=installmentPeriods(state?.installments??[],Boolean(state?.archivedAt))
 const pick=(id:string)=>{if(!state||loading||saving)return;const ids=toggleInstallment(state.installments,selectedIds,id);setSelectedIds(ids);setChoice("");setDiscount("");setAmount(String(state.installments.filter(i=>ids.includes(i.id)).reduce((sum,i)=>sum+Number(i.remaining),0)))}
 const eligible=state?.installments.filter(i=>i.status==="open"&&i.remaining>0&&(!state.archivedAt||i.due_date<=new Date().toISOString().slice(0,10)))??[]
 useEffect(()=>{if(!clientId||remote.status!=="success"||!state)return;if(typeChoice.current.clientId!==clientId)typeChoice.current={clientId,initialized:false,manual:false};if(!typeChoice.current.initialized){if(!typeChoice.current.manual){if(!allowOneOff&&!allowRecurring&&eventOptions[0]){setEventParticipantId(eventOptions[0].participantId);setEventPaymentDate(todayInTimeZone(eventOptions[0].timezone))}else setType(preferredType(state.current))}typeChoice.current.initialized=true}},[clientId,remote.status,state,allowRecurring,allowOneOff,eventOptions])
 const remainingBase=(selected.length?selected.reduce((sum,i)=>sum+Number(i.remaining),0):undefined)??(legacyDebt?state?.legacyDebt??0:Number(price))
 const remaining=Math.max(Math.round((remainingBase-Number(amount)-Number(discount))*100)/100,0)
 const over=type==="recurring"&&Number(amount)+Number(discount)>remainingBase
 const canSave=selectedEvent
  ?Boolean(clientId&&state&&!loading&&!loadError&&!saving&&eventPaymentDate)
  :Boolean(clientId&&state&&!loading&&!loadError&&!over&&selected.length<=100&&(type==="recurring"?allowRecurring:allowOneOff)&&validPaymentMoneyDraft(amount)&&validPaymentMoneyDraft(discount)&&Number(amount)>=0&&Number(discount)>=0&&Number.isFinite(Number(amount))&&Number.isFinite(Number(discount))&&(Number(amount)>0||Number(discount)>0)&&
  (type==="one_off"?!state.archivedAt&&concept.trim()&&range.from&&validPaymentMoneyDraft(oneOffDebt):installment||legacyDebt||creating&&!state.archivedAt&&planId&&date&&(validPaymentMoneyDraft(price)&&Number(price)>0)))
 const save=async()=>{if(!canSave||saving)return;if(!submission.acquire())return;const operation=toast.start(t("payment.registering"));setSaving(true);try{
  if(selectedEvent){const eventResponse=await fetch(`/api/events/${selectedEvent.eventId}/participants/${selectedEvent.participantId}/pay`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({receiptNote:note.trim()||undefined,paymentDate:eventPaymentDate})});if(eventResponse.status===401){window.location.href="/login";operation.close();return}const eventBody=await eventResponse.json();if(!eventResponse.ok)throw new Error(t("payment.error"));operation.success(eventBody.receipt_status==="failed"?t("payment.receiptFailed"):t("payment.registered"));onCreated();onClose();return}
  const payload:Record<string,unknown>={clientId,paymentType:type,provider:"manual",amount:Number(amount),discount:Number(discount),receiptNote:note.trim()||undefined,concept:concept.trim()||undefined}
  if(type==="one_off"){payload.debt=Number(oneOffDebt);payload.periodFrom=toCalendarDate(range.from)||undefined;payload.periodTo=toCalendarDate(range.to??range.from)||undefined}
  else if(installment){payload.selectedInstallmentIds=selectedIds;payload.recurringAgreementId=installment.recurring_agreement_id}
  else if(legacyDebt){payload.plan="Pago deuda";payload.debtPaymentId=state?.legacyDebtPaymentId;payload.debt=remaining}
  else {payload.anchorDate=date;if(planId)payload.planId=planId;else{payload.frequency=frequency;payload.cycleDate=date;payload.plan=planName.trim()||undefined;payload.debt=remaining}}
  const r=await fetch("/api/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(r.status===401){window.location.href="/login";operation.close();return}const b=await r.json();if(!r.ok)throw new Error(t("payment.error"));operation.success(b.receipt_status==="failed"?t("payment.receiptFailed"):t("payment.registered"));onCreated();onClose()
 }catch{operation.error(t("payment.error"))}finally{submission.release();operation.close();setSaving(false)}}
 return <Modal size="large" onClose={()=>{if(!saving)onClose()}} header={<h2 className="fs-14 font-semibold">{t("payment.title")}</h2>} secondaryAction={{label:t("common.back"),onClick:onClose,disabled:saving}} primaryAction={{label:saving?t("payment.saving"):t("payment.title"),onClick:save,disabled:saving||!canSave}}>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-p30"><div className="space-y-p10">
   <ClientSearchSelect disabled={saving} clients={clients} selectedClientId={clientId} onSelectClient={id=>{typeChoice.current={clientId:id,initialized:false,manual:false};setType(allowOneOff?"one_off":"recurring");setEventParticipantId("");setEventPaymentDate("");setPlanId("");setPlanName("");setClientId(id);setOneOffDebt("");setChoice("");setSelectedIds([]);setAmount("");setDiscount("")}}/>
   {state&&(allowOneOff||allowRecurring||eventOptions.length>0)&&<Field label={t("payment.type")}><select disabled={loading||saving} className={inputClass} value={selectedEvent?`event:${selectedEvent.participantId}`:type} onChange={e=>{typeChoice.current.manual=true;const value=e.target.value;if(value.startsWith("event:")){const participantId=value.slice(6);const event=eventOptions.find(item=>item.participantId===participantId);setEventParticipantId(participantId);setEventPaymentDate(event?todayInTimeZone(event.timezone):"");setType("one_off");setSelectedIds([]);setChoice("");return}setEventParticipantId("");setEventPaymentDate("");setType(value as PaymentType)}}>{allowOneOff&&<option value="one_off">{t("payment.oneOff")}</option>}{allowRecurring&&<option value="recurring">{t("payment.membership")}</option>}{eventOptions.map(event=><option key={event.participantId} value={`event:${event.participantId}`}>{t("payment.event")} · {event.name} · {formatPaymentMoney(event.amountDue,event.currency)}</option>)}</select></Field>}
   {state&&!allowRecurring&&!allowOneOff&&eventOptions.length===0&&<p className="rounded-br10 border border-n1 p-p10 fs-14 text-app-secondary">{t("tools.noDirectPayments")}</p>}
   {state&&loading&&<InlineLoader text={t("payment.refreshingInstallments")}/>}
   {selectedEvent&&<div className="rounded-br15 border border-n1 bg-bg0 p-p20"><p className="fs-14 font-semibold text-app">{selectedEvent.name}</p><p className="mt-p5 fs-12 text-app-secondary">{new Intl.DateTimeFormat(locale==="es"?"es-AR":"en-AU",{dateStyle:"medium",timeStyle:"short"}).format(new Date(selectedEvent.startsAt))}{selectedEvent.location?` · ${selectedEvent.location}`:""}</p><p className="mt-p10 fs-16 font-semibold text-app">{formatPaymentMoney(selectedEvent.amountDue,selectedEvent.currency)}</p><p className="mt-p5 fs-12 text-app-secondary">{t("payment.eventAmountHelp")}</p></div>}
   {!state&&loading&&<InlineLoader text={t("payment.loadingClient")}/>}{loadError&&<button className="btn-secondary" disabled={loading} onClick={()=>void remote.refresh()}>{t("payment.retryClient")}</button>}
   {state?.archivedAt&&<p className="fs-14 font-semibold">{t("payment.archivedClient")}</p>}
   {!selectedEvent&&type==="recurring"&&state&&<>
    <h3 className="fs-14 font-semibold">{creating?t("payment.createSubscription"):t("payment.registerInstallment")}</h3>
    {a&&<p className="fs-14">{a.plan_name?`${a.plan_name} · `:""}{t("payment.subscription")} {a.status==="paused"?t("payment.paused"):a.status==="pending"?t("payment.pending"):t("payment.active")} · {currentFrequency?frequencyLabel(locale,currentFrequency):"Legacy"} · {formatPaymentMoney(a.amount,a.currency)}</p>}
    {a?.status==="paused"&&<p className="fs-14 text-app-secondary">{t("payment.resumeHelp")}</p>}
    {a&&!a.installments_enabled&&<p className="fs-14 text-app-secondary">{t("payment.legacyHelp")}</p>}
    {(eligible.length>0||state.legacyDebt>0&&state.legacyDebtPaymentId)&&<Field label={t("payment.until")}><select disabled={loading||saving} className={inputClass} value={choice} onChange={e=>{setChoice(e.target.value);setSelectedIds(e.target.value&&e.target.value!=="legacy"?toggleInstallment(state.installments,[],e.target.value):[]);setDiscount("");const i=state.installments.find(x=>x.id===e.target.value);setAmount(String(i?state.installments.filter(x=>toggleInstallment(state.installments,[],i.id).includes(x.id)).reduce((sum,x)=>sum+Number(x.remaining),0):(e.target.value==="legacy"?state.legacyDebt:0)))}}><option value="">{t("payment.chooseLast")}</option>{eligible.map(i=><option key={i.id} value={i.id}>{formatCalendarDate(i.due_date)} · {formatPaymentMoney(i.remaining,i.currency)} {t("payment.outstanding")}</option>)}{state.legacyDebt>0&&state.legacyDebtPaymentId&&<option value="legacy">{t("payment.previousDebt")} · {formatPaymentMoney(state.legacyDebt,selectedClient?.currency)}</option>}</select></Field>}
    {creating&&<><PlanFields planId={planId} onPlanId={setPlanId} date={date} amount={price} onAmount={v=>{setPrice(v);setAmount(v)}} frequency={frequency} onFrequency={setFrequency} name={planName} onName={setPlanName} onPrice={onCatalogPrice}/><p className="fs-12 text-app-secondary">{t("payment.manual")}</p></>}
    {(installment||legacyDebt)&&<p className="fs-14 text-app-secondary">{t("payment.amountOutstanding")} {formatPaymentMoney(remainingBase,installment?.currency??selectedClient?.currency)}</p>}
   </>}
   {state&&selectedEvent?<fieldset disabled={loading||saving} className="space-y-p10"><Field label={t("payment.paymentDate")}><input className={inputClass} type="date" max={todayInTimeZone(selectedEvent.timezone)} value={eventPaymentDate} onChange={e=>setEventPaymentDate(e.target.value)}/><p className="fs-12 text-app-secondary">{t("payment.paymentDateHelp")}</p></Field><Field label={t("payment.receiptNote")}><textarea className={inputClass} rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field></fieldset>:state&&<fieldset disabled={loading||saving} className="space-y-p10"><Field label={type==="one_off"?t("payment.concept"):t("payment.conceptOptional")}><input className={inputClass} maxLength={200} value={concept} onChange={e=>setConcept(e.target.value)}/></Field>
   <Field label={t("payment.receivedToday")}><input className={inputClass} type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></Field>
   <Field label={t("payment.discount")}><input className={inputClass} type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></Field>
   {type==="one_off"&&<Field label={t("payment.oneOffDebt")}><input className={inputClass} type="number" min="0" step="0.01" value={oneOffDebt} onChange={e=>setOneOffDebt(e.target.value)}/><p className="fs-12 text-app-secondary">{t("payment.oneOffDebtHelp")}</p></Field>}
   {type==="recurring"&&<p className="fs-14 text-app-secondary">{over?t("payment.over"):selected.length||legacyDebt||creating?`${t("payment.remainingSelected")} ${formatPaymentMoney(remaining,selectedClient?.currency)}`:t("payment.chooseInstallment")}</p>}
   <Field label={t("payment.receiptNote")}><textarea className={inputClass} rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field></fieldset>}
  </div><div className="space-y-p10">
   {state&&!selectedEvent&&(type==="one_off"?<><Field label={t("payment.period")}><RangeCalendar disabled={loading||saving} numberOfMonths={2} selectionMode="range" value={range} onChange={setRange} markers={historyMarkers} onVisibleRangeChange={onVisible}/></Field>{range.from?<div className="flex flex-wrap items-center justify-between gap-p10"><p className="fs-14 text-app-secondary">{formatPaymentPeriod(toCalendarDate(range.from),toCalendarDate(range.to??range.from))}</p><button type="button" className="inline-flex min-h-10 items-center justify-center rounded-full border border-n2 bg-bg0 px-p20 py-p10 fs-12 font-medium text-app transition-colors hover:bg-bg1" onClick={()=>setRange({})}>{t("payment.clearPeriod")}</button></div>:<p className="fs-14 text-app-secondary">{t("payment.selectPeriod")}</p>}</>:creating?<Field label={t("payment.firstDue")}><RangeCalendar numberOfMonths={2} selectionMode="single" markers={historyMarkers} onVisibleRangeChange={onVisible} value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))} recurrence={date?{frequency,anchorDate:date}:undefined}/></Field>:<>
    <p className="fs-14 font-semibold">{t("payment.howFar")}</p>
    <RangeCalendar selectionMode="multiple" numberOfMonths={2} value={{}} onChange={()=>{}} periods={periods} markers={historyMarkers} selectedIds={selectedIds} onSelectInstallment={pick} onVisibleRangeChange={onVisible} disabled={loading||saving}/>
    <p className="fs-12 text-app-secondary">{t("payment.legend")}</p>
    <p className="fs-14">{t("payment.selected")} {selected.length} · {t("payment.totalBalance")} {formatPaymentMoney(selected.reduce((sum,i)=>sum+Number(i.remaining),0),selectedClient?.currency)}</p>
    <p className="fs-12 text-app-secondary">{t("payment.selectionHelp")}</p>
    {selected.length>100&&<p role="alert" className="fs-12 text-app-secondary">{t("payment.max100")}</p>}
    {selected.map(i=><p key={i.id} className="fs-12 text-app-secondary">{formatPaymentPeriod(i.period_from,i.period_to)}</p>)}
   </>)}

  </div></div>
 </Modal>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="flex flex-col gap-p5"><label className="fs-12 text-app-secondary">{label}</label>{children}</div>}
