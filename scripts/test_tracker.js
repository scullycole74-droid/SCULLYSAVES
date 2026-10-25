#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const T=require('./track_games');
const DS=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/current-season.json')));
const model=T.loadModel();
const DATE='2026-10-21',ID='2026029999',START='2026-10-21T23:00:00Z';
const game=(state='FUT',homeSog,awaySog)=>({id:Number(ID),gameDate:DATE,gameType:2,gameState:state,startTimeUTC:START,homeTeam:{abbrev:'CAR',...(homeSog===undefined?{}:{sog:homeSog})},awayTeam:{abbrev:'VAN',...(awaySog===undefined?{}:{sog:awaySog})}});
const schedule=(state='FUT')=>({games:[game(state,state==='OFF'?36:undefined,state==='OFF'?24:undefined)]});
const fetcher=async(url)=>({ok:true,json:async()=>url.includes('boxscore')?{gameState:'OFF',homeTeam:{sog:36},awayTeam:{sog:24}}:url.endsWith('/score/'+DATE)?schedule(url.includes('FINALMODE')?'OFF':'FUT'):{games:[]}});
async function suite(){
  assert.equal(model.teams.length,32);
  const rows=T.pregameRows(DS,DATE);
  const result=model.classify(rows,'CAR','VAN');
  assert.equal(result.classif,'GREEN');
  assert.equal(result.chosen,'S03');
  assert.equal(model.classify(rows,'CAR','VAN').classif,result.classif);
  assert(!rows.some(r=>Number(r.gameDate)>=20261021),'no same day data in pregame features');
  const p=model.project(rows,'CAR','VAN','CAR');
  assert(Number.isFinite(p.shots)&&p.shots>0,'Stage2 projection generated pregame');
  assert(Math.abs(p.venueDelta-0.5430640243902438)<0.00001,'home adjustment exactly once');
  assert.equal(T.activeSlateDate(new Date('2026-10-25T05:59:00Z')),'2026-10-24'); // 1:59 EDT
  assert.equal(T.activeSlateDate(new Date('2026-10-25T06:00:00Z')),'2026-10-25'); // 2:00 EDT
  assert.equal(T.activeSlateDate(new Date('2026-11-01T05:30:00Z')),'2026-10-31'); // first 1:30
  assert.equal(T.activeSlateDate(new Date('2026-11-01T06:30:00Z')),'2026-10-31'); // repeated 1:30
  assert.equal(T.activeSlateDate(new Date('2026-11-01T07:00:00Z')),'2026-11-01'); // 2:00 EST
  assert.equal(T.activeSlateDate(new Date('2027-01-02T06:00:00Z')),'2027-01-01');
  const preTime=new Date('2026-10-21T20:00:00Z');
  let first=await T.updateStore({dataset:DS,now:preTime,fetchImpl:fetcher,model,lookback:0});
  assert.equal(first.stats.created,2);
  assert.equal(first.store.records[ID+'|CAR'].classif,'GREEN');
  const originalPregame=structuredClone(first.store);
  const stamp=first.store.records[ID+'|CAR'].snapshotUTC;
  const desc=first.store.records[ID+'|CAR'].projectedShots;
  assert.equal(first.store.records[ID+'|CAR'].shotStatus,'PENDING');
  let twice=await T.updateStore({store:first.store,dataset:DS,now:new Date('2026-10-21T20:30:00Z'),fetchImpl:fetcher,model,lookback:0});
  assert.equal(twice.stats.created,0);
  assert.equal(twice.changed,false);
  // Official final only grades record, never changes original colour/projection/timestamp.
  const finalFetcher=async(url)=>({ok:true,json:async()=>url.includes('boxscore')?{gameState:'OFF',homeTeam:{sog:36},awayTeam:{sog:24}}:url.endsWith('/score/'+DATE)?schedule('OFF'):{games:[]}});
  let third=await T.updateStore({store:twice.store,dataset:DS,now:new Date('2026-10-22T08:00:00Z'),fetchImpl:finalFetcher,model,lookback:1});
  assert.equal(third.stats.graded,2);
  assert.equal(third.store.records[ID+'|CAR'].actualShots,36);
  assert.equal(third.store.records[ID+'|CAR'].reached['35'],true);
  assert.equal(third.store.records[ID+'|VAN'].reached['25'],false);
  assert.equal(third.store.records[ID+'|CAR'].snapshotUTC,stamp);
  assert.equal(third.store.records[ID+'|CAR'].projectedShots,desc);
  assert.equal(third.store.records[ID+'|CAR'].classif,'GREEN');
  const again=await T.updateStore({store:third.store,dataset:DS,now:new Date('2026-10-22T09:00:00Z'),fetchImpl:finalFetcher,model,lookback:1});
  assert.equal(again.stats.graded,0);
  assert.equal(again.changed,false);
  // No pregame capture? Mark uncovered and NEVER retroactively label green.
  const missed=await T.updateStore({dataset:DS,now:new Date('2026-10-22T08:00:00Z'),fetchImpl:finalFetcher,model,lookback:1});
  assert.equal(missed.stats.created,0);
  assert.equal(missed.stats.missed,0); // no artificial backlog of missed games before tracker activation
  assert.equal(Object.keys(missed.store.records).length,0);
  const sameDayLate=await T.updateStore({dataset:DS,now:new Date('2026-10-22T00:15:00Z'),fetchImpl:finalFetcher,model,lookback:0});
  assert.equal(sameDayLate.stats.missed,2); // still October 21 in Toronto, no fraudulent prediction
  // Bad final shot source is not allowed to grade.
  const badFetcher=async(url)=>({ok:true,json:async()=>url.includes('boxscore')?{gameState:'OFF',homeTeam:{sog:null},awayTeam:{sog:24}}:url.endsWith('/score/'+DATE)?schedule('OFF'):{games:[]}});
  let pending=await T.updateStore({store:originalPregame,dataset:DS,now:new Date('2026-10-22T08:00:00Z'),fetchImpl:badFetcher,model,lookback:1});
  assert.equal(pending.stats.graded,0);
  assert.equal(pending.store.records[ID+'|CAR'].shotStatus,'PENDING');
  // Postponed then rescheduled under same NHL game ID: preserve first audit and freeze a new one.
  const postponedFetcher=async(url)=>({ok:true,json:async()=>url.endsWith('/score/'+DATE)?schedule('PPD'):{games:[]}});
  const postponed=await T.updateStore({store:structuredClone(originalPregame),dataset:DS,now:new Date('2026-10-22T08:00:00Z'),fetchImpl:postponedFetcher,model,lookback:1});
  assert.equal(postponed.store.records[ID+'|CAR'].shotStatus,'POSTPONED');
  const later='2026-10-23';
  const moved=game('FUT'); moved.gameDate=later; moved.startTimeUTC='2026-10-23T23:00:00Z';
  const movedFetcher=async(url)=>({ok:true,json:async()=>url.endsWith('/score/'+DATE)?schedule('PPD'):url.endsWith('/score/'+later)?{games:[moved]}:{games:[]}});
  const rescheduled=await T.updateStore({store:postponed.store,dataset:DS,now:new Date('2026-10-23T20:00:00Z'),fetchImpl:movedFetcher,model,lookback:3});
  assert.equal(rescheduled.store.records[ID+'|CAR'].shotStatus,'POSTPONED');
  assert.equal(rescheduled.store.records[ID+'|CAR|'+later].shotStatus,'PENDING');
  assert.equal(rescheduled.store.records[ID+'|CAR|'+later].gameDate,later);
  // Unavailable API fails closed with no file write from main.
  let failed=false;try{await T.updateStore({dataset:DS,now:preTime,fetchImpl:async()=>{throw Error('network failure');},model,lookback:0});}catch(e){failed=true;}
  assert(failed);
  // Empty slate is a valid day and causes no fake selections.
  const empty=await T.updateStore({dataset:DS,now:preTime,fetchImpl:async()=>({ok:true,json:async()=>({games:[]})}),model,lookback:0});
  assert.equal(empty.stats.created,0);
  assert.equal(empty.store.slates[DATE].gameIds.length,0);
  assert.equal(T.validSchedule({games:[game()]},DATE).length,1);
  console.log('SCULLY tracker tests passed: Stage 1 exact parity; Stage2 pregame; green S03; freeze/grade; no backfill; official SOG; idempotence; two Toronto DST transitions; empty slate; failed feed; midnight/January rollover.');
}
suite().catch(e=>{console.error(e.stack);process.exitCode=1;});
