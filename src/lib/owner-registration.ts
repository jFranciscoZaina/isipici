import "server-only"
import bcrypt from "bcryptjs"
import {supabase} from "@/lib/supabaseClient"
import {businessEmail,businessTimezone,businessText,legacyPassword} from "./business-validation"
type OwnerResult={data:{id:string;name:string;email:string|null;contact_email:string;legacy_login_enabled:boolean}}|{error:string;status:number}
export async function createOwner(input:unknown,configuration:{defaultCurrency:"ARS"|"AUD"}={defaultCurrency:"ARS"}):Promise<OwnerResult>{
 if(!["ARS","AUD"].includes(configuration.defaultCurrency))return {error:"Moneda inválida",status:400}
 if(!input||typeof input!=="object"||Array.isArray(input))return {error:"Datos de negocio inválidos",status:400}
 const b=input as Record<string,unknown>
 let name:string,contact:string,email:string|null=null,password:string|null=null,timezone:string|null,country:string|null,businessType:string|null,enabled:boolean
 try{
  if(typeof b.name!=="string"||!b.name.trim()||b.name.length>200)throw new Error("Indicá el nombre del negocio")
  name=b.name.trim()
  if(b.legacyLoginEnabled!=null&&typeof b.legacyLoginEnabled!=="boolean")throw new Error("Acceso clásico inválido")
  enabled=b.legacyLoginEnabled!==false
  // Compatibility for existing public registration: its explicit login email also supplies contact.
  contact=businessEmail(b.contactEmail??(enabled?b.email:undefined))
  if(enabled){email=businessEmail(b.email);password=legacyPassword(b.password)}
  timezone=businessTimezone(b.timezone);country=businessText(b.country);businessType=businessText(b.businessType,200)
 }catch(error){return {error:error instanceof Error?error.message:"Datos inválidos",status:400}}
 if(email){const existing=await supabase.from("owners").select("id").ilike("email",email.replace(/[\\%_]/g,"\\$&")).maybeSingle();if(existing.error)return {error:"No se pudo crear el negocio",status:500};if(existing.data)return {error:"Ya existe un acceso con ese email",status:409}}
 const {data,error}=await supabase.from("owners").insert({name,contact_email:contact,email,password_hash:password?await bcrypt.hash(password,12):null,legacy_login_enabled:enabled,default_currency:configuration.defaultCurrency,timezone,country,business_type:businessType}).select("id, name, email, contact_email, legacy_login_enabled").single()
 if(error||!data)return {error:error?.code==="23505"?"Ya existe un acceso con ese email":"No se pudo crear el negocio",status:error?.code==="23505"?409:500}
 return {data}
}
