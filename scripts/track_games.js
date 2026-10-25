#!/usr/bin/env node
'use strict';
// Persistent forward-only stage-one audit. No external npm packages.
// Historical S01–S10 classifications are EXECUTED FROM index.html, rather than reimplemented.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const TRACK_FILE = path.join(ROOT, 'data/tracking/season-2026.json');
const CURRENT_FILE = path.join(ROOT, 'data/current-season.json');
const SOURCE = 'https://api-web.nhle.com/v1';
const SEASON = '2026-27';
const FINAL = new Set(['FINAL', 'OFF']);
const TZ = 'America/Toronto';
const ID_PATTERN = /^202602\d{4}$/;

function torontoDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(value);
}
function torontoParts(value) {
  const p = new Intl.DateTimeFormat('en-US', {timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
    .formatToParts(value);
  return Object.fromEntries(p.map(x=>[x.type,x.value]));
}
function isoDayBefore(day, offset=1) {
  return new Date(Date.parse(day+'T12:00:00Z')-offset*86400000).toISOString().slice(0,10);
}
function activeSlateDate(now) {
  const p=torontoParts(now);
  const d=`${p.year}-${p.month}-${p.day}`;
  return Number(p.hour)<2 ? isoDayBefore(d) : d;
}
function assert(cond,msg){if(!cond)throw Error(msg);}
function loadJson(file) {return JSON.parse(fs.readFileSync(file,'utf8'));}
function loadModel(htmlPath=path.join(ROOT,'index.html')) {
  const html=fs.readFileSync(htmlPath,'utf8');
  const encoded=(id)=>html.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>'))?.[1];
  const bundle=encoded('bundled-data'), snapshot=encoded('oct25-summary');
  assert(bundle&&snapshot,'SCULLY original historical research block missing');
  const src=html.match(/<script>\s*'use strict';([\s\S]*?)<\/script><\/body>/)?.[1];
  assert(src,'SCULLY application code not found');
  // Browser initialization follows the model functions. Cut BEFORE registration / UI startup.
  const marker='for(const [id,def] of [[';
  const i=src.indexOf(marker);
  assert(i>0,'Cannot isolate existing SCULLY calculations; browser source structure changed');
  const stubs={getElementById(id){if(id==='bundled-data')return {textContent:bundle};if(id==='oct25-summary')return {textContent:snapshot};throw Error('Unexpected DOM access: '+id);},querySelectorAll(){return []}};
  const ctx=vm.createContext({document:stubs,console,Math,Date});
  vm.runInContext("'use strict';"+src.slice(0,i),ctx,{timeout:20000});
  // Evaluating the actual browser functions preserves EXACT scenario priority and green CI cutoff.
  const classify=(rows,attack,defense,window='season')=> {
    ctx.AUDIT_ROWS=rows;ctx.AUDIT_ATTACK=attack;ctx.AUDIT_DEFENSE=defense;ctx.AUDIT_WINDOW=window;
    return vm.runInContext(`(function(){const p=profiles(AUDIT_ROWS,AUDIT_WINDOW),required=AUDIT_WINDOW==='season'?5:Number(AUDIT_WINDOW);if(Object.keys(p).length!==32||Object.values(p).some(v=>v.games<required))return {classif:'GREY',chosen:null,match:[],reason:'Insufficient league-wide pregame sample for this window'};return screen(AUDIT_ATTACK,AUDIT_DEFENSE,AUDIT_WINDOW,p,ranks(p))})()`,ctx,{timeout:15000});
  };
  const project=(rows,attack,defense,home)=>{
    ctx.AUDIT_ROWS=rows;ctx.AUDIT_ATTACK=attack;ctx.AUDIT_DEFENSE=defense;ctx.AUDIT_HOME=home;
    try{
      // Same Stage 2 projection, trained ONLY on earlier dates, venue applied exactly once.
      const out=vm.runInContext(`(function(){current=AUDIT_ROWS;usingSnapshot=false;currentFit.season=calcFit(AUDIT_ROWS,'season');const p=projection(AUDIT_ATTACK,AUDIT_DEFENSE,'season',AUDIT_HOME);return {shots:p.mu,neutral:p.neutral,venueDelta:p.venueDelta,method:p.fit.method,modelChoice:p.fit.trained?'regression':'shot-rate'}})()`,ctx,{timeout:25000});
      if(!Number.isFinite(out.shots)||out.shots<=0)return {shots:null,reason:'Invalid model output'};
      return JSON.parse(JSON.stringify(out));
    }catch(e){return {shots:null,reason:'No reliable Stage 2 projection: '+e.message};}
  };
  return {classify,project,teams:vm.runInContext('Object.keys(TEAMS)',ctx),historicalVersion:'2025-26 fixed S01-S10',modelVersion:'SCULLY v1.3',rules:'index.html original Stage 1 source'};
}
function gameFromNhl(g,expectedDay){
  const gameId=String(g.id||'');
  if(!ID_PATTERN.test(gameId) || g.gameType!==2 && String(g.gameType)!=='2')return null;
  const home=String(g.homeTeam?.abbrev||'').toUpperCase();
  const away=String(g.awayTeam?.abbrev||'').toUpperCase();
  const date=String(g.gameDate||expectedDay).slice(0,10);
  const start=String(g.startTimeUTC||'');
  if(!home||!away||home===away||!/^\d{4}-\d\d-\d\dT/.test(start) || !Number.isFinite(Date.parse(start)))return null;
  return {gameId,date,home,away,startTimeUTC:start,state:String(g.gameState||'UNKNOWN'),nhl:g};
}
function validSchedule(api,day){
  assert(api&&Array.isArray(api.games),'NHL score response did not contain game list for '+day);
  const games=api.games.map(g=>gameFromNhl(g,day)).filter(Boolean);
  if(api.games.some(g=>Number(g.gameType)===2) && !games.length)throw Error('NHL score response contained regular-season games in an unrecognized format');
  const uniques=new Set();for(const g of games){assert(!uniques.has(g.gameId),'Duplicate game ID');uniques.add(g.gameId);}
  return games;
}
async function getJson(url,fetchImpl=fetch) {
  let err;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetchImpl(url,{headers:{'Accept':'application/json','User-Agent':'SCULLY-Research/1.3 (personal, noncommercial)'},signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error('HTTP '+r.status+' from '+url);
      const obj=await r.json();assert(obj && typeof obj==='object','Invalid JSON');return obj;
    }catch(e){err=e;}
  }
  throw Error('NHL download unavailable: '+err.message);
}
function pregameRows(dataset,gameDate){
  assert(dataset&&Array.isArray(dataset.columns)&&Array.isArray(dataset.current),'Invalid MoneyPuck JSON structure');
  const dateIdx=dataset.columns.indexOf('gameDate');
  const situationIdx=dataset.columns.indexOf('situation');
  assert(dateIdx>=0&&situationIdx>=0,'MoneyPuck missing game date/situation');
  const cutoff=gameDate.replaceAll('-','');
  return dataset.current.filter(r=>String(r[dateIdx])<cutoff).map(r=>Object.fromEntries(dataset.columns.map((key,i)=>[key,r[i]])));
}
function defaultStore(){return {schema:1,season:SEASON,source:'NHL Web API + frozen SCULLY Stage 1',activationDate:null,slates:{},records:{},missed:{}};}
function normaliseStore(input){
  const d=input || defaultStore();
  assert(d.schema===1 && d.season===SEASON && typeof d.records==='object'&&d.records!==null && typeof d.slates==='object','Unsupported tracking JSON');
  d.missed ||= {};
  return d;
}
function recordKey(store,g,attack){
  const base=g.gameId+'|'+attack;
  const old=store.records[base];
  // If NHL reschedules the same official game ID to a new day, preserve the prior postponed snapshot.
  return old&&old.shotStatus==='POSTPONED'&&old.gameDate!==g.date ? base+'|'+g.date : base;
}
function freezeRecord({g,attack,defense,result,projection,now,sourceDate,window='season',recordId}){
  assert(Date.parse(g.startTimeUTC)>now.getTime(),'Cannot create prediction at/after puck drop');
  const decision=['GREEN','YELLOW','RED','GREY'].includes(result.classif)?result.classif:'GREY';
  return {
    recordId:recordId||g.gameId+'|'+attack,gameId:g.gameId,gameDate:g.date,
    home:g.home,away:g.away,attack,defense,startTimeUTC:g.startTimeUTC,
    snapshotUTC:now.toISOString(),dataThrough:sourceDate,window,modelVersion:'SCULLY v1.3',
    classif:decision,scenario:result.chosen||null,qualifyingScenarios:Array.from(result.match||[]),
    reason:result.reason||null,historicalSample:result.h?.n??null,
    historical35Rate:result.h?.p_35??null,
    projectedShots:projection?.shots??null,projectionMethod:projection?.method??null,
    projectionReason:projection?.reason||null,shotStatus:'PENDING',actualShots:null,
    officialState:null,gradedAt:null
  };
}
function gradeRecord(rec,shots,now,gameState){
  assert(FINAL.has(gameState),'Game not official final');
  assert(Number.isInteger(shots)&&shots>=0&&shots<=100,'Unverified final SOG');
  if(rec.shotStatus==='FINAL'){
    assert(rec.actualShots===shots,'Official shots changed after grading; preserve original and flag for manual review');
    return false;
  }
  rec.shotStatus='FINAL';rec.actualShots=shots;rec.officialState=gameState;rec.gradedAt=now.toISOString();
  rec.reached=Object.fromEntries([25,30,35,40].map(n=>[String(n),shots>=n]));
  return true;
}
function shotTotals(box,g){
  assert(FINAL.has(String(box.gameState||g.state)),'Boxscore game not final');
  const h=box.homeTeam?.sog,a=box.awayTeam?.sog;
  assert(Number.isInteger(h)&&Number.isInteger(a)&&h>=0&&a>=0&&h<=100&&a<=100,'Boxscore missing official final team shots');
  if(Number.isInteger(g.nhl.homeTeam?.sog)&&Number.isInteger(g.nhl.awayTeam?.sog))
    assert(g.nhl.homeTeam.sog===h&&g.nhl.awayTeam.sog===a,'Scoreboard/boxscore shot totals disagree');
  return {[g.home]:h,[g.away]:a};
}
async function updateStore({store=defaultStore(),dataset,now=new Date(),fetchImpl=fetch,model=loadModel(),lookback=5}){
  const d=normaliseStore(store),active=activeSlateDate(now),checks=new Set([active]);
  for(let i=1;i<=lookback;i++)checks.add(isoDayBefore(active,i));
  for(const r of Object.values(d.records))if(r.shotStatus!=='FINAL')checks.add(r.gameDate);
  const dateColumn=dataset.columns.indexOf('gameDate');
  const sourceDate=String(dataset.current.length?Math.max(...dataset.current.map(r=>Number(r[dateColumn])).filter(Number.isFinite)):0);
  let changed=false,seen=0,created=0,graded=0,missed=0;
  if(!d.activationDate){d.activationDate=active;changed=true;}
  for(const day of [...checks].sort()){
    const api=await getJson(`${SOURCE}/score/${day}`,fetchImpl);
    const games=validSchedule(api,day).filter(g=>g.date===day);
    const snapshot= d.slates[day] || {date:day,gameIds:[],checkedAt:null};
    const ids=games.map(g=>g.gameId).sort();
    if(JSON.stringify(snapshot.gameIds)!==JSON.stringify(ids)){
      snapshot.gameIds=ids;changed=true;
    }
    if(!d.slates[day]){d.slates[day]=snapshot;changed=true;}
    for(const g of games){
      seen++;
      const fresh=now.getTime()<Date.parse(g.startTimeUTC)-60000;
      const rows=fresh?pregameRows(dataset,g.date):null;
      for(const [attack,defense] of [[g.home,g.away],[g.away,g.home]]){
        if(!model.teams.includes(attack)||!model.teams.includes(defense))continue;
        const id=recordKey(d,g,attack);
        if(!d.records[id]&&fresh){
          let s,proj;
          const sourceDay=sourceDate.length===8?sourceDate.slice(0,4)+'-'+sourceDate.slice(4,6)+'-'+sourceDate.slice(6,8):'';
          const stale=!sourceDay || (Date.parse(g.date+'T12:00:00Z')-Date.parse(sourceDay+'T12:00:00Z'))>4*86400000;
          try{s=stale?{classif:'GREY',match:[],reason:'MoneyPuck verified game logs are over four calendar days old; screening paused'}:model.classify(rows,attack,defense,'season');}catch(e){s={classif:'GREY',match:[],reason:'Pregame screening unavailable: '+e.message};}
          if(s.classif!=='GREY')proj=model.project(rows,attack,defense,g.home);
          d.records[id]=freezeRecord({g,attack,defense,result:s,projection:proj,now,sourceDate,recordId:id});
          changed=true;created++;
        }
        if(!d.records[id] && !fresh && g.date>=d.activationDate && !d.missed[id]){
          // Explicitly label missing pregame coverage rather than manufacturing a retrospective green result.
          d.missed[id]={gameId:g.gameId,gameDate:g.date,attack,defense,reason:'No frozen prediction before puck drop'};
          missed++;changed=true;
        }
      }
      if(FINAL.has(g.state)){
        const targets=[[recordKey(d,g,g.home),g.home],[recordKey(d,g,g.away),g.away]];
        if(targets.some(([id])=>d.records[id]&&d.records[id].shotStatus==='PENDING')){
          try{
            const box=await getJson(`${SOURCE}/gamecenter/${g.gameId}/boxscore`,fetchImpl);
            const totals=shotTotals(box,g);
            for(const [id,team] of targets){if(d.records[id]&&gradeRecord(d.records[id],totals[team],now,g.state)){graded++;changed=true;}}
          }catch(e){console.warn('Result awaiting verification for game '+g.gameId+': '+e.message);}
        }
      }else if(['POST','PPD','CANCELLED','SUSP'].includes(g.state)){
        for(const team of [g.home,g.away]){
          const rec=d.records[recordKey(d,g,team)];
          if(rec&&rec.shotStatus==='PENDING'){
            rec.shotStatus='POSTPONED';rec.officialState=g.state;changed=true;
          }
        }
      }
    }
  }
  return {store:d,changed,stats:{created,graded,missed,seen,active,sourceDate}};
}
async function main(){
  const now=new Date(),old=fs.existsSync(TRACK_FILE)?loadJson(TRACK_FILE):defaultStore();
  const ds=loadJson(CURRENT_FILE);
  // A valid download is necessary for fresh pregame snapshots; model integrity over completeness.
  assert(ds.columns.includes('gameDate')&&ds.columns.includes('shotsOnGoalFor'),'MoneyPuck model dataset incomplete');
  const result=await updateStore({store:old,dataset:ds,now});
  if(result.changed){fs.mkdirSync(path.dirname(TRACK_FILE),{recursive:true});fs.writeFileSync(TRACK_FILE,JSON.stringify(result.store,null,2)+'\n');}
  console.log(JSON.stringify({...result.stats,changed:result.changed,records:Object.keys(result.store.records).length}));
}
if(require.main===module){main().catch(e=>{console.error('SCULLY tracker aborted; previous records retained: '+e.stack);process.exitCode=1;});}
module.exports={loadModel,torontoDate,torontoParts,activeSlateDate,isoDayBefore,gameFromNhl,validSchedule,pregameRows,normaliseStore,freezeRecord,gradeRecord,shotTotals,updateStore,defaultStore};
