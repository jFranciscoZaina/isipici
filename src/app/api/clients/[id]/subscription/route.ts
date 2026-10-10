import { NextRequest, NextResponse } from "next/server"
import { getSessionOwnerId } from "@/lib/auth"
import { getSubscriptionState, lifecycleOperation } from "@/lib/payments/lifecycle"
import { PaymentError } from "@/lib/payments/validation"
type Context={params:Promise<{id:string}>}
export async function GET(req:NextRequest,ctx:Context) {
 try { const owner=await getSessionOwnerId(req);if(!owner)return NextResponse.json({error:"No autorizado"},{status:401});const {id}=await ctx.params;return NextResponse.json(await getSubscriptionState(owner,id,req.nextUrl.searchParams.has("from")||req.nextUrl.searchParams.has("to")?{from:req.nextUrl.searchParams.get("from")??"",to:req.nextUrl.searchParams.get("to")??""}:undefined)) }
 catch(e){return NextResponse.json({error:e instanceof PaymentError?e.message:"Suscripción no disponible"},{status:e instanceof PaymentError?e.status:503})}
}
export async function POST(req:NextRequest,ctx:Context) {
 try {const owner=await getSessionOwnerId(req);if(!owner)return NextResponse.json({error:"No autorizado"},{status:401});const {id}=await ctx.params;let input:unknown;try{input=await req.json()}catch{return NextResponse.json({error:"Datos inválidos"},{status:400})}return NextResponse.json(await lifecycleOperation(owner,id,input))}
 catch(e){return NextResponse.json({error:e instanceof PaymentError?e.message:"No se pudo completar la acción"},{status:e instanceof PaymentError?e.status:503})}
}
