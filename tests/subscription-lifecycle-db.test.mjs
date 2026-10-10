import {test} from "node:test"
import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {testPostgres} from "./helpers/postgres.mjs"
import {loader} from "./helpers/load-ts.mjs"
const owner="11111111-1111-4111-8111-111111111111",other="11111111-1111-4111-8111-111111111112"
const ids=Array.from({length:12},(_,i)=>"22222222-2222-4222-8222-"+String(i+1).padStart(12,"0"))
const migrations=["20261010_payment_domain.sql","20261011_owner_payment_rules.sql","20261012_payment_schedule_rules.sql","20261013_subscription_lifecycle.sql"]
const {parsePayment}=loader()("src/lib/payments/validation.ts")
async function fixture(){const db=testPostgres();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE TABLE owners(id uuid PRIMARY KEY,is_active boolean DEFAULT true);
CREATE TABLE clients(id uuid PRIMARY KEY,gym_id uuid REFERENCES owners(id),current_debt numeric DEFAULT 0,last_payment_amount numeric,last_payment_date date,next_payment_date date);
CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),client_id uuid REFERENCES clients(id),amount numeric,plan text NOT NULL,discount numeric,debt numeric,period_from date,period_to date,next_payment_date date,created_at timestamptz DEFAULT now());
INSERT INTO owners(id) VALUES ('${owner}'),('${other}');
INSERT INTO clients(id,gym_id) VALUES ${ids.map((id,i)=>"('"+id+"','"+(i===11?other:owner)+"')").join(",")};GRANT ALL ON owners,clients,payments TO service_role;`);return db}
test("lifecycle SQL: uniqueness, installments, partial payments, pause/resume, change, archive and isolation",{timeout:90000},async()=>{
const db=await fixture();try{
for(const file of migrations)await db.exec(readFileSync(new URL("../supabase/migrations/"+file,import.meta.url),"utf8"));await db.exec("SET ROLE service_role")
const query=async(sql,args=[])=>(await db.query(sql,args)).rows
const action=async(client,kind,input={},who=owner)=>(await query("SELECT subscription_lifecycle($1,$2,$3,$4::jsonb) result",[who,client,kind,JSON.stringify(input)]))[0].result
const create=(client,frequency="weekly",anchorDate="2026-10-07",amount=100)=>action(client,"create",{frequency,anchorDate,amount})
const ensure=(client,date)=>query("SELECT ensure_recurring_installments_through($1,$2,$3::date)",[owner,client,date])
const rows=client=>query("SELECT * FROM recurring_installments WHERE client_id=$1 ORDER BY due_date",[client])
const pay=async(client,id,amount,discount=0,extra={})=>(await query("SELECT register_canonical_payment($1,$2::jsonb) result",[owner,JSON.stringify({...parsePayment({clientId:client,recurringInstallmentId:id,amount,discount,...extra}),currency:"ARS"})]))[0].result
const today=(await query("SELECT (now() AT TIME ZONE 'UTC')::date::text today"))[0].today
const first=await create(ids[0]);const agreement=first.agreementId
assert.equal((await rows(ids[0])).length,1)
for(const status of ["active","paused","pending"]){await db.query("UPDATE recurring_agreements SET status=$1 WHERE id=$2",[status,agreement]);await assert.rejects(()=>create(ids[0]),/CURRENT_AGREEMENT_EXISTS/)}
await db.query("UPDATE recurring_agreements SET status='active' WHERE id=$1",[agreement])
await assert.rejects(()=>db.query("INSERT INTO recurring_agreements(owner_id,client_id,provider,status,amount,currency,interval_unit)VALUES($1,$2,'manual','paused',100,'ARS','month')",[owner,ids[0]]),/recurring_one_current/)
await ensure(ids[0],"2026-10-28");await ensure(ids[0],"2026-10-28");assert.equal((await rows(ids[0])).length,4)
const i=(await rows(ids[0]))[0];const p=await pay(ids[0],i.id,60)
assert.equal(p.payment.recurring_installment_id,i.id);assert.equal((await rows(ids[0]))[0].status,"open")
await assert.rejects(()=>pay(ids[0],i.id,41),/INSTALLMENT_OVERALLOCATION/)
await pay(ids[0],i.id,20,20);assert.equal((await rows(ids[0]))[0].status,"paid")
assert.equal(Number((await query("SELECT sum(amount) income FROM payments WHERE client_id=$1",[ids[0]]))[0].income),80)
await assert.rejects(()=>pay(ids[1],i.id,10),/PAYMENT_INSTALLMENT_DENIED/)
await assert.rejects(()=>action(ids[11],"create",{frequency:"weekly",anchorDate:today,amount:100}),/PAYMENT_OWNER_DENIED/)

await action(ids[0],"pause",{agreementId:agreement});assert.equal((await query("SELECT status FROM recurring_agreements WHERE id=$1",[agreement]))[0].status,"paused")
await ensure(ids[0],"2026-11-04");assert.equal((await rows(ids[0])).length,4)
assert.ok((await rows(ids[0])).filter(x=>x.due_date>new Date(today)).every(x=>x.status==="cancelled"))
await assert.rejects(()=>action(ids[0],"resume",{agreementId:agreement,nextDueDate:"2026-11-05"}),/PAYMENT_SCHEDULE_CONFLICT/)
await action(ids[0],"resume",{agreementId:agreement,nextDueDate:"2026-11-04"});assert.equal((await rows(ids[0])).length,5)
assert.equal((await query("SELECT count(*) n FROM recurring_installments WHERE recurring_agreement_id=$1 AND due_date='2026-10-28' AND status='open'",[agreement]))[0].n,0)
const changed=await action(ids[0],"change",{agreementId:agreement,frequency:"monthly",anchorDate:"2026-11-10",amount:30})
assert.notEqual(changed.agreementId,agreement);assert.equal((await query("SELECT status FROM recurring_agreements WHERE id=$1",[agreement]))[0].status,"cancelled")
await assert.rejects(()=>action(ids[0],"resume",{agreementId:agreement,nextDueDate:"2026-12-02"}),/PAYMENT_AGREEMENT_DENIED/)
await action(ids[0],"archive");assert.ok((await query("SELECT archived_at FROM clients WHERE id=$1",[ids[0]]))[0].archived_at)
assert.equal((await query("SELECT count(*) n FROM payments WHERE client_id=$1",[ids[0]]))[0].n,2)
await assert.rejects(()=>query("DELETE FROM clients WHERE id=$1",[ids[0]]),/CLIENT_ARCHIVE_REQUIRED/)
await assert.rejects(()=>create(ids[0]),/CLIENT_ARCHIVED/)
await action(ids[0],"reactivate");assert.equal((await query("SELECT status FROM recurring_agreements WHERE id=$1",[changed.agreementId]))[0].status,"paused")
// Future quotas do not count as debt, overdue quotas count only their remainder.
const past="2026-10-01";await create(ids[1],"monthly",past,100);const debtI=(await rows(ids[1]))[0]
await pay(ids[1],debtI.id,60);assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[1]]))[0].current_debt),40)
await action(ids[1],"pause",{agreementId:debtI.recurring_agreement_id});assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[1]]))[0].current_debt),40)
await action(ids[1],"archive");await pay(ids[1],debtI.id,40);assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[1]]))[0].current_debt),0)
await create(ids[2],"monthly","2026-11-10",100);assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[2]]))[0].current_debt),0)
for(const [client,frequency,dates] of [[ids[3],"biweekly",["2026-10-07","2026-10-21","2026-11-04"]],[ids[4],"monthly",["2026-01-31","2026-02-28","2026-03-31","2026-04-30"]]]){
 await create(client,frequency,dates[0]);await ensure(client,dates.at(-1));assert.deepEqual((await query("SELECT due_date::text d FROM recurring_installments WHERE client_id=$1 ORDER BY due_date",[client])).map(x=>x.d),dates)
}
const debtBeforeWaiver=Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[4]]))[0].current_debt)
const waiver=(await rows(ids[4]))[0];await query("SELECT waive_recurring_installment($1,$2,$3)",[owner,ids[4],waiver.id]);assert.equal((await rows(ids[4]))[0].status,"waived")
assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[4]]))[0].current_debt),debtBeforeWaiver-100)
const prior=(await rows(ids[4]))[1].recurring_agreement_id
const beforeChangeDebt=Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[4]]))[0].current_debt)
await action(ids[4],"change",{agreementId:prior,frequency:"weekly",anchorDate:"2026-11-04",amount:30})
assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[4]]))[0].current_debt),beforeChangeDebt)
await assert.rejects(()=>query("UPDATE recurring_agreements SET status='active' WHERE id=$1",[prior]),/SUBSCRIPTION_TERMINAL/)
await assert.rejects(async()=>query("UPDATE recurring_installments SET status='paid' WHERE id=$1",[(await rows(ids[4]))[1].id]),/INSTALLMENT_NOT_SETTLED/)
await assert.rejects(()=>query("DELETE FROM payments WHERE id=$1",[p.payment.id]),/INSTALLMENT_PAYMENT_IMMUTABLE/)
await action(ids[2],"cancel",{agreementId:(await rows(ids[2]))[0].recurring_agreement_id});await create(ids[2]);
await db.query("UPDATE recurring_agreements SET status='failed' WHERE client_id=$1 AND status='active'",[ids[2]]);await create(ids[2]);
const before=(await query("SELECT to_jsonb(c) snapshot FROM clients c WHERE id=$1",[ids[2]]))[0].snapshot
for(const periodTo of ["2026-11-07","2026-11-09","2026-11-08"]){await query("SELECT register_canonical_payment($1,$2::jsonb)",[owner,JSON.stringify({...parsePayment({clientId:ids[2],paymentType:"one_off",concept:"Event",amount:20,periodFrom:"2026-11-07",periodTo}),currency:"ARS"})])}
assert.deepEqual((await query("SELECT to_jsonb(c) snapshot FROM clients c WHERE id=$1",[ids[2]]))[0].snapshot,before)
await db.query("UPDATE owners SET is_active=false WHERE id=$1",[owner]);await assert.rejects(()=>create(ids[5]),/PAYMENT_OWNER_DENIED/);await db.query("UPDATE owners SET is_active=true WHERE id=$1",[owner])

// Queue competing creations; the unique index is also exercised directly above.
const competing=await Promise.allSettled([create(ids[5]),create(ids[5])]);assert.equal(competing.filter(r=>r.status==="fulfilled").length,1)
assert.equal((await query("SELECT count(*) n FROM recurring_agreements WHERE client_id=$1 AND status IN ('pending','active','paused')",[ids[5]]))[0].n,1)
// A partially covered future installment survives pause; it is not current debt.
const futurePlan=await create(ids[6],"monthly","2026-11-10",100);const futureI=(await rows(ids[6]))[0];await pay(ids[6],futureI.id,20)
await action(ids[6],"pause",{agreementId:futurePlan.agreementId});assert.equal((await rows(ids[6]))[0].status,"open")
assert.equal(Number((await query("SELECT current_debt FROM clients WHERE id=$1",[ids[6]]))[0].current_debt),0)
// Leap-year installments keep the original day 31.
await create(ids[7],"monthly","2024-01-31",100);await ensure(ids[7],"2024-03-31")
assert.deepEqual((await query("SELECT due_date::text d FROM recurring_installments WHERE client_id=$1 ORDER BY due_date",[ids[7]])).map(x=>x.d),["2024-01-31","2024-02-29","2024-03-31"])
// Independent legacy debt remains collectible after modern payments, including archive.
const legacy=(await query("SELECT register_canonical_payment($1,$2::jsonb) result",[owner,JSON.stringify({...parsePayment({clientId:ids[8],plan:"Legacy",amount:50,debt:30,periodFrom:"2026-10-01",periodTo:"2026-11-01"}),currency:"ARS"})]))[0].result
await create(ids[8]);const modern=(await rows(ids[8]))[0];await pay(ids[8],modern.id,20)
await action(ids[8],"archive")
await query("SELECT register_canonical_payment($1,$2::jsonb)",[owner,JSON.stringify({...parsePayment({clientId:ids[8],plan:"Pago deuda",amount:30,debt:0,debtPaymentId:legacy.payment.id}),currency:"ARS"})])
assert.equal(Number((await query("SELECT legacy_debt_amount FROM clients WHERE id=$1",[ids[8]]))[0].legacy_debt_amount),0)
// Provider replay after pause never applies the amount twice.
const account="33333333-3333-4333-8333-333333333333",providerAgreement="44444444-4444-4444-8444-444444444444"
await query("INSERT INTO payment_provider_accounts(id,owner_id,provider,status,default_currency)VALUES($1,$2,'stripe','connected','ARS')",[account,owner])
await query("INSERT INTO recurring_agreements(id,owner_id,client_id,provider,status,amount,currency,interval_unit,interval_count,billing_anchor_date,next_charge_at,installments_enabled,payment_provider_account_id)VALUES($1,$2,$3,'stripe','active',100,'ARS','week',1,'2026-10-07','2026-10-07',true,$4)",[providerAgreement,owner,ids[9],account])
await ensure(ids[9],"2026-10-07");const providerI=(await rows(ids[9]))[0]
const providerInput={...parsePayment({clientId:ids[9],recurringInstallmentId:providerI.id,recurringAgreementId:providerAgreement,provider:"stripe",providerAccountId:account,providerPaymentId:"charge-1",currency:"ARS",amount:60},"provider")}
const external=async(input)=> (await query("SELECT register_canonical_payment($1,$2::jsonb) result",[owner,JSON.stringify(input)]))[0].result
const externalFirst=await external(providerInput);await action(ids[9],"archive")
const replay=await external(providerInput);assert.equal(replay.duplicate,true);assert.equal(replay.payment.id,externalFirst.payment.id)
await assert.rejects(()=>external({...providerInput,amount:61}),/PAYMENT_ID_CONFLICT/)
await assert.rejects(()=>external({...providerInput,currency:"AUD"}),/PAYMENT_CURRENCY_CONFLICT/)
// Pending is paused on archive; reactivation does not activate it.
await query("INSERT INTO recurring_agreements(owner_id,client_id,provider,status,amount,currency,interval_unit)VALUES($1,$2,'manual','pending',100,'ARS','month')",[owner,ids[10]])
await action(ids[10],"archive");await action(ids[10],"reactivate");assert.equal((await query("SELECT status FROM recurring_agreements WHERE client_id=$1",[ids[10]]))[0].status,"paused")
await db.exec("RESET ROLE;SET ROLE anon");await assert.rejects(()=>action(ids[0],"reactivate"),/permission denied/)
}finally{await db.close()}
})
test("migration refuses duplicate legacy current agreements without guessing",{timeout:90000},async()=>{const db=await fixture();try{
for(const file of migrations.slice(0,3))await db.exec(readFileSync(new URL("../supabase/migrations/"+file,import.meta.url),"utf8"))
await db.query("INSERT INTO recurring_agreements(owner_id,client_id,provider,status,amount,currency,interval_unit)VALUES($1,$2,'manual','pending',100,'ARS','month'),($1,$2,'manual','paused',100,'ARS','month')",[owner,ids[0]])
await assert.rejects(()=>db.exec(readFileSync(new URL("../supabase/migrations/"+migrations[3],import.meta.url),"utf8")),/REVIEW_REQUIRED/)
}finally{await db.close()}})
