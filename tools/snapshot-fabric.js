#!/usr/bin/env node
/* Freeze a month's fabric figures (cut, completed, WIP) as at its last working day.
   Run every weekday by .github/workflows/fabric-snapshot.yml. The first run after a month's last
   working day writes that month into data/fabric-snapshots.json; for the next SETTLE_DAYS working
   days each run re-takes it, so a cut marked late with the date put back (a Friday cut marked on
   Monday) still lands in the month. After that the month is final and nothing moves it but a forced
   re-freeze:  node tools/snapshot-fabric.js 2026-10      (a month still open is refused)
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
const nextMonth=K.nextMonth;
const r2=x=>x==null?null:Math.round(x*100)/100;
(async()=>{
  const args=process.argv.slice(2), force=args.filter(a=>/^\d{4}-\d{2}$/.test(a)), dry=args.includes('--dry-run');
  const F=await K.loadFeeds({fetch:localFetch});
  if(!F.planner||!F.cutlog){console.error('Feeds unavailable, nothing frozen:',JSON.stringify(F.status));process.exit(2);}
  const today=K.todayUK(), cur=today.slice(0,7);
  const store=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  store._about='Fabric KPIs frozen at each month\'s last working day by tools/snapshot-fabric.js (run by the fabric-snapshot workflow). The dashboard shows these for closed months instead of recomputing from the feeds.';
  store.months=store.months||{};
  const inRange=m=>/^\d{4}-\d{2}$/.test(m)&&m>=K.FEED_FROM.fabric&&m<=cur;
  for(const m of force){ if(!inRange(m)){console.error(m+' is not a month this job covers ('+K.FEED_FROM.fabric+' to '+cur+')');process.exit(1);} if(today<=K.lastWorkingDay(m)){console.error(m+' is still open (last working day '+K.lastWorkingDay(m)+'); it cannot be frozen yet');process.exit(1);} }
  const r4=x=>x==null?null:Math.round(x*10000)/10000;
  const same=(a,b)=>a&&b&&['cutM','cutGBP','cutLines','cutUnpriced','doneM','doneGBP','doneUnpriced'].every(k=>r4(a[k])===r4(b[k]))&&r4(a.wip&&a.wip.value)===r4(b.wip&&b.wip.value)&&r4(a.wip&&a.wip.metres)===r4(b.wip&&b.wip.metres);
  const changed=[];
  for(let m=K.FEED_FROM.fabric;m<=cur;m=nextMonth(m)){
    const lwd=K.lastWorkingDay(m), fo=K.finalOn(m), isFinal=today>fo;
    if(today<=lwd)continue;                                   // still open: the dashboard shows it to date
    const old=store.months[m];
    if(old&&old.final&&!force.includes(m))continue;           // final: nothing moves it but a forced re-freeze
    const x=K.fabricMonth(F,m,lwd), w=x.wip, now=new Date().toISOString();
    const rec={asAt:lwd,takenAt:old?old.takenAt:now,revisedAt:null,final:isFinal,finalOn:fo,
      cutM:r2(x.cutM),cutGBP:r2(x.cutGBP),cutLines:x.cutLines,cutWOs:x.cutWOs,cutUnpriced:x.cutUnpriced,
      doneM:r2(x.doneM),doneGBP:r2(x.doneGBP),doneUnpriced:x.doneUnpriced,
      wip:w&&{asAt:w.asAt,metres:r2(w.metres),value:r2(w.value),lines:w.lines,unpriced:w.unpriced,assumedLines:w.assumedLines,assumedValue:r2(w.assumedValue),notValued:w.notValued},
      sources:{planner:F.savedAt.planner,cutlog:F.savedAt.cutlog,stock:F.savedAt.stock,prices:F.priceSrc}};
    if(old&&same(old,rec)&&!force.includes(m)){
      if(isFinal&&!old.final){old.final=true;old.finalOn=fo;changed.push(m+' (final)');}   // settled with no change: now final
      continue;
    }
    if(old){rec.revisedAt=now;}
    store.months[m]=rec; changed.push(m+(old?' (revised)':'')+(isFinal?' (final)':' (settling until '+fo+')'));
    console.log(`${m}: as at ${lwd} — cut ${x.cutM.toFixed(1)} m £${x.cutGBP.toFixed(2)} (${x.cutUnpriced} unpriced), completed £${x.doneGBP.toFixed(2)}, WIP £${w?w.value.toFixed(2):'n/a'}${isFinal?' · final':' · settling until '+fo}`);
  }
  if(!changed.length){console.log('Nothing to freeze (today '+today+').');return;}
  if(dry){console.log('Dry run: not writing '+path.relative(root,file));return;}
  fs.writeFileSync(file,JSON.stringify(store,null,1)+'\n');
  console.log('Frozen '+changed.join(', ')+' into '+path.relative(root,file));
})().catch(e=>{console.error(e);process.exit(1);});
