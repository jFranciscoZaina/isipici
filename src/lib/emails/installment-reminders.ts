import "server-only"
import { supabase } from "@/lib/supabaseClient"
import { sendUpcomingDueEmail } from "./service"
import { ownedClientColumn } from "@/lib/auth"
export async function legacyReminderEligible(ownerId:string,clientId:string) {
 const {data,error}=await supabase.from("recurring_agreements").select("status,installments_enabled").eq("owner_id",ownerId).eq("client_id",clientId)
 if(error)throw new Error("No se pudo consultar la suscripción")
 return !data?.length || data.some(a=>a.status==="active"&&!a.installments_enabled)
}
export async function sendInstallmentReminders(target:string) {
 const results:{clientId:string;status:string;providerEmailId:string|null}[]=[]
 // Request-local reuse: no persistent cache of ownership or account activation.
 const owners=new Map<string,{id:string;name:string|null;default_currency:string}|null>()
 const refreshedClients=new Set<string>()
 for(let offset=0;;offset+=100){
  const {data:agreements,error}=await supabase.from("recurring_agreements").select("id,owner_id,client_id,status").eq("installments_enabled",true).order("id").range(offset,offset+99)
  if(error)throw new Error("No se pudo consultar la agenda")
  for(const a of agreements??[]){
   const column=await ownedClientColumn(a.client_id,a.owner_id);if(!column)throw new Error("Cliente fuera de su cuenta")
   if(!owners.has(a.owner_id)) {
    const {data:owner,error:ownerError}=await supabase.from("owners").select("id,name,default_currency").eq("id",a.owner_id).eq("is_active",true).maybeSingle()
    if(ownerError)throw new Error("Cuenta no disponible")
    owners.set(a.owner_id,owner)
   }
   const owner=owners.get(a.owner_id);if(!owner)continue
   const {data:client,error:clientError}=await supabase.from("clients").select("id,name,email,archived_at").eq("id",a.client_id).eq(column,a.owner_id).single()
   if(clientError)throw new Error("Cliente no disponible")
   const clientKey=a.owner_id+":"+a.client_id
   if(client.archived_at||a.status!=="active") {
    if(!refreshedClients.has(clientKey)) {
     const {error:snapshotError}=await supabase.rpc("refresh_installment_snapshot",{p_owner:a.owner_id,p_client:a.client_id})
     if(snapshotError)throw new Error("No se pudo actualizar la deuda")
     refreshedClients.add(clientKey)
    }
    continue
   }
   // Agenda generation also refreshes the snapshot, so do not run both RPCs.
   const {error:ensureError}=await supabase.rpc("ensure_recurring_installments_through",{p_owner:a.owner_id,p_client:a.client_id,p_through:target})
   if(ensureError)throw new Error("No se pudo generar la agenda")
   refreshedClients.add(clientKey)
   const {data:installments,error:installmentError}=await supabase.from("recurring_installments").select("id,amount_due,currency,payments(amount,discount)").eq("owner_id",a.owner_id).eq("client_id",a.client_id).eq("recurring_agreement_id",a.id).eq("status","open").eq("due_date",target).eq("payments.owner_id",a.owner_id)
   if(installmentError)throw new Error("Cuotas no disponibles");if(!client.email)continue
   for(const i of installments??[]){
    const {data:coverage,error:coverageError}=await supabase.rpc("installment_coverage",{p_id:i.id})
    if(coverageError&&coverageError.code!=="PGRST202"&&coverageError.code!=="42883")throw new Error("Saldo no disponible")
    const remaining=coverageError?Math.max(Number(i.amount_due)-(i.payments as {amount:number;discount:number}[]??[]).reduce((sum,p)=>sum+Number(p.amount)+Number(p.discount),0),0):Math.max(Number(i.amount_due)-Number(coverage),0)
    if(remaining<=0)continue
    const {data:current,error:stateError}=await supabase.from("recurring_agreements").select("status").eq("id",a.id).eq("owner_id",a.owner_id).eq("client_id",a.client_id).single()
    if(stateError)throw new Error("Estado no disponible");if(current.status!=="active")continue
    const result=await sendUpcomingDueEmail({ownerId:a.owner_id,clientId:a.client_id,to:client.email,clientName:client.name,ownerName:owner.name??"Tu negocio",dueDate:target,remainingDebt:remaining,currency:i.currency,deduplicationKey:`installment-upcoming:${a.owner_id}:${i.id}:${target}`})
    results.push({clientId:a.client_id,status:result.status,providerEmailId:result.providerEmailId})
   }
  }
  if(!agreements||agreements.length<100)break
 }
 return results
}
