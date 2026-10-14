import {test} from 'node:test'
import assert from 'node:assert/strict'
import {loader} from './helpers/load-ts.mjs'
const client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333'
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const response=data=>({ok:true,status:200,json:async()=>data,headers:{get:()=> 'ARS'}})
function clock(){let now=0,id=0;const timers=new Map();return {setTimeout:(fn,delay)=>{const key=++id;timers.set(key,{at:now+delay,fn});return key},clearTimeout:key=>timers.delete(key),tick:ms=>{now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.fn()}}}}
function harness(file,fetch,extra={}){
 const timers=clock(),store=loader({}, {},timers)('src/lib/ui/toast-state.ts').createToastStore();const hooks=[];let index=0;let pending=[]
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i])
 const createElement=(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)})
 const react={default:{createElement},useState:init=>{const n=index++;if(!(n in hooks))hooks[n]=typeof init==='function'?init():init;return [hooks[n],value=>{hooks[n]=typeof value==='function'?value(hooks[n]):value}]},useRef:init=>{const n=index++;return hooks[n]??(hooks[n]={current:init})},useCallback:(fn,deps)=>{const n=index++;if(hooks[n]&&same(hooks[n].deps,deps))return hooks[n].value;hooks[n]={deps,value:fn};return fn},useMemo:(fn,deps)=>{const n=index++;if(hooks[n]&&same(hooks[n].deps,deps))return hooks[n].value;hooks[n]={deps,value:fn()};return hooks[n].value},useEffect:(fn,deps)=>{const n=index++,old=hooks[n];if(!old||!same(old.deps,deps)){hooks[n]={deps};pending.push(()=>{old?.cleanup?.();hooks[n].cleanup=fn()})}}}
 const load=loader({react,'./ToastProvider':{useToast:()=>store},'./ConfirmProvider':{useConfirm:()=>async()=>true},'./components/ConfirmProvider':{useConfirm:()=>async()=>true},'./InlineLoader':{default:'InlineLoader'},'./Modal':{default:'Modal'},'./PlanFields':{default:'PlanFields'},'./RangeCalendar':{default:'Calendar'},'./ClientSearchSelect':{default:'ClientPicker'},'./SubscriptionPanel':{default:'Subscription'},'react-feather':{},'next/dynamic':{default:()=> 'Dynamic'},'./components/ToastProvider':{useToast:()=>store},'./components/InlineLoader':{default:'InlineLoader'},'./components/TopBar':{default:'TopBar'},'./components/StatsGrid':{default:'StatsGrid'},'./components/ClientsTable':{default:'ClientsTable'},'./components/SearchBarAndTabs':{default:'Search'},'./components/ConfirmDialog':{default:'Confirm'},...extra},{},{React:react.default,fetch,AbortController,DOMException,crypto:globalThis.crypto,window:{location:{}},...timers})
 const Component=file?load(file).default:null
 const render=(props={})=>{index=0;pending=[];const tree=Component(props);pending.forEach(fn=>fn());return tree}
 const flush=async props=>{await new Promise(resolve=>setImmediate(resolve));return render(props)}
 const dispose=()=>{hooks.forEach(h=>h?.cleanup?.());store.dispose()}
 return {render,flush,dispose,toast:store,clock:timers,load,runHook:fn=>{index=0;pending=[];const result=fn();pending.forEach(fn=>fn());return result}}
}
const collect=(tree,predicate)=>!tree||typeof tree!=='object'?[]:[...(predicate(tree)?[tree]:[]),...(tree.children??[]).flatMap(c=>collect(c,predicate))]
const text=tree=>!tree?'':typeof tree==='string'?tree:typeof tree==='object'?(tree.children??[]).map(text).join(' '):''
const plan={id:other,name:'Premium',frequency:'monthly',prices:[{id:other,amount:15000,currency:'ARS',effective_from:'1900-01-01'}],subscriptions:0}
for(const [label,data,error] of [['empty',[],false],['data',[plan],false],['error',null,true]])test(`plans ${label}: loading never renders empty and success distinguishes data/error`,async()=>{
 const request=deferred(),h=harness('src/app/dashboard/components/PlansModal.tsx',()=>request.promise),props={onClose(){}}
 try{let tree=h.render(props);assert.doesNotMatch(text(tree),/Todavía no hay/);assert.equal(h.toast.getSnapshot().length,0);h.clock.tick(300);assert.equal(h.toast.getSnapshot()[0].type,'loading');
 request.resolve(error?{ok:false,status:503}:response(data));tree=await h.flush(props);assert.equal(/Todavía no hay/.test(text(tree)),label==='empty');if(label==='data')assert.match(text(tree),/Premium/);assert.equal(h.toast.getSnapshot().some(t=>t.type==='loading'),false);if(error)assert.equal(h.toast.getSnapshot()[0].type,'error')
 }finally{h.dispose()}
})
test('subscription loading has no absent agreement copy; successful absent agreement does',async()=>{
 const request=deferred(),h=harness('src/app/dashboard/components/SubscriptionPanel.tsx',()=>request.promise),props={clientId:client,onChanged(){}}
 try{assert.doesNotMatch(text(h.render(props)),/Sin suscripción/);request.resolve(response({current:null,agreements:[],installments:[],archivedAt:null,legacyDebt:0}));assert.match(text(await h.flush(props)),/Sin suscripción/)}finally{h.dispose()}
})
test('remote refresh keeps data, abort closes its own loader, and stale responses cannot replace a new key',async()=>{
 const requests=[],h=harness(null,()=>{const d=deferred();requests.push(d);return d.promise}),use=h.load('src/app/dashboard/components/useRemoteData.ts').useRemoteData
 const run=url=>h.runHook(()=>use(url,'Cargando...','No se pudo cargar.'))
 try{run('/a');requests[0].resolve(response(['known']));await new Promise(r=>setImmediate(r));let r=run('/a');assert.equal(r.data[0],'known');const pending=r.refresh();r=run('/a');assert.equal(r.data[0],'known');assert.equal(r.loading,true);h.clock.tick(300);assert.equal(h.toast.getSnapshot().some(t=>t.type==='loading'),true);
 r=run('/b');assert.equal(r.data,null);assert.equal(h.toast.getSnapshot().some(t=>t.type==='error'),false);requests[2].resolve(response(['new']));await new Promise(r=>setImmediate(r));requests[1].resolve(response(['old']));await pending;r=run('/b');assert.equal(r.data[0],'new');assert.equal(h.toast.getSnapshot().length,0)
 }finally{h.dispose()}
})
test('delayed GET never flashes on fast success; mutation updates the same id and remains until settled',()=>{
 const h=harness(null,async()=>response([]));try{const fast=h.toast.start('Cargando...',300);fast.close();h.clock.tick(300);assert.equal(h.toast.getSnapshot().length,0);const slow=h.toast.start('Cargando...',300);h.clock.tick(299);assert.equal(h.toast.getSnapshot().length,0);h.clock.tick(1);assert.equal(h.toast.getSnapshot()[0].id,slow.id);slow.close();assert.equal(h.toast.getSnapshot().length,0);
 const mutation=h.toast.start('Guardando...');h.clock.tick(10000);assert.equal(h.toast.getSnapshot()[0].type,'loading');mutation.success('Guardado.');assert.equal(h.toast.getSnapshot()[0].id,mutation.id);assert.equal(h.toast.getSnapshot().length,1);assert.equal(h.toast.getSnapshot()[0].type,'success');mutation.close();assert.equal(h.toast.getSnapshot().length,1);h.clock.tick(4000);assert.equal(h.toast.getSnapshot().length,0)
 const failed=h.toast.start('Guardando...');failed.error('No se pudo guardar.');assert.equal(h.toast.getSnapshot()[0].id,failed.id);assert.equal(h.toast.getSnapshot()[0].type,'error');h.clock.tick(6500);assert.equal(h.toast.getSnapshot().length,0)
 }finally{h.dispose()}
})
for(const fails of [false,true])test(`plan mutation ${fails?'error':'success'} disables action, settles one toast and restores UI`,async()=>{
 let posts=0;const mutation=deferred(),h=harness('src/app/dashboard/components/PlansModal.tsx',(_url,options)=>options?.method==='POST'?(posts++,mutation.promise):Promise.resolve(response([]))),props={onClose(){}}
 try{h.render(props);let tree=await h.flush(props);collect(tree,t=>t.type==='button'&&text(t)==='Nuevo plan')[0].props.onClick();tree=h.render(props);const inputs=collect(tree,t=>t.type==='input');inputs[0].props.onChange({target:{value:'Premium'}});inputs[1].props.onChange({target:{value:'15000'}});tree=h.render(props);const saving=tree.props.primaryAction.onClick();tree.props.primaryAction.onClick();assert.equal(posts,1);tree=h.render(props);assert.equal(tree.props.primaryAction.disabled,true);const id=h.toast.getSnapshot()[0].id;mutation.resolve(fails?{ok:false,status:400,json:async()=>({error:'SQL_SECRET'})}:response({ok:true}));await saving;tree=h.render(props);assert.equal(h.toast.getSnapshot()[0].id,id);assert.equal(h.toast.getSnapshot()[0].type,fails?'error':'success');assert.doesNotMatch(text(tree),/SQL_SECRET/);if(fails)assert.equal(tree.props.primaryAction.disabled,false)
 }finally{h.dispose()}
})
test('payment waits for both subscription/history, resolves recurring and ignores previous-client late response',async()=>{
 const req=[],h=harness('src/app/dashboard/components/NewPaymentModal.tsx',url=>{const d=deferred();req.push({url,...d});return d.promise}),props={clients:[{id:client,name:'A'},{id:other,name:'B'}],preselectedClientId:client,onClose(){},onCreated(){}}
 const select=t=>collect(t,x=>x.type==='select'&&x.children.some(c=>c?.props?.value==='one_off'))[0]
 const state=current=>({current,agreements:[],installments:[],archivedAt:null,legacyDebt:0})
 try{let tree=h.render(props);assert.equal(select(tree),undefined);assert.doesNotMatch(text(tree),/Crear suscripción/);req[0].resolve(response(state({id:other,status:'active',amount:50,currency:'ARS',provider:'manual',interval_unit:'month',interval_count:1,installments_enabled:true})));tree=await h.flush(props);assert.equal(select(tree),undefined);req[1].resolve(response([]));tree=await h.flush(props);assert.equal(select(tree).props.value,'recurring');
 select(tree).props.onChange({target:{value:'one_off'}});tree=h.render(props);collect(tree,t=>t.type==='Calendar')[0].props.onVisibleRangeChange({from:'2026-11-01',to:'2026-12-31'});tree=h.render(props);assert.equal(select(tree).props.value,'one_off');assert.equal(select(tree).props.disabled,true);
 collect(tree,t=>t.type==='ClientPicker')[0].props.onSelectClient(other);tree=h.render(props);assert.equal(select(tree),undefined);req[4].resolve(response(state(null)));req[5].resolve(response([]));tree=await h.flush(props);assert.equal(select(tree).props.value,'one_off');req[2].resolve(response(state({status:'active'})));req[3].resolve(response([]));tree=await h.flush(props);assert.equal(select(tree).props.value,'one_off');assert.equal(h.toast.getSnapshot().some(t=>t.type==='error'),false)
 }finally{h.dispose()}
})
test('dashboard initial clients load uses neutral metrics and table loading; successful empty is real',async()=>{
 const request=deferred(),h=harness('src/app/dashboard/page.tsx',()=>request.promise)
 try{let tree=h.render();assert.equal(collect(tree,t=>t.type==='StatsGrid')[0].props.available,false);assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.loading,true);request.resolve(response([]));tree=await h.flush();assert.equal(collect(tree,t=>t.type==='StatsGrid')[0].props.available,true);assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.loading,false)}finally{h.dispose()}
})

