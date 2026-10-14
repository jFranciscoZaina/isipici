import {NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {redeemWorkspaceInvite} from "@/lib/workspace-access"
import {verifiedModernUser,sameOrigin,hasDualSession} from "@/lib/supabase-auth"
import {listUserWorkspaces,selectWorkspace} from "@/lib/modern-workspaces"
export const runtime="nodejs"
export async function POST(req:NextRequest){
  const headers={"Cache-Control":"no-store"},token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1]
  if(!sameOrigin(req)||hasDualSession(req.cookies)||(token&&req.cookies.get("session")?.value))return NextResponse.json({error:"No autorizado"},{status:401,headers})
  let user
  try{
    if(token){const result=await supabase.auth.getUser(token);user=result.error?null:result.data.user}
    else user=await verifiedModernUser(req)
  }catch{user=null}
  if(!user)return NextResponse.json({error:"No autorizado"},{status:401,headers})
  try{
    const b=await req.json()
    if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>k!=="code"))throw new Error("Invalid invite")
    const result=await redeemWorkspaceInvite(user,b.code),response=NextResponse.json(result,{headers})
    if(!token){
      const workspace=(await listUserWorkspaces(user.id)).find(w=>w.ownerId===result.ownerId&&w.membershipId===result.membershipId)
      if(!workspace)throw new Error("Workspace unavailable")
      selectWorkspace(response,user.id,workspace)
    }
    return response
  }catch{return NextResponse.json({error:"Código inválido, vencido o sin accesos disponibles."},{status:409,headers})}
}
