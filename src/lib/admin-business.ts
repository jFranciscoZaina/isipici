import "server-only"
import bcrypt from "bcryptjs"
import {requireAdmin} from "@/lib/admin-auth"
import {supabase} from "@/lib/supabaseClient"
import {businessEmail,businessTimezone,legacyPassword,businessText} from "./business-validation"
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function updateBusinessContact(id:unknown,email:unknown,timezone:unknown,country:unknown=undefined,businessType:unknown=undefined,name:unknown=undefined){
 await requireAdmin()
 if(typeof id!=="string"||!idPattern.test(id))return "Negocio inválido"
 const payload:Record<string,unknown>={}
 let contact:string,zone:string|null
 try{contact=businessEmail(email);zone=businessTimezone(timezone);if(country!==undefined)payload.country=businessText(country);if(businessType!==undefined)payload.business_type=businessText(businessType,200);if(name!==undefined){const label=businessText(name,200);if(!label)throw new Error("Indicá el nombre del negocio");payload.name=label}}catch(error){return error&&typeof error==="object"&&"message" in error&&typeof error.message==="string"&&error.message?error.message:"Información del negocio inválida"}
 const {data,error}=await supabase.from("owners").update({...payload,contact_email:contact,timezone:zone}).eq("id",id).select("id").maybeSingle()
 return error||!data?"No se pudo actualizar el negocio":null
}
export async function updateLegacyAccess(id:unknown,enabled:boolean,email:unknown,password:unknown){
 await requireAdmin()
 if(typeof id!=="string"||!idPattern.test(id))return "Negocio inválido"
 const payload:Record<string,unknown>={legacy_login_enabled:enabled}
 if(enabled){
  let login:string,secret:string|null=null
  try{login=businessEmail(email);if(password!=null&&password!=="")secret=legacyPassword(password)}catch{return "Email de login o contraseña inválidos"}
  if(!secret){const row=await supabase.from("owners").select("password_hash").eq("id",id).maybeSingle();if(row.error||!row.data||typeof row.data.password_hash!=="string"||!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(row.data.password_hash))return "Indicá una contraseña inicial para habilitar el acceso"}
  const duplicate=await supabase.from("owners").select("id").ilike("email",login.replace(/[\\%_]/g,"\\$&")).neq("id",id).maybeSingle()
  if(duplicate.error)return "No se pudo actualizar el acceso"
  if(duplicate.data)return "Ya existe un acceso con ese email"
  payload.email=login;if(secret)payload.password_hash=await bcrypt.hash(secret,12)
 }
 const {data,error}=await supabase.from("owners").update(payload).eq("id",id).select("id").maybeSingle()
 return error||!data?"No se pudo actualizar el acceso":null
}
