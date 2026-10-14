import {NextRequest,NextResponse} from "next/server"
import {verifiedModernUser,sameOrigin} from "@/lib/supabase-auth"
import {listUserWorkspaces,selectWorkspace} from "@/lib/modern-workspaces"
const headers={"Cache-Control":"private, no-store"}
export async function GET(req:NextRequest){
  const user=await verifiedModernUser(req)
  if(!user)return NextResponse.json({error:"No autorizado"},{status:401,headers})
  try{return NextResponse.json({workspaces:await listUserWorkspaces(user.id)},{headers})}catch{return NextResponse.json({error:"No se pudieron cargar los espacios"},{status:503,headers})}
}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return NextResponse.json({error:"Solicitud inválida"},{status:403,headers})
  const user=await verifiedModernUser(req)
  if(!user)return NextResponse.json({error:"No autorizado"},{status:401,headers})
  try{
    const body=await req.json(),list=await listUserWorkspaces(user.id),workspace=list.find(w=>w.ownerId===body.ownerId)
    if(!workspace)return NextResponse.json({error:"Espacio no disponible"},{status:403,headers})
    const response=NextResponse.json({ok:true},{headers})
    selectWorkspace(response,user.id,workspace);return response
  }catch{return NextResponse.json({error:"No se pudo seleccionar el espacio"},{status:503,headers})}
}
