import {addCalendarDays,toCalendarDate} from "./schedule"
import type {RecurringInstallment} from "./types"
export type CalendarStatus="paid"|"debt"|"partial"|"upcoming"|"payment_debt"
export type CalendarPeriod={id:string;from:string;to:string;dueDate:string;status:CalendarStatus;selectable:boolean}
export function calendarWindow(base=new Date()){return {from:toCalendarDate(new Date(base.getFullYear(),base.getMonth(),1)),to:toCalendarDate(new Date(base.getFullYear(),base.getMonth()+2,0))}}
export function installmentPeriods(rows:RecurringInstallment[],archived=false,today=new Date().toISOString().slice(0,10)):CalendarPeriod[]{return rows.filter(i=>i.status!=="cancelled"&&i.status!=="waived").map(i=>({id:i.id,from:i.period_from,to:i.period_to,dueDate:i.due_date,status:i.remaining===0?"paid":i.partially_paid?"partial":i.due_date<today?"debt":"upcoming",selectable:i.status==="open"&&i.remaining>0&&(!archived||i.due_date<=today)}))}
// Selection is a prefix within one agreement. Remove a quota => remove all later ones.
export function toggleInstallment(rows:RecurringInstallment[],selected:string[],id:string){const item=rows.find(i=>i.id===id);if(!item)return selected;const pending=rows.filter(i=>i.recurring_agreement_id===item.recurring_agreement_id&&i.status==="open"&&i.remaining>0).sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.id.localeCompare(b.id));return pending.filter(i=>selected.includes(id)?i.due_date<item.due_date:i.due_date<=item.due_date).map(i=>i.id)}
export function periodMarkers(periods:CalendarPeriod[]){const markers:Record<string,CalendarStatus>={};for(const p of periods){let d=p.from;let n=0;while(d<=p.to&&n++<370){markers[d]=p.status;d=addCalendarDays(d,1)}}return markers}

// Existing payment history is independent of subscription obligations.
export type CalendarPayment = {payment_type?:string|null;recurring_agreement_id?:string|null;recurring_installment_id?:string|null;period_from?:string|null;period_to?:string|null;service_date?:string|null;created_at?:string;debt?:number|string|null}
export function paymentHistoryMarkers(rows:CalendarPayment[],window:{from:string;to:string}) {
 const result:Record<string,CalendarStatus>={};
 for(const row of rows){
  if(row.recurring_installment_id||row.recurring_agreement_id||row.payment_type==='recurring')continue;
  const from=row.period_from??row.service_date??row.created_at?.slice(0,10);
  const to=row.period_to??from;
  if(!from||!to||to<window.from||from>window.to)continue;
  let date=from<window.from?window.from:from;let count=0;
  while(date<=to&&date<=window.to&&count++<70){
   if(Number(row.debt??0)>0)result[date]='payment_debt';
   else if(result[date]!=='payment_debt')result[date]='paid';
   date=addCalendarDays(date,1);
  }
 }
 return result;
}
