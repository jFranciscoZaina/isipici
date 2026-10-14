import "server-only"
import {AsyncLocalStorage} from "node:async_hooks"
import type {SupabaseClient} from "@supabase/supabase-js"
export type AuditActor={kind:"admin"|"system";userId?:never;ownerId?:never}|{kind:"legacy";ownerId:string;userId?:never}|{kind:"user";userId:string;ownerId?:string}
type Scope={actor:AuditActor;client?:SupabaseClient;request?:object;ownerId?:string}
const storage=new AsyncLocalStorage<Scope>()
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function withAuditActor<T>(actor:AuditActor,operation:()=>T,request?:object):T{
 if(!["admin","system","legacy","user"].includes(actor.kind)||(actor.kind==="user"&&!uuid.test(actor.userId))||(actor.kind==="legacy"&&!uuid.test(actor.ownerId))||(actor.ownerId!==undefined&&!uuid.test(actor.ownerId)))throw new Error("Contexto de auditoría inválido")
 return storage.run({actor,request,ownerId:actor.ownerId},operation)
}
export function currentAuditScope(){return storage.getStore()}
export function auditHeaders(actor:AuditActor):Record<string,string>{
 return {"x-isipici-actor-kind":actor.kind,...(actor.kind==="user"?{"x-isipici-actor-user":actor.userId}:{}),...(actor.ownerId?{"x-isipici-actor-owner":actor.ownerId}:{})}
}
