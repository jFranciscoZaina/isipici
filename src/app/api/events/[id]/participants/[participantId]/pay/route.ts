import {after,NextRequest,NextResponse} from "next/server"
import {supabase} from "@/lib/supabaseClient"
import {getAccessContext} from "@/lib/auth"
import {sameOrigin} from "@/lib/supabase-auth"
import {withRequestAudit} from "@/lib/audit-request"
import {processPaymentReceipt} from "@/lib/payments/service"
import type {CanonicalPayment} from "@/lib/payments/types"

export const runtime="nodejs"
export const maxDuration=60
const headers={"Cache-Control":"private, no-store"}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function performPOST(req:NextRequest,{params}:{params:Promise<{id:string;participantId:string}>}){
 if(!sameOrigin(req))return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const context=await getAccessContext(req)
 if(!context)return NextResponse.json({error:"No autorizado"},{status:401,headers})
 const {id,participantId}=await params
 if(!UUID.test(id)||!UUID.test(participantId))return NextResponse.json({error:"Participante inválido"},{status:400,headers})

 const {data:participant,error:lookupError}=await supabase.from("event_participants").select("id,event_id,status").eq("id",participantId).eq("event_id",id).eq("owner_id",context.ownerId).single()
 if(lookupError||!participant)return NextResponse.json({error:"Participante no disponible"},{status:404,headers})

 let receiptNote:string|null=null
 let paymentDate:string|null=null
 try{
  const body=await req.json().catch(()=>({}))
  if(body?.receiptNote!=null){
   if(typeof body.receiptNote!=="string"||body.receiptNote.length>1000)return NextResponse.json({error:"Nota del comprobante inválida"},{status:400,headers})
   receiptNote=body.receiptNote.trim()||null
  }
 }catch{return NextResponse.json({error:"Datos inválidos"},{status:400,headers})}

 const {data,error}=await supabase.rpc("event_register_participant_payment_v2",{
  p_owner_id:context.ownerId,
  p_participant_id:participantId,
  p_payment_date:paymentDate,
  p_receipt_note:receiptNote,
 })
 if(error||!data){
  const code=error?.message??error?.code??""
  const missing=code.includes("event_register_participant_payment_v2")||error?.code==="42883"||error?.code==="PGRST202"
  const future=code.includes("EVENT_PAYMENT_DATE_FUTURE")
  const conflict=code.includes("EVENT_PARTICIPANT_PAID_IMMUTABLE")||code.includes("EVENT_PARTICIPANT_UNAVAILABLE")||code.includes("EVENT_UNAVAILABLE")
  return NextResponse.json({error:missing?"Falta aplicar la migración M26.":future?"No podés registrar un pago en una fecha futura.":conflict?"El participante ya no está disponible para registrar este pago.":"No se pudo registrar el pago del evento."},{status:missing?503:future?400:conflict?409:500,headers})
 }

 const payment=data.payment as CanonicalPayment
 const receipt=await processPaymentReceipt(context.ownerId,payment,true)
 if(receipt.receiptJobId){
  const jobId=receipt.receiptJobId
  try{after(async()=>{const {dispatchEmailJob}=await import("@/lib/emails/dispatch");await dispatchEmailJob(jobId,context.ownerId,true)})}catch{/* scheduler recovery */}
 }
 return NextResponse.json({...data,receipt_status:receipt.receiptStatus},{status:data.duplicate?200:201,headers})
}

export async function POST(req:NextRequest,context:{params:Promise<{id:string;participantId:string}>}){
 return withRequestAudit(req,()=>performPOST(req,context))
}
