/* kpi-feeds.js — the KPI dashboard's feed maths, shared by the page (index.html) and the month-end
   freeze job (tools/snapshot-fabric.js). Plain JavaScript, no dependencies: in the browser it sets
   window.KPI, in Node it is module.exports. Everything here is pure except loadFeeds(), which fetches.

   Sources (all public, published by the planner apps into GitHub; Pages first, raw as fallback):
   - production planner data.json: WOs (live), completedWOs (with the fabric written off on completion)
   - cutting log cutlog.json: one line per works order fabric, marked cut with the cutting room's metres
   - stock planner data.json: bookedPOs — containers (C…) and airfreight (AF…) booked in
   - the planner page: its FABRIC_PRICES table (standard £ per metre)
   - this repo: fabric-prices.json (snapshot), fabric-price-overrides.json, clockwork-prices.json */
(function(root){
'use strict';
const FEEDS={
  planner:['https://luke5446.github.io/Tibard-Productionplan/data.json','https://raw.githubusercontent.com/Luke5446/Tibard-Productionplan/main/data.json'],
  cutlog:['https://luke5446.github.io/Tibard-Cutlog/cutlog.json','https://raw.githubusercontent.com/Luke5446/Tibard-Cutlog/main/cutlog.json'],
  stock:['https://luke5446.github.io/Tibard-Stock-Planner/data.json','https://raw.githubusercontent.com/Luke5446/Tibard-Stock-Planner/main/data.json'],
  plannerPage:['https://luke5446.github.io/Tibard-Productionplan/index.html','https://raw.githubusercontent.com/Luke5446/Tibard-Productionplan/main/index.html'],
  prices:['data/fabric-prices.json'],
  priceOverrides:['data/fabric-price-overrides.json'],
  ckwPrices:['data/clockwork-prices.json'],
  snapshots:['data/fabric-snapshots.json']
};
/* The first month each feed replaces the figure typed into the sheet */
const FEED_FROM={wo:'2026-09', clockwork:'2026-09', fabric:'2026-10'};
const CUTLOG_FROM='2026-09-29';   // the cutting log began; a works order due before it was never on the log

/* ---------- dates ---------- */
const pad=n=>String(n).padStart(2,'0');
const d2s=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const lastDay=m=>{const[y,mo]=m.split('-').map(Number);return m+'-'+pad(new Date(y,mo,0).getDate());};
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00');d.setDate(d.getDate()+n);return d2s(d);};
const dow=s=>new Date(s+'T00:00:00').getDay();
/* UK bank holidays (England): New Year, Good Friday, Easter Monday, early May, spring, summer, Christmas, Boxing Day, with weekend substitutes */
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return y+'-'+pad(mo)+'-'+pad(da);}
function bankHolidays(y){
  const sub=s=>{let d=s;while(dow(d)===0||dow(d)===6)d=addDays(d,1);return d;};   // a holiday on a weekend moves to the next weekday
  const lastMon=(mo)=>{let d=lastDay(y+'-'+pad(mo));while(dow(d)!==1)d=addDays(d,-1);return d;};
  const firstMon=(mo)=>{let d=y+'-'+pad(mo)+'-01';while(dow(d)!==1)d=addDays(d,1);return d;};
  const e=easter(y), xmas=sub(y+'-12-25'), box=sub(y+'-12-26'); const box2=box===xmas?addDays(box,1):box;
  return new Set([sub(y+'-01-01'),addDays(e,-2),addDays(e,1),firstMon(5),lastMon(5),lastMon(8),xmas,box2]);
}
const isWorkingDay=s=>{const w=dow(s);return w!==0&&w!==6&&!bankHolidays(+s.slice(0,4)).has(s);};
/* The last working day of a month: the day the month's fabric figures are frozen */
const lastWorkingDay=m=>{let d=lastDay(m);while(!isWorkingDay(d))d=addDays(d,-1);return d;};
/* Today's date in the UK, whatever the machine's zone (GitHub's runners are UTC) */
const ukDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const todayUK=()=>ukDate(new Date());
const nextMonth=m=>{const[y,mo]=m.split('-').map(Number);return mo===12?(y+1)+'-01':y+'-'+pad(mo+1);};
const addWorkingDays=(s,n)=>{let d=s,k=0;while(k<n){d=addDays(d,1);if(isWorkingDay(d))k++;}return d;};
/* A month's fabric runs from the day after the previous month's last working day to its own last
   working day, so a cut or completion dated on a month-end weekend belongs to the next month */
const monthOf=day=>{const m=day.slice(0,7);return day>lastWorkingDay(m)?nextMonth(m):m;};
/* After its last working day a month settles for this many working days: back-dated cut marks and
   completions (a Friday cut marked on Monday) still revise it. After that it is final. */
const SETTLE_DAYS=5;
const finalOn=m=>addWorkingDays(lastWorkingDay(m),SETTLE_DAYS);
/* A mark recorded after its month was made final goes to the month it was recorded in, so it is
   counted somewhere rather than nowhere */
function lateMonth(F,m,stampIso){
  const snap=F.snapshots&&F.snapshots[m];
  if(snap&&snap.final&&stampIso&&snap.takenAt&&stampIso>snap.takenAt){const d=ukDate(new Date(stampIso));return isNaN(new Date(stampIso))?m:monthOf(d);}
  return m;
}

/* ---------- fetching ---------- */
async function fetchFirst(urls,asJson,fetchImpl){
  const f=fetchImpl||root.fetch; let lastErr=null;
  for(const u of urls){
    try{const r=await f(u,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return asJson===false?await r.text():await r.json();}
    catch(e){lastErr=e;}
  }
  throw lastErr||new Error('no source');
}
/* The planner keeps its fabric cost list (standard £ per metre) as a table inside its page */
function pricesFromPage(html){
  if(typeof html!=='string')return null;
  const tag='var FABRIC_PRICES=', i=html.indexOf(tag); if(i<0)return null;
  let depth=0,k=i+tag.length;
  for(;k<html.length;k++){const ch=html[k];if(ch==='{')depth++;else if(ch==='}'){depth--;if(depth===0){k++;break;}}}
  try{const o=JSON.parse(html.slice(i+tag.length,k));return o&&typeof o==='object'?o:null;}catch(e){return null;}
}
const up=o=>{const t={};Object.keys(o||{}).forEach(k=>{const v=+o[k];if(v>0)t[k.trim().toUpperCase()]=v;});return t;};
/* Fetch every source; never throws — each one that fails is null with its error in status.
   opts.base prefixes the relative (repo) files; opts.fetch supplies fetch (Node). */
async function loadFeeds(opts){
  opts=opts||{};
  const rel=urls=>urls.map(u=>/^https?:/.test(u)?u:(opts.base||'')+u);
  const jobs={
    planner:fetchFirst(FEEDS.planner,true,opts.fetch),
    cutlog:fetchFirst(FEEDS.cutlog,true,opts.fetch),
    stock:fetchFirst(FEEDS.stock,true,opts.fetch),
    snapshot:fetchFirst(rel(FEEDS.prices),true,opts.fetch).then(j=>j&&j.prices?j.prices:j),
    page:fetchFirst(FEEDS.plannerPage,false,opts.fetch).then(pricesFromPage),
    overrides:fetchFirst(rel(FEEDS.priceOverrides),true,opts.fetch),
    ckwPrices:fetchFirst(rel(FEEDS.ckwPrices),true,opts.fetch).then(j=>j&&j.prices?j.prices:j),
    snapshots:fetchFirst(rel(FEEDS.snapshots),true,opts.fetch)
  };
  const keys=Object.keys(jobs), results=await Promise.allSettled(keys.map(k=>jobs[k]));
  const got={}, status={};
  keys.forEach((k,i)=>{const r=results[i];got[k]=r.status==='fulfilled'?r.value:null;status[k]=r.status==='fulfilled'?'ok':String((r.reason&&r.reason.message)||r.reason||'failed');});
  const F={
    planner:got.planner&&Array.isArray(got.planner.completedWOs)?got.planner:null,
    cutlog:got.cutlog&&Array.isArray(got.cutlog.entries)?got.cutlog:null,
    stock:got.stock&&Array.isArray(got.stock.bookedPOs)?got.stock:null,
    snapshots:got.snapshots&&got.snapshots.months?got.snapshots.months:{},
    status, loaded:true
  };
  if(!F.planner&&got.planner)status.planner='unexpected shape';
  if(!F.cutlog&&got.cutlog)status.cutlog='unexpected shape';
  if(!F.stock&&got.stock)status.stock='unexpected shape';
  // fabric £/m: the snapshot in this repo, overridden by the live table on the planner page,
  // overridden again by a price table the planner may one day publish in its data.json
  F.prices=Object.assign({},up(got.snapshot),up(got.page),up(F.planner&&F.planner.fabricPrices));
  F.priceSrc=F.planner&&F.planner.fabricPrices?'planner data':got.page?'planner page':got.snapshot?'snapshot':'none';
  F.overrides={exact:up(got.overrides&&got.overrides.exact),prefix:up(got.overrides&&got.overrides.prefix)};
  F.ckwPrices=up(got.ckwPrices);
  F.savedAt={planner:F.planner&&F.planner.savedAt,cutlog:F.cutlog&&F.cutlog.savedAt,stock:F.stock&&F.stock.savedAt};
  return F;
}

/* ---------- rules ---------- */
/* Brand of a garment: a special make carries its Sage company; otherwise an OH product code is
   Oliver Harvey and everything else (Tibard codes and customer-branded codes) is Tibard. */
const brandOf=(code,ref,company)=>{
  if(company)return /OLIVER/i.test(company)?'OH':'Tibard';
  if(/^OH/i.test(code||'')||/^S-OH/i.test(ref||''))return 'OH';
  return 'Tibard';
};
/* £/m for a fabric: an exact override first, then the planner's list, then a prefix rule for codes the list lacks */
const makePriceFor=F=>code=>{
  const c=(code||'').trim().toUpperCase(), o=F.overrides||{exact:{},prefix:{}};
  if(o.exact[c]>0)return o.exact[c];
  const p=(F.prices||{})[c]; if(p>0)return p;
  for(const k of Object.keys(o.prefix))if(c.startsWith(k))return o.prefix[k];
  return null;
};
const makeCkwPriceFor=F=>code=>{const p=(F.ckwPrices||{})[(code||'').trim().toUpperCase()];return p>0?p:null;};
const cutMetres=e=>e.metres!=null?e.metres:(e.std!=null?e.std:0);

/* ---------- the month-by-month facts ---------- */
const blankMonth=()=>({
  wo:{done:new Set(),doneOH:new Set(),doneTib:new Set(),raised:new Set(),unitsOH:0,unitsTib:0,lines:0,refBrand:{}},
  fab:{cutM:0,cutGBP:0,cutLines:0,cutWOs:new Set(),cutUnpriced:0,doneM:0,doneGBP:0,doneUnpriced:0,wip:null,asAt:null,frozen:null},
  ckw:{containers:[],units:0,unitsOH:0,unitsTib:0,usd:null,usdOH:0,usdTib:0,unpriced:[]}
});
/* Fabric cut up to and including a day, by month — the month's figure is what was cut by its last working day */
function cutByMonth(F,upTo){
  const priceFor=makePriceFor(F), by={};
  (F.cutlog?F.cutlog.entries:[]).forEach(e=>{
    if(e.cancelledAt||!e.cutAt)return; if(upTo&&e.cutAt>upTo)return;
    const m=lateMonth(F,monthOf(e.cutAt),e.adjustedAt||e.at), g=by[m]||(by[m]={cutM:0,cutGBP:0,cutLines:0,cutWOs:new Set(),cutUnpriced:0});
    const mm=cutMetres(e), pr=priceFor(e.fabric);
    g.cutM+=mm; g.cutLines++; g.cutWOs.add(e.ref); if(pr!=null)g.cutGBP+=mm*pr; else g.cutUnpriced++;
  });
  return by;
}
/* WIP as at a day: fabric cut on or before it on works orders not completed by then, valued at £/m.
   Plus, while they are still live, works orders printed before the log began, taken as cut at standard
   (the planner's own rule). A line waiting on the log is still on the roll and is not WIP. */
function wipAt(F,asAt){
  const P=F.planner, C=F.cutlog, priceFor=makePriceFor(F);
  const w={asAt,metres:0,value:0,lines:0,unpriced:0,assumedLines:0,assumedValue:0,notValued:0};
  if(!P||!C)return null;
  const doneOn={}, lastDone={}, doneRec={};
  P.completedWOs.forEach(c=>{const k=c.ref+'|'+c.code; if(!c.completed)return; if(!doneOn[k])doneOn[k]=c.completed; if(!lastDone[c.ref]||c.completed>lastDone[c.ref]){lastDone[c.ref]=c.completed;doneRec[c.ref]=c;}});
  // a works order was live at asAt if it is live now, or its last line was completed after asAt
  const live={}; (P.WOs||[]).forEach(x=>{live[x.ref]=x;});
  Object.keys(lastDone).forEach(r=>{if(!live[r]&&lastDone[r]>asAt){const c=doneRec[r];live[r]={ref:r,printed:!!c.printedAt,printedAt:c.printedAt,createdAt:c.createdAt,due:c.due,embOnly:!!c.embOnly,splitFrom:c.splitFrom,wasLiveAt:true};}});
  const onLog=new Set(C.entries.map(e=>e.ref)), liveKeys=new Set(C.entries.filter(e=>!e.cancelledAt).map(e=>e.k));
  C.entries.forEach(e=>{
    if(e.cancelledAt){
      if(live[e.ref]&&(e.printedAt||'')<=asAt&&!liveKeys.has(e.k)&&e.std!=null){const pr=priceFor(e.fabric);w.assumedLines++;w.lines++;w.metres+=e.std;if(pr!=null)w.assumedValue+=e.std*pr;else w.unpriced++;}
      return;
    }
    if(!e.cutAt||e.cutAt>asAt)return;
    const done=doneOn[e.ref+'|'+e.code]; if(done&&done<=asAt)return;
    const mm=cutMetres(e), pr=priceFor(e.fabric); w.lines++; w.metres+=mm;
    if(pr!=null)w.value+=mm*pr; else w.unpriced++;
  });
  // a works order the log never had: not valued — unless it was split off a works order that is on the
  // log, whose cloth was cut with the parent (the planner asks the cutting room for nothing on those)
  Object.keys(live).forEach(r=>{const x=live[r]; if(x.printed&&!x.embOnly&&(!x.due||x.due>=CUTLOG_FROM)&&(x.printedAt||x.createdAt||'')<=asAt&&!onLog.has(r)&&!(x.splitFrom&&onLog.has(x.splitFrom)))w.notValued++;});
  w.value+=w.assumedValue;
  return w;
}
/* Fabric written off on completion, by month: the cutting room's metres (else standard) at the price
   frozen on the record, extras included — the planner's own ledger line. upTo caps the completion day. */
function doneByMonth(F,upTo){
  const priceFor=makePriceFor(F), by={};
  (F.planner?F.planner.completedWOs:[]).forEach(c=>{
    if(!c.completed)return; if(upTo&&c.completed>upTo)return;
    const fb=c.fabric; if(!fb||!fb.code)return;
    const m=lateMonth(F,monthOf(c.completed),c.bookedAt), g=by[m]||(by[m]={doneM:0,doneGBP:0,doneUnpriced:0});
    const main=fb.actual!=null?fb.actual:fb.std, pr=fb.price!=null?fb.price:priceFor(fb.code);
    if(main!=null){g.doneM+=main; if(pr!=null)g.doneGBP+=main*pr; else g.doneUnpriced++;}
    (fb.extras||[]).forEach(x=>{const xm=x.actual!=null?x.actual:x.std, xp=x.price!=null?x.price:priceFor(x.code);
      if(xm!=null){g.doneM+=xm; if(xp!=null)g.doneGBP+=xm*xp; else g.doneUnpriced++;}});
  });
  return by;
}
/* One month's fabric figures as at a day (its last working day, or today for the month in progress) */
function fabricMonth(F,m,asAt){
  const cut=cutByMonth(F,asAt)[m]||{cutM:0,cutGBP:0,cutLines:0,cutWOs:new Set(),cutUnpriced:0};
  const done=doneByMonth(F,asAt)[m]||{doneM:0,doneGBP:0,doneUnpriced:0};
  return {asAt, cutM:cut.cutM, cutGBP:cut.cutGBP, cutLines:cut.cutLines, cutWOs:cut.cutWOs.size, cutUnpriced:cut.cutUnpriced,
          doneM:done.doneM, doneGBP:done.doneGBP, doneUnpriced:done.doneUnpriced, wip:wipAt(F,asAt)};
}

/* Everything the dashboard shows from the feeds, by month. today is YYYY-MM-DD (UK). */
function computeFacts(F,today){
  const FACTS={}, M=m=>FACTS[m]||(FACTS[m]=blankMonth());
  const P=F.planner, C=F.cutlog, S=F.stock, cm=today.slice(0,7), ckwPriceFor=makeCkwPriceFor(F);
  if(P){
    P.completedWOs.forEach(c=>{
      if(!c.completed)return;
      const m=c.completed.slice(0,7), f=M(m).wo, b=brandOf(c.code,c.ref,c.company);
      f.done.add(c.ref); f.lines++;
      if(b==='OH')f.unitsOH+=c.qty||0; else f.unitsTib+=c.qty||0;
      // a works order with lines of both brands counts once, under the brand of most of its garments
      const rb=f.refBrand[c.ref]||(f.refBrand[c.ref]={OH:0,Tibard:0}); rb[b]+=(c.qty||0)||1e-9;
    });
    // raised: the day it entered the planner (createdAt, stamped from 7 Sep 2026), else the planned start, else the print date
    const seen=new Set();
    (P.WOs||[]).concat(P.completedWOs).forEach(w=>{const raised=w.createdAt||w.start||w.printedAt; if(!raised||seen.has(w.ref))return; seen.add(w.ref); M(raised.slice(0,7)).wo.raised.add(w.ref);});
    Object.keys(FACTS).forEach(m=>{const f=FACTS[m].wo; Object.keys(f.refBrand).forEach(r=>{const rb=f.refBrand[r]; (rb.OH>rb.Tibard?f.doneOH:f.doneTib).add(r);});});
  }
  {
    // every month with a cut line, a completion or a stored snapshot, plus the current month:
    // as at its last working day, or today while it is open
    const months=new Set([cm]);
    if(C)Object.keys(cutByMonth(F)).filter(m=>m>=FEED_FROM.fabric).forEach(m=>months.add(m));
    if(P)Object.keys(doneByMonth(F)).filter(m=>m>=FEED_FROM.fabric).forEach(m=>months.add(m));
    Object.keys(F.snapshots||{}).filter(m=>m>=FEED_FROM.fabric).forEach(m=>months.add(m));
    months.forEach(m=>{
      if(m>cm)return;
      const lwd=lastWorkingDay(m), closed=today>lwd, asAt=closed?lwd:today, fo=finalOn(m);
      const snap=F.snapshots&&F.snapshots[m];
      // a snapshot taken before its own as-at day (an open month forced by hand) is no good
      const snapOk=!!(snap&&snap.asAt&&(!snap.takenAt||ukDate(new Date(snap.takenAt))>=snap.asAt));
      const g=M(m).fab;
      if(closed&&snapOk){   // frozen: the stored figures stand whatever the feeds say now
        Object.assign(g,{cutM:snap.cutM,cutGBP:snap.cutGBP,cutLines:snap.cutLines,cutUnpriced:snap.cutUnpriced||0,doneM:snap.doneM,doneGBP:snap.doneGBP,doneUnpriced:snap.doneUnpriced||0,wip:snap.wip,asAt:snap.asAt,frozen:snap.takenAt||snap.asAt,final:!!snap.final,revisedAt:snap.revisedAt||null});
      }else if(C){
        const x=fabricMonth(F,m,asAt);
        Object.assign(g,{cutM:x.cutM,cutGBP:x.cutGBP,cutLines:x.cutLines,cutUnpriced:x.cutUnpriced,doneM:x.doneM,doneGBP:x.doneGBP,doneUnpriced:x.doneUnpriced,wip:x.wip,asAt,frozen:null,final:false,revisedAt:null});
      }else return;   // no cutting log and nothing frozen: nothing to show for this month
      g.closed=closed; g.lastWorkingDay=lwd; g.finalOn=fo;
    });
  }
  if(S){
    S.bookedPOs.forEach(b=>{
      const ref=(b.ref||'').trim(); if(!/^(C|AF)\d/i.test(ref))return;   // C = container, AF = airfreight; anything else is another supplier
      const date=b.bookedDate||b.date||''; if(!date)return;
      const m=date.slice(0,7), g=M(m).ckw, c={ref,date,units:0,unitsOH:0,unitsTib:0,lines:(b.items||[]).length,usd:null,usdOH:0,usdTib:0,unpriced:[]};
      (b.items||[]).forEach(it=>{
        const q=it.qty||0, oh=brandOf(it.code)==='OH', p=ckwPriceFor(it.code);
        c.units+=q; if(oh)c.unitsOH+=q; else c.unitsTib+=q;
        if(p!=null){c.usd=(c.usd||0)+q*p; if(oh)c.usdOH+=q*p; else c.usdTib+=q*p;} else if(q) c.unpriced.push(it.code);
      });
      // a value put on the container in the stock planner (its USD box) wins over the price list;
      // the brand split then follows the priced lines, or the units where nothing is priced
      const v=b.valueUSD!=null?b.valueUSD:(b.usd!=null?b.usd:null);
      if(v!=null&&+v>=0){
        const priced=c.usd; c.usd=+v;
        if(priced>0){c.usdOH=c.usdOH*c.usd/priced;c.usdTib=c.usdTib*c.usd/priced;}
        else if(c.units>0){c.usdOH=c.usd*c.unitsOH/c.units;c.usdTib=c.usd*c.unitsTib/c.units;}
        c.unpriced=[]; c.typed=true;
      }
      if(c.usd!=null){g.usd=(g.usd||0)+c.usd; g.usdOH+=c.usdOH; g.usdTib+=c.usdTib;}
      g.unpriced=g.unpriced.concat(c.unpriced);
      g.containers.push(c); g.units+=c.units; g.unitsOH+=c.unitsOH; g.unitsTib+=c.unitsTib;
    });
  }
  return FACTS;
}

const KPI={FEEDS,FEED_FROM,CUTLOG_FROM,SETTLE_DAYS,d2s,lastDay,lastWorkingDay,isWorkingDay,bankHolidays,addWorkingDays,nextMonth,monthOf,finalOn,ukDate,todayUK,fetchFirst,pricesFromPage,loadFeeds,brandOf,makePriceFor,makeCkwPriceFor,cutMetres,cutByMonth,doneByMonth,wipAt,fabricMonth,computeFacts};
if(typeof module!=='undefined'&&module.exports)module.exports=KPI; else root.KPI=KPI;
})(typeof globalThis!=='undefined'?globalThis:this);
