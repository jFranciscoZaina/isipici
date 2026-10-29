"use client"
import InlineLoader from "./InlineLoader"
import {useMemo,useState} from "react"
import type {ClientRow} from "../page"
import type {ClientStatus} from "./SearchBarAndTabs"
import {formatDateByLocale} from "@/lib/utils"
import {fromCalendarDate} from "@/lib/payments/schedule"
import {formatPaymentMoney} from "@/lib/payments/format"
import {Check,Minus,X} from "react-feather"
import {ClientContextMenu,type ClientMenuAction} from "./ClientContextMenu"
import React from "react"
import {useI18n} from "../../I18nProvider"

type Props={clients:ClientRow[];status:ClientStatus;loading:boolean;error:string|null;sortKey:"name"|"plan"|"paid"|"debt"|"due";sortDir:"asc"|"desc";onToggleSort:(key:"name"|"plan"|"paid"|"debt"|"due")=>void;onOpenDetail:(client:ClientRow)=>void;onMenuAction?:(action:ClientMenuAction,client:ClientRow)=>void}

export default function ClientsTable({clients,status,loading,error,sortKey,sortDir,onToggleSort,onOpenDetail,onMenuAction}:Props){
 const {t,locale}=useI18n()
 const [colWidths,setColWidths]=useState<number[]>([80,260,160,140,160,120])
 const [menuClient,setMenuClient]=useState<ClientRow|null>(null),[menuPosition,setMenuPosition]=useState<{top:number;left:number}|null>(null)
 const openMenu=(client:ClientRow,e:React.MouseEvent<HTMLButtonElement|HTMLTableRowElement>)=>{const rect=e.currentTarget.getBoundingClientRect();setMenuClient(client);setMenuPosition({top:rect.bottom+8,left:rect.left})}
 const closeMenu=()=>{setMenuClient(null);setMenuPosition(null)}
 const handleMenuAction=(action:ClientMenuAction,client:ClientRow)=>onMenuAction?onMenuAction(action,client):onOpenDetail(client)
 const startResize=(index:number,startX:number)=>{const startWidth=colWidths[index];const onMouseMove=(e:MouseEvent)=>{const delta=e.clientX-startX;setColWidths(prev=>{const next=[...prev];next[index]=Math.max(80,startWidth+delta);return next})};const onMouseUp=()=>{window.removeEventListener("mousemove",onMouseMove);window.removeEventListener("mouseup",onMouseUp)};window.addEventListener("mousemove",onMouseMove);window.addEventListener("mouseup",onMouseUp)}
 const handleResizeMouseDown=(index:number)=>(e:React.MouseEvent<HTMLSpanElement>)=>{e.preventDefault();e.stopPropagation();startResize(index,e.clientX)}
 const today=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return d},[])
 const headers:Array<[string,"name"|"plan"|"paid"|"debt"|"due"]>=[[t("table.payment"),"paid"],[t("table.person"),"name"],[t("common.plan"),"plan"],[t("common.debt"),"debt"],[t("table.due"),"due"]]
 return <div className="h-full w-full rounded-br10 md:rounded-br15 bg-bg0 border border-n2 overflow-hidden flex-1 flex flex-col"><div className="hidden h-full max-h-full overflow-y-auto scrollbar-hide md:block"><table className="min-w-full table-auto">
  <thead className="bg-[color:var(--n8)] fs-12 text-[color:var(--n0)] sticky top-0 z-10"><tr>
   {headers.map(([label,key],index)=><th key={key} style={{width:colWidths[index],fontWeight:400}} className={`relative cursor-pointer select-none ${index===0?"pl-p40 pr-p20":"px-p20"} py-p10 text-left`} onClick={()=>onToggleSort(key)}>{label} <span className="fs-12 font-normal">{sortKey===key?(sortDir==="asc"?"↑":"↓"):""}</span><span onMouseDown={handleResizeMouseDown(index)} className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"/></th>)}
   <th style={{width:colWidths[5],fontWeight:400}} className="relative px-p20 py-p10 text-left">{t("common.details")}<span onMouseDown={handleResizeMouseDown(5)} className="absolute inset-y-0 right-0 w-[4px] cursor-col-resize"/></th>
  </tr></thead>
  <tbody className="bg-bg0 fs-12 text-app">
   {loading&&<tr><td colSpan={6} className="px-p20 py-p20 text-center text-app-secondary"><InlineLoader text={t("table.loading")}/></td></tr>}
   {!loading&&error&&<tr><td colSpan={6} className="px-p20 py-p20 text-center text-danger">{error}</td></tr>}
   {!loading&&!error&&clients.map(client=>{const due=fromCalendarDate(client.nextDue)??null;if(due)due.setHours(0,0,0,0);const isOverdue=!!due&&due<today;return <tr key={client.id} className="border-b border-[color:var(--n0)] fs-12 text-app transition hover:border-[color:var(--n2)]" onClick={e=>{if(window.innerWidth<450){e.stopPropagation();openMenu(client,e)}}}>
    <td className="pl-p50 pr-p20 py-p10">{isOverdue?<Minus className="h-4 w-4 stroke-[2.5] text-danger"/>:client.isMonthFullyPaid?<Check className="h-4 w-4 stroke-[2.5] text-app"/>:<X className="h-4 w-4 stroke-[2.5] text-danger"/>}</td>
    <td className="px-p20 py-p10 fs-12 font-bold uppercase">{client.name}</td>
    <td className="px-p20 py-p10 fs-12 font-normal">{client.currentPlan??<span className="text-app-disabled">{t("table.noPlan")}</span>}</td>
    <td className="px-p20 py-p10 fs-12 font-normal">{client.currentDebt>0?formatPaymentMoney(client.currentDebt,client.currency):""}</td>
    <td className="px-p20 py-p10 fs-12 font-normal">{formatDateByLocale(client.nextDue,locale)}</td>
    <td className="px-p20 py-p10 fs-12"><button className="fs-12 text-[color:var(--color-accent-primary)] no-underline hover:underline" onClick={e=>{e.stopPropagation();openMenu(client,e)}}>{t("table.more")}</button></td>
   </tr>})}
  </tbody>
 </table></div>
 <div className="h-full overflow-y-auto px-p10 pb-28 md:hidden">
  {loading&&<div className="py-p20 text-center text-app-secondary"><InlineLoader text={t("table.loading")}/></div>}
  {!loading&&error&&<div className="py-p20 text-center text-danger">{error}</div>}
  {!loading&&!error&&<div className="space-y-p10">{clients.map(client=>{
   const due=fromCalendarDate(client.nextDue)??null;if(due)due.setHours(0,0,0,0);const isOverdue=!!due&&due<today;
   return <article key={client.id} className="flex items-stretch gap-p5 rounded-br10 border border-n1 bg-bg0 p-p10 shadow-sm">
    <button type="button" onClick={()=>onOpenDetail(client)} className="min-w-0 flex-1 rounded-br5 py-p5 text-left focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent-primary)]">
     <div className="flex items-start justify-between gap-p10"><span className="truncate fs-14 font-semibold uppercase text-app">{client.name}</span><span className="shrink-0 rounded-full bg-[color:var(--color-accent-primary-soft)] px-p10 py-p5 fs-12 font-medium text-[color:var(--color-accent-primary)]">{t(`search.${status}`)}</span></div>
     <div className="mt-p5 flex flex-wrap items-center gap-x-p10 gap-y-p5 fs-12 text-app-secondary">
      <span>{client.currentPlan??t("table.noPlan")}</span>
      {client.currentDebt>0?<span className="font-medium text-danger">{t("common.debt")}: {formatPaymentMoney(client.currentDebt,client.currency)}</span>:client.isMonthFullyPaid?<span className="inline-flex items-center gap-p5"><Check className="h-3 w-3 text-[color:var(--status-paid)]"/>{t("detail.paid")}</span>:null}
      {client.nextDue&&<span className={isOverdue?"font-medium text-danger":""}>{t("table.due")}: {formatDateByLocale(client.nextDue,locale)}</span>}
     </div>
    </button>
    <button type="button" onClick={event=>openMenu(client,event)} className="flex min-h-11 min-w-11 items-center justify-center self-center rounded-br10 px-p5 fs-12 font-medium text-[color:var(--color-accent-primary)]" aria-label={`${t("table.more")} ${client.name}`}>{t("table.more")}</button>
   </article>
  })}</div>}
 </div>
 <ClientContextMenu client={menuClient} position={menuPosition} onClose={closeMenu} onAction={handleMenuAction}/></div>
}
