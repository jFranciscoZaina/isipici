import "server-only"
import {createHmac,randomInt} from "node:crypto"
import {supabase} from "@/lib/supabaseClient"
import {getResend} from "@/lib/emails/provider"
import {businessEmail,businessText,businessTimezone} from "@/lib/business-validation"
import {withAuditActor} from "@/lib/audit-context"

type ModernUser={id:string;email?:string|null;last_sign_in_at?:string;user_metadata?:Record<string,unknown>}
export type WorkspaceBusinessInput={
 name:string
 contactEmail:string
 currency:"ARS"|"AUD"
 timezone:string|null
 country:string|null
 businessType:string|null
}
type CreateResult={ownerId:string;membershipId:string;name:string}

export class WorkspaceOnboardingError extends Error{
 constructor(message:string,public status=409){super(message)}
}

function verificationSecret(){
 const secret=process.env.JWT_SECRET
 if(!secret||secret.length<32)throw new WorkspaceOnboardingError("La verificación de email no está disponible.",503)
 return secret
}

function verificationHash(userId:string,email:string,code:string){
 return createHmac("sha256",verificationSecret()).update(userId+"|"+email+"|"+code).digest("hex")
}

export function parseWorkspaceBusiness(input:unknown):WorkspaceBusinessInput{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new WorkspaceOnboardingError("Completá los datos del negocio.",400)
 const body=input as Record<string,unknown>
 if(typeof body.name!=="string"||!body.name.trim()||body.name.trim().length>200)throw new WorkspaceOnboardingError("Indicá el nombre del negocio.",400)
 const contactEmail=businessEmail(body.contactEmail)
 if(body.currency!=="ARS"&&body.currency!=="AUD")throw new WorkspaceOnboardingError("Seleccioná una moneda.",400)
 return {
  name:body.name.trim(),
  contactEmail,
  currency:body.currency,
  timezone:businessTimezone(body.timezone),
  country:businessText(body.country),
  businessType:businessText(body.businessType,200),
 }
}

export function needsContactVerification(user:ModernUser,contactEmail:string){
 const googleEmail=typeof user.email==="string"?user.email.trim().toLowerCase():null
 return !googleEmail||googleEmail!==contactEmail
}

export async function sendWorkspaceVerification(user:ModernUser,contactEmail:unknown){
 if(typeof user.id!=="string")throw new WorkspaceOnboardingError("Usuario no disponible.",401)
 const email=businessEmail(contactEmail)
 if(!needsContactVerification(user,email))return {verificationRequired:false as const}

 const from=process.env.EMAIL_FROM
 if(!from||!process.env.RESEND_API_KEY)throw new WorkspaceOnboardingError("El envío de códigos no está configurado.",503)

 const code=String(randomInt(100000,1000000))
 const hash=verificationHash(user.id,email,code)
 const expiresAt=new Date(Date.now()+10*60*1000).toISOString()
 const {data,error}=await supabase.rpc("workspace_begin_self_service_verification",{p_user:user.id,p_email:email,p_hash:hash,p_expires:expiresAt})
 if(error)throw new WorkspaceOnboardingError("No se pudo iniciar la verificación.",503)
 const result=data as {ok?:boolean;reason?:string}|null
 if(!result?.ok){
  if(result?.reason==="already_joined")throw new WorkspaceOnboardingError("Tu cuenta ya está vinculada a un negocio.",409)
  if(result?.reason==="cooldown")throw new WorkspaceOnboardingError("Esperá un minuto antes de reenviar el código.",429)
  if(result?.reason==="rate_limited")throw new WorkspaceOnboardingError("Alcanzaste el límite de envíos. Intentá nuevamente más tarde.",429)
  throw new WorkspaceOnboardingError("No se pudo iniciar la verificación.",400)
 }

 try{
  const sent=await getResend().emails.send({
   from,
   to:email,
   subject:"Código para crear tu espacio en ISIPICI",
   html:`<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="margin:0 0 12px">Confirmá el email de tu negocio</h2><p style="margin:0 0 20px">Usá este código para terminar de crear tu espacio en ISIPICI.</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:20px 0">${code}</div><p style="margin:0;color:#666">El código vence en 10 minutos. Si no solicitaste esto, podés ignorar este email.</p></div>`
  },{idempotencyKey:`isipici/workspace-verification/${user.id}/${hash.slice(0,20)}`})
  if(sent.error||!sent.data?.id)throw new Error("provider")
 }catch{
  await supabase.from("workspace_creation_requests").delete().eq("user_id",user.id).eq("code_hash",hash).catch(()=>{})
  throw new WorkspaceOnboardingError("No pudimos enviar el código. Intentá nuevamente.",503)
 }
 return {verificationRequired:true as const,email}
}

export async function createSelfServiceWorkspace(user:ModernUser,input:unknown,code?:unknown):Promise<CreateResult>{
 const business=parseWorkspaceBusiness(input)
 const verificationRequired=needsContactVerification(user,business.contactEmail)
 let codeHash:string|null=null
 if(verificationRequired){
  if(typeof code!=="string"||!/^[0-9]{6}$/.test(code.trim()))throw new WorkspaceOnboardingError("Ingresá el código de 6 dígitos.",400)
  codeHash=verificationHash(user.id,business.contactEmail,code.trim())
 }

 const {data,error}=await withAuditActor({kind:"system"},()=>supabase.rpc("workspace_create_self_service",{
  p_user:user.id,
  p_name:business.name,
  p_contact_email:business.contactEmail,
  p_currency:business.currency,
  p_timezone:business.timezone,
  p_country:business.country,
  p_business_type:business.businessType,
  p_code_hash:codeHash
 }))
 if(error)throw new WorkspaceOnboardingError("No se pudo crear el negocio.",503)
 const result=data as {ok?:boolean;reason?:string;attemptsLeft?:number;ownerId?:string;membershipId?:string;name?:string}|null
 if(!result?.ok){
  if(result?.reason==="already_joined")throw new WorkspaceOnboardingError("Tu cuenta ya está vinculada a un negocio.",409)
  if(result?.reason==="invalid_code")throw new WorkspaceOnboardingError(`El código no es correcto.${typeof result.attemptsLeft==="number"?` Te quedan ${result.attemptsLeft} intentos.`:""}`,409)
  if(result?.reason==="expired_code")throw new WorkspaceOnboardingError("El código venció. Pedí uno nuevo.",409)
  if(result?.reason==="attempts_exhausted")throw new WorkspaceOnboardingError("Superaste los intentos permitidos. Pedí un código nuevo.",409)
  if(result?.reason==="verification_required")throw new WorkspaceOnboardingError("Primero verificá el email de contacto.",409)
  throw new WorkspaceOnboardingError("Revisá los datos del negocio e intentá nuevamente.",400)
 }
 if(!result.ownerId||!result.membershipId||!result.name)throw new WorkspaceOnboardingError("No se pudo crear el negocio.",503)
 return {ownerId:result.ownerId,membershipId:result.membershipId,name:result.name}
}
