import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { testPostgres } from "./helpers/postgres.mjs"
const owner="11111111-1111-4111-8111-111111111111",other="11111111-1111-4111-8111-111111111112",client="22222222-2222-4222-8222-222222222221",archived="22222222-2222-4222-8222-222222222222",foreign="22222222-2222-4222-8222-222222222223"
async function fixture() {
 const db=testPostgres()
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE owners(id uuid PRIMARY KEY,name text,email text,is_active boolean DEFAULT true);
 CREATE TABLE clients(id uuid PRIMARY KEY,gym_id uuid REFERENCES owners(id),name text,email text,phone text,address text,address_number text,plan text,created_at timestamptz DEFAULT now(),current_debt numeric DEFAULT 0,last_payment_amount numeric,last_payment_date date,next_payment_date date);
 CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),client_id uuid REFERENCES clients(id),amount numeric,plan text NOT NULL,discount numeric DEFAULT 0,debt numeric DEFAULT 0,period_from date,period_to date,next_payment_date date,created_at timestamptz DEFAULT now());
 CREATE TABLE email_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),client_id uuid REFERENCES clients(id),type text,subject text,due_date date,status text CHECK(status IN ('sent','failed')),sent_at timestamptz NOT NULL DEFAULT now());
 INSERT INTO owners(id,name) VALUES('${owner}','Owner'),('${other}','Other');
 INSERT INTO clients(id,gym_id,name,email,current_debt) VALUES('${client}','${owner}','Client','client@example.test',5),('${archived}','${owner}','Archive','archive@example.test',0),('${foreign}','${other}','Foreign','foreign@example.test',0);
 GRANT ALL ON owners,clients,payments,email_logs TO service_role;`)
 for(const file of ["20261007_email_delivery_tracking.sql","20261010_payment_domain.sql","20261011_owner_payment_rules.sql","20261012_payment_schedule_rules.sql","20261013_subscription_lifecycle.sql","20261014_dashboard_summary.sql","20261015_email_dispatch.sql"]) {
  if(file==="20261015_email_dispatch.sql") await db.query("INSERT INTO payments(owner_id,client_id,amount,plan,created_at) VALUES($1,$2,1,'before-queue',now()-interval '400 days')",[owner,client])
  await db.exec(readFileSync(new URL("../supabase/migrations/"+file,import.meta.url),"utf8"))
 }
 await db.exec("SET ROLE service_role")
 return db
}
test("SQL summaries keep monthly totals, due balances and ownership with thousands of historical payments", {timeout:90000}, async()=>{
 const db=await fixture()
 try {
  await db.query("INSERT INTO payments(owner_id,client_id,amount,plan,created_at) SELECT $1,$2,1,'Old',now()-interval '400 days' FROM generate_series(1,5000)",[owner,client])
  await db.query("INSERT INTO payments(owner_id,client_id,amount,plan,payment_type) VALUES($1,$2,30,'Recurring','recurring'),($1,$2,20,'Extra','one_off')",[owner,client])
  // A malformed legacy row must not bleed into the selected owner's income.
  await db.query("INSERT INTO payments(owner_id,client_id,amount,plan,payment_type) VALUES($1,$2,999,'Foreign','one_off')",[other,client])
  const today=(await db.query("SELECT (now() AT TIME ZONE 'UTC')::date::text today")).rows[0].today
  await db.query("SELECT subscription_lifecycle($1,$2,'create',$3::jsonb)",[owner,client,JSON.stringify({frequency:"monthly",anchorDate:today,amount:100})])
  const installment=(await db.query("SELECT id FROM recurring_installments WHERE client_id=$1",[client])).rows[0].id
  await db.query("SELECT register_canonical_payment($1,$2::jsonb)",[owner,JSON.stringify({clientId:client,paymentType:"recurring",recurringInstallmentId:installment,amount:60,discount:10,currency:"ARS",provider:"manual"})])
  await db.query("SELECT ensure_recurring_installments_through($1,$2,$3::date+40)",[owner,client,today])
  await db.query("SELECT subscription_lifecycle($1,$2,'archive')",[owner,archived])
  const args=[owner,false,new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString(),new Date(new Date().getFullYear(),new Date().getMonth()+1,1).toISOString(),today]
  const result=(await db.query("SELECT dashboard_client_summary($1,$2,$3,$4,$5) summary",args)).rows[0].summary
  assert.equal(result.currency,"ARS");assert.equal(result.clients.length,1)
  const row=result.clients[0]
  assert.equal(Number(row.total_paid_this_month),110);assert.equal(Number(row.installment_debt),30);assert.equal(Number(row.legacy_debt_amount),5)
  assert.equal(row.has_active_agreement,true);assert.ok(row.last_payment.id);assert.ok(row.last_recurring.id)
  assert.ok(JSON.stringify(result).length<4000);assert.equal(row.payments,undefined)
  args[1]=true;assert.equal((await db.query("SELECT dashboard_client_summary($1,$2,$3,$4,$5) summary",args)).rows[0].summary.clients[0].id,archived)
  args[0]=other;args[1]=false;assert.equal((await db.query("SELECT dashboard_client_summary($1,$2,$3,$4,$5) summary",args)).rows[0].summary.clients[0].id,foreign)
  await db.query("UPDATE owners SET is_active=false WHERE id=$1",[other]);await assert.rejects(()=>db.query("SELECT dashboard_client_summary($1,$2,$3,$4,$5)",args),/PAYMENT_OWNER_DENIED/)
  await db.exec("SET ROLE anon");await assert.rejects(()=>db.query("SELECT dashboard_client_summary($1,$2,$3,$4,$5)",args),/permission denied/)
 } finally { await db.close() }
})
test("email queue persists frozen payload, deduplicates, leases, retries, reconciles and blocks ambiguous old sends", {timeout:90000}, async()=>{
 const db=await fixture()
 try {
  const payment=(await db.query("INSERT INTO payments(owner_id,client_id,amount,plan,payment_type) VALUES($1,$2,20,'One off','one_off') RETURNING id",[owner,client])).rows[0].id
  assert.equal((await db.query("SELECT receipt_requested_at FROM payments WHERE plan='before-queue'")).rows[0].receipt_requested_at,null)
  assert.equal((await db.query("SELECT unqueued_payment_receipts(3) receipts")).rows[0].receipts[0].payment.id,payment)
  const payload={from:"ISIPICI <sender@example.test>",to:"client@example.test",subject:"Receipt",html:"<p>Original</p>"}
  const enqueue=async(body=payload)=>(await db.query("SELECT enqueue_payment_receipt($1,$2,$3::jsonb,null) result",[owner,payment,JSON.stringify(body)])).rows[0].result
  const first=await enqueue();assert.equal((await db.query("SELECT unqueued_payment_receipts(3) receipts")).rows[0].receipts.length,0);const replay=await enqueue({...payload,html:"<p>Changed template</p>"});assert.equal(replay.id,first.id)
  await assert.rejects(()=>db.query("SELECT enqueue_payment_receipt($1,$2,$3::jsonb,null)",[other,payment,JSON.stringify(payload)]),/PAYMENT_OWNER_DENIED/)
  const claim=async(id=first.id,who=owner)=>(await db.query("SELECT * FROM claim_email_dispatch($1,$2)",[id,who])).rows
  assert.equal((await claim(first.id,other)).length,0)
  let job=(await claim())[0];assert.deepEqual(job.dispatch_payload,payload);assert.equal(job.dispatch_attempts,1);assert.equal((await claim()).length,0)
  const finish=async(token,provider,retry)=>(await db.query("SELECT finish_email_dispatch($1,$2,$3,$4,null) done",[first.id,token,provider,retry])).rows[0].done
  assert.equal(await finish("33333333-3333-4333-8333-333333333333",null,true),false)
  assert.equal(await finish(job.dispatch_token,null,true),true);assert.equal((await claim()).length,0)
  await db.query("UPDATE email_logs SET dispatch_available_at=now()-interval '1 second' WHERE id=$1",[first.id]);job=(await claim())[0]
  assert.equal(job.dispatch_attempts,2);assert.deepEqual(job.dispatch_payload,payload)
  await db.query("SELECT record_resend_event('early','resend-id','email.delivered',now(),null)")
  assert.equal(await finish(job.dispatch_token,"resend-id",false),true)
  await db.query("SELECT reconcile_resend_email('resend-id')")
  assert.equal((await db.query("SELECT delivery_status FROM email_logs WHERE id=$1",[first.id])).rows[0].delivery_status,"delivered")
  assert.equal((await claim()).length,0)
  const secondPayment=(await db.query("INSERT INTO payments(owner_id,client_id,amount,plan,payment_type) VALUES($1,$2,20,'One off','one_off') RETURNING id",[owner,client])).rows[0].id
  const second=(await db.query("SELECT enqueue_payment_receipt($1,$2,$3::jsonb,null) result",[owner,secondPayment,JSON.stringify(payload)])).rows[0].result
  const old=(await claim(second.id))[0]
  await db.query("UPDATE email_logs SET dispatch_lease_until=now()-interval '1 second' WHERE id=$1",[second.id])
  const recovered=(await claim(second.id))[0];assert.notEqual(recovered.dispatch_token,old.dispatch_token)
  assert.equal((await db.query("SELECT finish_email_dispatch($1,$2,'stale-provider',false,null) done",[second.id,old.dispatch_token])).rows[0].done,false)
  await db.query("UPDATE email_logs SET dispatch_first_attempt_at=now()-interval '24 hours',dispatch_lease_until=now()-interval '1 second' WHERE id=$1",[second.id])
  assert.equal((await claim(second.id)).length,0)
  assert.equal((await db.query("SELECT dispatch_state,delivery_status FROM email_logs WHERE id=$1",[second.id])).rows[0].dispatch_state,"review")
  await db.exec("SET ROLE anon");await assert.rejects(()=>db.query("SELECT * FROM email_logs"),/permission denied/);await assert.rejects(()=>claim(),/permission denied/)
 } finally { await db.close() }
})
