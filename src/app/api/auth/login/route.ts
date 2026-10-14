import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {withAuditActor} from "@/lib/audit-context"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import {clearModernCookies,sameOrigin} from "@/lib/supabase-auth"
export const runtime="nodejs"
const duration=604800
const fields="id, name, email, password_hash, is_active, legacy_login_enabled, legacy_session_version"
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403})
 const secret=process.env.JWT_SECRET
 if(!secret)return NextResponse.json({error:"Login no disponible"},{status:503})
 try{
  const {email,password}=await req.json()
  if(typeof email!=="string"||!email.trim()||email.length>254||typeof password!=="string"||!password||password.length>256)return NextResponse.json({error:"Indicá email y contraseña"},{status:400})
  const login=email.trim()
  let {data,error}=await supabase.from("owners").select(fields).eq("email",login).eq("legacy_login_enabled",true).eq("is_active",true).single()
  if(!data)({data,error}=await supabase.from("owners").select(fields).ilike("email",login.toLowerCase().replace(/[\\%_]/g,"\\$&")).eq("legacy_login_enabled",true).eq("is_active",true).single())
  if(error||!data||data.is_active!==true||data.legacy_login_enabled!==true||typeof data.password_hash!=="string"||!Number.isSafeInteger(Number(data.legacy_session_version))||!await bcrypt.compare(password,data.password_hash))return NextResponse.json({error:"Credenciales inválidas"},{status:401})
  // Login telemetry must not block authentication during a rolling M21 migration.
  try{await withAuditActor({kind:"legacy",ownerId:data.id},()=>supabase.rpc("record_legacy_login",{p_owner:data.id}))}catch{/* No credentials or database errors are logged. */}
  const token=jwt.sign({authKind:"legacy",ownerId:data.id,email:data.email,legacyVersion:Number(data.legacy_session_version)},secret,{expiresIn:duration,algorithm:"HS256"})
  const response=NextResponse.json({id:data.id,name:data.name,email:data.email},{status:200})
  clearModernCookies(req,response)
  response.headers.set("Cache-Control","private, no-store")
  response.cookies.set("session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:duration})
  return response
 }catch{return NextResponse.json({error:"No se pudo iniciar sesión"},{status:500})}
}
