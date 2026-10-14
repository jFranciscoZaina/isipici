import {withAuditActor} from "@/lib/audit-context"
import {NextRequest,NextResponse} from "next/server"
import {requireAdmin} from "@/lib/admin-auth"
import {WorkspaceError,createWorkspaceInvite,listWorkspaceAccess,revokeWorkspaceInvite,revokeOwnerMembership,setWorkspaceOwnerLimit} from "@/lib/workspace-access"
export const runtime="nodejs"
const headers={"Cache-Control":"no-store"}
type Context={params:Promise<{id:string}>}
export async function GET(_req:NextRequest,ctx:Context){
 try{await requireAdmin()}catch{return NextResponse.json({error:"No autorizado"},{status:401,headers})}
 try{return NextResponse.json(await listWorkspaceAccess((await ctx.params).id),{headers})}catch{return NextResponse.json({error:"No se pudo cargar el acceso"},{status:409,headers})}
}
async function performPOST(req:NextRequest,ctx:Context){
 try{await requireAdmin()}catch{return NextResponse.json({error:"No autorizado"},{status:401,headers})}
 try{
  const b=await req.json(),owner=(await ctx.params).id
  if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["action","days","maxUses","id","limit"].includes(k)))throw new WorkspaceError("Datos inválidos",400)
  let result:unknown={ok:true}
  if(b.action==="createInvite")result=await createWorkspaceInvite({kind:"admin"},owner,{days:b.days,maxUses:b.maxUses})
  else if(b.action==="revokeInvite")await revokeWorkspaceInvite({kind:"admin"},owner,b.id)
  else if(b.action==="revokeMembership")await revokeOwnerMembership(owner,b.id)
  else if(b.action==="setLimit")await setWorkspaceOwnerLimit(owner,b.limit)
  else throw new WorkspaceError("Acción inválida",400)
  return NextResponse.json(result,{headers})
 }catch(error){return NextResponse.json({error:error instanceof WorkspaceError?error.message:"No se pudo actualizar el acceso"},{status:error instanceof WorkspaceError?error.status:400,headers})}
}

export async function POST(req:NextRequest,ctx:Context){return withAuditActor({kind:"admin"},()=>performPOST(req,ctx))}
