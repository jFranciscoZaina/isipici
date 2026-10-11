"use client"
import {useEffect} from "react"
import {useRemoteData} from "./useRemoteData"
import type {PlanSummary} from "@/lib/payments/plan-types"
import {priceForDate} from "@/lib/payments/plan-types"
import {FREQUENCY_LABELS,toCalendarDate,type RecurringFrequency} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function PlanFields({planId,onPlanId,date,onFrequency,onName,onPrice}:{planId:string;onPlanId:(id:string)=>void;date:string;amount:string;onAmount:(amount:string)=>void;frequency:RecurringFrequency;onFrequency:(frequency:RecurringFrequency)=>void;name:string;onName:(name:string)=>void;onPrice?:(amount:number|null)=>void}){
 const remote=useRemoteData<PlanSummary[]>("/api/plans","Cargando planes...","No se pudieron cargar los planes.")
 const plans=remote.data??[],error=remote.error
 const selected=plans.find(p=>p.id===planId),price=priceForDate(selected,date||toCalendarDate(new Date()))
 useEffect(()=>{if(planId)onPrice?.(price?Number(price.amount):null)},[planId,price,onPrice])
 const choose=(id:string)=>{onPlanId(id);const plan=plans.find(p=>p.id===id);if(plan){onFrequency(plan.frequency);onName(plan.name)}}
 return <div className="space-y-p10">
  <label className="fs-12 text-app-secondary">Plan<select className={inputClass} disabled={remote.loading||remote.status!=="success"} value={planId} onChange={e=>choose(e.target.value)}><option value="">Seleccioná un plan</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {FREQUENCY_LABELS[p.frequency]}</option>)}</select></label>
  {error&&<p role="alert" className="fs-12 text-app-secondary">{error}</p>}
  {planId&&selected&&<p className="fs-14">{selected?.name??"Plan actual"} · {selected?FREQUENCY_LABELS[selected.frequency]:""} · {price?formatPaymentMoney(price.amount,price.currency):"Elegí una fecha con precio vigente"}</p>}
 </div>
}
