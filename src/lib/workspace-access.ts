import "server-only"
import {withAuditActor} from "@/lib/audit-context"
import {randomBytes,createHash} from "node:crypto"
import {supabase} from "@/lib/supabaseClient"
export type InviteActor={kind:"admin";userId?:never}|{kind:"owner";userId:string}
export class WorkspaceError extends Error{constructor(message:string,public status=409){super(message)}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function workspaceId(value:unknown){if(typeof value!=="string"||!uuid.test(value))throw new WorkspaceError("Datos inválidos",400);return value}
function actorInput(actor:InviteActor){if(actor.kind!=="admin"&&actor.kind!=="owner")throw new WorkspaceError("Contexto inválido",400);if(actor.kind==="admin")return {p_actor_kind:"admin",p_actor_user:null};return {p_actor_kind:"owner",p_actor_user:workspaceId(actor.userId)}}
export function inviteHash(code:string){return createHash("sha256").update(code).digest("hex")}
export async function createWorkspaceInvite(actor:InviteActor,ownerId:unknown,options:{days?:unknown;maxUses?:unknown}={}){
 const days=options.days??7,maxUses=options.maxUses??1
 if(!Number.isInteger(days)||Number(days)<1||Number(days)>30||!Number.isInteger(maxUses)||Number(maxUses)<1||Number(maxUses)>100)throw new WorkspaceError("Configuración de invitación inválida",400)
 const code=randomBytes(32).toString("base64url"),expires=new Date(Date.now()+Number(days)*86400000).toISOString()
 const {data,error}=await supabase.rpc("workspace_create_invite",{p_owner:workspaceId(ownerId),p_hash:inviteHash(code),p_expires:expires,p_max_uses:maxUses,...actorInput(actor)})
 if(error||!data)throw new WorkspaceError("No se pudo crear la invitación")
 return {...data,code}
}
export async function listWorkspaceAccess(ownerId:unknown){const {data,error}=await supabase.rpc("workspace_access_summary",{p_owner:workspaceId(ownerId)});if(error||!data)throw new WorkspaceError("No se pudo cargar el acceso");return data as {maxOwners:number;memberships:{id:string;userId:string;email:string|null;displayName:string|null;role:string}[];invites:{id:string;expires_at:string;max_uses:number;used_count:number}[]}}
export async function revokeWorkspaceInvite(actor:InviteActor,ownerId:unknown,inviteId:unknown){const {error}=await supabase.rpc("workspace_revoke_invite",{p_owner:workspaceId(ownerId),p_invite:workspaceId(inviteId),...actorInput(actor)});if(error)throw new WorkspaceError("No se pudo revocar la invitación")}
export async function revokeOwnerMembership(ownerId:unknown,membershipId:unknown){const {error}=await supabase.rpc("workspace_revoke_membership",{p_owner:workspaceId(ownerId),p_membership:workspaceId(membershipId)});if(error)throw new WorkspaceError("No se pudo retirar el acceso")}
export async function setWorkspaceOwnerLimit(ownerId:unknown,limit:unknown){if(!Number.isInteger(limit)||Number(limit)<0||Number(limit)>1000)throw new WorkspaceError("Límite inválido",400);const {error}=await supabase.rpc("workspace_set_owner_limit",{p_owner:workspaceId(ownerId),p_limit:limit});if(error)throw new WorkspaceError("No se puede reducir el límite por debajo del uso actual")}
export async function redeemWorkspaceInvite(user:{id:string;email?:string;last_sign_in_at?:string;user_metadata?:Record<string,unknown>},code:unknown){
 if(typeof code!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(code))throw new WorkspaceError("Invitación no disponible")
 const display=user.user_metadata?.display_name??user.user_metadata?.full_name
 const {data,error}=await withAuditActor({kind:"user",userId:user.id},()=>supabase.rpc("workspace_redeem_invite",{p_hash:inviteHash(code),p_user:workspaceId(user.id),p_email:user.email??null,p_last_login:user.last_sign_in_at&&Number.isFinite(Date.parse(user.last_sign_in_at))?user.last_sign_in_at:null,p_display:typeof display==="string"?display.slice(0,200):null}))
 if(error||!data)throw new WorkspaceError("Invitación no disponible")
 return data as {membershipId:string;ownerId:string;duplicate:boolean}
}