test('payment history failure never renders empty, and loaded history survives refresh',async()=>{
 const requests=[],h=harness('src/app/dashboard/components/ClientDetailModal.tsx',()=>{const d=deferred();requests.push(d);return d.promise}),props={client:{id:client,name:'A'},initialTab:'payments',onClose(){},onChanged(){}}
 try{let tree=h.render(props);assert.doesNotMatch(text(tree),/aún no tiene pagos/);requests[0].resolve({ok:false,status:503});tree=await h.flush(props);assert.doesNotMatch(text(tree),/aún no tiene pagos/);collect(tree,t=>t.type==='button'&&text(t)==='Reintentar')[0].props.onClick();requests[1].resolve(response([{id:other,amount:50,created_at:'2026-10-11',concept:'Known payment',currency:'ARS'}]));tree=await h.flush(props);assert.match(text(tree),/Known payment/);
 h.render({...props,initialTab:'emails'});tree=h.render({...props,initialTab:'emails'});assert.doesNotMatch(text(tree),/Todavía no se enviaron/);h.render(props);tree=h.render(props);assert.match(text(tree),/Known payment/);
 }finally{h.dispose()}
});
test('dashboard new category does not display another category snapshot',async()=>{
 const requests=[],h=harness('src/app/dashboard/page.tsx',()=>{const d=deferred();requests.push(d);return d.promise});try{h.render();requests[0].resolve(response([{id:client,name:'A',currentDebt:100,totalPaidThisMonth:50}]));let tree=await h.flush();collect(tree,t=>t.type==='Search')[0].props.onStatusChange('inactive');tree=h.render();assert.equal(collect(tree,t=>t.type==='StatsGrid')[0].props.available,false);assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.clients.length,0);assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.loading,true);requests[1].resolve(response([]));tree=await h.flush();assert.equal(collect(tree,t=>t.type==='StatsGrid')[0].props.totalClients,0)}finally{h.dispose()}
});
test('Snackbar exposes accessible status/alert and loading cannot dismiss or expire',()=>{
 const h=harness('src/app/dashboard/components/Snackbar.tsx',async()=>response([]));let closes=0;try{let tree=h.render({message:'Guardando...',type:'loading',onClose:()=>closes++});assert.equal(collect(tree,t=>t.props.role==='status')[0].props['aria-live'],'polite');assert.equal(collect(tree,t=>t.type==='button').length,0);assert.equal(collect(tree,t=>String(t.props['aria-hidden'])==='true').length,1);h.clock.tick(10000);assert.equal(closes,0);tree=h.render({message:'Error',type:'error',onClose:()=>closes++,managed:true});assert.equal(collect(tree,t=>t.props.role==='alert')[0].props['aria-live'],'assertive');assert.equal(collect(tree,t=>t.type==='button').length,1)}finally{h.dispose()}
});
test('concurrent loaders close independently and disposal clears delayed notifications',()=>{
 const h=harness(null,async()=>response([]));try{const first=h.toast.start('A',300),second=h.toast.start('B',300);h.clock.tick(300);first.close();assert.equal(h.toast.getSnapshot().length,1);assert.equal(h.toast.getSnapshot()[0].id,second.id);second.error('B failed');assert.equal(h.toast.getSnapshot()[0].id,second.id);h.toast.start('Delayed',300);h.toast.dispose();h.clock.tick(300);assert.equal(h.toast.getSnapshot().length,0)}finally{h.dispose()}
});

