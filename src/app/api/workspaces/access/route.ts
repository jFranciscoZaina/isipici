import {NextRequest,NextResponse} from "next/server"
import {getAccessContext} from "@/lib/auth"
import {withRequestAudit} from "@/lib/audit-request"
import {sameOrigin} from "@/lib/supabase-auth"
import {WorkspaceError,createWorkspaceInvite,listWorkspaceAccess,revokeWorkspaceInvite,revokeOwnerMembership} from "@/lib/workspace-access"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}

async function modernContext(req:NextRequest){
 const context=await getAccessContext(req)
 return context?.authKind==="user"?context:null
}

export async function GET(req:NextRequest){
 const context=await modernContext(req)
 if(!context)return NextResponse.json({error:"Acceso moderno requerido"},{status:403,headers})
 try{
  const data=await listWorkspaceAccess(context.ownerId)
  return NextResponse.json({...data,currentUserId:context.userId},{headers})
 }catch{
  return NextResponse.json({error:"No se pudieron cargar los accesos"},{status:409,headers})
 }
}

async function performPOST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403,headers})
 const context=await modernContext(req)
 if(!context)return NextResponse.json({error:"Acceso moderno requerido"},{status:403,headers})
 try{
  const body=await req.json()
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(key=>!["action","id"].includes(key)))throw new WorkspaceError("Datos inválidos",400)
  const access=await listWorkspaceAccess(context.ownerId)

  if(body.action==="createInvite"){
   if(access.memberships.length>=access.maxOwners)throw new WorkspaceError("No hay lugares disponibles. Contactá a ISIPICI para ampliar el límite.",409)
   return NextResponse.json(await createWorkspaceInvite({kind:"owner",userId:context.userId},context.ownerId),{headers})
  }

  if(body.action==="revokeInvite"){
   await revokeWorkspaceInvite({kind:"owner",userId:context.userId},context.ownerId,body.id)
   return NextResponse.json({ok:true},{headers})
  }

  if(body.action==="revokeMembership"){
   const target=access.memberships.find(m=>m.id===body.id)
   if(!target)throw new WorkspaceError("Acceso no disponible",404)
   if(target.userId===context.userId)throw new WorkspaceError("No podés desvincular tu propia cuenta desde este espacio.",409)
   await revokeOwnerMembership(context.ownerId,body.id)
   return NextResponse.json({ok:true},{headers})
  }

  throw new WorkspaceError("Acción inválida",400)
 }catch(error){
  return NextResponse.json({error:error instanceof WorkspaceError?error.message:"No se pudo actualizar el acceso"},{status:error instanceof WorkspaceError?error.status:400,headers})
 }
}

export async function POST(req:NextRequest){
 return withRequestAudit(req,()=>performPOST(req))
}
