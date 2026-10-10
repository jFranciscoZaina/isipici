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
CREATE TABLE email_logs(id uuid PRIMARY KEY,owner_id uuid,client_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid REFERENCES owners(id),client_id uuid REFERENCES clients(id),amount numeric,plan text NOT NULL,discount numeric,debt numeric,period_from date,period_to date,next_payment_date date,created_at timestamptz DEFAULT now());
INSERT INTO owners(id) VALUES ('${owner}'),('${other}');
INSERT INTO clients(id,gym_id) VALUES ${ids.map((id,i)=>"('"+id+"','"+(i===11?other:owner)+"')").join(",")};GRANT ALL ON owners,clients,payments TO service_role;`);return db}

test("allocations: multi payments, discounts, partial, advance, same agreement editing and isolation",{timeout:90000},async()=>{
 const db=await fixture();try{
  for(const file of [...migrations,"20261014_dashboard_summary.sql","20261016_payment_allocations.sql"])await db.exec(readFileSync(new URL("../supabase/migrations/"+file,import.meta.url),"utf8"));
  await db.exec("SET ROLE service_role");const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const today=(await q("SELECT (now() AT TIME ZONE 'UTC')::date::text today"))[0].today;
  const date=(await q("SELECT ((now() AT TIME ZONE 'UTC')::date-14)::text d"))[0].d;
  const create=async(client,amount=50)=>(await q("SELECT subscription_lifecycle($1,$2,'create',$3::jsonb) r",[owner,client,JSON.stringify({frequency:"weekly",anchorDate:date,amount})]))[0].r;
  const rows=async(client)=>q("SELECT *,due_date::text d,public.installment_coverage(id) covered FROM recurring_installments WHERE client_id=$1 AND status<>'cancelled' ORDER BY due_date",[client]);
  const pay=async(client,selected,amount,discount=0,extra={})=>(await q("SELECT register_canonical_payment($1,$2::jsonb) r",[owner,JSON.stringify({...parsePayment({clientId:client,selectedInstallmentIds:selected,amount,discount,...extra}),currency:"ARS"})]))[0].r;
  const a=await create(ids[0]);await q("SELECT ensure_recurring_installments_through($1,$2,$3::date)",[owner,ids[0],today]);let r=await rows(ids[0]);assert.equal(r.length,3);
  const p=await pay(ids[0],r.map(i=>i.id),120);assert.equal(p.payment.recurring_installment_id,null);assert.equal((await q("SELECT count(*) n FROM payments WHERE client_id=$1",[ids[0]]))[0].n,1);
  assert.deepEqual((await rows(ids[0])).map(i=>[i.status,Number(i.covered)]),[["paid",50],["paid",50],["open",20]]);
  assert.equal((await q("SELECT count(*) n FROM payment_allocations WHERE payment_id=$1",[p.payment.id]))[0].n,3);
  await pay(ids[0],[r[2].id],20,10);assert.equal((await rows(ids[0]))[2].status,"paid");
  await assert.rejects(()=>pay(ids[1],[r[2].id],1),/PAYMENT_INSTALLMENT_DENIED/);
  await assert.rejects(()=>q("DELETE FROM payment_allocations WHERE payment_id=$1",[p.payment.id]),/ALLOCATION_IMMUTABLE/);
  await assert.rejects(()=>q("UPDATE payments SET amount=0 WHERE id=$1",[p.payment.id]),/INSTALLMENT_PAYMENT_IMMUTABLE/);
  await create(ids[1]);await q("SELECT ensure_recurring_installments_through($1,$2,$3::date)",[owner,ids[1],today]);r=await rows(ids[1]);
  await assert.rejects(()=>pay(ids[1],[r[2].id],50),/OLDER_INSTALLMENTS_REQUIRED/);
  const full=await pay(ids[1],r.map(i=>i.id),130,20);assert.equal(Number(full.payment.amount),130);assert.ok((await rows(ids[1])).every(i=>i.status==='paid'));
  assert.deepEqual((await q('SELECT a.amount_applied,a.discount_applied FROM payment_allocations a JOIN recurring_installments i ON i.id=a.recurring_installment_id WHERE a.payment_id=$1 ORDER BY i.due_date',[full.payment.id])).map(a=>[Number(a.amount_applied),Number(a.discount_applied)]),[[50,0],[50,0],[30,20]]);
  assert.equal(Number((await q('SELECT sum(amount) income FROM payments WHERE client_id=$1',[ids[1]]))[0].income),130);
  await create(ids[2]);r=await rows(ids[2]);await pay(ids[2],[r[0].id],20);assert.equal(Number((await rows(ids[2]))[0].covered),20);await q('SELECT register_canonical_payment($1,$2::jsonb)',[owner,JSON.stringify({...parsePayment({clientId:ids[2],recurringInstallmentId:r[0].id,amount:30}),currency:'ARS'})]);assert.equal((await rows(ids[2]))[0].status,'paid');
  await assert.rejects(()=>pay(ids[2],[r[0].id],1),/PAYMENT_INSTALLMENT_DENIED/);
  // Future cash does not count as debt. Pause preserves allocated periods and does not resume on payment.
  const future=(await q("SELECT ((now() AT TIME ZONE 'UTC')::date+21)::text d"))[0].d;
  const fa=(await q("SELECT subscription_lifecycle($1,$2,'create',$3::jsonb) r",[owner,ids[3],JSON.stringify({frequency:'weekly',anchorDate:future,amount:50})]))[0].r;
  r=await rows(ids[3]);await pay(ids[3],[r[0].id],20);assert.equal(Number((await q("SELECT current_debt FROM clients WHERE id=$1",[ids[3]]))[0].current_debt),0);
  await q("SELECT subscription_lifecycle($1,$2,'pause',$3::jsonb)",[owner,ids[3],JSON.stringify({agreementId:fa.agreementId})]);await pay(ids[3],[r[0].id],30);
  assert.equal((await q("SELECT status FROM recurring_agreements WHERE id=$1",[fa.agreementId]))[0].status,'paused');
  const before=await rows(ids[0]);const effective=(await q("SELECT ((now() AT TIME ZONE 'UTC')::date+7)::text d"))[0].d;
  await q("SELECT subscription_lifecycle($1,$2,'change',$3::jsonb)",[owner,ids[0],JSON.stringify({agreementId:a.agreementId,frequency:'monthly',amount:90,anchorDate:effective,planName:'Nuevo'})]);
  const edited=(await q("SELECT * FROM recurring_agreements WHERE id=$1",[a.agreementId]))[0];assert.equal(edited.status,'active');assert.equal(Number(edited.amount),90);assert.equal(edited.plan_name,'Nuevo');
  assert.deepEqual((await rows(ids[0])).slice(0,3),before);
  const calendar=(await q("SELECT recurring_calendar($1,$2,$3::date,$4::date) r",[owner,ids[0],today,effective]))[0].r;assert.ok(calendar.installments.length>=1);
  await assert.rejects(()=>q("SELECT recurring_calendar($1,$2,$3::date,$4::date)",[other,ids[0],today,effective]),/PAYMENT_OWNER_DENIED/);
  // Constraint paths are tested directly inside transactions, independently of the RPC.
  await create(ids[5]);const target=(await rows(ids[5]))[0];
  for(const [,allocationOwner,allocationClient,currency,amount,bonus] of [['owner',other,ids[5],'ARS',10,0],['client',owner,ids[1],'ARS',10,0],['currency',owner,ids[5],'AUD',10,0],['cash',owner,ids[5],'ARS',51,0],['discount',owner,ids[5],'ARS',0,1]]){
   await db.exec('BEGIN');const raw=(await q("INSERT INTO payments(owner_id,client_id,amount,discount,debt,plan,provider,currency,payment_type,recurring_agreement_id)VALUES($1,$2,50,0,0,'test','manual','ARS','recurring',$3) RETURNING id",[owner,ids[5],target.recurring_agreement_id]))[0];
   await assert.rejects(()=>q('INSERT INTO payment_allocations(owner_id,client_id,payment_id,recurring_installment_id,recurring_agreement_id,currency,amount_applied,discount_applied)VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[allocationOwner,allocationClient,raw.id,target.id,target.recurring_agreement_id,currency,amount,bonus]),/foreign key|OVERALLOCATION/);await db.exec('ROLLBACK');
  }
  await db.exec('BEGIN');const raw=(await q("INSERT INTO payments(owner_id,client_id,amount,discount,debt,plan,provider,currency,payment_type,recurring_agreement_id)VALUES($1,$2,50,0,0,'test','manual','ARS','recurring',$3) RETURNING id",[owner,ids[5],target.recurring_agreement_id]))[0];
  await q('INSERT INTO payment_allocations(owner_id,client_id,payment_id,recurring_installment_id,recurring_agreement_id,currency,amount_applied,discount_applied)VALUES($1,$2,$3,$4,$5,$6,20,0)',[owner,ids[5],raw.id,target.id,target.recurring_agreement_id,'ARS']);
  await assert.rejects(()=>db.exec('COMMIT'),/PAYMENT_ALLOCATION_INCOMPLETE/);await db.exec('ROLLBACK');
  const receipt=(await q("SELECT payment_receipt_allocations($1,$2) r",[owner,p.payment.id]))[0].r;assert.equal(receipt.length,3);
  await db.exec("RESET ROLE;SET ROLE anon");await assert.rejects(()=>q("SELECT * FROM payment_allocations"),/permission denied/);
 }finally{await db.close()}
});
test("allocations: safe legacy backfill, provider replay, future replacement and month-end edit",{timeout:90000},async()=>{
 const db=await fixture();try{
  for(const file of migrations)await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const dates=(await q("SELECT (now() AT TIME ZONE 'UTC')::date::text today,((now() AT TIME ZONE 'UTC')::date-14)::text past,((now() AT TIME ZONE 'UTC')::date+21)::text future,((now() AT TIME ZONE 'UTC')::date+35)::text later"))[0];
  const action=async(client,kind,input={})=>(await q('SELECT subscription_lifecycle($1,$2,$3,$4::jsonb) r',[owner,client,kind,JSON.stringify(input)]))[0].r;
  const create=(client,anchorDate=dates.past)=>action(client,'create',{frequency:'weekly',anchorDate,amount:50});
  const rows=client=>q("SELECT *,due_date::text d FROM recurring_installments WHERE client_id=$1 AND status<>'cancelled' ORDER BY due_date",[client]);
  const legacy=await create(ids[0]);let i=(await rows(ids[0]))[0];
  const lp=(await q('SELECT register_canonical_payment($1,$2::jsonb) r',[owner,JSON.stringify({...parsePayment({clientId:ids[0],recurringInstallmentId:i.id,amount:20}),currency:'ARS'})]))[0].r;
  for(const file of ['20261014_dashboard_summary.sql','20261016_payment_allocations.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  assert.equal(Number((await q('SELECT amount_applied FROM payment_allocations WHERE payment_id=$1',[lp.payment.id]))[0].amount_applied),20);
  assert.equal(Number((await q('SELECT installment_coverage($1) n',[i.id]))[0].n),20);
  const external=(input)=>(async()=>(await q('SELECT register_canonical_payment($1,$2::jsonb) r',[owner,JSON.stringify(input)]))[0].r)();
  const account='33333333-3333-4333-8333-333333333333';await q("INSERT INTO payment_provider_accounts(id,owner_id,provider,status,default_currency)VALUES($1,$2,'stripe','connected','ARS')",[account,owner]);
  await q("INSERT INTO recurring_agreements(owner_id,client_id,provider,status,amount,currency,interval_unit,interval_count,billing_anchor_date,next_charge_at,installments_enabled,payment_provider_account_id)VALUES($1,$2,'stripe','active',50,'ARS','week',1,$3::date,$3::date,true,$4) RETURNING id",[owner,ids[1],dates.past,account]);
  await q('SELECT ensure_recurring_installments_through($1,$2,$3::date)',[owner,ids[1],dates.today]);const pr=await rows(ids[1]);
  const pi=parsePayment({clientId:ids[1],selectedInstallmentIds:pr.map(i=>i.id),amount:100,provider:'stripe',providerAccountId:account,providerPaymentId:'multi-charge',currency:'ARS'},'provider');
  const first=await external(pi);assert.equal((await q('SELECT count(*) n FROM payment_allocations WHERE payment_id=$1',[first.payment.id]))[0].n,2);
  await action(ids[1],'archive');const replay=await external(pi);assert.equal(replay.payment.id,first.payment.id);assert.equal(replay.duplicate,true);
  for(const extra of [{amount:101},{receiptNote:'changed'},{selectedInstallmentIds:[pr[0].id]}])await assert.rejects(()=>external({...pi,...extra}),/PAYMENT_ID_CONFLICT/);
  await assert.rejects(()=>external({...pi,currency:'AUD'}),/PAYMENT_CURRENCY_CONFLICT/);await assert.rejects(()=>external({...pi,clientId:ids[11]}),/PAYMENT_OWNER_DENIED/);
  // Unallocated future obligation may be cancelled/replaced while retaining its immutable old row.
  const a=await create(ids[2],dates.future);const old=(await rows(ids[2]))[0];
  await action(ids[2],'change',{agreementId:a.agreementId,frequency:'weekly',amount:90,anchorDate:dates.future});
  assert.equal((await rows(ids[2]))[0].recurring_agreement_id,a.agreementId);assert.equal(Number((await rows(ids[2]))[0].amount_due),90);
  assert.equal((await q('SELECT status FROM recurring_installments WHERE id=$1',[old.id]))[0].status,'cancelled');
  // A future partial allocation blocks changing any configuration that would overlap that snapshot.
  const current=(await rows(ids[2]))[0];await external({...parsePayment({clientId:ids[2],selectedInstallmentIds:[current.id],amount:20}),currency:'ARS'});
  await assert.rejects(()=>action(ids[2],'change',{agreementId:a.agreementId,frequency:'monthly',amount:100,anchorDate:dates.future}),/PLAN_EFFECTIVE_DATE_PROTECTED/);
  const snapshot=(await rows(ids[2]))[0];await action(ids[2],'change',{agreementId:a.agreementId,frequency:'monthly',amount:100,anchorDate:dates.later});assert.deepEqual((await rows(ids[2]))[0],snapshot);
  // January 31 -> February 28 -> March 31 after editing the same agreement.
  const end='2027-01-31';const month=await create(ids[3],dates.future);await action(ids[3],'change',{agreementId:month.agreementId,frequency:'monthly',amount:75,anchorDate:end});
  await q('SELECT ensure_recurring_installments_through($1,$2,$3::date)',[owner,ids[3],'2027-03-31']);
  assert.deepEqual((await rows(ids[3])).filter(i=>i.d>=end).map(i=>i.d),['2027-01-31','2027-02-28','2027-03-31']);
  assert.equal((await q("SELECT count(*) n FROM recurring_agreements WHERE client_id=$1 AND status IN ('active','paused','pending')",[ids[3]]))[0].n,1);
  // Legacy debt must remain payable after a newer multi-allocation payment with a NULL legacy pointer.
  const legacyDebt=(await external({...parsePayment({clientId:ids[6],plan:'Legacy',amount:50,debt:30,periodFrom:dates.today,periodTo:dates.later}),currency:'ARS'})).payment;
  await action(ids[6],'create',{frequency:'monthly',amount:100,anchorDate:dates.future});
  const quota=(await rows(ids[6]))[0];await external({...parsePayment({clientId:ids[6],selectedInstallmentIds:[quota.id],amount:20}),currency:'ARS'});
  await external({...parsePayment({clientId:ids[6],plan:'Pago deuda',debtPaymentId:legacyDebt.id,amount:30}),currency:'ARS'});
  assert.equal(Number((await q('SELECT legacy_debt_amount FROM clients WHERE id=$1',[ids[6]]))[0].legacy_debt_amount),0);
  // The original legacy installment remains partial, and no one-off touches its snapshot.
  const before=(await q('SELECT to_jsonb(c) r FROM clients c WHERE id=$1',[ids[0]]))[0].r;
  for(let n=0;n<2;n++)await external({...parsePayment({clientId:ids[0],paymentType:'one_off',concept:'Event '+n,amount:30,periodFrom:dates.today,periodTo:dates.today}),currency:'ARS'});
  assert.deepEqual((await q('SELECT to_jsonb(c) r FROM clients c WHERE id=$1',[ids[0]]))[0].r,before);
  assert.equal((await q('SELECT status FROM recurring_agreements WHERE id=$1',[legacy.agreementId]))[0].status,'active');
 }finally{await db.close()}
});

test('one-off debt is stored independently of subscription balances and allocations',{timeout:90000},async()=>{
 const db=await fixture();try{
 for(const file of [...migrations,'20261014_dashboard_summary.sql','20261016_payment_allocations.sql','20261017_one_off_debt.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec('SET ROLE service_role');
 const date=(await db.query("SELECT ((now() AT TIME ZONE 'UTC')::date-7)::text d")).rows[0].d;
 await db.query("SELECT subscription_lifecycle($1,$2,'create',$3::jsonb)",[owner,ids[0],JSON.stringify({frequency:'weekly',anchorDate:date,amount:100})]);
 const snapshot=async()=>(await db.query('SELECT current_debt,next_payment_date,legacy_debt_amount FROM clients WHERE id=$1',[ids[0]])).rows[0];
 const before=await snapshot();
 const pay=async(debt,who=owner)=>(await db.query('SELECT register_canonical_payment($1,$2::jsonb) r',[who,JSON.stringify({...parsePayment({clientId:ids[0],paymentType:'one_off',concept:'Event',amount:50,discount:5,debt,periodFrom:date,periodTo:date}),currency:'ARS'})])).rows[0].r;
 const result=await pay(20);assert.equal(Number(result.payment.debt),20);assert.equal(Number(result.payment.amount),50);assert.equal(Number(result.payment.discount),5);
 assert.deepEqual(await snapshot(),before);assert.equal(result.payment.recurring_agreement_id,null);
 assert.equal((await db.query('SELECT count(*) n FROM payment_allocations WHERE payment_id=$1',[result.payment.id])).rows[0].n,0);
 assert.equal(Number((await pay(0)).payment.debt),0);await assert.rejects(()=>pay(10,other),/OWNER_DENIED/);
 await assert.rejects(()=>db.query('SELECT register_canonical_payment($1,$2::jsonb)',[owner,JSON.stringify({clientId:ids[0],paymentType:'one_off',concept:'Invalid',amount:50,debt:-1,currency:'ARS'})]),/PAYMENT_INPUT_INVALID/);
 }finally{await db.close()}
});