test('accepted client archive converts its loading toast into success',async()=>{
 const mutation=deferred(),row={id:client,name:'A',currentDebt:0,totalPaidThisMonth:0},h=harness('src/app/dashboard/page.tsx',(_url,options)=>options?.method==='DELETE'?mutation.promise:Promise.resolve(response([row])));try{h.render();let tree=await h.flush();collect(tree,t=>t.type==='ClientsTable')[0].props.onMenuAction('delete',row);await new Promise(r=>setImmediate(r));tree=h.render();const id=h.toast.getSnapshot()[0].id;mutation.resolve(response({}));tree=await h.flush();assert.equal(h.toast.getSnapshot()[0].id,id);assert.equal(h.toast.getSnapshot()[0].type,'success');assert.equal(h.toast.getSnapshot().some(t=>t.type==='loading'),false)}finally{h.dispose()}
});

test('ConfirmProvider store accepts, cancels, rejects concurrent opening and settles on unmount',async()=>{
 const store=loader()('src/lib/ui/confirm-state.ts').createConfirmStore(),options={title:'Archivar',confirmLabel:'Archivar'};const accepted=store.confirm(options);assert.equal(store.getSnapshot().title,'Archivar');assert.equal(await store.confirm(options),false);store.settle(true);assert.equal(await accepted,true);assert.equal(store.getSnapshot(),null);const cancelled=store.confirm(options);store.settle(false);assert.equal(await cancelled,false);const disposed=store.confirm(options);store.dispose();assert.equal(await disposed,false)
});
test('dashboard revisited tab uses its own cache immediately and refreshes it',async()=>{
 const requests=[],h=harness('src/app/dashboard/page.tsx',()=>{const d=deferred();requests.push(d);return d.promise}),active={id:client,name:'Active',currentDebt:0,totalPaidThisMonth:50},inactive={id:other,name:'Inactive',currentDebt:0,totalPaidThisMonth:0};try{h.render();requests[0].resolve(response([active]));let tree=await h.flush();collect(tree,t=>t.type==='Search')[0].props.onStatusChange('inactive');tree=h.render();assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.loading,true);requests[1].resolve(response([inactive]));tree=await h.flush();collect(tree,t=>t.type==='Search')[0].props.onStatusChange('active');tree=h.render();assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.clients[0].name,'Active');assert.equal(collect(tree,t=>t.type==='StatsGrid')[0].props.monthlyIncome,50);requests[2].resolve(response([{...active,name:'Refreshed'}]));tree=await h.flush();assert.equal(collect(tree,t=>t.type==='ClientsTable')[0].props.clients[0].name,'Refreshed')}finally{h.dispose()}
});
test('loaders appear immediately on first tab fetch and native dialogs are absent from product code',async()=>{
 const request=deferred(),h=harness('src/app/dashboard/components/ClientDetailModal.tsx',()=>request.promise);try{const tree=h.render({client:{id:client,name:'A'},initialTab:'payments',onClose(){},onChanged(){}});assert.equal(collect(tree,t=>t.type==='InlineLoader')[0].props.text,'Cargando historial...');assert.equal(h.toast.getSnapshot().length,0)}finally{h.dispose()}
 const {readdirSync,readFileSync}=await import('node:fs');const {join}=await import('node:path');const {default:ts}=await import('typescript');const visit=path=>{for(const entry of readdirSync(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())visit(file);else if(/\.[jt]sx?$/.test(file)){const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const scan=node=>{if(ts.isCallExpression(node)){const e=node.expression;assert.equal(ts.isIdentifier(e)&&['alert','prompt'].includes(e.text)||ts.isPropertyAccessExpression(e)&&ts.isIdentifier(e.expression)&&['window','globalThis'].includes(e.expression.text)&&['confirm','alert','prompt'].includes(e.name.text),false,file)}ts.forEachChild(node,scan)};scan(source)}}};visit('src');
});

