"use client"
import InlineLoader from "./InlineLoader"
import {useEffect} from "react"
import {useRemoteData} from "./useRemoteData"
import type {PlanSummary} from "@/lib/payments/plan-types"
import {priceForDate} from "@/lib/payments/plan-types"
import {toCalendarDate,type RecurringFrequency} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
import {frequencyLabel} from "@/lib/i18n"
import {useI18n} from "../../I18nProvider"
const inputClass="w-full rounded-br15 border border-n1 bg-bg1 px-p20 py-p10 fs-14 text-app"
export default function PlanFields({planId,onPlanId,date,onFrequency,onName,onPrice}:{planId:string;onPlanId:(id:string)=>void;date:string;amount:string;onAmount:(amount:string)=>void;frequency:RecurringFrequency;onFrequency:(frequency:RecurringFrequency)=>void;name:string;onName:(name:string)=>void;onPrice?:(amount:number|null)=>void}){
 const {t,locale}=useI18n()
 const remote=useRemoteData<PlanSummary[]>("/api/plans",t("plans.loading"),t("plans.loadError"))
 const plans=remote.data??[],error=remote.error
 const selected=plans.find(p=>p.id===planId),price=priceForDate(selected,date||toCalendarDate(new Date()))
 useEffect(()=>{if(planId)onPrice?.(price?Number(price.amount):null)},[planId,price,onPrice])
 const choose=(id:string)=>{onPlanId(id);const plan=plans.find(p=>p.id===id);if(plan){onFrequency(plan.frequency);onName(plan.name)}}
 return <div className="space-y-p10">
  {remote.loading&&<InlineLoader text={t("plans.loading")}/>}
  <label className="fs-12 text-app-secondary">{t("common.plan")}<select className={inputClass} disabled={remote.loading||remote.status!=="success"} value={planId} onChange={e=>choose(e.target.value)}><option value="">{t("plans.new")}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} · {frequencyLabel(locale,p.frequency)}</option>)}</select></label>
  {error&&<p role="alert" className="fs-12 text-app-secondary">{error}</p>}
  {planId&&selected&&<p className="fs-14">{selected?.name??t("common.plan")} · {selected?frequencyLabel(locale,selected.frequency):""} · {price?formatPaymentMoney(price.amount,price.currency):t("plans.noPrice")}</p>}
 </div>
}
