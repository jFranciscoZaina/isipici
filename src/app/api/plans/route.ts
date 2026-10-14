import {withRequestAudit} from "@/lib/audit-request"
import {NextRequest,NextResponse} from "next/server"
import {getSessionOwnerId} from "@/lib/auth"
import {listPlans,planOperation} from "@/lib/payments/plans"
import {PaymentError} from "@/lib/payments/validation"
export async function GET(req:NextRequest){try{const owner=await getSessionOwnerId(req);if(!owner)return NextResponse.json({error:"No autorizado"},{status:401});return NextResponse.json(await listPlans(owner))}catch(e){return NextResponse.json({error:e instanceof PaymentError?e.message:"Planes no disponibles"},{status:e instanceof PaymentError?e.status:503})}}
async function performPOST(req:NextRequest){try{const owner=await getSessionOwnerId(req);if(!owner)return NextResponse.json({error:"No autorizado"},{status:401});let input:unknown;try{input=await req.json()}catch{return NextResponse.json({error:"Datos inválidos"},{status:400})}return NextResponse.json(await planOperation(owner,input))}catch(e){return NextResponse.json({error:e instanceof PaymentError?e.message:"No se pudo guardar el plan"},{status:e instanceof PaymentError?e.status:503})}}

export async function POST(req:NextRequest){return withRequestAudit(req,()=>performPOST(req))}