test('CSV preview requires duplicate consent; retry keeps attempt and double-click cannot duplicate import',async()=>{
 const requests=[],saving=deferred(),preview={rows:[{row:2,values:{name:'Ana'},errors:[],duplicates:['Email existente']}],valid:1,invalid:0,duplicates:1,statusIgnored:false,ownerId:client}
 let imports=0,created=0
 const h=harness('src/app/dashboard/components/ClientCsvModal.tsx',(url,options)=>{
  requests.push({url,options})
  if(url.endsWith('/preview'))return Promise.resolve(response(preview))
  imports++;return imports===1?saving.promise:Promise.resolve(response({count:1,duplicate:true}))
 }),props={onClose(){},onImported(){created++}}
 try{
  let tree=h.render(props)
  collect(tree,t=>t.type==='input'&&t.props.type==='file')[0].props.onChange({target:{files:[{name:'clients.csv',size:50}]}})
  tree=h.render(props);assert.equal(tree.props.primaryAction.disabled,true)
  collect(tree,t=>t.type==='button'&&text(t)==='Analizar archivo')[0].props.onClick()
  tree=await h.flush(props);assert.deepEqual(collect(tree,t=>t.type==="p"&&text(t).includes("posibles duplicados"))[0].children.filter(c=>typeof c==="number"),[1,0,1]);assert.equal(tree.props.primaryAction.disabled,true)
  collect(tree,t=>t.type==='input'&&t.props.type==='checkbox')[0].props.onChange({target:{checked:true}})
  tree=h.render(props);assert.equal(tree.props.primaryAction.disabled,false)
  tree.props.primaryAction.onClick();tree.props.primaryAction.onClick();tree=await h.flush(props)
  assert.equal(imports,1);assert.equal(tree.props.primaryAction.disabled,true);assert.ok(h.toast.getSnapshot().some(t=>t.type==='loading'))
  saving.resolve({ok:false,status:503,json:async()=>({error:'Reintentá el mismo archivo'})})
  tree=await h.flush(props);assert.equal(tree.props.primaryAction.disabled,false)
  const attempt=requests.find(r=>!r.url.endsWith('/preview')).options.headers['x-import-id']
  tree.props.primaryAction.onClick();tree=await h.flush(props)
  assert.equal(imports,2);assert.equal(requests.at(-1).options.headers['x-import-id'],attempt)
  assert.equal(created,1);assert.equal(collect(tree,t=>t.props?.role==="status")[0].children[0],1);assert.match(text(tree),/clientes importados/);assert.equal(tree.props.primaryAction,undefined)
 }finally{h.dispose()}
})
