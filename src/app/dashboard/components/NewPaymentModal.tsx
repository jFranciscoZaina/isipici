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
import { FREQUENCY_LABELS, frequencyFromInterval, formatCalendarDate, formatPaymentPeriod, toCalendarDate, fromCalendarDate, type RecurringFrequency } from "@/lib/payments/schedule"
import {validPaymentMoneyDraft} from "@/lib/payments/validation"
import {calendarWindow,defaultPaymentType,installmentPeriods,toggleInstallment,paymentHistoryMarkers,type CalendarPayment} from "@/lib/payments/calendar"
import type { PaymentType, SubscriptionState } from "@/lib/payments/types"
import { formatPaymentMoney } from "@/lib/payments/format"
type Props={clients:ClientRow[];onClose:()=>void;onCreated:()=>void;preselectedClientId?:string;onSuccess?:(msg:string)=>void;onError?:(msg:string)=>void}
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function NewPaymentModal({clients,onClose,onCreated,preselectedClientId}:Props){
 const [clientId,setClientId]=useState(preselectedClientId??""),[chosenType,setType]=useState<PaymentType>("one_off")
 const submission=useSubmissionLock()
 const toast=useToast()
 const [saving,setSaving]=useState(false),[choice,setChoice]=useState("")
 const [amount,setAmount]=useState(""),[discount,setDiscount]=useState(""),[price,setPrice]=useState(""),[concept,setConcept]=useState(""),[note,setNote]=useState("")
 const [planId,setPlanId]=useState(""),[planName,setPlanName]=useState("")
 const onCatalogPrice=useCallback((value:number|null)=>{setPrice(value===null?"":String(value));setAmount(value===null?"":String(value))},[])
 const typeChoice=useRef({clientId:preselectedClientId??"",initialized:false,manual:false})
 const [oneOffDebt,setOneOffDebt]=useState("")
 const [frequency,setFrequency]=useState<RecurringFrequency>("monthly"),[date,setDate]=useState(""),[range,setRange]=useState<DateRangeValue>({})
 const [selectedIds,setSelectedIds]=useState<string[]>([]),[visible,setVisible]=useState(calendarWindow)
 const loadClient=useCallback(async(signal:AbortSignal)=>{
  const responses=await Promise.all([fetch(`/api/clients/${clientId}/subscription?from=${visible.from}&to=${visible.to}`,{signal}),fetch(`/api/payments?clientId=${clientId}`,{signal})])
  if(responses.some(r=>r.status===401)){window.location.href="/login";throw new DOMException("Aborted","AbortError")}
  if(responses.some(r=>!r.ok))throw new Error("No se pudo cargar la información del cliente.")
  const [subscription,history]=await Promise.all(responses.map(r=>r.json()))
  return {subscription:subscription as SubscriptionState,history:history as CalendarPayment[]}
 },[clientId,visible.from,visible.to])
 const remote=useRemoteData(`/api/clients/${clientId}/subscription?from=${visible.from}&to=${visible.to}`,"Cargando información del cliente...","No se pudo cargar la información del cliente.",Boolean(clientId),clientId,loadClient)
 const state=remote.data?.subscription??null,loading=remote.loading,loadError=remote.error
 const type=state&&!typeChoice.current.initialized&&!typeChoice.current.manual?defaultPaymentType(state.current):chosenType
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
 useEffect(()=>{if(!clientId||remote.status!=="success"||!state)return;if(typeChoice.current.clientId!==clientId)typeChoice.current={clientId,initialized:false,manual:false};if(!typeChoice.current.initialized){if(!typeChoice.current.manual)setType(defaultPaymentType(state.current));typeChoice.current.initialized=true}},[clientId,remote.status,state])
 const remainingBase=(selected.length?selected.reduce((sum,i)=>sum+Number(i.remaining),0):undefined)??(legacyDebt?state?.legacyDebt??0:Number(price))
 const remaining=Math.max(Math.round((remainingBase-Number(amount)-Number(discount))*100)/100,0)
 const over=type==="recurring"&&Number(amount)+Number(discount)>remainingBase
 const canSave=Boolean(clientId&&state&&!loading&&!loadError&&!over&&selected.length<=100&&validPaymentMoneyDraft(amount)&&validPaymentMoneyDraft(discount)&&Number(amount)>=0&&Number(discount)>=0&&Number.isFinite(Number(amount))&&Number.isFinite(Number(discount))&&(Number(amount)>0||Number(discount)>0)&&
  (type==="one_off"?!state.archivedAt&&concept.trim()&&range.from&&validPaymentMoneyDraft(oneOffDebt):installment||legacyDebt||creating&&!state.archivedAt&&planId&&date&&(validPaymentMoneyDraft(price)&&Number(price)>0)))
 const save=async()=>{if(!canSave||saving)return;if(!submission.acquire())return;const operation=toast.start("Registrando pago...");setSaving(true);try{
  const payload:Record<string,unknown>={clientId,paymentType:type,provider:"manual",amount:Number(amount),discount:Number(discount),receiptNote:note.trim()||undefined,concept:concept.trim()||undefined}
  if(type==="one_off"){payload.debt=Number(oneOffDebt);payload.periodFrom=toCalendarDate(range.from)||undefined;payload.periodTo=toCalendarDate(range.to??range.from)||undefined}
  else if(installment){payload.selectedInstallmentIds=selectedIds;payload.recurringAgreementId=installment.recurring_agreement_id}
  else if(legacyDebt){payload.plan="Pago deuda";payload.debtPaymentId=state?.legacyDebtPaymentId;payload.debt=remaining}
  else {payload.anchorDate=date;if(planId)payload.planId=planId;else{payload.frequency=frequency;payload.cycleDate=date;payload.plan=planName.trim()||undefined;payload.debt=remaining}}
  const r=await fetch("/api/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(r.status===401){window.location.href="/login";operation.close();return}const b=await r.json();if(!r.ok)throw new Error("No se pudo registrar el pago.");operation.success(b.receipt_status==="failed"?"Pago registrado. No se pudo preparar el comprobante.":"Pago registrado.");onCreated();onClose()
 }catch{operation.error("No se pudo registrar el pago.")}finally{submission.release();operation.close();setSaving(false)}}
 return <Modal size="large" onClose={()=>{if(!saving)onClose()}} header={<h2 className="fs-14 font-semibold">Registrar pago</h2>} secondaryAction={{label:"Regresar",onClick:onClose,disabled:saving}} primaryAction={{label:saving?"Guardando…":"Registrar pago",onClick:save,disabled:saving||!canSave}}>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-p30"><div className="space-y-p10">
   <ClientSearchSelect disabled={saving} clients={clients} selectedClientId={clientId} onSelectClient={id=>{typeChoice.current={clientId:id,initialized:false,manual:false};setType("one_off");setPlanId("");setPlanName("");setClientId(id);setOneOffDebt("");setChoice("");setSelectedIds([]);setAmount("");setDiscount("")}}/>
   {state&&<Field label="Tipo de pago"><select disabled={loading||saving} className={inputClass} value={type} onChange={e=>{typeChoice.current.manual=true;setType(e.target.value as PaymentType)}}><option value="recurring">Recurrente</option><option value="one_off">Pago único</option></select></Field>}
   {state&&loading&&<InlineLoader text="Actualizando cuotas..."/>}
   {!state&&loading&&<InlineLoader text="Cargando información del cliente..."/>}{loadError&&<button className="btn-secondary" disabled={loading} onClick={()=>void remote.refresh()}>Reintentar carga del cliente</button>}
   {state?.archivedAt&&<p className="fs-14 font-semibold">Cliente dado de baja. Solo puede registrar pagos de deuda pendiente.</p>}
   {type==="recurring"&&state&&<>
    <h3 className="fs-14 font-semibold">{creating?"Crear suscripción y registrar primera cuota":"Registrar cuota"}</h3>
    {a&&<p className="fs-14">{a.plan_name?`${a.plan_name} · `:""}Suscripción {a.status==="paused"?"pausada":a.status==="pending"?"pendiente":"activa"} · {currentFrequency?FREQUENCY_LABELS[currentFrequency]:"Legacy"} · {formatPaymentMoney(a.amount,a.currency)}</p>}
    {a?.status==="paused"&&<p className="fs-14 text-app-secondary">Para generar nuevos ciclos, usá “Reanudar suscripción” en la ficha del cliente. Podés pagar cuotas pendientes.</p>}
    {a&&!a.installments_enabled&&<p className="fs-14 text-app-secondary">Para iniciar el modelo de cuotas, usá “Empezar cuotas” o “Editar plan” en la ficha del cliente. La deuda anterior sigue disponible.</p>}
    {(eligible.length>0||state.legacyDebt>0&&state.legacyDebtPaymentId)&&<Field label="¿Hasta qué cuota querés pagar?"><select disabled={loading||saving} className={inputClass} value={choice} onChange={e=>{setChoice(e.target.value);setSelectedIds(e.target.value&&e.target.value!=="legacy"?toggleInstallment(state.installments,[],e.target.value):[]);setDiscount("");const i=state.installments.find(x=>x.id===e.target.value);setAmount(String(i?state.installments.filter(x=>toggleInstallment(state.installments,[],i.id).includes(x.id)).reduce((sum,x)=>sum+Number(x.remaining),0):(e.target.value==="legacy"?state.legacyDebt:0)))}}><option value="">Elegí la última cuota a incluir…</option>{eligible.map(i=><option key={i.id} value={i.id}>{formatCalendarDate(i.due_date)} · {formatPaymentMoney(i.remaining,i.currency)} pendiente</option>)}{state.legacyDebt>0&&state.legacyDebtPaymentId&&<option value="legacy">Deuda anterior · {formatPaymentMoney(state.legacyDebt,selectedClient?.currency)}</option>}</select></Field>}
    {creating&&<><PlanFields planId={planId} onPlanId={setPlanId} date={date} amount={price} onAmount={v=>{setPrice(v);setAmount(v)}} frequency={frequency} onFrequency={setFrequency} name={planName} onName={setPlanName} onPrice={onCatalogPrice}/><p className="fs-12 text-app-secondary">Método de cobro: Manual</p></>}
    {(installment||legacyDebt)&&<p className="fs-14 text-app-secondary">Monto pendiente: {formatPaymentMoney(remainingBase,installment?.currency??selectedClient?.currency)}</p>}
   </>}
   {state&&<fieldset disabled={loading||saving} className="space-y-p10"><Field label={type==="one_off"?"Concepto":"Concepto (opcional)"}><input className={inputClass} maxLength={200} value={concept} onChange={e=>setConcept(e.target.value)}/></Field>
   <Field label="Dinero recibido hoy"><input className={inputClass} type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></Field>
   <Field label="Bonificación (no cuenta como ingreso)"><input className={inputClass} type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></Field>
   {type==="one_off"&&<Field label="Deuda pendiente de este pago"><input className={inputClass} type="number" min="0" step="0.01" value={oneOffDebt} onChange={e=>setOneOffDebt(e.target.value)}/><p className="fs-12 text-app-secondary">Importe que queda por cobrar, aparte del dinero recibido y la bonificación. No modifica la deuda de la suscripción.</p></Field>}
   {type==="recurring"&&<p className="fs-14 text-app-secondary">{over?"El pago y descuento superan el saldo de la cuota.":selected.length||legacyDebt||creating?`Saldo restante de las cuotas seleccionadas: ${formatPaymentMoney(remaining,selectedClient?.currency)}`:"Elegí hasta qué cuota querés pagar en el calendario o en la lista."}</p>}
   <Field label="Nota del comprobante"><textarea className={inputClass} rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field></fieldset>}
  </div><div className="space-y-p10">
   {state&&(type==="one_off"?<><Field label="Fecha o período del pago (obligatorio)"><RangeCalendar disabled={loading||saving} numberOfMonths={2} selectionMode="range" value={range} onChange={setRange} markers={historyMarkers} onVisibleRangeChange={onVisible}/></Field><p className="fs-14 text-app-secondary">{range.from?formatPaymentPeriod(toCalendarDate(range.from),toCalendarDate(range.to??range.from)):"Seleccioná un día o un rango para registrar el pago."}</p>{range.from&&<button className="btn-secondary" onClick={()=>setRange({})}>Quitar período</button>}</>:creating?<Field label="Primer vencimiento"><RangeCalendar numberOfMonths={2} selectionMode="single" markers={historyMarkers} onVisibleRangeChange={onVisible} value={{from:fromCalendarDate(date)}} onChange={v=>setDate(toCalendarDate(v.from))} recurrence={date?{frequency,anchorDate:date}:undefined}/></Field>:<>
    <p className="fs-14 font-semibold">¿Hasta cuándo querés pagar?</p>
    <RangeCalendar selectionMode="multiple" numberOfMonths={2} value={{}} onChange={()=>{}} periods={periods} markers={historyMarkers} selectedIds={selectedIds} onSelectInstallment={pick} onVisibleRangeChange={onVisible} disabled={loading||saving}/>
    <p className="fs-12 text-app-secondary">Negro: vencimiento · Punto verde: pagado · Punto naranja: cuota pendiente o parcial · Punto amarillo: pago único con deuda · Sin punto: futuro. El borde indica tu selección.</p>
    <p className="fs-14">Cuotas seleccionadas: {selected.length} · Saldo total: {formatPaymentMoney(selected.reduce((sum,i)=>sum+Number(i.remaining),0),selectedClient?.currency)}</p>
    <p className="fs-12 text-app-secondary">Elegí un día del período de la última cuota que querés incluir. También se incluyen las cuotas pendientes anteriores. El dinero se aplica desde la más antigua; si no alcanza, la última queda parcialmente pagada.</p>
    {selected.length>100&&<p role="alert" className="fs-12 text-app-secondary">Seleccioná hasta 100 cuotas por operación; empezá por las más antiguas.</p>}
    {selected.map(i=><p key={i.id} className="fs-12 text-app-secondary">{formatPaymentPeriod(i.period_from,i.period_to)}</p>)}
   </>)}

  </div></div>
 </Modal>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="flex flex-col gap-p5"><label className="fs-12 text-app-secondary">{label}</label>{children}</div>}
