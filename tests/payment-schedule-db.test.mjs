import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {testPostgres} from "./helpers/postgres.mjs"
import {loader} from "./helpers/load-ts.mjs"
const owner="11111111-1111-4111-8111-111111111111",other="11111111-1111-4111-8111-111111111112"
const clients=[1,2,3,4].map(n=>"22222222-2222-4222-8222-22222222222"+n)
const account="33333333-3333-4333-8333-333333333333",agreement="44444444-4444-4444-8444-444444444444"
const load=loader(),{getNextRecurringDate}=load("src/lib/payments/schedule.ts"),{parsePayment}=load("src/lib/payments/validation.ts")
test("PostgreSQL scheduling: sequential migrations, parity, snapshots, anchors, debt, provider replay and privileges",{timeout:90000},async()=>{
 const db=testPostgres()
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
   CREATE TABLE owners(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
   CREATE TABLE clients(id uuid PRIMARY KEY,gym_id uuid REFERENCES owners(id),current_debt numeric DEFAULT 0,last_payment_amount numeric,last_payment_date date,next_payment_date date);
   CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),client_id uuid REFERENCES clients(id),amount numeric,plan text NOT NULL,discount numeric,debt numeric,period_from date,period_to date,next_payment_date date,created_at timestamptz DEFAULT now());
   INSERT INTO owners(id) VALUES('${owner}'),('${other}');
   INSERT INTO clients(id,gym_id) VALUES ${clients.map((id,i)=>`('${id}','${i===3?other:owner}')`).join(",")};
   GRANT ALL ON owners,clients,payments TO service_role;`)
  for(const name of ["20261010_payment_domain.sql","20261011_owner_payment_rules.sql","20261012_payment_schedule_rules.sql"])await db.exec(readFileSync(new URL("../supabase/migrations/"+name,import.meta.url),"utf8"))
  await db.exec("SET ROLE service_role")
  const register=async(input,who=owner,raw=false)=> (await db.query("SELECT register_canonical_payment($1::uuid,$2::jsonb) AS result",[who,JSON.stringify(raw?input:parsePayment(input,input.provider&&input.provider!=="manual"?"provider":"manual"))])).rows[0].result
  const sqlNext=async(frequency,anchor,current)=>(await db.query("SELECT payment_next_recurring_date($1,$2::date,$3::date)::text AS next",[frequency,anchor,current])).rows[0].next
  for(const zone of ["UTC","America/Argentina/Buenos_Aires","Australia/Sydney"]){
   await db.exec(`SET TIME ZONE '${zone}'`)
   for(const [frequency,anchor,current] of [["weekly","2026-10-14","2026-10-14"],["weekly","2026-10-14","2026-10-21"],["biweekly","2026-10-14","2026-10-14"],["biweekly","2026-10-14","2026-10-28"],["monthly","2026-10-10","2026-10-10"],["monthly","2026-01-31","2026-01-31"],["monthly","2026-01-31","2026-02-28"],["monthly","2026-01-31","2026-03-31"],["monthly","2028-01-31","2028-01-31"],["monthly","2028-01-31","2028-02-29"]]) assert.equal(await sqlNext(frequency,anchor,current),getNextRecurringDate({frequency,anchorDate:anchor,currentDate:current}))
  }
  const base={clientId:clients[0],amount:50,debt:20,frequency:"weekly",anchorDate:"2026-10-14"}
  const first=await register(base)
  assert.equal(first.payment.period_from,"2026-10-14");assert.equal(first.payment.period_to,"2026-10-20");assert.equal(first.payment.next_payment_date,"2026-10-21")
  const agreementId=first.payment.recurring_agreement_id;assert.ok(agreementId)
  const before=(await db.query("SELECT to_jsonb(c) AS snapshot FROM clients c WHERE id=$1",[clients[0]])).rows[0].snapshot
  const uniqueBase={clientId:clients[0],paymentType:"one_off",amount:200,concept:"Event",periodFrom:"2026-11-07"}
  const one=await register(uniqueBase),many=await register({...uniqueBase,periodTo:"2026-11-09"})
  assert.equal(one.payment.period_from,"2026-11-07");assert.equal(one.payment.period_to,"2026-11-07")
  assert.equal(many.payment.period_to,"2026-11-09");assert.equal(many.payment.next_payment_date,null);assert.equal(many.payment.recurring_agreement_id,null)
  assert.equal(Number(many.payment.debt),0)
  assert.deepEqual((await db.query("SELECT to_jsonb(c) AS snapshot FROM clients c WHERE id=$1",[clients[0]])).rows[0].snapshot,before)
  assert.equal(Number((await db.query("SELECT sum(amount)::numeric AS income FROM payments WHERE client_id=$1",[clients[0]])).rows[0].income),450)
  const settled=await register({clientId:clients[0],amount:20,debt:0,plan:"Pago deuda",debtPaymentId:first.payment.id})
  assert.equal(settled.payment.period_from,first.payment.period_from);assert.equal(settled.payment.period_to,first.payment.period_to)
  assert.equal((await db.query("SELECT next_payment_date::text AS due,current_debt FROM clients WHERE id=$1",[clients[0]])).rows[0].due,"2026-10-21")
  assert.equal(Number((await db.query("SELECT current_debt FROM clients WHERE id=$1",[clients[0]])).rows[0].current_debt),0)
  const second=await register({...base,debt:0,cycleDate:"2026-10-21",recurringAgreementId:agreementId})
  assert.equal(second.payment.next_payment_date,"2026-10-28")
  await assert.rejects(register({...base,debt:0,anchorDate:"2026-10-21",recurringAgreementId:agreementId}),/PAYMENT_SCHEDULE_CONFLICT/)
  await assert.rejects(db.query("UPDATE recurring_agreements SET billing_anchor_date='2026-10-21' WHERE id=$1",[agreementId]),/PAYMENT_ANCHOR_IMMUTABLE/)
  await assert.rejects(register({...base,clientId:clients[3]}),/PAYMENT_OWNER_DENIED/)
  await assert.rejects(register({...base,clientId:clients[1],recurringAgreementId:agreementId}),/PAYMENT_AGREEMENT_DENIED/)
  await db.exec(`UPDATE owners SET is_active=false WHERE id='${owner}'`)
  await assert.rejects(register(base),/PAYMENT_OWNER_DENIED/)
  await db.exec(`UPDATE owners SET is_active=true WHERE id='${owner}'`)
  await assert.rejects(register({...parsePayment(base),nextPaymentDate:"2026-10-22"},owner,true),/PAYMENT_SCHEDULE_CONFLICT/)
  const fortnight=await register({clientId:clients[1],amount:50,frequency:"biweekly",anchorDate:"2026-10-14"})
  assert.equal(fortnight.payment.period_to,"2026-10-27");assert.equal(fortnight.payment.next_payment_date,"2026-10-28")
  const monthly={clientId:clients[2],amount:50,frequency:"monthly",anchorDate:"2026-01-31"}
  const jan=await register(monthly),feb=await register({...monthly,cycleDate:"2026-02-28"}),mar=await register({...monthly,cycleDate:"2026-03-31"})
  assert.equal(jan.payment.next_payment_date,"2026-02-28");assert.equal(feb.payment.next_payment_date,"2026-03-31");assert.equal(mar.payment.next_payment_date,"2026-04-30")
  assert.equal(jan.payment.recurring_agreement_id,feb.payment.recurring_agreement_id)
  assert.equal((await db.query("SELECT billing_anchor_date::text AS anchor FROM recurring_agreements WHERE id=$1",[jan.payment.recurring_agreement_id])).rows[0].anchor,"2026-01-31")
  await db.exec(`INSERT INTO payment_provider_accounts(id,owner_id,provider,status,default_currency)VALUES('${account}','${owner}','stripe','connected','ARS');
    INSERT INTO recurring_agreements(id,owner_id,client_id,payment_provider_account_id,provider,status,amount,currency,interval_unit,interval_count,billing_anchor_date)
    VALUES('${agreement}','${owner}','${clients[2]}','${account}','stripe','active',50,'ARS','month',1,'2026-01-31');`)
  const external={...monthly,provider:"stripe",currency:"ARS",providerAccountId:account,recurringAgreementId:agreement,providerPaymentId:"schedule-paid-1"}
  const paid=await register(external)
  await register({...external,cycleDate:"2026-03-31",providerPaymentId:"schedule-paid-2"})
  const replay=await register(external)
  assert.equal(replay.duplicate,true);assert.equal(replay.payment.id,paid.payment.id)
  assert.equal((await db.query("SELECT next_payment_date::text AS due FROM clients WHERE id=$1",[clients[2]])).rows[0].due,"2026-04-30")
  await assert.rejects(register({...external,amount:51}),/PAYMENT_ID_CONFLICT/)
  await assert.rejects(db.exec(`UPDATE owners SET default_currency='AUD' WHERE id='${owner}'`),/OWNER_CURRENCY_LOCKED/)
  await assert.rejects(db.exec(`UPDATE payments SET currency='AUD' WHERE owner_id='${owner}'`),/PAYMENT_CURRENCY_IMMUTABLE/)
  await db.exec("SET ROLE anon")
  await assert.rejects(db.query("SELECT payment_next_recurring_date('monthly','2026-01-31','2026-02-28')"),/permission denied/)
  await assert.rejects(db.query("SELECT register_canonical_payment($1::uuid,$2::jsonb)",[owner,JSON.stringify(parsePayment(base))]),/permission denied/)
 }finally{await db.close()}
})
