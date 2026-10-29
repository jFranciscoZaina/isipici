import {NextRequest,NextResponse} from "next/server"
import {hasDualSession,sameOrigin,verifiedModernUser} from "@/lib/supabase-auth"
import {selectWorkspace} from "@/lib/modern-workspaces"
import {createSelfServiceWorkspace,parseWorkspaceBusiness,sendWorkspaceVerification,WorkspaceOnboardingError} from "@/lib/workspace-onboarding"

export const runtime="nodejs"
const headers={"Cache-Control":"private, no-store"}

export async function POST(req:NextRequest){
 if(!sameOrigin(req)||hasDualSession(req.cookies)||req.cookies.get("session")?.value)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const user=await verifiedModernUser(req)
 if(!user)return NextResponse.json({error:"No autorizado"},{status:401,headers})

 try{
  const body=await req.json()
  if(!body||typeof body!=="object"||Array.isArray(body))throw new WorkspaceOnboardingError("Datos inválidos.",400)
  const action=(body as Record<string,unknown>).action

  if(action==="prepare"){
   const business=parseWorkspaceBusiness((body as Record<string,unknown>).business)
   const verification=await sendWorkspaceVerification(user,business.contactEmail)
   if(verification.verificationRequired)return NextResponse.json({verificationRequired:true,email:verification.email},{headers})
   const created=await createSelfServiceWorkspace(user,business)
   const response=NextResponse.json({created:true},{headers})
   selectWorkspace(response,user.id,{ownerId:created.ownerId,membershipId:created.membershipId,name:created.name})
   return response
  }

  if(action==="complete"){
   const created=await createSelfServiceWorkspace(user,(body as Record<string,unknown>).business,(body as Record<string,unknown>).code)
   const response=NextResponse.json({created:true},{headers})
   selectWorkspace(response,user.id,{ownerId:created.ownerId,membershipId:created.membershipId,name:created.name})
   return response
  }

  if(action==="resend"){
   const verification=await sendWorkspaceVerification(user,(body as Record<string,unknown>).contactEmail)
   return NextResponse.json({verificationRequired:verification.verificationRequired,...(verification.verificationRequired?{email:verification.email}:{})},{headers})
  }

  throw new WorkspaceOnboardingError("Acción inválida.",400)
 }catch(error){
  const message=error instanceof WorkspaceOnboardingError?error.message:"No se pudo completar el onboarding."
  const status=error instanceof WorkspaceOnboardingError?error.status:400
  return NextResponse.json({error:message},{status,headers})
 }
}
