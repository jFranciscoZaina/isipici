import type {Currency} from "./types"
import type {RecurringFrequency} from "./schedule"
export type PlanPrice={id:string;plan_id:string;amount:number;currency:Currency;effective_from:string}
export type PlanSummary={id:string;name:string;frequency:RecurringFrequency;archived_at:string|null;prices:PlanPrice[];subscriptions:number;used?:boolean}
export type SubscriptionChange={id:string;recurring_agreement_id:string;new_plan_name:string|null;new_amount:number;currency:Currency;new_frequency:RecurringFrequency;effective_from:string;starts_on:string;status:"scheduled"|"applied"|"cancelled";target_plan_id:string|null}
export function priceForDate(plan:PlanSummary|undefined,date:string){return plan?.prices.filter(p=>p.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0]}
