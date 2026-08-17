#!/usr/bin/env node
/**
 * model-health-sweep.mjs — replaces 6 originals (1,081 LOC)
 * Merged: capability-ledger(153) + check-safety(27) + circuit-state(513) +
 *         ledger-adapter(112) + ledger(274) + passive-events(255)
 */
'use strict'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __d = path.dirname(fileURLToPath(import.meta.url)), R = path.resolve(__d, '..')
let pass=0, fail=0
const ok=(a,m)=>{if(a){pass++;console.log(' ✓'+m)}else{fail++;console.error(' ✗'+m)}},
      eq=(a,b,m)=>ok(a===b,m), deep=(a,b,m)=>{try{assert.deepEqual(a,b);ok(true,m)}catch(e){ok(false,m+' '+e.message)}},
      th=(fn,m)=>{try{fn();ok(false,m+' expected throw')}catch{ok(true,m)}}
// ── capability-ledger ──────────────────────────────────────────────────────
console.log('\n=== capability-ledger ===')
import { buildCapabilityStatus } from '../scripts/build-model-capability-status.mjs'
const catalog={schemaVersion:2,models:[{id:'alpha',provider:'openai',path:'/kilo/v1',metadata:{name:'Alpha',supportsTools:true}},{id:'beta',provider:'openai',path:'/kilo/v1',metadata:{name:'Beta',supportsTools:true}},{id:'delta',provider:'openai',path:'/kilo/v1',metadata:{name:'Delta'}},{id:'gamma',provider:'openai',path:'/other/v1',metadata:{name:'Gamma'}},{id:'theta',provider:'openai',path:'/other/v1',metadata:{name:'Theta'}},{id:'zeta',provider:'openai',path:'/nomatch/v1',metadata:{name:'Zeta'}}]}
const health={schemaVersion:1,routers:[{name:'laptop',routes:[{provider:'kilo',route:'/kilo/v1',status:'catalog_visible',statusCode:200,modelIds:['alpha','beta']},{provider:'other',route:'/other/v1',status:'catalog_visible',statusCode:200,modelIds:['gamma']},{provider:'nomatch',route:'/nomatch/v1',status:'catalog_visible',statusCode:200,modelIds:['zeta']}]}]}
const ledger={schemaVersion:1,entries:{'laptop\u0000/kilo/v1\u0000alpha':{target:'laptop',route:'/kilo/v1',modelId:'alpha',deployability:'deployable',deployabilityReason:'fresh-chat-proven'},'laptop\u0000/kilo/v1\u0000beta':{target:'laptop',route:'/kilo/v1',modelId:'beta',deployability:'stale',deployabilityReason:'stale-evidence'},'laptop\u0000/kilo/v1\u0000delta':{target:'laptop',route:'/kilo/v1',modelId:'delta',deployability:'blocked',deployabilityReason:'route-blocked'},'laptop\u0000/other/v1\u0000gamma':{target:'laptop',route:'/other/v1',modelId:'gamma',deployability:'cooldown',deployabilityReason:'route-cooldown'},'laptop\u0000/other/v1\u0000theta':{target:'laptop',route:'/other/v1',modelId:'theta',deployability:'ready-unverified',deployabilityReason:'no-recent-chat-or-worker-proof'}}}
const st=buildCapabilityStatus({catalog,health,ledger})
const tFor=(s,id)=>{const e=s.entries.find(x=>x.modelId===id);assert.ok(e);assert.equal(e.targets.length,1);return e.targets[0]}
const a=tFor(st,'alpha'),b=tFor(st,'beta'),d=tFor(st,'delta'),g=tFor(st,'gamma'),theta=tFor(st,'theta'),z=tFor(st,'zeta')
eq(a.deployability,'deployable','alpha deployable');eq(a.deployabilityReason,'fresh-chat-proven','alpha reason')
eq(b.deployability,'stale','beta stale');eq(d.deployability,'blocked','delta blocked');eq(g.deployability,'cooldown','gamma cooldown');eq(theta.deployability,'ready-unverified','theta ready-unverified')
for(const s of[b,d,g,theta])ok(s.deployability!=='deployable',(s.modelId||s.target)+' not promoted')
eq(z.deployability,'unknown','zeta unknown');eq(z.deployabilityReason,'ledger-entry-missing','zeta reason')
for(const s of[a,b,d,g,theta,z]){ok('deployability' in s,s.target+' has deployability');ok(!('deployability' in s.capabilities),s.target+' deployability not in capabilities');ok(!('deployabilityReason' in s.capabilities),s.target+' reason not in capabilities')}
eq(a.capabilities.tool.status,'not-tested','alpha tool not-tested');eq(a.capabilities.catalog.status,'catalog-visible','alpha catalog visible')
eq(st.policy.declaredCapabilityNeverPromotesProof,true,'policy declaredCapabilityNeverPromotesProof')
eq(st.policy.ledgerDeployabilityProjectedNotPromoted,true,'policy ledgerDeployabilityProjectedNotPromoted')
eq(st.sources.ledgerProvided,true,'sources ledgerProvided');eq(st.sources.externalEvidenceProvided,false,'sources externalEvidenceProvided')
eq(st.policy.secretFree,true,'policy secretFree');ok(!JSON.stringify(st).includes('sk-'),'status no sk-')
for(const e of st.entries)for(const s of e.targets){ok(!('apiKey' in s)&&!('token' in s)&&!('secret' in s),'no secrets on '+s.target);ok(typeof s.deployability==='string','deployability is string');if(s.deployabilityReason!==null)ok(typeof s.deployabilityReason==='string','reason is string')}
const nl=buildCapabilityStatus({catalog,health});for(const e of nl.entries)for(const s of e.targets)ok(!('deployability' in s),'no deployability when no ledger')
eq(nl.sources.ledgerProvided,false,'noLedger sources')
const iv=buildCapabilityStatus({catalog:{...catalog,models:[catalog.models[0]]},health,ledger:{schemaVersion:1,entries:{'laptop\u0000/kilo/v1\u0000alpha':{target:'laptop',route:'/kilo/v1',modelId:'alpha',deployability:'not-a-verdict'}}}})
eq(iv.entries[0].targets[0].deployability,'unknown','invalid verdict→unknown');eq(iv.entries[0].targets[0].deployabilityReason,'ledger-deployability-invalid','invalid reason')
const wv=buildCapabilityStatus({catalog,health,ledger:{schemaVersion:2,entries:ledger.entries}})
for(const e of wv.entries)for(const s of e.targets)ok(!('deployability' in s),'non-sv1 ledger ignored')
// ── check-safety ───────────────────────────────────────────────────────────
console.log('\n=== check-safety ===')
const src=fs.readFileSync(path.join(R,'scripts/model-health-check.mjs'),'utf8')
ok(/smokeDelayMs\s*=\s*smokeDelayArg[\s\S]*?:\s*250\b/.test(src),'default smokeDelayMs=250')
ok(!/Math\.(max|min)\s*\([^)]*smokeDelay[^)]*\)/.test(src),'no floor on smokeDelayMs')
const ss=src.slice(src.indexOf('if (smoke) {'))
ok(/if\s*\(\s*smokeDelayMs\s*>\s*0\s*&&[\s\S]*?await\s+sleep\s*\(\s*smokeDelayMs\s*\)/.test(ss),'throttle gated by smokeDelayMs')
// ── circuit-state ──────────────────────────────────────────────────────────
console.log('\n=== circuit-state ===')
import {DEFAULT_CIRCUIT_POLICY,OUTCOME,PHASE,SCHEMA_VERSION,backoffForFailures,canProbe,circuitPhase,classifyOutcome,createCircuitState,getRouteState,initialRouteState,makeRouteKey,nextReady,nextReadyAt,parseRouteKey,planProbes,pruneCircuitState,recordProbeAttempt,recordProbeResult,resolvePolicy,summarizeCircuitState} from '../scripts/model-health-circuit-state.mjs'
const T0=new Date('2026-08-16T12:00:00.000Z').getTime()
const KA=makeRouteKey({target:'laptop',route:'/kilo/v1',modelId:'alpha'}),KB=makeRouteKey({target:'laptop',route:'/kilo/v1',modelId:'beta'})
const cl=v=>JSON.parse(JSON.stringify(v))
// 1
{const s=createCircuitState({now:T0});eq(s.schemaVersion,SCHEMA_VERSION,'sv');deep(s.routes,{},'empty routes');deep(cl(s),s,'serializable')
const r=initialRouteState(KA);eq(r.routeKey,KA,'routeKey');eq(r.phase,PHASE.CLOSED,'closed');eq(r.consecutiveFailures,0,'cf 0');eq(r.openUntil,null,'openUntil null');deep(cl(r),r,'route serializable');deep(parseRouteKey(KA),{target:'laptop',route:'/kilo/v1',modelId:'alpha'},'parseKey')}
// 2
{const s=createCircuitState({now:T0});const d=canProbe(s,{routeKey:KA,now:T0});eq(d.allowed,true,'probe allowed');eq(d.phase,PHASE.CLOSED,'phase closed');eq(d.reason,'closed','reason');eq(d.nextReadyAt,null,'nextReadyAt null');eq(d.waitMs,0,'waitMs 0');eq(nextReadyAt(s,KA),null,'nextReadyAt fn');eq(nextReady(s,{routeKey:KA,now:T0}).readyAt,T0,'nextReady');eq(getRouteState(s,KA).phase,PHASE.CLOSED,'getRouteState')}
// 3
{const s=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,outcome:'cooldown',statusCode:429,retryAfterMs:90000});const r=getRouteState(s,KA);eq(r.phase,PHASE.OPEN,'429 open');eq(r.lastOutcome,OUTCOME.COOLDOWN,'cooldown outcome');eq(r.lastRetryAfterMs,90000,'retryAfterMs');eq(r.openUntil,T0+90000,'openUntil')
const dur=canProbe(s,{routeKey:KA,now:T0+89999});eq(dur.allowed,false,'during blocked');eq(dur.reason,'circuit-open','reason');eq(dur.nextReadyAt,T0+90000,'nextReadyAt');eq(dur.waitMs,1,'waitMs 1')
const sh=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:429,retryAfterMs:1000});eq(getRouteState(sh,KA).openUntil,T0+DEFAULT_CIRCUIT_POLICY.baseBackoffMs,'short retry bounded')}
// 4
{const h=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:429,retryAfterMs:10*24*60*60*1000});eq(getRouteState(h,KA).lastRetryAfterMs,DEFAULT_CIRCUIT_POLICY.maxRetryAfterMs,'huge capped');eq(getRouteState(h,KA).openUntil,T0+DEFAULT_CIRCUIT_POLICY.maxOpenMs,'huge openUntil capped')
for(const bad of[-1,NaN,Infinity,'600000',null]){const n=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:429,retryAfterMs:bad});const r=getRouteState(n,KA);eq(r.lastRetryAfterMs,null,'bad retry null');eq(r.openUntil,T0+DEFAULT_CIRCUIT_POLICY.baseBackoffMs,'bad open base');eq(Number.isFinite(r.openUntil),true,'bad finite')}}
// 5
{const exp=[30e3,60e3,120e3,240e3,480e3,900e3,900e3];let s=createCircuitState({now:T0}),now=T0,obs=[];for(let i=0;i<exp.length;i++){s=recordProbeResult(s,{routeKey:KA,now,outcome:'error',statusCode:503});const r=getRouteState(s,KA);obs.push(r.openUntil-now);now=r.openUntil}
deep(obs,exp,'backoff seq');eq(backoffForFailures(1),30000,'bf1');eq(backoffForFailures(6),900000,'bf6');eq(backoffForFailures(500),DEFAULT_CIRCUIT_POLICY.maxBackoffMs,'bf500');eq(backoffForFailures(0),0,'bf0');eq(Number.isFinite(backoffForFailures(1e6)),true,'bf finite')}
// 6
{const s=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:503});const ou=getRouteState(s,KA).openUntil
eq(circuitPhase(s,{routeKey:KA,now:ou-1}),PHASE.OPEN,'before window');eq(circuitPhase(s,{routeKey:KA,now:ou}),PHASE.HALF_OPEN,'at window')
const tr=canProbe(s,{routeKey:KA,now:ou});eq(tr.allowed,true,'trial allowed');eq(tr.phase,PHASE.HALF_OPEN,'half-open');eq(tr.reason,'half-open-trial','reason')
const inf=recordProbeAttempt(s,{routeKey:KA,now:ou});const bl=canProbe(inf,{routeKey:KA,now:ou+5});eq(bl.allowed,false,'in-flight blocked');eq(bl.reason,'half-open-probe-in-flight','reason');eq(bl.nextReadyAt,ou+DEFAULT_CIRCUIT_POLICY.halfOpenProbeTimeoutMs,'nextReadyAt')
const af=canProbe(inf,{routeKey:KA,now:ou+DEFAULT_CIRCUIT_POLICY.halfOpenProbeTimeoutMs});eq(af.allowed,true,'after timeout');eq(af.reason,'half-open-trial','reason')}
// 7
{const op=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:503});const ou=getRouteState(op,KA).openUntil
const at=recordProbeAttempt(op,{routeKey:KA,now:ou});const cl2=recordProbeResult(at,{routeKey:KA,now:ou+10,outcome:'success',statusCode:200});const r=getRouteState(cl2,KA)
eq(r.phase,PHASE.CLOSED,'success close');eq(r.lastOutcome,OUTCOME.SUCCESS,'outcome');eq(r.consecutiveFailures,0,'cf 0');eq(r.consecutiveSuccesses,1,'cs 1');eq(r.backoffMs,0,'backoff 0');eq(r.openUntil,null,'openUntil null');eq(r.openedAt,null,'openedAt null');eq(r.halfOpenProbesInFlight,0,'flight 0')
eq(canProbe(cl2,{routeKey:KA,now:ou+10}).allowed,true,'probe ok');eq(getRouteState(recordProbeResult(cl2,{routeKey:KA,now:ou+20,statusCode:503}),KA).openUntil,ou+20+DEFAULT_CIRCUIT_POLICY.baseBackoffMs,'rebackoff')}
// 8
{const op=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:503});const ou=getRouteState(op,KA).openUntil
const rp=recordProbeResult(op,{routeKey:KA,now:ou,statusCode:503});const r=getRouteState(rp,KA);eq(r.phase,PHASE.OPEN,'reopen');eq(r.consecutiveFailures,2,'cf 2');eq(r.openUntil,ou+60000,'openUntil');eq(canProbe(rp,{routeKey:KA,now:ou+1}).allowed,false,'blocked')}
// 9
{const pol={openAfterFailures:2}
const f=recordProbeResult(createCircuitState({now:T0,policy:pol}),{routeKey:KA,now:T0,statusCode:503});eq(getRouteState(f,KA).phase,PHASE.CLOSED,'1st 5xx closed');eq(getRouteState(f,KA).consecutiveFailures,1,'cf 1');eq(canProbe(f,{routeKey:KA,now:T0}).allowed,true,'allowed')
const s2=recordProbeResult(f,{routeKey:KA,now:T0+1,statusCode:503});eq(getRouteState(s2,KA).phase,PHASE.OPEN,'2nd 5xx open');eq(canProbe(s2,{routeKey:KA,now:T0+1}).allowed,false,'blocked')
const rl=recordProbeResult(createCircuitState({now:T0,policy:pol}),{routeKey:KA,now:T0,statusCode:429});eq(getRouteState(rl,KA).phase,PHASE.OPEN,'429 opens')
const hb=recordProbeResult(createCircuitState({now:T0,policy:pol}),{routeKey:KA,now:T0,statusCode:403});const br=getRouteState(hb,KA);eq(br.phase,PHASE.OPEN,'403 open');eq(br.lastOutcome,OUTCOME.BLOCKED,'blocked');eq(br.openUntil,T0+DEFAULT_CIRCUIT_POLICY.blockedOpenMs,'blocked openUntil')}
// 10
{eq(classifyOutcome({statusCode:200}),OUTCOME.SUCCESS,'200');eq(classifyOutcome({outcome:'chat_ok',statusCode:200}),OUTCOME.SUCCESS,'chat_ok');eq(classifyOutcome({outcome:'vision-proven'}),OUTCOME.SUCCESS,'vision');eq(classifyOutcome({outcome:'success',statusCode:429}),OUTCOME.COOLDOWN,'success+429');eq(classifyOutcome({outcome:'rate_limited'}),OUTCOME.COOLDOWN,'rate_limited');eq(classifyOutcome({outcome:'timeout'}),OUTCOME.SERVER_ERROR,'timeout');eq(classifyOutcome({outcome:'empty-200',statusCode:200}),OUTCOME.SERVER_ERROR,'empty-200');eq(classifyOutcome({statusCode:404}),OUTCOME.BLOCKED,'404');eq(classifyOutcome({outcome:'mystery'}),OUTCOME.UNKNOWN_FAILURE,'mystery');eq(classifyOutcome({}),OUTCOME.UNKNOWN_FAILURE,'empty')
const u=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,outcome:'mystery'});eq(getRouteState(u,KA).phase,PHASE.OPEN,'mystery open');eq(getRouteState(u,KA).lastOutcome,OUTCOME.UNKNOWN_FAILURE,'mystery outcome')}
// 11
{const s=recordProbeResult(createCircuitState({now:T0}),{routeKey:KA,now:T0,statusCode:429,retryAfterMs:60000});eq(canProbe(s,{routeKey:KA,now:T0}).allowed,false,'A blocked');eq(canProbe(s,{routeKey:KB,now:T0}).allowed,true,'B allowed');deep(Object.keys(s.routes),[KA],'route-scoped')}
// 12
{let s=createCircuitState({now:T0});s=recordProbeResult(s,{routeKey:KA,now:T0,statusCode:503});s=recordProbeResult(s,{routeKey:KB,now:T0,statusCode:200});const b=cl(s)
canProbe(s,{routeKey:KA,now:T0+1});nextReady(s,{routeKey:KA,now:T0+1});nextReadyAt(s,KA);circuitPhase(s,{routeKey:KA,now:T0+1});getRouteState(s,KA);summarizeCircuitState(s,{now:T0+1});planProbes(s,{routeKeys:[KA,KB],now:T0+1});pruneCircuitState(s,{now:T0+1});recordProbeAttempt(s,{routeKey:KA,now:T0+1});recordProbeResult(s,{routeKey:KA,now:T0+1,statusCode:200})
deep(s,b,'state pure')}
// 13
{const build=()=>{let s=createCircuitState({now:T0});s=recordProbeResult(s,{routeKey:KA,now:T0,statusCode:429,retryAfterMs:45000});s=recordProbeAttempt(s,{routeKey:KB,now:T0+5});s=recordProbeResult(s,{routeKey:KB,now:T0+5,outcome:'success',statusCode:200});return s}
const f=build(),s2=build();deep(f,s2,'deterministic');deep(cl(f),f,'serializable');ok(!JSON.stringify(f).includes('undefined'),'no undefined');deep(canProbe(f,{routeKey:KA,now:T0+10}),canProbe(s2,{routeKey:KA,now:T0+10}),'canProbe same')
const rt=cl(f);deep(canProbe(rt,{routeKey:KA,now:T0+10}),canProbe(f,{routeKey:KA,now:T0+10}),'round-trip')}
// 14
{const host={schemaVersion:SCHEMA_VERSION,routes:{[KA]:{phase:PHASE.OPEN,openUntil:T0+60000,apiKey:'sk-secret-token-1234567890',authorization:'Bearer abc123def456ghi789',headers:{cookie:'session=abc123def456ghi789'}}}}
const nx=recordProbeResult(host,{routeKey:KA,now:T0+60000,outcome:'success',statusCode:200,apiKey:'sk-secret-token-1234567890',authorization:'Bearer abc123def456ghi789',body:{token:'sk-secret-token-1234567890'}})
const ser=JSON.stringify(nx);ok(!ser.includes('sk-secret-token'),'no sk-secret');ok(!ser.includes('abc123def456ghi789'),'no abc');ok(!ser.includes('apiKey'),'no apiKey');ok(!ser.includes('authorization'),'no auth')
deep(Object.keys(getRouteState(nx,KA)).sort(),Object.keys(initialRouteState(KA)).sort(),'keys match')
const bog={schemaVersion:SCHEMA_VERSION,routes:{[KA]:{phase:PHASE.OPEN,openUntil:null}}}
eq(canProbe(bog,{routeKey:KA,now:T0}).allowed,true,'bogus allows')}
// 15
{const s=createCircuitState({now:T0});th(()=>canProbe(s,{routeKey:KA}),'missing now');th(()=>canProbe(s,{routeKey:KA,now:NaN}),'NaN now');th(()=>canProbe(s,{routeKey:'',now:T0}),'empty key');th(()=>canProbe(s,{now:T0}),'missing key');th(()=>recordProbeResult(s,{routeKey:KA,statusCode:200}),'missing now result');th(()=>recordProbeAttempt(s,{routeKey:KA}),'missing now attempt');th(()=>summarizeCircuitState(s,{}),'empty opts');th(()=>makeRouteKey({target:'laptop',route:'/kilo/v1'}),'missing modelId');eq(parseRouteKey('not-a-composite-key'),null,'invalid parse')}
// 16
{let s=createCircuitState({now:T0});s=recordProbeResult(s,{routeKey:KA,now:T0,statusCode:429,retryAfterMs:120000});s=recordProbeResult(s,{routeKey:KB,now:T0+10,outcome:'success',statusCode:200})
const pl=planProbes(s,{routeKeys:[KB,KA,KB,'',null],now:T0+20});eq(pl.now,T0+20,'plan now');deep(pl.ready.map(r=>r.routeKey),[KB],'plan ready');deep(pl.suppressed.map(r=>r.routeKey),[KA],'plan suppressed');eq(pl.suppressed[0].nextReadyAt,T0+120000,'nextReadyAt');eq(pl.suppressed[0].reason,'circuit-open','reason');deep(cl(pl),pl,'plan serializable')
let tw=createCircuitState({now:T0});tw=recordProbeResult(tw,{routeKey:KB,now:T0+1,statusCode:200});tw=recordProbeResult(tw,{routeKey:KA,now:T0+2,statusCode:200})
deep(planProbes(tw,{routeKeys:[KA,KB],now:T0+3}).ready.map(r=>r.routeKey),[KB,KA],'LRP ordering')}
// 17
{let s=createCircuitState({now:T0});s=recordProbeResult(s,{routeKey:KA,now:T0,statusCode:429,retryAfterMs:600000});s=recordProbeResult(s,{routeKey:KB,now:T0,outcome:'success',statusCode:200})
const li=T0+48*60*60*1000;const pr=pruneCircuitState(s,{now:li,idleMs:24*60*60*1000});deep(Object.keys(pr.routes),[KA],'prune keeps suppressed')
const kt=pruneCircuitState(s,{now:T0+1,idleMs:24*60*60*1000});deep(Object.keys(kt.routes).sort(),[KA,KB].sort(),'prune keeps recent')
const cp=pruneCircuitState(s,{now:T0+1,maxRouteEntries:1,idleMs:24*60*60*1000});deep(Object.keys(cp.routes),[KA],'maxRouteEntries');deep(cl(pr),pr,'pruned serializable')}
// 18
{let s=createCircuitState({now:T0});s=recordProbeResult(s,{routeKey:KA,now:T0,statusCode:429,retryAfterMs:300000});s=recordProbeResult(s,{routeKey:KB,now:T0,outcome:'success',statusCode:200})
const sm=summarizeCircuitState(s,{now:T0+1});eq(sm.routeCount,2,'routeCount');eq(sm.phases.open,1,'open 1');eq(sm.phases.closed,1,'closed 1');eq(sm.phases['half-open'],0,'ho 0');eq(sm.soonestReadyAt,T0+300000,'soonest');eq(sm.soonestReadyRouteKey,KA,'key');deep(cl(sm),sm,'serializable')
const aw=summarizeCircuitState(s,{now:T0+300000});eq(aw.phases['half-open'],1,'after window ho');eq(aw.soonestReadyAt,null,'no soonest')}
// 19
{const rs=resolvePolicy({baseBackoffMs:1000,backoffFactor:0,maxBackoffSteps:9999,openAfterFailures:0});eq(rs.baseBackoffMs,1000,'base');eq(rs.backoffFactor,1,'factor');eq(rs.maxBackoffSteps,64,'steps');eq(rs.openAfterFailures,1,'of');ok(rs.maxOpenMs>=rs.maxBackoffMs,'maxOpen>=maxBackoff')
const ig=resolvePolicy({baseBackoffMs:'lots',maxBackoffMs:NaN,junk:1});eq(ig.baseBackoffMs,DEFAULT_CIRCUIT_POLICY.baseBackoffMs,'fallback base');eq(ig.maxBackoffMs,DEFAULT_CIRCUIT_POLICY.maxBackoffMs,'fallback max');eq(ig.junk,undefined,'junk undefined')
const st2=recordProbeResult(createCircuitState({now:T0,policy:{baseBackoffMs:5000}}),{routeKey:KA,now:T0,statusCode:503});eq(getRouteState(st2,KA).openUntil,T0+5000,'stored policy');eq(getRouteState(cl(st2),KA).openUntil,T0+5000,'after clone')}
// 20
{const csSrc=fs.readFileSync(path.join(R,'scripts/model-health-circuit-state.mjs'),'utf8')
const forbid=[/\bDate\s*\.\s*now\b/,/\bnew\s+Date\b/,/\bperformance\s*\.\s*now\b/,/\bsetTimeout\b/,/\bsetInterval\b/,/\bsetImmediate\b/,/\bqueueMicrotask\b/,/\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\brequire\s*\(/,/\bprocess\s*\.\s*env\b/,/\bawait\b/,/\basync\b/,/from\s+['"]node:(?:http|https|net|fs|child_process|dns|tls)['"]/ ,/\bMath\s*\.\s*random\b/]
for(const p of forbid)ok(!p.test(csSrc),'no '+p)}
// ── ledger-adapter ────────────────────────────────────────────────────────
console.log('\n=== ledger-adapter ===')
import {healthMatrixToLedgerInputs} from '../scripts/model-health-ledger-adapter.mjs'
import {buildLedger as bld} from '../scripts/model-health-ledger.mjs'
const NOW=new Date('2026-08-16T12:00:00.000Z').getTime(),oa='2026-08-16T11:59:00.000Z'
const mx={schemaVersion:1,generatedAt:oa,routers:[{name:'laptop',routes:[{provider:'kilo',route:'/kilo/v1',status:'catalog_visible',statusCode:200,modelIds:['alpha','beta','alpha'],retryAfterMs:null,error:null,smoke:[{model:'alpha',status:'chat_ok',statusCode:200,reasoningSeen:true,toolEvidence:false,contentPreview:'ok'},{model:'beta',status:'cooldown',statusCode:429,retryAfterMs:5000,error:'cooldown'}]},{route:'/broken/v1',status:'transport_error',statusCode:null,modelIds:['gamma'],smoke:[]}]},{name:'missing-routes'},{routes:[{route:'/ignored/v1',modelIds:['ignored']}]}]}
{const i=healthMatrixToLedgerInputs(mx);eq(i.catalog.length,3,'catalog 3');eq(i.routeHealth.length,3,'route 3');eq(i.dataPlaneChat.length,2,'chat 2');deep(i.catalog.map(x=>`${x.target}\u0000${x.route}\u0000${x.modelId}`),['laptop\u0000/kilo/v1\u0000alpha','laptop\u0000/kilo/v1\u0000beta','laptop\u0000/broken/v1\u0000gamma'],'keys');deep(i.catalog[0].modelIds,['alpha','beta'],'dedup')}
{const i=healthMatrixToLedgerInputs(mx);eq(i.catalog[0].status,'catalog-visible','catalog norm');eq(i.routeHealth[0].status,'catalog-visible','route norm');eq(i.dataPlaneChat[0].status,'chat-proven','chat proven');eq(i.dataPlaneChat[1].status,'cooldown','cooldown');eq(i.dataPlaneChat[1].retryAfterMs,5000,'retry');eq(i.dataPlaneChat[0].reasoningSeen,true,'reasoning');eq(i.dataPlaneChat[0].toolEvidence,false,'tool')}
{const lg=bld({...healthMatrixToLedgerInputs(mx),now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'deployable','alpha');eq(lg.entries['laptop\u0000/kilo/v1\u0000beta'].deployability,'cooldown','beta');eq(lg.entries['laptop\u0000/broken/v1\u0000gamma'].deployability,'unknown','gamma');eq(lg.entries['laptop\u0000/broken/v1\u0000gamma'].rails.routeHealth.error,'transport_error','error')}
{const i=healthMatrixToLedgerInputs({generatedAt:oa,routers:[{name:'laptop',routes:[{route:'/kilo/v1',status:'catalog_visible',modelIds:[],smoke:[{model:'explicit',status:'chat_ok'}]}]}]});eq(i.catalog.length,0,'no catalog');eq(i.routeHealth.length,0,'no route');eq(i.dataPlaneChat.length,1,'chat 1');eq(i.dataPlaneChat[0].modelId,'explicit','explicit')}
deep(healthMatrixToLedgerInputs(null),{catalog:[],routeHealth:[],dataPlaneChat:[]},'null');deep(healthMatrixToLedgerInputs({routers:[{name:'',routes:[{route:'/x',modelIds:['x']}]}]}),{catalog:[],routeHealth:[],dataPlaneChat:[]},'malformed')
{const sn=JSON.parse(JSON.stringify(mx));healthMatrixToLedgerInputs(mx);deep(mx,sn,'immutable')}
// ── ledger ─────────────────────────────────────────────────────────────────
console.log('\n=== ledger ===')
import {buildLedger} from '../scripts/model-health-ledger.mjs'
const mc=(t,r,m,st='catalog-visible',o=oa,ex={})=>({target:t,route:r,modelId:m,status:st,observedAt:o,...ex})
const mr=(t,r,m,st='catalog_visible',sc=200,o=oa,ex={})=>({target:t,route:r,modelId:m,status:st,statusCode:sc,observedAt:o,...ex})
const mch=(t,r,m,st='chat-proven',sc=200,o='2026-08-16T11:50:00.000Z',ex={})=>({target:t,route:r,modelId:m,status:st,statusCode:sc,observedAt:o,...ex})
const mw=(t,r,m,st='proven',o='2026-08-16T11:50:00.000Z',ex={})=>({target:t,route:r,modelId:m,status:st,observedAt:o,...ex})
const mc2=(t,r,m,st='vision-proven',o='2026-08-16T11:50:00.000Z',ex={})=>({target:t,route:r,modelId:m,status:st,observedAt:o,...ex})
// 1
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha','catalog-visible',oa,{modelIds:['alpha','beta']}),mc('laptop','/kilo/v1','beta','catalog-visible',oa,{modelIds:['alpha','beta']})],routeHealth:[mr('laptop','/kilo/v1','alpha'),mr('laptop','/kilo/v1','beta')],dataPlaneChat:[mch('laptop','/kilo/v1','alpha')],now:NOW})
eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].modelId,'alpha','modelId');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.status,'catalog-visible','ctrl');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.dataPlaneChat.status,'chat-proven','dpchat');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'deployable','deployable');eq(lg.entries['laptop\u0000/kilo/v1\u0000beta'].deployability,'ready-unverified','beta ready')}
// 2-8
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha',oa),mc('laptop','/kilo/v1','alpha','catalog-visible','2026-08-16T11:00:00.000Z')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.observedAt,oa,'newest wins')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha','mystery',200)],dataPlaneChat:[mch('laptop','/kilo/v1','alpha')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'unknown','unknown route')}
{const lg=buildLedger({routeHealth:[mr('laptop','/kilo/v1','alpha','error',429)],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'cooldown','429 cooldown')}
{const k='laptop\u0000/kilo/v1\u0000alpha',lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha')],manualOverrides:{[k]:{deployability:'deployable'}},now:NOW});eq(lg.entries[k].deployability,'ready-unverified','override suppress')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha','cooldown',429,'2026-08-16T10:00:00.000Z')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'stale','stale cooldown')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha','catalog-visible','2026-08-16T13:00:00.000Z')],routeHealth:[mr('laptop','/kilo/v1','alpha','catalog_visible',200,'2026-08-16T13:00:00.000Z')],dataPlaneChat:[mch('laptop','/kilo/v1','alpha','chat-proven',200,'2026-08-16T13:00:00.000Z')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'stale','future stale')}
{const lg=buildLedger({catalog:[null,{target:'laptop',route:'/kilo/v1'}],now:NOW});deep(Object.keys(lg.entries),[],'malformed no keys')}
// 9-17
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'ready-unverified','catalog-only')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha')],dataPlaneChat:[mch('laptop','/kilo/v1','alpha')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'deployable','fresh chat')}
{const old='2026-08-16T10:00:00.000Z',lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha','catalog-visible',old)],routeHealth:[mr('laptop','/kilo/v1','alpha','catalog_visible',200,old)],dataPlaneChat:[mch('laptop','/kilo/v1','alpha','chat-proven',200,old)],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'stale','TTL stale')}
{const lg=buildLedger({routeHealth:[mr('laptop','/kilo/v1','alpha','cooldown',429,oa,{retryAfterMs:1234})],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'cooldown','cooldown');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.routeHealth.retryAfterMs,1234,'retryAfterMs')}
{const lg=buildLedger({routeHealth:[mr('laptop','/kilo/v1','alpha','not_visible',404,oa)],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'blocked','404 blocked')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha','empty-200',200,oa)],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'degraded','empty-200')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha')],routeHealth:[mr('laptop','/kilo/v1','alpha')],workerProof:[mw('laptop','/kilo/v1','alpha','proven')],now:NOW});eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'deployable','worker proof')}
{const lg=buildLedger({catalog:[mc('laptop','/kilo/v1','alpha','catalog-visible',oa,{apiKey:'sk-secret-token',authorization:'Bearer abc123'})],routeHealth:[mr('laptop','/kilo/v1','alpha')],now:NOW});ok(!JSON.stringify(lg).includes('sk-secret-token'),'no secret');ok(!JSON.stringify(lg).includes('abc123'),'no abc');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.apiKey,undefined,'no apiKey');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.authorization,undefined,'no auth')}
{const ci=[mc('laptop','/kilo/v1','alpha')],ri=[mr('laptop','/kilo/v1','alpha')],chi=[mch('laptop','/kilo/v1','alpha')],wi=[mw('laptop','/kilo/v1','alpha')],cap=[mc2('laptop','/kilo/v1','alpha')]
buildLedger({catalog:ci,routeHealth:ri,dataPlaneChat:chi,workerProof:wi,capabilityProof:cap,now:NOW})
deep(ci,[mc('laptop','/kilo/v1','alpha')],'catalog immut');deep(ri,[mr('laptop','/kilo/v1','alpha')],'route immut');deep(chi,[mch('laptop','/kilo/v1','alpha')],'chat immut');deep(wi,[mw('laptop','/kilo/v1','alpha')],'worker immut');deep(cap,[mc2('laptop','/kilo/v1','alpha')],'capability immut')}
// ── passive-events ────────────────────────────────────────────────────────
console.log('\n=== passive-events ===')
import {normalizeWorkerEvents} from '../scripts/model-health-passive-events.mjs'
const SRC=fs.readFileSync(path.join(__d,'..','scripts/model-health-passive-events.mjs'),'utf8')
{eq(typeof normalizeWorkerEvents,'function','named fn');const m=await import('../scripts/model-health-passive-events.mjs');eq(typeof m.normalizeWorkerEvents,'function','export fn');eq(typeof m.default,'function','default fn');eq(m.default,m.normalizeWorkerEvents,'default=named')}
{ok(!SRC.includes('setTimeout'),'no setTimeout');ok(!SRC.includes('setInterval'),'no setInterval');ok(!SRC.includes('setImmediate'),'no setImmediate');ok(!SRC.includes('fetch('),'no fetch(');ok(!SRC.includes('fetch ('),'no fetch ');ok(!SRC.includes('XMLHttpRequest'),'no xhr');ok(!SRC.includes('writeFile'),'no writeFile');ok(!SRC.includes('appendFile'),'no appendFile');ok(!/require\(['"]node:fs['"]\)/.test(SRC),'no require fs');ok(!SRC.includes('fs'),'no fs')}
{const o=normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',source:'external_subagent',harness:'external_subagent',workerId:'w-1'});eq(o.length,1,'1 record');const p=o[0];eq(p.target,'laptop','target');eq(p.route,'/kilo/v1','route');eq(p.modelId,'alpha','modelId');eq(p.observedAt,'2026-08-16T11:50:00.000Z','observedAt');eq(p.status,'worker-proven','status');eq(p.source,'external_subagent','source');eq(p.harness,'external_subagent','harness');eq(p.directChatProof,false,'dc false');eq(p.workerId,'w-1','workerId')}
{const a={target:'laptop',route:'/kilo/v1',modelId:'a',status:'success',observedAt:'2026-08-16T11:50:00.000Z'},b={target:'phone',route:'/agnes/v1',model:'b',status:'completed',observedAt:'2026-08-16T11:51:00.000Z'},c={target:'laptop',route:'/kilo/v1',requested_model:'c',status:'done',observedAt:'2026-08-16T11:52:00.000Z'}
const o=normalizeWorkerEvents(a,[b,[c]]);eq(o.length,3,'3 records');deep(o.map(p=>p.modelId).sort(),['a','b','c'],'modelIds');eq(o.find(p=>p.modelId==='b').route,'/agnes/v1','nested route');eq(o.find(p=>p.modelId==='c').modelId,'c','requested_model')}
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',status:'settled',observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'no modelId')
eq(normalizeWorkerEvents({target:'laptop',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'no route')
eq(normalizeWorkerEvents({route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'no target')
eq(normalizeWorkerEvents(null,undefined,42,'worker',[1,2,3],{not:'an object but is'}).length,0,'malformed')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',headers:{authorization:'Bearer x'}}).length,0,'headers dropped')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',note:'sk-abcdefghijklmnop'}).length,0,'secret-like dropped')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'running',observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'running not proven')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'catalog_visible',observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'catalog_visible not proven')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'self-identified',observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'self-identified not proven')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',source:'chat',directChatProof:true}).length,0,'direct chat rejected')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'success',statusCode:500,observedAt:'2026-08-16T11:50:00.000Z'}).length,0,'non-2xx rejected')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'not-a-date'}).length,0,'unparseable date')
eq(normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',token:'sk-abcdefghijklmnop',password:'hunter2'}).length,0,'secrets drop record')
{const o=normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'completed',completedAt:'2026-08-16T11:50:00.000Z',source:'external_subagent'});eq(o.length,1,'1');eq(o[0].status,'worker-proven','completed→proven')}
{const o=normalizeWorkerEvents({target:'phone',route:'/agnes/v1',modelId:'beta',status:'success',observedAt:'2026-08-16T11:50:00.000Z',source:'worker-health',harness:'worker-health',sessionId:'s-9'});eq(o[0].source,'worker-health','source');eq(o[0].harness,'worker-health','harness');eq(o[0].sessionId,'s-9','sessionId')}
{const inp={target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',source:'external_subagent'},sn=JSON.parse(JSON.stringify(inp));normalizeWorkerEvents(inp);deep(inp,sn,'immutable')}
{const wp=normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'settled',observedAt:'2026-08-16T11:50:00.000Z',source:'external_subagent'})
const lg=buildLedger({catalog:[{target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'catalog-visible',observedAt:oa}],routeHealth:[{target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'catalog_visible',statusCode:200,observedAt:oa}],workerProof:wp,now:NOW})
eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.workerProof.status,'worker-proven','integration status');eq(lg.entries['laptop\u0000/kilo/v1\u0000alpha'].deployability,'deployable','integration deployable')
const wp2=normalizeWorkerEvents({target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'success',observedAt:'2026-08-16T11:50:00.000Z'})
const lg2=buildLedger({catalog:[{target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'catalog-visible',observedAt:oa}],routeHealth:[{target:'laptop',route:'/kilo/v1',modelId:'alpha',status:'catalog_visible',statusCode:200,observedAt:oa}],workerProof:wp2,now:NOW})
eq(lg2.entries['laptop\u0000/kilo/v1\u0000alpha'].deployabilityReason,'fresh-worker-proven','worker-only reason')}

console.log(`\n=== model-health-sweep COMPLETE ===`)
console.log(`Passed: ${pass}, Failed: ${fail}`)
if(fail===0){console.log('All assertions verified.');process.exit(0)}else{console.error(`${fail} failure(s)`);process.exit(1)}
