import "server-only"
import {NextRequest,NextResponse} from "next/server"
import {getAccessContext} from "@/lib/auth"
import {withAuditActor} from "@/lib/audit-context"
export async function withRequestAudit(req:NextRequest,operation:()=>Promise<NextResponse>){
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401})
 return withAuditActor(context.authKind==="user"?{kind:"user",userId:context.userId,ownerId:context.ownerId}:{kind:"legacy",ownerId:context.ownerId},operation,req)
}
