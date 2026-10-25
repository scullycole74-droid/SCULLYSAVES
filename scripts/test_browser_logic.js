// Offline Node VM harness for the existing no-framework SCULLY website.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path'), root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const extract=id=>html.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)</script>'))?.[1];
const bundle=extract('bundled-data'), snapshot=extract('oct25-summary');
assert(bundle && snapshot);
const elements=new Map();
function elem(id){
 if(!elements.has(id))elements.set(id,{
  id,textContent:'',innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}},
  addEventListener(){},style:{},scrollIntoView(){},files:[]
 });
 return elements.get(id);
}
const doc={getElementById(id){if(id==='bundled-data')return {textContent:bundle}; if(id==='oct25-summary')return {textContent:snapshot}; return elem(id);},querySelectorAll(){return []}};
elem('situationSummary').value='all';elem('attack').value='CAR';elem('defense').value='VAN';elem('window2').value='season';elem('window1').value='season';elem('homeTeam').value='';
const context=vm.createContext({document:doc,console,Date,Math,setInterval(){},fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'data/current-season.json'),'utf8'))}),scrollTo(){}});
let app=html.match(/<script>\s*'use strict';([\s\S]*?)<\/script><\/body>/)?.[1];
assert(app,'App script not found');
vm.runInContext("'use strict';"+app,context,{timeout:20000});
console.log('Initial heading:',elem('topdate').textContent);
assert.equal(elem('currentgames').textContent,179);
assert(elem('topdate').textContent.includes('Oct 25'));
assert(elem('dataSourceStatus').innerHTML.includes('179 games'));
assert((elem('snapshotTable').innerHTML.match(/<tr>/g)||[]).length===33);
vm.runInContext("$('situationSummary').value='4on5';renderSnapshot();",context,{timeout:20000});
assert(elem('snapshotTable').innerHTML.includes('SOG F/G'));
vm.runInContext("$('matchups').value='CAR vs VAN\\nTOR vs BOS';runMatchups();",context,{timeout:20000});
assert(elem('matchupResults').innerHTML.includes('CAR'));
vm.runInContext("runSaves()",context,{timeout:20000});
assert(elem('saveResults').innerHTML.includes('Expected team shots'));
console.log('Verified bundled data, Oct25 snapshot, 4on5 table, Stage1 matchup screen and Stage2 shot projection.');
// Integration test only: 28 synthetic (re-keyed) example games to check that a future
// 179-game published feed takes precedence over the October 25 aggregate snapshot.
// These are NOT real games and are never saved to a user-facing dataset.
const seed=JSON.parse(bundle), k=seed.columns, gIdx=k.indexOf('gameId'), dIdx=k.indexOf('gameDate');
const ids=[...new Set(seed.current.map(r=>r[gIdx]))].slice(0,28);
let extra=[];
for(let i=0;i<ids.length;i++){
  const newID='2026029'+String(i+1).padStart(3,'0');
  for(const r of seed.current.filter(x=>x[gIdx]===ids[i])){
    const c=r.slice();c[gIdx]=newID;c[dIdx]='20261024';extra.push(c);
  }
}
assert.equal(extra.length,280);
context.TEST_ROWS=seed.current.concat(extra);
const upgraded=vm.runInContext('updateApp(convert(TEST_ROWS))',context,{timeout:30000});
assert.equal(upgraded.games,179);
assert.equal(elem('currentgames').textContent,179);
assert(elem('topdate').textContent.includes('through 2026-10-24'));
vm.runInContext("$('matchups').value='CAR vs VAN';runMatchups();runSaves();",context,{timeout:30000});
assert(elem('matchupResults').innerHTML.includes('CAR'));
assert(elem('saveResults').innerHTML.includes('Expected team shots'));
console.log('Verified full 179-game future feed switches to real game-log profiles and both stages remain functional.');
