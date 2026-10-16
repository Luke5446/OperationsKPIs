#!/usr/bin/env node
/* Freeze a month's fabric figures (cut, completed, WIP) as at its last working day.
   Run daily by .github/workflows/fabric-snapshot.yml: the first run after a month's last working day
   writes that month into data/fabric-snapshots.json, and the dashboard then shows those figures for
   good, whatever the feeds say later. A month already frozen is left alone unless named on the
   command line:  node tools/snapshot-fabric.js 2026-10      (re-freeze October)
   --dry-run prints what would be written without touching the file. */
'use strict';
const fs=require('fs'), path=require('path');
const K=require('../kpi-feeds.js');
const root=path.join(__dirname,'..'), file=path.join(root,'data','fabric-snapshots.json');
const localFetch=async(u,o)=>{
  if(/^https?:/.test(u))return fetch(u,o);
  const p=path.join(root,u), ok=fs.existsSync(p);
  return {ok,status:ok?200:404,json:async()=>JSON.parse(fs.readFileSync(p,'utf8')),text:async()=>fs.readFileSync(p,'utf8')};
};
const nextMonth=m=>{const[y,mo]=m.split('-').map(Number);return mo===12?(y+1)+'-01':y+'-'+String(mo+1).padStart(2,'0');};
const r2=x=>x==null?null:Math.round(x*100)/100;
(async()=>{
  const args=process.argv.slice(2), force=args.filter(a=>/^\d{4}-\d{2}$/.test(a)), dry=args.includes('--dry-run');
  const F=await K.loadFeeds({fetch:localFetch});
  if(!F.planner||!F.cutlog){console.error('Feeds unavailable, nothing frozen:',JSON.stringify(F.status));process.exit(2);}
  const today=K.todayUK(), cur=today.slice(0,7);
  const store=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  store._about='Fabric KPIs frozen at each month\'s last working day by tools/snapshot-fabric.js (run by the fabric-snapshot workflow). The dashboard shows these for closed months instead of recomputing from the feeds.';
  store.months=store.months||{};
  const changed=[];
  for(let m=K.FEED_FROM.fabric;m<=cur;m=nextMonth(m)){
    const lwd=K.lastWorkingDay(m);
    if(today<=lwd&&!force.includes(m))continue;            // still open: the dashboard shows it to date
    if(store.months[m]&&!force.includes(m))continue;        // already frozen
    const x=K.fabricMonth(F,m,lwd), w=x.wip;
    store.months[m]={asAt:lwd,takenAt:new Date().toISOString(),
      cutM:r2(x.cutM),cutGBP:r2(x.cutGBP),cutLines:x.cutLines,cutWOs:x.cutWOs,cutUnpriced:x.cutUnpriced,
      doneM:r2(x.doneM),doneGBP:r2(x.doneGBP),doneUnpriced:x.doneUnpriced,
      wip:w&&{asAt:w.asAt,metres:r2(w.metres),value:r2(w.value),lines:w.lines,unpriced:w.unpriced,assumedLines:w.assumedLines,assumedValue:r2(w.assumedValue),notValued:w.notValued},
      sources:{planner:F.savedAt.planner,cutlog:F.savedAt.cutlog,stock:F.savedAt.stock,prices:F.priceSrc}};
    changed.push(m);
    console.log(`${m}: as at ${lwd} — cut ${x.cutM.toFixed(1)} m £${x.cutGBP.toFixed(2)} (${x.cutUnpriced} unpriced), completed £${x.doneGBP.toFixed(2)}, WIP £${w?w.value.toFixed(2):'n/a'}`);
  }
  if(!changed.length){console.log('Nothing to freeze (today '+today+').');return;}
  if(dry){console.log('Dry run: not writing '+path.relative(root,file));return;}
  fs.writeFileSync(file,JSON.stringify(store,null,1)+'\n');
  console.log('Frozen '+changed.join(', ')+' into '+path.relative(root,file));
})().catch(e=>{console.error(e);process.exit(1);});
