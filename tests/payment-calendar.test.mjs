import {test} from "node:test"
import assert from "node:assert/strict"
import {loader} from "./helpers/load-ts.mjs"
const helpers=loader()("src/lib/payments/calendar.ts")
const base={recurring_agreement_id:"a",amount_due:50,currency:"ARS",status:"open",covered_amount:0,remaining:50,overdue:false,partially_paid:false}
const rows=[{...base,id:"1",due_date:"2026-10-01",period_from:"2026-10-01",period_to:"2026-10-07",status:"paid",remaining:0},{...base,id:"2",due_date:"2026-10-08",period_from:"2026-10-08",period_to:"2026-10-14"},{...base,id:"3",due_date:"2026-10-15",period_from:"2026-10-15",period_to:"2026-10-21",partially_paid:true,covered_amount:20,remaining:30},{...base,id:"4",due_date:"2026-10-22",period_from:"2026-10-22",period_to:"2026-10-28"}]
test("calendar derives paid, debt, partial, upcoming periods and oldest-first prefix selection",()=>{const periods=helpers.installmentPeriods(rows,false,"2026-10-10");assert.deepEqual(Array.from(periods,p=>p.status),["paid","debt","partial","upcoming"]);assert.equal(periods[0].selectable,false);assert.deepEqual(Array.from(helpers.toggleInstallment(rows,[],"4")),["2","3","4"]);assert.deepEqual(Array.from(helpers.toggleInstallment(rows,["2","3","4"],"3")),["2"]);assert.equal(helpers.periodMarkers(periods)["2026-10-19"],"partial");assert.equal(helpers.calendarWindow(new Date(2026,9,31)).to,"2026-11-30")})
test("two month component: multiple click selects covered period, paid is disabled, navigation updates horizon",()=>{
 const createElement=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})
 const state=[],effects=[];let index=0;const react={default:{createElement},useState:init=>{const n=index++;if(!(n in state))state[n]=typeof init==='function'?init():init;return [state[n],next=>{state[n]=typeof next==='function'?next(state[n]):next}]},useMemo:fn=>fn(),useEffect:fn=>effects.push(fn)};
 const Calendar=loader({react})("src/app/dashboard/components/RangeCalendar.tsx").default;
 let picked=null,range=null;const props={value:{from:new Date(2026,9,1)},onChange:()=>{},selectionMode:'multiple',periods:helpers.installmentPeriods(rows,false,"2026-10-10"),selectedIds:["3"],markers:{'2026-10-26':'payment_debt'},onSelectInstallment:id=>picked=id,onVisibleRangeChange:r=>range=r};
 const render=()=>{index=0;effects.length=0;const tree=Calendar(props);effects.forEach(fn=>fn());return tree};
 const collect=(tree,predicate)=>!tree||typeof tree!=='object'?[]:[...(predicate(tree)?[tree]:[]),...(tree.children??[]).flatMap(c=>collect(c,predicate))];
 let tree=render();assert.ok(collect(tree,t=>t.type==='div'&&t.children.includes('octubre de 2026')).length);assert.ok(collect(tree,t=>t.type==='div'&&t.children.includes('noviembre de 2026')).length);assert.equal(range.to,'2026-11-30');
 const day=n=>collect(tree,t=>t.type==='button'&&t.children.some(c=>c?.type==='span'&&c.children.includes(n)))[0];assert.equal(day(5).props.disabled,true);assert.ok(!day(5).props.className.includes('status-paid'));assert.ok(day(5).children.some(c=>c?.props?.className?.includes('status-paid')));assert.ok(day(10).children.some(c=>c?.props?.className?.includes('status-pending')));assert.ok(day(15).props.className.includes('bg-black'));assert.ok(!day(19).props.className.includes('bg-black'));assert.ok(!day(19).props.className.includes('status-pending'));assert.ok(day(19).children.some(c=>c?.props?.className?.includes('status-pending')));assert.ok(!day(25).props.className.includes('bg-black'));assert.ok(!day(25).props.className.includes('status-pending'));assert.ok(!day(25).children.some(c=>c?.props?.className?.includes('status-')));assert.ok(day(26).children.some(c=>c?.props?.className?.includes('status-payment-debt')));assert.ok(!day(26).props.className.includes('bg-black'));assert.equal(day(19).props['aria-pressed'],true);day(19).props.onClick();assert.equal(picked,'3');
 collect(tree,t=>t.type==='button'&&t.props['aria-label']==='Next month')[0].props.onClick();tree=render();assert.equal(range.from,'2026-11-01');assert.equal(range.to,'2026-12-31');
});
test("parser validates multiple IDs and rejects one-off allocations, duplicates and mixed schedules",()=>{const {parsePayment}=loader()("src/lib/payments/validation.ts");const client='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';assert.equal(parsePayment({clientId:client,selectedInstallmentIds:[id],amount:20}).selectedInstallmentIds[0],id);for(const extra of [{paymentType:'one_off',concept:'Event'},{selectedInstallmentIds:[id,id]},{frequency:'weekly',anchorDate:'2026-10-10'},{recurringInstallmentId:id}])assert.throws(()=>parsePayment({clientId:client,selectedInstallmentIds:[id],amount:20,...extra}))});

test('one-off history retains green and yellow markers, bounded dates and debt precedence',()=>{
 const window={from:'2026-10-01',to:'2026-11-30'};
 const markers=helpers.paymentHistoryMarkers([
 {payment_type:'one_off',period_from:'2026-09-01',period_to:'2026-10-05',debt:0},
 {payment_type:'one_off',period_from:'2026-10-03',period_to:'2026-10-04',debt:10},
 {payment_type:'one_off',period_from:'2026-10-03',period_to:'2026-10-04',debt:0},
 {payment_type:'one_off',created_at:'2026-10-15T12:00:00Z',debt:0},
 {payment_type:'recurring',period_from:'2026-10-20',period_to:'2026-10-22',debt:0}
 ],window);
 assert.equal(markers['2026-09-30'],undefined);assert.equal(markers['2026-10-01'],'paid');
 assert.equal(markers['2026-10-03'],'payment_debt');assert.equal(markers['2026-10-15'],'paid');assert.equal(markers['2026-10-20'],undefined);
});
