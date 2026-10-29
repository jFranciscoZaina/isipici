"use client";

import { useState } from "react";
import { Eye, EyeOff, ChevronUp, ChevronDown } from "react-feather";
import type { Currency } from "@/lib/payments/types";
import { formatPaymentMoney } from "@/lib/payments/format";
import {useI18n} from "../../I18nProvider";

type Props={available?:boolean;totalClients:number;clientsWithDebt:number;monthlyIncome:number;currency:Currency};
type HiddenState={totalClients:boolean;clientsWithDebt:boolean;monthlyIncome:boolean};

export default function StatsGrid({available=true,totalClients,clientsWithDebt,monthlyIncome,currency}:Props){
  const {t}=useI18n();
  const [isCollapsed,setIsCollapsed]=useState(true);
  const [hidden,setHidden]=useState<HiddenState>({totalClients:false,clientsWithDebt:false,monthlyIncome:true});
  const toggleHidden=(key:keyof HiddenState)=>setHidden(prev=>({...prev,[key]:!prev[key]}));

  return <div className="mb-1">
    {isCollapsed&&<div className="group mb-4 flex items-center justify-between border-b border-n2 pb-3 pl-5 pr-3 hover:cursor-pointer transition-colors" onClick={()=>setIsCollapsed(false)}>
      <span className="fs-14 text-app-secondary transition-colors group-hover:text-[color:var(--color-text)]">{t("stats.show")}</span>
      <button type="button" onClick={()=>setIsCollapsed(false)} className="p-1 text-app-secondary transition-colors group-hover:text-[color:var(--color-text)]" aria-label={t("stats.showAria")}><ChevronDown className="h-4 w-4" strokeWidth={2}/></button>
    </div>}
    <div className={`overflow-hidden transition-all ${isCollapsed?"duration-700 max-h-0 opacity-0 scale-95":"duration-1000 max-h-[400px] opacity-100 scale-100"}`}>
      <div className="flex items-start justify-between gap-p10 h-auto">
        <div className="grid flex-1 grid-cols-1 gap-p10 md:grid-cols-3">
          <StatCard title={t("stats.total")} value={available?totalClients.toString():"—"} isHidden={hidden.totalClients} onToggleHidden={()=>toggleHidden("totalClients")} showLabel={t("stats.showValue")} hideLabel={t("stats.hideValue")}/>
          <StatCard title={t("stats.debt")} value={available?clientsWithDebt.toString():"—"} isHidden={hidden.clientsWithDebt} onToggleHidden={()=>toggleHidden("clientsWithDebt")} showLabel={t("stats.showValue")} hideLabel={t("stats.hideValue")}/>
          <StatCard title={t("stats.income")} value={available?formatPaymentMoney(monthlyIncome,currency):"—"} isHidden={hidden.monthlyIncome} onToggleHidden={()=>toggleHidden("monthlyIncome")} showLabel={t("stats.showValue")} hideLabel={t("stats.hideValue")}/>
        </div>
        <button type="button" onClick={()=>setIsCollapsed(true)} className="mt-1 flex h-9 w-9 items-center justify-center rounded-br10 bg-[color:var(--color-accent-primary)] text-[color:var(--color-text-on-primary)] transition-colors hover:bg-[#3f3fbb]" aria-label={t("stats.hideAria")}><ChevronUp className="h-4 w-4" strokeWidth={2}/></button>
      </div>
    </div>
  </div>
}

function StatCard({title,value,isHidden,onToggleHidden,showLabel,hideLabel}:{title:string;value:string;isHidden:boolean;onToggleHidden:()=>void;showLabel:string;hideLabel:string}){
  const displayValue=isHidden?"***":value,Icon=isHidden?Eye:EyeOff;
  return <div className="flex flex-col justify-between rounded-br25 border border-n2 bg-bg0 px-p30 py-p20">
    <div className="flex items-start justify-between gap-p10">
      <div className="fs-12 text-app-secondary">{title}</div>
      <button type="button" onClick={onToggleHidden} className="p-1 text-app-secondary transition-colors hover:text-app" aria-label={isHidden?showLabel:hideLabel}><Icon className="h-4 w-4" strokeWidth={2}/></button>
    </div>
    <div className="mt-4 fs-48 leading-none text-app">{displayValue}</div>
  </div>
}
