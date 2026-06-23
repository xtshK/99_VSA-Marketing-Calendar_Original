import { useState, useRef, useEffect, useCallback } from "react";
import * as mammoth from "mammoth";

var QUARTERS = [
  { label:"Q1", num:1, months:["January","February","March"], startMonth:1 },
  { label:"Q2", num:2, months:["April","May","June"], startMonth:4 },
  { label:"Q3", num:3, months:["July","August","September"], startMonth:7 },
  { label:"Q4", num:4, months:["October","November","December"], startMonth:10 }
];
var MONTH_TO_Q = {1:1,2:1,3:1,4:2,5:2,6:2,7:3,8:3,9:3,10:4,11:4,12:4};
var ALL_TYPES = ["Landing Page","Email","Blog","LinkedIn Ad","Social Post","Battlecard","One-Pager","Video","Sell Sheet","Webinar","Infographic","Other"];
var ALL_MEDIUMS = ["Web","Print","Event","Webinar","Digital - Email","Digital - Social","Digital - Paid Ad","Digital - Publisher"];
var TC = {};
TC["Landing Page"]="#0063A3"; TC["Email"]="#00875A"; TC["Blog"]="#E07B00"; TC["LinkedIn Ad"]="#0077B5";
TC["Social Post"]="#9B59B6"; TC["Battlecard"]="#C0392B"; TC["One-Pager"]="#16A085"; TC["Video"]="#8E44AD";
TC["Sell Sheet"]="#D35400"; TC["Webinar"]="#2980B9"; TC["Infographic"]="#27AE60"; TC["Other"]="#7F8C8D";
var VC = {};
VC["Education"]="#E07B00"; VC["Enterprise"]="#0063A3"; VC["Government"]="#2D6A4F";
var CP = ["#0063A3","#00875A","#C0392B","#8E44AD","#E07B00","#0077B5","#16A085","#D35400","#2980B9","#27AE60","#7F8C8D","#E91E63"];
var STORAGE_KEY = "vs_mktg_cal_v4";
var PRIORITIES = ["Priority 1","Priority 2","Priority 3"];
var VERTICALS = ["Education","Enterprise","Government"];
var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
var SW = ["US","CA","LATAM","NA","Q1","Q2","Q3","Q4","EDU","ENT","GOV","BUS","ENTERPRISE","EDUCATION","GOVERNMENT","AMERICAS","VSA"];

function typeColor(t) {
  if (!t) return TC["Other"];
  var keys = Object.keys(TC);
  for (var i=0;i<keys.length;i++) { if (t.toLowerCase().indexOf(keys[i].toLowerCase())!==-1) return TC[keys[i]]; }
  return TC["Other"];
}
function vertColor(v) { return (v && VC[v]) ? VC[v] : "#0063A3"; }
function cleanCamp(name) {
  if (!name) return name;
  var parts = name.split(/[\s_-]+/);
  var kept = parts.filter(function(p){ return SW.indexOf(p.toUpperCase())===-1; });
  return kept.length>0 ? kept.join(" ") : name;
}
function monthForWeek(qStart, week) {
  if (week<=4) return qStart;
  if (week<=8) return qStart+1;
  return qStart+2;
}
function wkLabel(w, qStart, yr) {
  var d = new Date(yr, qStart-1, 1);
  d.setDate(d.getDate()+(w-1)*7);
  return "W"+w+" "+d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
}
function wkToDate(week, qStart, yr) {
  var d = new Date(yr, qStart-1, 1);
  d.setDate(d.getDate()+(week-1)*7);
  return d;
}
function localDate(str) {
  if (!str) return null;
  var p = str.split("-");
  if (p.length===3) return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  return new Date(str);
}
function itemWeek(item, q) {
  if (item.goLiveDate) {
    try {
      var d = localDate(item.goLiveDate);
      var qs = new Date(d.getFullYear(), q.startMonth-1, 1);
      var diff = Math.floor((d-qs)/(7*24*60*60*1000));
      var w = diff+1;
      if (w>=1&&w<=13) return w;
    } catch(e){}
  }
  return item.week||1;
}
function useCampColors(items) {
  var map={}, names=[];
  items.forEach(function(i){ if(i.campaignName&&names.indexOf(i.campaignName)===-1) names.push(i.campaignName); });
  names.forEach(function(c,i){ map[c]=CP[i%CP.length]; });
  return map;
}
async function loadData() {
  try { var r=await fetch("/api/data"); var j=await r.json(); return Array.isArray(j)?j:[]; } catch(e){ return []; }
}
async function saveData(items) {
  try { await fetch("/api/data",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(items)}); } catch(e){}
}

var PROMPT = "Extract ALL marketing deliverables. Return ONLY valid JSON array.\n"+
"Each: {\"title\":\"\",\"contentType\":\"Landing Page|Email|Blog|LinkedIn Ad|Social Post|Battlecard|One-Pager|Video|Sell Sheet|Webinar|Infographic|Other\",\"medium\":\"Web|Print|Event|Webinar|Digital - Email|Digital - Social|Digital - Paid Ad|Digital - Publisher\",\"vertical\":\"\",\"priority\":\"Priority 1|2|3\",\"timingNote\":\"\",\"goLiveDate\":\"YYYY-MM-DD\",\"week\":1,\"month\":7,\"year\":2025,\"campaignName\":\"\",\"product\":\"\"}\n"+
"Use per-tactic Go Live Date. week=quarter week 1-13. Q3:W1=Jul1,W5=Aug1,W9=Sep1. Clean campaign names, no file prefixes.\n"+
"medium: LandingPage/Blog=Web. SellSheet/Battlecard/OnePager=Print. Email=Digital - Email. LinkedInAd=Digital - Paid Ad. SocialPost=Digital - Social. Webinar=Webinar.";

async function callClaude(content, isPdf) {
  var res = await fetch("/api/extract",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({content:content,isPdf:isPdf})
  });
  var d = await res.json();
  if (d.error) throw new Error(d.error);
  return d.text||"";
}

function StatCard(props) {
  var c=props.color||"#0063A3";
  return (
    <div style={{background:"#fff",borderRadius:10,padding:"16px 20px",border:"1px solid #e8edf2",flex:1,minWidth:140}}>
      <div style={{fontSize:22,marginBottom:4}}>{props.icon}</div>
      <div style={{fontSize:28,fontWeight:900,color:c,lineHeight:1}}>{props.value}</div>
      <div style={{fontSize:12,fontWeight:700,color:"#555",marginTop:4}}>{props.label}</div>
      {props.sub&&<div style={{fontSize:11,color:"#aaa",marginTop:2}}>{props.sub}</div>}
    </div>
  );
}

