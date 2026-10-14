import {auditMocks} from "./helpers/audit-mocks.mjs"
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {loader} from './helpers/load-ts.mjs'
const owner='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',plan='33333333-3333-4333-8333-333333333333'
const response={json:(body,options)=>({body,status:options?.status??200})}
test('plans API requires session, rejects browser authority and uses authenticated owner',async()=>{
 const calls=[];let signed=false;
 const route=loader({...auditMocks,'server-only':{},'next/server':{NextResponse:response},'@/lib/auth':{getSessionOwnerId:async()=>signed?owner:null},'@/lib/supabaseClient':{supabase:{rpc:async(name,args)=>{calls.push([name,args]);return args.p_input.planId?{error:{message:'PLAN_UNAVAILABLE'}}:{data:{ok:true,planId:plan}}}}}})('src/app/api/plans/route.ts');
 const req=input=>({json:async()=>input});assert.equal((await route.POST(req({action:'create'}))).status,401);assert.equal(calls.length,0);signed=true;
 const base={action:'create',name:'Monthly',frequency:'monthly',amount:50,effectiveFrom:undefined};
 for(const extra of [{owner_id:'foreign'},{currency:'AUD'},{amount:-1},{frequency:'daily'}])assert.equal((await route.POST(req({...base,...extra}))).status,400);
 assert.equal(calls.length,0);assert.equal((await route.POST(req(base))).status,200);assert.equal(calls[0][1].p_owner,owner);assert.equal(calls[0][1].p_input.currency,undefined);assert.equal(calls[0][1].p_input.effectiveFrom,"1900-01-01");
 const foreign=await route.POST(req({action:'archive',planId:plan}));assert.equal(foreign.status,409);assert.equal(foreign.body.error,'Plan no disponible');
});
test('plan subscription input ignores browser pricing and requires a catalog plan',async()=>{
 const calls=[];const service=loader({...auditMocks,'server-only':{},'@/lib/auth':{ownedClientColumn:async()=> 'owner_id'},'@/lib/supabaseClient':{supabase:{rpc:async(name,args)=>{calls.push(args);return {data:{ok:true}}}}}})('src/lib/payments/lifecycle.ts');
 await service.lifecycleOperation(owner,client,{action:'create',planId:plan,anchorDate:'2026-11-01',amount:1,frequency:'weekly'});
 assert.equal(calls[0].p_input.planId,plan);assert.equal(calls[0].p_input.amount,undefined);assert.equal(calls[0].p_input.frequency,undefined);
 await assert.rejects(()=>service.lifecycleOperation(owner,client,{action:'create',amount:1,frequency:'monthly',anchorDate:'2026-11-01'}));
});
function modalHarness(current){
 const createElement=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)});
 const hooks=[];let index=0;const effects=[];
 const react={default:{createElement},useState:init=>{const n=index++;if(!(n in hooks))hooks[n]=typeof init==='function'?init():init;return [hooks[n],next=>{hooks[n]=typeof next==='function'?next(hooks[n]):next}]},useRef:init=>{const n=index++;return hooks[n]??(hooks[n]={current:init})},useCallback:(fn,deps)=>{const n=index++,old=hooks[n];if(old&&deps.every((d,i)=>d===old.deps[i]))return old.fn;hooks[n]={deps,fn};return fn},useEffect:(fn,deps)=>{const n=index++,old=hooks[n];if(!old||deps.some((d,i)=>d!==old.deps[i])){old?.cleanup?.();hooks[n]={deps};effects.push(()=>{hooks[n].cleanup=fn()})}}};
 const state=()=>({current,agreements:current?[current]:[],installments:[],legacyDebt:0,legacyDebtPaymentId:null,archivedAt:null});
 const toast={start:()=>({close(){},success(){},error(){}})};
 const Component=loader({...auditMocks,react,'./ToastProvider':{useToast:()=>toast},'./InlineLoader':{default:'InlineLoader'},'./RangeCalendar':{default:'Calendar'},'./PlanFields':{default:'PlanFields'},'./ClientSearchSelect':{default:'ClientPicker'},'./Modal':{default:'Modal'}},{},{AbortController,DOMException,window:{location:{}},fetch:async url=>({status:200,ok:true,json:async()=>url.includes('/subscription')?state():[]})})('src/app/dashboard/components/NewPaymentModal.tsx').default;
 const props={clients:[{id:client,name:'Client',currency:'ARS'},{id:plan,name:'Other',currency:'ARS'}],preselectedClientId:client,onClose:()=>{},onCreated:()=>{}};
 const render=()=>{index=0;effects.length=0;const tree=Component(props);effects.forEach(fn=>fn());return tree};
 const flush=async()=>{render();await new Promise(resolve=>setImmediate(resolve));return render()};
 const collect=(tree,predicate)=>!tree||typeof tree!=='object'?[]:[...(predicate(tree)?[tree]:[]),...(tree.children??[]).flatMap(c=>collect(c,predicate))];
 const typeSelect=tree=>collect(tree,t=>t.type==='select'&&t.children.some(c=>c?.type==='option'&&c.props.value==='one_off'))[0];
 return {flush,render,collect,typeSelect,setCurrent:v=>current=v};
}
test('NewPaymentModal defaults by client once and preserves manual choice across navigation',async()=>{
 for(const status of ['active','paused','pending','cancelled','failed',null]){
  const h=modalHarness(status?{id:plan,status,amount:50,currency:'ARS',provider:'manual',installments_enabled:true,interval_unit:'month',interval_count:1}:null);
  let tree=await h.flush();assert.equal(h.typeSelect(tree).props.value,['active','paused','pending'].includes(status)?'recurring':'one_off');
  h.typeSelect(tree).props.onChange({target:{value:'one_off'}});tree=h.render();
  h.collect(tree,t=>t.type==='Calendar')[0].props.onVisibleRangeChange({from:'2026-11-01',to:'2026-12-31'});tree=await h.flush();assert.equal(h.typeSelect(tree).props.value,'one_off');
  h.setCurrent({id:plan,status:'paused',amount:50,currency:'ARS',provider:'manual',installments_enabled:true,interval_unit:'month',interval_count:1});
  h.collect(tree,t=>t.type==='ClientPicker')[0].props.onSelectClient(plan);tree=await h.flush();assert.equal(h.typeSelect(tree).props.value,'recurring');
 }
});

test('first recurring payment prefills plan amount and retains edits while navigating',async()=>{
 const h=modalHarness(null);let tree=await h.flush();h.typeSelect(tree).props.onChange({target:{value:'recurring'}});tree=h.render();
 const fields=h.collect(tree,t=>t.type==='PlanFields')[0];fields.props.onPlanId(plan);fields.props.onPrice(15000);tree=h.render();
 const inputs=()=>h.collect(tree,t=>t.type==='input'&&t.props.type==='number');assert.equal(inputs()[0].props.value,'15000');
 inputs()[0].props.onChange({target:{value:'10000'}});tree=h.render();
 h.collect(tree,t=>t.type==='Calendar')[0].props.onVisibleRangeChange({from:'2026-11-01',to:'2026-12-31'});tree=h.render();assert.equal(inputs()[0].props.value,'10000');
});
