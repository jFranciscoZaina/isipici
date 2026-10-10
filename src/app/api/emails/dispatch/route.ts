import { NextRequest, NextResponse } from "next/server"
import { drainEmailQueue } from "@/lib/emails/dispatch"
export const runtime = "nodejs"
export const maxDuration = 60
export async function GET(req: NextRequest) {
 if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({error:"Unauthorized cron"},{status:401})
 try { return NextResponse.json({ok:true,...await drainEmailQueue()}) }
 catch { return NextResponse.json({error:"No se pudo procesar la cola de emails"},{status:503}) }
}