function BarChart(props) {
  var data=props.data||[];
  var max=Math.max.apply(null,data.map(function(d){return d.value;}).concat([1]));
  var sorted=data.slice().sort(function(a,b){return a.label.localeCompare(b.label);});
  return (
    <div style={{background:"#fff",borderRadius:10,padding:"16px 18px",border:"1px solid #e8edf2"}}>
      <div style={{fontWeight:800,fontSize:13,color:"#111",marginBottom:14}}>{props.title}</div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {sorted.map(function(d){
          return (
            <div key={d.label} style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:120,fontSize:11,color:"#555",fontWeight:600,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</div>
              <div style={{flex:1,background:"#f0f2f5",borderRadius:4,height:18,position:"relative"}}>
                <div style={{width:((d.value/max)*100)+"%",background:d.color||"#0063A3",height:"100%",borderRadius:4,minWidth:d.value>0?18:0,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:4}}>
                  {d.value>0&&<span style={{fontSize:10,color:"#fff",fontWeight:700}}>{d.value}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayCalendar(props) {
  var items=props.items, quarter=props.quarter, yr=props.year, showFY=props.showFullYear;
  var [tip,setTip]=useState(null);
  var [expCells,setExpCells]=useState({});
  function toggleCell(k){ setExpCells(function(p){return Object.assign({},p,{[k]:!p[k]});}); }
  var qs=showFY?QUARTERS:[QUARTERS.find(function(q){return q.num===quarter;})];

  function getDay(mn,day){
    return items.filter(function(i){
      if(MONTH_TO_Q[i.month]!==MONTH_TO_Q[mn]) return false;
      if(i.goLiveDate){
        var d=localDate(i.goLiveDate);
        return d.getFullYear()===yr&&d.getMonth()===mn-1&&d.getDate()===day;
      }
      if(i.month!==mn) return false;
      var q=QUARTERS.find(function(q){return q.num===MONTH_TO_Q[mn];});
      var ws=wkToDate(i.week||1,q.startMonth,yr);
      return ws.getMonth()===mn-1&&ws.getDate()===day;
    });
  }

  function renderMonth(mName,mn){
    var fd=new Date(yr,mn-1,1).getDay();
    var dim=new Date(yr,mn,0).getDate();
    var cells=[];
    for(var i=0;i<fd;i++) cells.push(null);
    for(var d=1;d<=dim;d++) cells.push(d);
    while(cells.length%7!==0) cells.push(null);
    return (
      <div key={mName} style={{marginBottom:24}}>
        <div style={{fontWeight:800,fontSize:14,color:"#0063A3",marginBottom:8}}>{mName}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
          {DAYS.map(function(d){return <div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#aaa",padding:"2px 0"}}>{d}</div>;})}
          {cells.map(function(day,idx){
            if(!day) return <div key={idx} style={{minHeight:52}}/>;
            var di=getDay(mn,day);
            var ck=mn+"-"+day;
            var isExp=!!expCells[ck];
            var vis=isExp?di:di.slice(0,3);
            var ov=di.length-3;
            return (
              <div key={idx} style={{minHeight:52,background:"#fff",border:"1px solid #f0f0f0",borderRadius:4,padding:"2px 3px"}} onMouseLeave={function(){setTip(null);}}>
                <div style={{fontSize:9,color:"#aaa",fontWeight:600,marginBottom:2}}>{day}</div>
                <div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {vis.map(function(item,i){
                    return (
                      <div key={i} onMouseEnter={function(e){setTip({item:item,x:e.clientX,y:e.clientY});}}
                        style={{background:typeColor(item.contentType),color:"#fff",borderRadius:3,padding:"1px 4px",fontSize:8,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"default"}}>
                        {item.title.length>14?item.title.slice(0,13)+"...":item.title}
                      </div>
                    );
                  })}
                  {!isExp&&ov>0&&<div onClick={function(){toggleCell(ck);}} style={{fontSize:8,color:"#0063A3",fontWeight:700,cursor:"pointer",paddingLeft:2,textDecoration:"underline"}}>{"+"+ ov+" more"}</div>}
                  {isExp&&di.length>3&&<div onClick={function(){toggleCell(ck);}} style={{fontSize:8,color:"#aaa",fontWeight:700,cursor:"pointer",paddingLeft:2,textDecoration:"underline"}}>show less</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{position:"relative"}}>
      {tip&&(
        <div style={{position:"fixed",top:tip.y+10,left:tip.x+10,background:"#fff",border:"1px solid #ddd",borderRadius:8,padding:"10px 14px",fontSize:12,zIndex:999,boxShadow:"0 4px 16px rgba(0,0,0,0.12)",maxWidth:240,pointerEvents:"none"}}>
          <div style={{fontWeight:700,color:"#111",marginBottom:4}}>{tip.item.title}</div>
          <div style={{color:typeColor(tip.item.contentType),fontWeight:600,marginBottom:2}}>{tip.item.contentType}</div>
          <div style={{color:"#666"}}>{tip.item.campaignName}</div>
          <div style={{color:"#aaa",fontSize:11}}>{tip.item.medium+" · "+tip.item.priority}</div>
          <div style={{color:"#aaa",fontSize:11}}>{tip.item.goLiveDate||tip.item.timingNote||("Week "+tip.item.week)}</div>
        </div>
      )}
      {qs.map(function(q){
        return (
          <div key={q.num} style={{marginBottom:showFY?32:0}}>
            {showFY&&<div style={{fontWeight:800,fontSize:14,color:"#0063A3",marginBottom:12,paddingBottom:6,borderBottom:"2px solid #e8f0f8"}}>{q.label+" - "+q.months.join(", ")}</div>}
            <div style={{display:"flex",flexDirection:"column"}}>
              {q.months.map(function(m,mi){return renderMonth(m,q.startMonth+mi);})}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContentView(props) {
  var yr=new Date().getFullYear();
  var filtered=props.items.filter(function(i){
    if(!props.showFullYear&&MONTH_TO_Q[i.month]!==props.quarter) return false;
    if(props.filterVertical!=="All"&&!(i.vertical&&i.vertical.toLowerCase().indexOf(props.filterVertical.toLowerCase())!==-1)) return false;
    if(props.filterCampaign!=="All"&&i.campaignName!==props.filterCampaign) return false;
    return true;
  });
  var tCounts=ALL_TYPES.map(function(t){return{type:t,count:filtered.filter(function(i){return i.contentType===t;}).length,color:typeColor(t)};}).filter(function(d){return d.count>0;});
  var qObj=QUARTERS.find(function(q){return q.num===props.quarter;});
  return (
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
        {tCounts.map(function(tc){
          return (
            <div key={tc.type} style={{background:tc.color,borderRadius:8,padding:"14px 20px",minWidth:150}}>
              <div style={{fontSize:28,fontWeight:900,color:"#fff",lineHeight:1}}>{tc.count}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.85)",fontWeight:600,marginTop:3}}>{tc.type}</div>
            </div>
          );
        })}
        {tCounts.length===0&&<div style={{color:"#bbb",fontSize:13}}>No deliverables match current filters.</div>}
      </div>
      {tCounts.length>0&&(
        <div style={{background:"#fff",borderRadius:10,border:"1px solid #e8edf2",padding:"16px 18px",marginBottom:20}}>
          <div style={{fontWeight:800,fontSize:13,color:"#111",marginBottom:14}}>{"Content Calendar - "+(props.showFullYear?"Full Year "+yr:(qObj.label+" "+yr))}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {tCounts.map(function(tc){return <span key={tc.type} style={{background:tc.color+"18",color:tc.color,border:"1px solid "+tc.color+"44",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700}}>{tc.type}</span>;})}
          </div>
          <DayCalendar items={filtered} quarter={props.quarter} year={yr} showFullYear={props.showFullYear}/>
        </div>
      )}
    </div>
  );
}

function Dashboard(props) {
  var yr=new Date().getFullYear();
  var q=QUARTERS.find(function(q){return q.num===props.quarter;});
  var qi=props.showFullYear?props.items:props.items.filter(function(i){return MONTH_TO_Q[i.month]===props.quarter;});
  var camps=[]; qi.forEach(function(i){if(i.campaignName&&camps.indexOf(i.campaignName)===-1)camps.push(i.campaignName);});
  var td=ALL_TYPES.map(function(t){return{label:t,value:qi.filter(function(i){return i.contentType===t;}).length,color:typeColor(t)};}).filter(function(d){return d.value>0;});
  var md=ALL_MEDIUMS.map(function(m){return{label:m,value:qi.filter(function(i){return i.medium===m;}).length,color:"#0063A3"};}).filter(function(d){return d.value>0;});
  var p1=qi.filter(function(i){return i.priority==="Priority 1";}).length;
  var p2=qi.filter(function(i){return i.priority==="Priority 2";}).length;
  var p3=qi.filter(function(i){return i.priority==="Priority 3";}).length;
  var pl=props.showFullYear?"Full Year "+yr:q.label+" "+yr+" - "+q.months.join(", ");
  var ql=props.showFullYear?QUARTERS:[q];
  return (
    <div>
      <div style={{background:"linear-gradient(135deg,#0063A3,#004d80)",borderRadius:12,padding:"20px 24px",marginBottom:16,color:"#fff"}}>
        <div style={{fontSize:11,fontWeight:700,opacity:0.7,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>ViewSonic Americas - Marketing Dashboard</div>
        <div style={{fontSize:22,fontWeight:900,marginBottom:2}}>{pl}</div>
        <div style={{fontSize:12,opacity:0.7}}>Prepared for Sales Leadership & C-Suite</div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <StatCard icon="📣" label="Active Campaigns" value={camps.length} color="#0063A3" sub={props.showFullYear?"across all quarters":"in "+q.label}/>
        <StatCard icon="📦" label="Total Deliverables" value={qi.length} color="#00875A" sub={p1+" Priority 1 - "+p2+" P2 - "+p3+" P3"}/>
        <StatCard icon="🗂" label="Content Types" value={td.length} color="#E07B00" sub="unique formats"/>
        <StatCard icon="📡" label="Mediums Active" value={md.length} color="#8E44AD" sub="distribution mediums"/>
      </div>
      <div style={{background:"#fff",borderRadius:10,padding:"16px 18px",border:"1px solid #e8edf2",marginBottom:16,overflowX:"auto"}}>
        <div style={{fontWeight:800,fontSize:13,color:"#111",marginBottom:8}}>Campaign Activity Timeline</div>
        <div style={{display:"flex",gap:16,marginBottom:12}}>
          {["Education","Enterprise","Government"].map(function(vn){
            return (
              <div key={vn} style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:12,height:12,borderRadius:3,background:vertColor(vn),flexShrink:0}}/>
                <span style={{fontSize:11,color:"#555",fontWeight:600}}>{vn}</span>
              </div>
            );
          })}
        </div>
        {ql.map(function(qq){
          var qi2=props.showFullYear?props.items.filter(function(i){return MONTH_TO_Q[i.month]===qq.num;}):qi;
          var qc=[]; qi2.forEach(function(i){if(i.campaignName&&qc.indexOf(i.campaignName)===-1)qc.push(i.campaignName);});
          if(!qc.length) return null;
          return (
            <div key={qq.num} style={{marginBottom:props.showFullYear?16:0}}>
              {props.showFullYear&&<div style={{fontSize:11,fontWeight:800,color:"#0063A3",marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>{qq.label+" - "+qq.months.join(", ")}</div>}
              {qc.map(function(camp){
                var ci=qi2.filter(function(i){return i.campaignName===camp;});
                var cv=ci[0]&&ci[0].vertical;
                var bc=vertColor(cv);
                var ws=ci.map(function(i){return itemWeek(i,qq);});
                var mn=Math.min.apply(null,ws), mx=Math.max.apply(null,ws);
                var dn=cleanCamp(camp);
                return (
                  <div key={camp} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <div style={{width:180,fontSize:11,fontWeight:700,color:bc,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0}} title={camp}>{dn}</div>
                    <div style={{flex:1,background:"#f0f2f5",borderRadius:4,height:18,position:"relative",minWidth:200}}>
                      <div style={{position:"absolute",left:(((mn-1)/12)*100)+"%",width:(((mx-mn+1)/13)*100)+"%",background:bc,height:"100%",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:9,color:"#fff",fontWeight:700}}>{ci.length+" tactics"}</span>
                      </div>
                    </div>
                    <div style={{fontSize:10,color:"#aaa",flexShrink:0,width:60}}>{"Wk "+mn+"-"+mx}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:13,color:"#111",marginBottom:10}}>Campaign Breakdown</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
          {camps.map(function(camp){
            var ci=qi.filter(function(i){return i.campaignName===camp;});
            var color=props.campColors[camp]||"#0063A3";
            var ws=ci.map(function(i){return i.week||1;});
            var mn=ws.length?Math.min.apply(null,ws):1, mx=ws.length?Math.max.apply(null,ws):1;
            var types=[]; ci.forEach(function(i){if(i.contentType&&types.indexOf(i.contentType)===-1)types.push(i.contentType);});
            var p1c=ci.filter(function(i){return i.priority==="Priority 1";}).length;
            return (
              <div key={camp} style={{background:"#fff",borderRadius:10,padding:"14px 16px",border:"1px solid "+color+"33",borderTop:"3px solid "+color}}>
                <div style={{fontWeight:800,fontSize:13,color:"#111",marginBottom:6}}>{camp}</div>
                <div style={{display:"flex",gap:16,marginBottom:8}}>
                  <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:color}}>{ci.length}</div><div style={{fontSize:10,color:"#aaa"}}>tactics</div></div>
                  <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:"#C0392B"}}>{p1c}</div><div style={{fontSize:10,color:"#aaa"}}>priority 1</div></div>
                  <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:"#555"}}>{"W"+mn+"-"+mx}</div><div style={{fontSize:10,color:"#aaa"}}>week range</div></div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {types.map(function(t){return <span key={t} style={{background:typeColor(t)+"18",color:typeColor(t),border:"1px solid "+typeColor(t)+"44",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:600}}>{t}</span>;})}
                </div>
              </div>
            );
          })}
          {!camps.length&&<div style={{color:"#ccc",fontSize:13,padding:20}}>No campaigns. Upload a brief to populate.</div>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <BarChart data={td} title="Deliverables by Content Type"/>
        <BarChart data={md} title="Deliverables by Medium"/>
      </div>
      {props.showFullYear&&<BarChart data={QUARTERS.map(function(qq){return{label:qq.label,value:props.items.filter(function(i){return MONTH_TO_Q[i.month]===qq.num;}).length,color:"#0063A3"};})} title="Deliverables by Quarter"/>}
    </div>
  );
}

function DupModal(props) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:12,width:"100%",maxWidth:500,boxShadow:"0 8px 40px rgba(0,0,0,0.2)",overflow:"hidden"}}>
        <div style={{background:"#fff8e1",borderBottom:"1px solid #ffe082",padding:"14px 20px"}}>
          <div style={{fontWeight:900,fontSize:15,color:"#333",marginBottom:2}}>Possible Duplicate Detected</div>
          <div style={{fontSize:12,color:"#888"}}>These campaigns already exist in the same vertical</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          {props.conflicts.map(function(c,i){
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#fafafa",borderRadius:7,marginBottom:8,border:"1px solid #eee"}}>
                <div style={{fontSize:20}}>📋</div>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#111"}}>{c.campaignName}</div>
                  <div style={{fontSize:11,color:"#888"}}>{"Vertical: "+c.vertical+" - "+c.existingCount+" existing"}</div>
                </div>
              </div>
            );
          })}
          <div style={{fontSize:12,color:"#666",marginTop:12,marginBottom:16,lineHeight:1.6}}>
            <strong>Replace</strong> - remove existing, add new<br/>
            <strong>Merge</strong> - keep existing, add new<br/>
            <strong>Cancel</strong> - skip this brief
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={props.onCancel} style={{border:"1px solid #ddd",background:"#fff",borderRadius:6,padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#666"}}>Cancel</button>
            <button onClick={props.onMerge} style={{border:"1px solid #0063A3",background:"#fff",borderRadius:6,padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:700,color:"#0063A3"}}>Merge</button>
            <button onClick={props.onReplace} style={{background:"#C0392B",color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:700}}>Replace</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditModal(props) {
  var q=QUARTERS.find(function(q){return q.num===props.quarter;});
  var yr=new Date().getFullYear();
  var [form,setForm]=useState({
    title:props.item?(props.item.title||""):"",
    contentType:props.item?(props.item.contentType||"Other"):"Other",
    medium:props.item?(props.item.medium||"Web"):"Web",
    vertical:props.item?(props.item.vertical||"Enterprise"):"Enterprise",
    priority:props.item?(props.item.priority||"Priority 1"):"Priority 1",
    week:props.item?(props.item.week||1):1,
    campaignName:props.item?(props.item.campaignName||props.allCampaigns[0]||""):(props.allCampaigns[0]||""),
    timingNote:props.item?(props.item.timingNote||""):"",
    newCampaign:"",useNewCampaign:false
  });
  function sf(k,v){setForm(function(p){return Object.assign({},p,{[k]:v});});}
  function save(){
    var camp=form.useNewCampaign?form.newCampaign.trim():form.campaignName;
    if(!form.title.trim()||!camp) return;
    var month=monthForWeek(q.startMonth,parseInt(form.week));
    props.onSave(Object.assign({},props.item,{
      id:props.item&&props.item.id?props.item.id:"manual_"+Date.now(),
      title:form.title.trim(),contentType:form.contentType,medium:form.medium,
      vertical:form.vertical,priority:form.priority,week:parseInt(form.week),
      month:month,year:props.item&&props.item.year?props.item.year:yr,
      campaignName:camp,timingNote:form.timingNote||("Week "+form.week)
    }));
  }
  var inp={border:"1px solid #ddd",borderRadius:5,padding:"6px 8px",fontSize:12,width:"100%",boxSizing:"border-box",background:"#fff"};
  var lbl={fontSize:11,fontWeight:700,color:"#555",marginBottom:3,display:"block"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={props.onClose}>
      <div style={{background:"#fff",borderRadius:12,padding:24,width:420,maxWidth:"95vw",boxShadow:"0 8px 40px rgba(0,0,0,0.18)"}} onClick={function(e){e.stopPropagation();}}>
        <div style={{fontWeight:800,fontSize:16,color:"#111",marginBottom:16}}>{props.item&&props.item.id?"Edit Deliverable":"Add Deliverable"}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Title *</label><input style={inp} value={form.title} onChange={function(e){sf("title",e.target.value);}} placeholder="e.g. Campaign Landing Page"/></div>
          <div><label style={lbl}>Content Type</label><select style={inp} value={form.contentType} onChange={function(e){sf("contentType",e.target.value);}}>{ALL_TYPES.map(function(t){return <option key={t}>{t}</option>;})}</select></div>
          <div><label style={lbl}>Medium</label><select style={inp} value={form.medium} onChange={function(e){sf("medium",e.target.value);}}>{ALL_MEDIUMS.map(function(m){return <option key={m}>{m}</option>;})}</select></div>
          <div><label style={lbl}>Priority</label><select style={inp} value={form.priority} onChange={function(e){sf("priority",e.target.value);}}>{PRIORITIES.map(function(p){return <option key={p}>{p}</option>;})}</select></div>
          <div><label style={lbl}>Vertical</label><select style={inp} value={form.vertical} onChange={function(e){sf("vertical",e.target.value);}}>{VERTICALS.map(function(v){return <option key={v}>{v}</option>;})}</select></div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Week in Quarter (1-13)</label>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="range" min={1} max={13} value={form.week} onChange={function(e){sf("week",e.target.value);}} style={{flex:1,accentColor:"#0063A3"}}/>
              <span style={{fontWeight:700,color:"#0063A3",fontSize:13,width:70}}>{wkLabel(parseInt(form.week),q.startMonth,yr)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#bbb",marginTop:2}}><span>Launch</span><span>Mid</span><span>Close</span></div>
          </div>
          <div style={{gridColumn:"1/-1"}}>
            <label style={lbl}>Campaign</label>
            {props.allCampaigns.length>0&&!form.useNewCampaign?(
              <div style={{display:"flex",gap:6}}>
                <select style={Object.assign({},inp,{flex:1})} value={form.campaignName} onChange={function(e){sf("campaignName",e.target.value);}}>{props.allCampaigns.map(function(c){return <option key={c}>{c}</option>;})}</select>
                <button onClick={function(){sf("useNewCampaign",true);}} style={{border:"1px solid #ddd",borderRadius:5,padding:"6px 10px",fontSize:11,cursor:"pointer",background:"#f5f5f5",whiteSpace:"nowrap"}}>+ New</button>
              </div>
            ):(
              <div style={{display:"flex",gap:6}}>
                <input style={Object.assign({},inp,{flex:1})} value={form.newCampaign} onChange={function(e){sf("newCampaign",e.target.value);}} placeholder="Enter new campaign name"/>
                {props.allCampaigns.length>0&&<button onClick={function(){sf("useNewCampaign",false);}} style={{border:"1px solid #ddd",borderRadius:5,padding:"6px 10px",fontSize:11,cursor:"pointer",background:"#f5f5f5"}}>Cancel</button>}
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={props.onClose} style={{border:"1px solid #ddd",background:"#fff",borderRadius:6,padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#666"}}>Cancel</button>
          <button onClick={save} style={{background:"#0063A3",color:"#fff",border:"none",borderRadius:6,padding:"8px 18px",fontSize:12,cursor:"pointer",fontWeight:700}}>{props.item&&props.item.id?"Save Changes":"Add Deliverable"}</button>
        </div>
      </div>
    </div>
  );
}

function TRow(props) {
  var disp=props.item.goLiveDate?props.item.goLiveDate:(props.item.timingNote||("Week "+props.item.week));
  return (
    <div style={{display:"flex",alignItems:"flex-start",gap:6,padding:"4px 0",borderBottom:"1px solid #f0f0f0"}}>
      <span style={{color:props.color,fontSize:10,marginTop:4,flexShrink:0}}>&#9679;</span>
      <div style={{flex:1,minWidth:0}}>
        <span style={{fontSize:12,fontWeight:600,color:"#222"}}>{props.item.title}</span>
        <span style={{fontSize:11,color:"#888",marginLeft:6}}>{props.item.contentType+" - "+props.item.medium}</span>
        <span style={{fontSize:10,color:"#bbb",marginLeft:6}}>{disp}</span>
      </div>
      <button onClick={function(){props.onEdit(props.item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:12,padding:"0 3px"}}>&#9998;</button>
      <button onClick={function(){props.onRemove(props.item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#bbb",fontSize:12,padding:"0 3px"}}>&#10005;</button>
    </div>
  );
}

function QView(props) {
  var [exp,setExp]=useState({});
  var q=QUARTERS.find(function(q){return q.num===props.quarter;});
  var wks=[1,2,3,4,5,6,7,8,9,10,11,12,13];
  var ms=[{label:q.months[0],wks:4},{label:q.months[1],wks:5},{label:q.months[2],wks:4}];
  var fil=props.items.filter(function(i){
    if(MONTH_TO_Q[i.month]!==props.quarter) return false;
    if(props.fc!=="All"&&i.campaignName!==props.fc) return false;
    if(props.fv!=="All"&&!(i.vertical&&i.vertical.toLowerCase().indexOf(props.fv.toLowerCase())!==-1)) return false;
    if(props.ft!=="All"&&!(i.contentType&&i.contentType.toLowerCase().indexOf(props.ft.toLowerCase())!==-1)) return false;
    return true;
  });
  var camps=[]; fil.forEach(function(i){if(i.campaignName&&camps.indexOf(i.campaignName)===-1)camps.push(i.campaignName);});
  if(!fil.length) return (
    <div style={{textAlign:"center",padding:"50px 20px",color:"#bbb"}}>
      <div style={{fontSize:36,marginBottom:8}}>📋</div>
      <div style={{fontWeight:700,color:"#ccc"}}>{"No deliverables for "+q.label+" "+props.year}</div>
      <button onClick={function(){props.onAdd(null);}} style={{marginTop:16,background:"#0063A3",color:"#fff",border:"none",borderRadius:6,padding:"8px 18px",fontSize:12,cursor:"pointer",fontWeight:700}}>+ Add Deliverable</button>
    </div>
  );
  var COL=70,LABEL=190;
  return (
    <div style={{overflowX:"auto"}}>
      <div style={{minWidth:LABEL+COL*13+20}}>
        <div style={{display:"flex",marginLeft:LABEL,marginBottom:2,gap:2}}>
          {ms.map(function(m){return <div key={m.label} style={{width:COL*m.wks,textAlign:"center",fontWeight:700,fontSize:11,color:"#0063A3",padding:"3px 0",background:"#e8f0f8",borderRadius:"4px 4px 0 0",border:"1px solid #d0dce8"}}>{m.label}</div>;})}
        </div>
        <div style={{display:"flex",alignItems:"center",borderBottom:"2px solid #d0dce8",background:"#f5f7fa"}}>
          <div style={{width:LABEL,flexShrink:0,padding:"5px 10px",fontWeight:700,fontSize:11,color:"#666"}}>Campaign</div>
          {wks.map(function(w){return <div key={w} style={{width:COL,flexShrink:0,textAlign:"center",fontSize:9,color:"#999",padding:"3px 1px",borderLeft:"1px solid #ececec"}}>{wkLabel(w,q.startMonth,props.year)}</div>;})}
        </div>
        {camps.map(function(camp){
          var color=props.campColors[camp]||"#0063A3";
          var ci=fil.filter(function(i){return i.campaignName===camp;}).map(function(i){return Object.assign({},i,{_w:itemWeek(i,q)});}).sort(function(a,b){return a._w-b._w;});
          var aw=ci.map(function(i){return i._w;});
          var mn=aw.length?Math.min.apply(null,aw):1, mx=aw.length?Math.max.apply(null,aw):1;
          var isO=!!exp[camp];
          return (
            <div key={camp} style={{borderBottom:"1px solid #ececec"}}>
              <div style={{display:"flex",alignItems:"center",background:isO?"#fafafa":"#fff",cursor:"pointer"}} onClick={function(){setExp(function(p){return Object.assign({},p,{[camp]:!p[camp]});});}}>
                <div style={{width:LABEL,flexShrink:0,padding:"7px 10px",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:color,fontSize:13}}>{isO?"▾":"▸"}</span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:12,color:"#111",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{camp}</div>
                    <div style={{fontSize:10,color:"#aaa"}}>{ci.length+" tactic"+(ci.length!==1?"s":"")}</div>
                  </div>
                </div>
                <div style={{display:"flex",flex:1}}>
                  {wks.map(function(w){
                    var wi=ci.filter(function(i){return i._w===w;});
                    var ir=w>=mn&&w<=mx;
                    var br=w===mn&&w===mx?"5px":w===mn?"5px 0 0 5px":w===mx?"0 5px 5px 0":"0";
                    return (
                      <div key={w} style={{width:COL,flexShrink:0,height:34,borderLeft:"1px solid #f0f0f0",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {ir&&<div style={{position:"absolute",left:w===mn?4:0,right:w===mx?4:0,height:18,background:wi.length>0?color:(color+"22"),borderRadius:br,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {wi.length>0&&<span style={{fontSize:9,color:"#fff",fontWeight:800}}>{wi.length}</span>}
                        </div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              {isO&&(
                <div style={{marginLeft:LABEL,padding:"8px 12px",background:"#fafafa",borderTop:"1px solid #ececec"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:10,color:"#999",fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Tactics in order</span>
                    <button onClick={function(e){e.stopPropagation();props.onAdd(camp);}} style={{background:color+"18",border:"1px solid "+color+"55",color:color,borderRadius:5,padding:"3px 10px",fontSize:10,cursor:"pointer",fontWeight:700}}>+ Add Tactic</button>
                  </div>
                  {ci.map(function(item){return <TRow key={item.id} item={item} onRemove={props.onRemove} onEdit={props.onEdit} color={color}/>;}) }
                </div>
              )}
            </div>
          );
        })}
        <div style={{padding:"8px 12px",borderTop:"1px solid #ececec"}}>
          <button onClick={function(){props.onAdd(null);}} style={{background:"none",border:"1px dashed #ccc",borderRadius:6,padding:"6px 14px",fontSize:11,cursor:"pointer",color:"#999",fontWeight:600}}>+ Add Deliverable</button>
        </div>
      </div>
    </div>
  );
}

function AView(props) {
  var [cq,setCq]=useState({});
  var [cc,setCc]=useState({1:{},2:{},3:{},4:{}});
  var fil=props.items.filter(function(i){
    if(props.fv!=="All"&&!(i.vertical&&i.vertical.toLowerCase().indexOf(props.fv.toLowerCase())!==-1)) return false;
    if(props.ft!=="All"&&!(i.contentType&&i.contentType.toLowerCase().indexOf(props.ft.toLowerCase())!==-1)) return false;
    return true;
  });
  function tc(qn,camp){setCc(function(p){var qm=Object.assign({},p[qn]);qm[camp]=!qm[camp];return Object.assign({},p,{[qn]:qm});});}
  function ic(qn,camp){return cc[qn]?cc[qn][camp]!==false:true;}
  return (
    <div>
      <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={function(){setCq({});}} style={{border:"1px solid #ddd",background:"#fff",borderRadius:5,padding:"4px 12px",fontSize:11,cursor:"pointer"}}>Expand All</button>
        <button onClick={function(){setCq({1:true,2:true,3:true,4:true});}} style={{border:"1px solid #ddd",background:"#fff",borderRadius:5,padding:"4px 12px",fontSize:11,cursor:"pointer"}}>Collapse All</button>
      </div>
      {QUARTERS.map(function(q){
        var qi=fil.filter(function(i){return MONTH_TO_Q[i.month]===q.num;});
        var camps=[]; qi.forEach(function(i){if(i.campaignName&&camps.indexOf(i.campaignName)===-1)camps.push(i.campaignName);});
        var col=!!cq[q.num];
        return (
          <div key={q.num} style={{marginBottom:10,border:"1px solid #e0e0e0",borderRadius:10,overflow:"hidden"}}>
            <div onClick={function(){setCq(function(p){return Object.assign({},p,{[q.num]:!p[q.num]});});}} style={{background:col?"#f5f7fa":"#0063A3",color:col?"#333":"#fff",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none"}}>
              <div style={{fontWeight:800,fontSize:13}}>{q.label+" - "+q.months.join(", ")}<span style={{fontWeight:400,fontSize:11,opacity:0.8,marginLeft:8}}>{"("+qi.length+" deliverables - "+camps.length+" campaigns)"}</span></div>
              <span>{col?"▸":"▾"}</span>
            </div>
            {!col&&(
              <div style={{padding:12}}>
                {!camps.length&&<div style={{color:"#ccc",fontSize:12,fontStyle:"italic"}}>No campaigns for this quarter</div>}
                {camps.map(function(camp){
                  var ci=qi.filter(function(i){return i.campaignName===camp;}).sort(function(a,b){return (a.week||1)-(b.week||1);});
                  var color=props.campColors[camp]||"#0063A3";
                  var isc=ic(q.num,camp);
                  return (
                    <div key={camp} style={{marginBottom:10,borderLeft:"3px solid "+color,paddingLeft:10}}>
                      <div style={{fontWeight:700,fontSize:12,color:color,marginBottom:3,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={function(){tc(q.num,camp);}}>
                        <span style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11}}>{isc?"▸":"▾"}</span>{camp}<span style={{color:"#aaa",fontWeight:400,fontSize:11}}>{"("+ci.length+" tactics)"}</span></span>
                        <button onClick={function(e){e.stopPropagation();props.onAdd(camp);}} style={{background:"none",border:"1px solid "+color+"55",color:color,borderRadius:4,padding:"1px 8px",fontSize:10,cursor:"pointer",fontWeight:700}}>+ Add</button>
                      </div>
                      {!isc&&ci.map(function(item){return(
                        <div key={item.id} style={{display:"flex",alignItems:"center",gap:5,padding:"2px 0",fontSize:11}}>
                          <span style={{color:color,fontSize:9,flexShrink:0}}>&#9679;</span>
                          <span style={{color:"#333",fontWeight:600,flex:1}}>{item.title}</span>
                          <span style={{color:"#aaa",fontSize:10}}>{item.goLiveDate||item.timingNote}</span>
                          <button onClick={function(){props.onEdit(item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#9998;</button>
                          <button onClick={function(){props.onRemove(item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#10005;</button>
                        </div>
                      );})}
                    </div>
                  );
                })}
                <button onClick={function(){props.onAdd(null);}} style={{marginTop:6,background:"none",border:"1px dashed #ccc",borderRadius:5,padding:"4px 12px",fontSize:11,cursor:"pointer",color:"#aaa"}}>+ Add Deliverable</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VView(props) {
  var [ec,setEc]=useState({});
  function tog(k){setEc(function(p){return Object.assign({},p,{[k]:!p[k]});});}
  var ccm={}; var an=[];
  props.allItems.forEach(function(i){if(i.campaignName&&an.indexOf(i.campaignName)===-1)an.push(i.campaignName);});
  an.forEach(function(c,i){ccm[c]=CP[i%CP.length];});
  var fil=props.items.filter(function(i){
    if(props.ft!=="All"&&!(i.contentType&&i.contentType.toLowerCase().indexOf(props.ft.toLowerCase())!==-1)) return false;
    if(props.fc!=="All"&&i.campaignName!==props.fc) return false;
    return true;
  });
  var vns=[]; fil.forEach(function(i){if(i.vertical&&vns.indexOf(i.vertical)===-1)vns.push(i.vertical);}); vns.sort();

  function rCamps(si,qn){
    var camps=[]; si.forEach(function(i){if(i.campaignName&&camps.indexOf(i.campaignName)===-1)camps.push(i.campaignName);}); camps.sort();
    if(!camps.length) return <div style={{color:"#ccc",fontSize:12,fontStyle:"italic",padding:"8px 0"}}>No campaigns</div>;
    return camps.map(function(camp){
      var ci=si.filter(function(i){return i.campaignName===camp;}).sort(function(a,b){return (a.week||1)-(b.week||1);});
      var color=ccm[camp]||"#0063A3";
      var k=qn+"_"+camp, isO=!!ec[k];
      var ws=ci.map(function(i){return i.week||1;}); var mn=ws.length?Math.min.apply(null,ws):1,mx=ws.length?Math.max.apply(null,ws):1;
      var types=[]; ci.forEach(function(i){if(i.contentType&&types.indexOf(i.contentType)===-1)types.push(i.contentType);});
      return (
        <div key={camp} style={{marginBottom:8,border:"1px solid "+color+"33",borderRadius:7,overflow:"hidden"}}>
          <div onClick={function(){tog(k);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:isO?(color+"11"):"#fff",cursor:"pointer",userSelect:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:color}}>{isO?"▾":"▸"}</span>
              <span style={{fontWeight:700,fontSize:12,color:"#111"}}>{camp}</span>
              <span style={{fontSize:11,color:"#aaa"}}>{"("+ci.length+" tactics - Wk "+mn+"-"+mx+")"}</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
              {types.map(function(t){return <span key={t} style={{background:typeColor(t)+"18",color:typeColor(t),border:"1px solid "+typeColor(t)+"44",borderRadius:3,padding:"1px 5px",fontSize:9,fontWeight:700}}>{t}</span>;})}
            </div>
          </div>
          {isO&&(
            <div style={{padding:"8px 14px",borderTop:"1px solid "+color+"22",background:"#fafafa"}}>
              {ci.map(function(item){return(
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",fontSize:11,borderBottom:"1px solid #f0f0f0"}}>
                  <span style={{color:typeColor(item.contentType),fontSize:9,flexShrink:0}}>&#9679;</span>
                  <span style={{fontWeight:600,color:"#222",flex:1}}>{item.title}</span>
                  <span style={{color:"#aaa",fontSize:10,whiteSpace:"nowrap"}}>{item.contentType}</span>
                  <span style={{color:"#bbb",fontSize:10,whiteSpace:"nowrap",marginLeft:6}}>{item.goLiveDate||item.timingNote||("Wk "+item.week)}</span>
                  <button onClick={function(){props.onEdit(item);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#9998;</button>
                  <button onClick={function(){props.onRemove(item.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ccc",fontSize:11,padding:"0 2px"}}>&#10005;</button>
                </div>
              );})}
            </div>
          )}
        </div>
      );
    });
  }

  if(!vns.length) return <div style={{textAlign:"center",padding:40,color:"#bbb",fontSize:13}}>No deliverables match filters.</div>;
  return (
    <div>
      {vns.map(function(vn){
        var vc=vertColor(vn);
        var vi=fil.filter(function(i){return i.vertical===vn;});
        return (
          <div key={vn} style={{marginBottom:16,border:"1px solid "+vc+"44",borderRadius:10,overflow:"hidden"}}>
            <div style={{background:vc,color:"#fff",padding:"10px 16px",fontWeight:800,fontSize:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>{"🏢 "+vn}</span>
              <span style={{fontWeight:400,fontSize:12,opacity:0.85}}>{vi.length+" deliverables"}</span>
            </div>
            <div style={{padding:14}}>
              {props.showFY?(
                QUARTERS.map(function(q){
                  var qi=vi.filter(function(i){return MONTH_TO_Q[i.month]===q.num;});
                  if(!qi.length) return null;
                  return (
                    <div key={q.num} style={{marginBottom:16}}>
                      <div style={{fontWeight:800,fontSize:12,color:vc,marginBottom:8,paddingBottom:4,borderBottom:"2px solid "+vc+"33",textTransform:"uppercase",letterSpacing:0.5}}>
                        {q.label+" - "+q.months.join(", ")+" "}
                        <span style={{fontWeight:400,color:"#aaa",fontSize:11}}>{"("+qi.length+" deliverables)"}</span>
                      </div>
                      {rCamps(qi,q.num)}
                    </div>
                  );
                })
              ):rCamps(vi.filter(function(i){return MONTH_TO_Q[i.month]===props.quarter;}),props.quarter)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  var [items,setItems]=useState([]);
  var [loaded,setLoaded]=useState(false);
  var [view,setView]=useState("dashboard");
  var [quarter,setQuarter]=useState(function(){var m=new Date().getMonth();return m<3?1:m<6?2:m<9?3:4;});
  var [showFY,setShowFY]=useState(false);
  var [uploading,setUploading]=useState(false);
  var [upMsg,setUpMsg]=useState("");
  var [upProg,setUpProg]=useState(null);
  var [fc,setFc]=useState("All");
  var [fv,setFv]=useState("All");
  var [ft,setFt]=useState("All");
  var [editItem,setEditItem]=useState(null);
  var [showModal,setShowModal]=useState(false);
  var [dupModal,setDupModal]=useState(null);
  var pqRef=useRef(null);
  var fRef=useRef();
  var year=new Date().getFullYear();

  useEffect(function(){loadData().then(function(d){setItems(d);setLoaded(true);});},[]);

  var campColors=useCampColors(items);
  var allCamps=[]; items.forEach(function(i){if(i.campaignName&&allCamps.indexOf(i.campaignName)===-1)allCamps.push(i.campaignName);}); allCamps.sort();
  var allVerts=[]; items.forEach(function(i){if(i.vertical&&allVerts.indexOf(i.vertical)===-1)allVerts.push(i.vertical);}); allVerts.sort();
  var allTypes=[]; items.forEach(function(i){if(i.contentType&&allTypes.indexOf(i.contentType)===-1)allTypes.push(i.contentType);}); allTypes.sort();

  function remItem(id){setItems(function(p){var n=p.filter(function(i){return i.id!==id;});saveData(n);return n;});}
  function openEdit(item){setEditItem(item);setShowModal(true);}
  function openAdd(camp){var q=QUARTERS.find(function(q){return q.num===quarter;});setEditItem({title:"",contentType:"Other",medium:"Web",vertical:"Enterprise",priority:"Priority 1",week:1,month:q.startMonth,year:year,campaignName:camp||allCamps[0]||""});setShowModal(true);}
  function doSave(u){setItems(function(p){var e=p.find(function(i){return i.id===u.id;});var n=e?p.map(function(i){return i.id===u.id?u:i;}):p.concat([u]);saveData(n);return n;});setShowModal(false);}

  async function procFile(file){
    var raw=null,isPdf=false,b64=null,nm=file.name.toLowerCase();
    if(nm.lastIndexOf(".pdf")===nm.length-4){var a=await file.arrayBuffer();b64=btoa(new Uint8Array(a).reduce(function(s,b){return s+String.fromCharCode(b);},""));isPdf=true;}
    else if(nm.indexOf(".docx")!==-1){var a2=await file.arrayBuffer();var r2=await mammoth.extractRawText({arrayBuffer:a2});raw=r2.value;if(!raw||raw.trim().length<50)throw new Error("Cannot extract from "+file.name);}
    else if(nm.indexOf(".pptx")!==-1){var a3=await file.arrayBuffer();var dec=new TextDecoder("utf-8").decode(a3);var mx=dec.match(/<a:t[^>]*>([^<]+)<\/a:t>/g)||[];raw=mx.map(function(m){return m.replace(/<[^>]+>/g,"");}).join(" ");if(!raw||raw.trim().length<50)throw new Error("Cannot extract from "+file.name);}
    else{raw=await file.text();}
    var le;
    for(var att=1;att<=3;att++){
      try{
        var resp=await callClaude(isPdf?b64:raw.slice(0,9000),isPdf);
        var cl=resp.replace(/```json|```/gi,"").trim();
        var pr;
        try{pr=JSON.parse(cl);}catch(e){var mx2=cl.match(/\[[\s\S]*\]/);if(!mx2)throw new Error("Invalid JSON");pr=JSON.parse(mx2[0]);}
        if(!Array.isArray(pr)||!pr.length)throw new Error("No deliverables in "+file.name);
        return pr.map(function(item,i){return Object.assign({},item,{id:Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2),month:parseInt(item.month)||7,year:parseInt(item.year)||year,week:parseInt(item.week)||1,goLiveDate:item.goLiveDate||null});});
      }catch(err){le=err;if(att<3)await new Promise(function(r){setTimeout(r,att*2000);});}
    }
    throw le;
  }

  var resQ=useCallback(function(mode,conflicts,newItems){
    setDupModal(null);
    var q=pqRef.current; if(!q) return;
    setItems(function(prev){var base=mode==="replace"?prev.filter(function(e){return!conflicts.some(function(c){return(e.campaignName||"").toLowerCase().trim()===c.campaignName.toLowerCase().trim()&&(e.vertical||"").toLowerCase().trim()===c.vertical.toLowerCase().trim();});}):prev;var next=mode==="cancel"?prev:base.concat(newItems);saveData(next);return next;});
    if(q.remaining.length===0){if(q.firstMonth)setQuarter(MONTH_TO_Q[q.firstMonth]);setUpProg(function(p){return p?Object.assign({},p,{currentName:"",done:true}):p;});setUploading(false);pqRef.current=null;}
    else{runQ(q.remaining,q.firstMonth,q.total,q.doneCount+1,q.successCount+(mode!=="cancel"?1:0),q.failCount);}
  },[]);

  async function runQ(files,fm,total,dc,sc,fc2){
    for(var i=0;i<files.length;i++){
      var file=files[i];
      setUpProg({total:total,current:dc+i+1,success:sc+i,failed:fc2,currentName:file.name,done:false});
      try{
        var ni=await procFile(file);
        var fmo=fm||(ni[0]&&ni[0].month?ni[0].month:null);
        var snap=await loadData();
        var ig={};
        ni.forEach(function(item){var key=(item.campaignName||"").toLowerCase().trim()+"__"+(item.vertical||"").toLowerCase().trim();if(!ig[key])ig[key]={campaignName:item.campaignName,vertical:item.vertical};});
        var confl=Object.values(ig).filter(function(g){return snap.some(function(e){return(e.campaignName||"").toLowerCase().trim()===g.campaignName.toLowerCase().trim()&&(e.vertical||"").toLowerCase().trim()===g.vertical.toLowerCase().trim();});}).map(function(g){return Object.assign({},g,{existingCount:snap.filter(function(e){return(e.campaignName||"").toLowerCase().trim()===g.campaignName.toLowerCase().trim()&&(e.vertical||"").toLowerCase().trim()===g.vertical.toLowerCase().trim();}).length});});
        if(confl.length>0){pqRef.current={remaining:files.slice(i+1),firstMonth:fmo,total:total,doneCount:dc+i,successCount:sc+i,failCount:fc2};setDupModal({conflicts:confl,newItems:ni});return;}
        setItems(function(prev){var next=prev.concat(ni);saveData(next);return next;});
        if(!fm&&fmo)fm=fmo;
        setUpProg(function(p){return p?Object.assign({},p,{success:p.success+1}):p;});
      }catch(err){setUpProg(function(p){return p?Object.assign({},p,{failed:p.failed+1}):p;});}
      if(i<files.length-1)await new Promise(function(r){setTimeout(r,1500);});
    }
    if(fm)setQuarter(MONTH_TO_Q[fm]);
    setUpProg(function(p){return p?Object.assign({},p,{currentName:"",done:true}):p;});
    setUploading(false);
    if(fRef.current)fRef.current.value="";
  }

  function handleFile(e){var files=Array.from(e.target.files||[]);if(!files.length)return;setUploading(true);setUpMsg("");setUpProg({total:files.length,current:0,success:0,failed:0,currentName:"",done:false});runQ(files,null,files.length,0,0,0);if(fRef.current)fRef.current.value="";}

  return (
    <div style={{fontFamily:"'Segoe UI',Arial,sans-serif",maxWidth:1200,margin:"0 auto",padding:20,background:"#f7f9fc",minHeight:"100vh"}}>
      {dupModal&&<DupModal conflicts={dupModal.conflicts} onReplace={function(){resQ("replace",dupModal.conflicts,dupModal.newItems);}} onMerge={function(){resQ("merge",dupModal.conflicts,dupModal.newItems);}} onCancel={function(){resQ("cancel",dupModal.conflicts,dupModal.newItems);}}/>}
      {showModal&&<EditModal item={editItem} allCampaigns={allCamps} quarter={quarter} onSave={doSave} onClose={function(){setShowModal(false);}}/>}

      <div style={{background:"#fff",border:"1px solid #e0e8f0",borderRadius:10,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:14}}>
        <div style={{fontSize:24,flexShrink:0,marginTop:2}}>📌</div>
        <div>
          <div style={{fontWeight:800,fontSize:14,color:"#111",marginBottom:4}}>ViewSonic Americas - Marketing Calendar</div>
          <div style={{fontSize:12,color:"#555",lineHeight:1.7,maxWidth:900}}>
            Visibility into every marketing campaign across Education, Enterprise, and Government.
            {" "}<strong>Dashboard</strong> - leadership summary.
            {" "}<strong>Quarterly</strong> - week-by-week Gantt.
            {" "}<strong>Full Year</strong> - all quarters.
            {" "}<strong>Content Type</strong> - formats and dates.
            {" "}<strong>Vertical</strong> - by market segment.
            Use <strong>Q1-Q4</strong> to switch quarters and dropdowns to filter.
          </div>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{background:"#0063A3",color:"#fff",fontWeight:900,fontSize:17,padding:"5px 12px",borderRadius:6,letterSpacing:1}}>VS</div>
          <div>
            <div style={{fontWeight:800,fontSize:19,color:"#111",lineHeight:1.2}}>Marketing Calendar</div>
            <div style={{fontSize:11,color:"#999"}}>{"ViewSonic Americas - "+year}</div>
          </div>
        </div>
        <label style={{background:uploading?"#aaa":"#0063A3",color:"#fff",padding:"8px 16px",borderRadius:7,cursor:uploading?"not-allowed":"pointer",fontWeight:700,fontSize:12,userSelect:"none",display:"flex",alignItems:"center",gap:5}}>
          {uploading?"Processing...":"Upload Brief"}
          <input ref={fRef} type="file" accept=".pdf,.docx,.pptx,.txt" multiple onChange={handleFile} style={{display:"none"}} disabled={uploading}/>
        </label>
      </div>

      {upProg&&!upProg.done&&(
        <div style={{background:"#fff",border:"1px solid #d0dce8",borderRadius:8,padding:"12px 16px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:700,fontSize:13,color:"#111"}}>{"Uploading - "+upProg.current+" of "+upProg.total}</div>
            <div style={{display:"flex",gap:12,fontSize:12}}>
              <span style={{color:"#00875A",fontWeight:700}}>{"done: "+upProg.success}</span>
              {upProg.failed>0&&<span style={{color:"#C0392B",fontWeight:700}}>{"failed: "+upProg.failed}</span>}
              <span style={{color:"#aaa"}}>{(upProg.total-upProg.current)+" remaining"}</span>
            </div>
          </div>
          <div style={{background:"#f0f2f5",borderRadius:6,height:8,overflow:"hidden",marginBottom:6}}>
            <div style={{width:((upProg.current/upProg.total)*100)+"%",background:"linear-gradient(90deg,#00875A,#0063A3)",height:"100%",borderRadius:6,transition:"width 0.4s"}}/>
          </div>
          {upProg.currentName&&<div style={{fontSize:11,color:"#888"}}>{"Processing: "+upProg.currentName}</div>}
        </div>
      )}
      {upMsg&&<div style={{background:"#e8f5e9",border:"1px solid #d0dce8",borderRadius:6,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#333",whiteSpace:"pre-line"}}>{upMsg}</div>}

      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",background:"#eef0f3",borderRadius:8,padding:3,gap:2}}>
          {[["dashboard","Dashboard"],["quarterly","Quarterly"],["annual","Full Year"],["content","Content Type"],["vertical","Vertical"]].map(function(pr){
            return <button key={pr[0]} onClick={function(){setView(pr[0]);if(pr[0]==="annual")setShowFY(true);else if(pr[0]!=="dashboard")setShowFY(false);}} style={{background:view===pr[0]?"#0063A3":"transparent",color:view===pr[0]?"#fff":"#666",border:"none",borderRadius:6,padding:"6px 11px",fontWeight:700,fontSize:11,cursor:"pointer"}}>{pr[1]}</button>;
          })}
        </div>
        <div style={{display:"flex",background:"#eef0f3",borderRadius:8,padding:3,gap:2}}>
          {QUARTERS.map(function(q){
            var cnt=items.filter(function(i){return MONTH_TO_Q[i.month]===q.num;}).length;
            return <button key={q.num} onClick={function(){setQuarter(q.num);setShowFY(false);if(view==="annual")setView("quarterly");}} style={{background:quarter===q.num&&!showFY?"#fff":"transparent",color:quarter===q.num&&!showFY?"#0063A3":"#888",border:quarter===q.num&&!showFY?"1px solid #d0dce8":"none",borderRadius:6,padding:"5px 12px",fontWeight:700,fontSize:11,cursor:"pointer"}}>{q.label}{cnt>0&&<span style={{marginLeft:3,background:"#0063A3",color:"#fff",borderRadius:10,padding:"0 4px",fontSize:9}}>{cnt}</span>}</button>;
          })}
          <button onClick={function(){setShowFY(true);if(view==="quarterly")setView("annual");}} style={{background:showFY?"#fff":"transparent",color:showFY?"#0063A3":"#888",border:showFY?"1px solid #d0dce8":"none",borderRadius:6,padding:"5px 12px",fontWeight:700,fontSize:11,cursor:"pointer"}}>Full Year</button>
        </div>
        <select value={fc} onChange={function(e){setFc(e.target.value);}} style={{border:"1px solid #ddd",borderRadius:6,padding:"5px 8px",fontSize:11,background:"#fff"}}>
          <option value="All">All Campaigns</option>{allCamps.map(function(c){return <option key={c}>{c}</option>;})}
        </select>
        <select value={fv} onChange={function(e){setFv(e.target.value);}} style={{border:"1px solid #ddd",borderRadius:6,padding:"5px 8px",fontSize:11,background:"#fff"}}>
          <option value="All">All Verticals</option>{allVerts.map(function(v){return <option key={v}>{v}</option>;})}
        </select>
        <select value={ft} onChange={function(e){setFt(e.target.value);}} style={{border:"1px solid #ddd",borderRadius:6,padding:"5px 8px",fontSize:11,background:"#fff"}}>
          <option value="All">All Content Types</option>{allTypes.map(function(t){return <option key={t}>{t}</option>;})}
        </select>
        {items.length>0&&<span style={{color:"#bbb",fontSize:11,marginLeft:"auto"}}>{items.length+" total deliverable"+(items.length!==1?"s":"")}</span>}
      </div>

      {loaded&&items.length===0&&!uploading&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:"#bbb"}}>
          <div style={{fontSize:44,marginBottom:10}}>📋</div>
          <div style={{fontSize:16,fontWeight:700,color:"#ccc",marginBottom:5}}>No briefs uploaded yet</div>
          <div style={{fontSize:12}}>Upload a campaign brief (PDF, Word, or PowerPoint) to get started</div>
        </div>
      )}

      {loaded&&items.length>0&&view==="dashboard"&&<Dashboard items={items} quarter={quarter} showFullYear={showFY} campColors={campColors}/>}
      {loaded&&items.length>0&&view==="quarterly"&&!showFY&&<QView items={items} quarter={quarter} year={year} onRemove={remItem} onEdit={openEdit} onAdd={openAdd} fc={fc} fv={fv} ft={ft} campColors={campColors}/>}
      {loaded&&items.length>0&&(view==="annual"||(view==="quarterly"&&showFY))&&<AView items={items} year={year} onRemove={remItem} onEdit={openEdit} onAdd={openAdd} campColors={campColors} fv={fv} ft={ft}/>}
      {loaded&&items.length>0&&view==="content"&&<ContentView items={items} quarter={quarter} showFullYear={showFY} filterVertical={fv} filterCampaign={fc}/>}
      {loaded&&items.length>0&&view==="vertical"&&(
        <div>
          <div style={{background:"#fff",border:"1px solid #d0dce8",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontWeight:700,fontSize:13,color:"#333",whiteSpace:"nowrap"}}>Viewing period:</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {QUARTERS.map(function(q){
                var cnt=items.filter(function(i){return MONTH_TO_Q[i.month]===q.num;}).length;
                return <button key={q.num} onClick={function(){setQuarter(q.num);setShowFY(false);}} style={{background:quarter===q.num&&!showFY?"#0063A3":"#f0f2f5",color:quarter===q.num&&!showFY?"#fff":"#555",border:"none",borderRadius:7,padding:"7px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>{q.label+" - "+q.months[0].slice(0,3)+"-"+q.months[2].slice(0,3)}{cnt>0&&<span style={{marginLeft:5,background:quarter===q.num&&!showFY?"rgba(255,255,255,0.3)":"#0063A322",color:quarter===q.num&&!showFY?"#fff":"#0063A3",borderRadius:10,padding:"0 6px",fontSize:10}}>{cnt}</span>}</button>;
              })}
              <button onClick={function(){setShowFY(true);}} style={{background:showFY?"#0063A3":"#f0f2f5",color:showFY?"#fff":"#555",border:"none",borderRadius:7,padding:"7px 16px",fontWeight:700,fontSize:12,cursor:"pointer"}}>Full Year</button>
            </div>
          </div>
          <VView items={items} quarter={quarter} showFY={showFY} onRemove={remItem} onEdit={openEdit} ft={ft} fc={fc} allItems={items}/>
        </div>
      )}
    </div>
  );
}
