"use strict";
/* ---------------- constants ---------------- */
/* The 2000 note is out of circulation; the school never handles one. */
var DENOMS=[500,200,100,50,20,10,5,2,1];
var CATS=["School","Residence","STL","Construction"];
/* Cost heads apply to STL alone; every other unit books straight to its account. */
var STL_HEADS=["Program Delivery","Beneficiary Support","Contingency"];
var HEADS_ALL=STL_HEADS;                       /* report columns */
function headsFor(cat){ return cat==="STL"?STL_HEADS:[]; }
/* Placeholders only. The accountant who signs each voucher and the trustees who
   pass it are entered in the app itself (+ and the pencil beside each list) and
   live in the browser or on the site — never in this repository. */
var DEFAULT_PEOPLE=["Accountant"];
var DEFAULT_APPROVERS=["Approver 1","Approver 2","Approver 3","Approver 4"];
var ROSTER_VERSION=2;   /* bump when the standing roster changes; see applyLoaded */
var DEFAULT_PAYEES=["Local vegetable market"];   /* generic on purpose */
var DEFAULT_ACCOUNTS={School:"School EXP",Residence:"Residence EXP",STL:"School To Livelihood A/c",Construction:"Construction A/c"};
/* On a Frappe site these come from Rokar Settings, injected by the page; the
   standalone build falls back to the school it was written for. */
var BOOT=window.rokarBoot||{};
var ORG=BOOT.org||"Noor Girls High School";
var PLACE=BOOT.place||"Meghwal, Mathiya";
var FOUNDATION=BOOT.foundation||"Hikmat Foundation";
var TITLE=BOOT.title||"Rokar \u2014 Cash Book & Voucher Register";
/* A Frappe site passes an asset path, or whatever the foundation attached in
   Rokar Settings; the static build keeps the emblem beside index.html. */
var LOGO=BOOT.logo||"hikmat-emblem.png";
var SERIES=BOOT.series||"NGHS";                  /* voucher number prefix */

/* The Indian financial year runs 1 April to 31 March. Every voucher number and
   every label derives its year from a date, so the series rolls over by itself
   each April and numbering restarts at 0001 inside the new year. Nothing here
   is edited annually. */
function fyStart(iso){
  var d=String(iso||todayISO());
  var y=Number(d.slice(0,4)), m=Number(d.slice(5,7));
  return (m>=4)?y:y-1;
}
function yy(v){ return String(v%100).padStart(2,"0"); }
function fyOf(iso){ var a=fyStart(iso); return yy(a)+"-"+yy(a+1); }
function fyLabel(iso){ var a=fyStart(iso); return a+"\u2011"+yy(a+1); }

/* ---------------- state ---------------- */
var S={entries:[],days:{},mode:"local",sample:true,openingSeed:0,
       people:DEFAULT_PEOPLE.slice(),approvers:DEFAULT_APPROVERS.slice(),
       payees:DEFAULT_PAYEES.slice(),accounts:[],particulars:[],given:{},series:{}};


/* ---------------- helpers ---------------- */
function $(s,r){return (r||document).querySelector(s);}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}

/* ---------------- dialogs ----------------
   Every question the app asks goes through one centred panel, so nothing falls
   back to the browser's own box docked at the top of the window. The English
   line leads and the Hindi sits under it in the smaller face the form labels
   already use.

     ask(o, fn)      a decision   — fn() runs on confirm
     askText(o, fn)  a value      — fn(text) runs on confirm
     note(o[, fn])   something to read

   All three return immediately; the work belongs in the callback. */
var askThen=null, askExtraThen=null;
function dialogHide(){ $("#ask").hidden=true; askThen=null; askExtraThen=null; }
function dialogOpen(o,then,kind){
  if(typeof o==="string") o={title:o};
  askThen=then||null;
  $("#ask-title").textContent=o.title||"";
  [["#ask-hi",o.hindi],["#ask-note",o.note],["#ask-note-hi",o.noteHindi]]
    .forEach(function(pr){ var n2=$(pr[0]); n2.textContent=pr[1]||""; n2.hidden=!pr[1]; });

  var inp=$("#ask-input");
  inp.hidden=(kind!=="text");
  if(kind==="text"){ inp.value=o.value||""; inp.placeholder=o.placeholder||""; }

  var box=$("#ask-choices");
  box.hidden=(kind!=="choose");
  box.innerHTML="";
  if(kind==="choose"){
    (o.choices||[]).forEach(function(c){
      var lab=el("label"), cb=document.createElement("input");
      cb.type="checkbox"; cb.value=c.value; cb.checked=!!c.checked;
      lab.appendChild(cb);
      lab.appendChild(el("span",null,c.label));
      if(c.hindi) lab.appendChild(el("span","hi",c.hindi));
      if(c.amount!==undefined) lab.appendChild(el("span","amt",c.amount));
      box.appendChild(lab);
    });
  }

  var yes=$("#ask-yes");
  yes.className="btn"+(o.danger?" danger":"");
  yes.innerHTML="";
  yes.appendChild(document.createTextNode(o.yes||"OK"));
  if(o.yesHindi||kind==="note"){
    yes.appendChild(document.createTextNode(" "));
    yes.appendChild(el("span","hi",o.yesHindi||"\u0920\u0940\u0915"));
  }
  /* An optional third action, kept away from Save because it destroys something. */
  var ex=$("#ask-extra");
  askExtraThen=(o.extra&&o.extra.then)||null;
  ex.hidden=!o.extra;
  if(o.extra){
    var label=o.extra.label||"Remove";
    ex.innerHTML="";
    if(o.extra.icon&&ICONS[o.extra.icon]){
      /* A glyph, not a word: the destructive action should read at a glance and
         not sit next to Save looking like another button to press. */
      ex.className="ibtn"+(o.extra.danger?" danger":"");
      ex.innerHTML=ICONS[o.extra.icon];
      ex.title=label+(o.extra.hindi?" \u00b7 "+o.extra.hindi:"");
      ex.setAttribute("aria-label",label);
    } else {
      ex.className="btn"+(o.extra.danger?" danger":" ghost");
      ex.removeAttribute("title");
      ex.setAttribute("aria-label",label);
      ex.appendChild(document.createTextNode(label));
      if(o.extra.hindi){
        ex.appendChild(document.createTextNode(" "));
        ex.appendChild(el("span","hi",o.extra.hindi));
      }
    }
  }

  var no=$("#ask-no");
  no.hidden=(kind==="note");
  if(!no.hidden){
    no.innerHTML="";
    no.appendChild(document.createTextNode(o.no||"Not now"));
    no.appendChild(document.createTextNode(" "));
    no.appendChild(el("span","hi",o.noHindi||"\u0905\u092d\u0940 \u0928\u0939\u0940\u0902"));
  }
  $("#ask").hidden=false;
  (kind==="text"?inp:yes).focus();
}
function dialogAccept(){
  var then=askThen;
  var wantsText=!$("#ask-input").hidden, val=$("#ask-input").value;
  var wantsChoice=!$("#ask-choices").hidden;
  var picked=wantsChoice ? $$("#ask-choices input:checked").map(function(c){return c.value;}) : null;
  dialogHide();
  if(!then) return;
  then(wantsText?val:wantsChoice?picked:undefined);
}
function ask(o,then){ dialogOpen(o,then,"confirm"); }
function askText(o,then){ dialogOpen(o,then,"text"); }
function note(o,then){ dialogOpen(o,then,"note"); }
function askChoose(o,then){ dialogOpen(o,then,"choose"); }
function el(t,c,x){var e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e;}
function n(v){v=Number(v); return isFinite(v)?v:0;}
function inr(v){
  v=Math.round(n(v));
  var neg=v<0; v=Math.abs(v);
  var s=String(v), last3=s.slice(-3), rest=s.slice(0,-3);
  if(rest) last3=","+last3;
  rest=rest.replace(/\B(?=(\d{2})+(?!\d))/g,",");
  return (neg?"-":"")+rest+last3;
}
function rs(v){return "₹"+inr(v);}
function iso(d){var p=function(x){return String(x).padStart(2,"0");}; return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());}
function todayISO(){return iso(new Date());}
function ym(d){return (d||"").slice(0,7);}
function dmy(d){if(!d)return ""; var a=d.split("-"); return a[2]+"-"+a[1]+"-"+a[0];}
function monthLabel(k){
  if(!k) return "";
  var M=["January","February","March","April","May","June","July","August","September","October","November","December"];
  var a=k.split("-"); return M[Number(a[1])-1]+" "+a[0];
}
/* Indian numbering, words */
var ONES=["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
var TENS=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
function under100(x){ if(x<20) return ONES[x]; var t=TENS[Math.floor(x/10)], o=ONES[x%10]; return o?t+"-"+o:t; }
function under1000(x){ var h=Math.floor(x/100), r=x%100; var out=[]; if(h)out.push(ONES[h]+" hundred"); if(r)out.push((h?"and ":"")+under100(r)); return out.join(" "); }
function words(v){
  v=Math.round(n(v));
  if(v<=0) return "—";
  var parts=[], units=[[10000000,"crore"],[100000,"lakh"],[1000,"thousand"]];
  for(var i=0;i<units.length;i++){
    var d=Math.floor(v/units[i][0]);
    if(d){ parts.push((d<1000?under1000(d):String(d))+" "+units[i][1]); v%=units[i][0]; }
  }
  if(v) parts.push(under1000(v));
  var s=parts.join(" ");
  return "Rupees "+s.charAt(0).toUpperCase()+s.slice(1)+" only";
}
function csv(rows){
  return rows.map(function(r){
    return r.map(function(c){
      c=(c==null?"":String(c));
      return /[",\n]/.test(c) ? '"'+c.replace(/"/g,'""')+'"' : c;
    }).join(",");
  }).join("\r\n");
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

/* ---------------- sample seed ---------------- */
function seed(){
  var t=new Date(), y=t.getFullYear(), m=t.getMonth();
  function dd(day){var d=new Date(y,m,day); return iso(d);}
  var day=Math.max(3,Math.min(t.getDate(),26));
  var E=[
    /* account, payee, address, particulars, amount, unit, head, by */
    ["Residence EXP","Gas agency","Mathiya","Gas cylinder refilling 1 pcs",1070,"Residence","Program Delivery","Accountant"],
    ["Residence EXP","Local vegetable market","Mathiya","Bhindi 1kg, mirchi 250g, aloo 5kg",265,"Residence","Program Delivery","Accountant"],
    ["School EXP","Electrician","Mathiya","Light repairing, labour charge",200,"School","Program Delivery","Accountant"],
    ["School EXP","Electrical shop","Lauriya","Classroom fan repairing 6 pcs",500,"School","Program Delivery","Accountant"],
    ["School EXP","Petrol pump","Ramnagar","Petrol refilling - school bus",1200,"School","Program Delivery","Accountant"],
    ["School EXP","Stationery shop","Bettiah","A4 paper 1 packet, printer ink",995,"School","Beneficiary Support","Accountant"],
    ["School To Livelihood A/c","Form processing agent","Mathiya","Scholarship form processing - 9 students",450,"STL","Beneficiary Support","Accountant"],
    ["School To Livelihood A/c","Travel agent","Meghwal","Emergency travel - district office",380,"STL","Contingency","Accountant"],
    ["Science Block Floor-3 Construction A/c","Building contractor","Lauriya","Payment of Mobilization Advance",50000,"Construction","Program Delivery","Accountant"]
  ];
  var dayOf=[day-2,day-2,day-1,day-1,day,day,day,day-1,day];
  S.entries=E.map(function(r,i){
    var dt=dd(dayOf[i]);
    return {id:uid(),no:SERIES+"/"+fyOf(dt)+"/"+String(i+1).padStart(4,"0"),date:dt,
            account:r[0],payee:r[1],address:r[2],
            items:[{particulars:r[3],amount:r[4]}],particulars:r[3],amount:r[4],
            category:r[5],head:(r[5]==="STL"?r[6]:""),by:r[7],approved:"Approver 1",sample:true,ts:Date.now()+i};
  });
  var open=34530;
  [[dd(day-2),5000,800,0,0,2550],[dd(day-1),2500,400,0,0,400],[dd(day),1600,0,10000,0,550]].forEach(function(r){
    var recd=r[1]+r[2]+r[4];
    var counted=(r[0]===dd(day-2))?recd-100:recd; /* mirrors the real 01-09 ₹100 gap */
    var dn={}; var rem=counted;
    DENOMS.forEach(function(f){ var q=Math.floor(rem/f); if(q){dn[f]=q; rem-=q*f;} });
    S.days[r[0]]={date:r[0],opening:open,expenses:0,fee:r[1],bus:r[2],wdl:r[3],other:r[4],
                  deposit:0,upi:r[5],denoms:dn,closed:true,sample:true};
    open=open+r[1]+r[2]+r[3]+r[4];
  });
  S.accounts=[]; S.payees=[]; S.particulars=[];
  E.forEach(function(r){
    if(S.accounts.indexOf(r[0])<0) S.accounts.push(r[0]);
    if(S.payees.indexOf(r[1])<0) S.payees.push(r[1]);
    if(S.particulars.indexOf(r[3])<0) S.particulars.push(r[3]);
  });
  S.payees.sort();
  S.openingSeed=34530; S.sample=true;
}

/* ---------------- persistence ---------------- */
function payload(){return {v:1,rosterVersion:ROSTER_VERSION,savedAt:new Date().toISOString(),
                           entries:S.entries,days:S.days,sample:S.sample,openingSeed:S.openingSeed,
                           people:S.people,approvers:S.approvers,payees:S.payees,
                           accounts:S.accounts,particulars:S.particulars,given:S.given,
                           series:S.series};}
function roster(){return {sample:S.sample,openingSeed:S.openingSeed,org:ORG,fy:fyOf(),
                          people:S.people,approvers:S.approvers,accounts:S.accounts};}
function saveLocal(){
  var r=Storage.save(payload());
  var el2=document.getElementById("backup-note");
  if(!r.ok&&el2){ el2.textContent="Could not save to this browser: "+r.error; el2.style.color="var(--bad)"; }
}
function persist(){ saveLocal(); }

/* ---------------- boot ---------------- */
function boot(){
  buildStatic();
  /* On a Frappe site the page is rendered inside the web template's <main>,
     which the print stylesheet hides -- taking #printarea down with it and
     printing a blank sheet. Lifting it to <body> makes both builds identical. */
  var pa=$("#printarea");
  if(pa && pa.parentNode !== document.body) document.body.appendChild(pa);
  var raw=Storage.load();
  if(raw && typeof raw.then==="function"){
    /* Frappe adapter: render the empty shell now, fill it when the books arrive. */
    renderAll();
    raw.then(applyLoaded).catch(function(e){
      setBanner("info","Could not reach the server",
                (e&&e.message)||"The books could not be loaded. Nothing has been changed.");
    });
  } else {
    applyLoaded(raw);
  }
}
function applyLoaded(raw){
  try{
    if(raw){ var p=JSON.parse(raw);
             S.entries=p.entries||[]; S.days=p.days||{}; S.sample=!!p.sample; S.openingSeed=n(p.openingSeed);
             if(p.people&&p.people.length) S.people=p.people;
             if(p.approvers&&p.approvers.length) S.approvers=p.approvers;
             if(p.payees&&p.payees.length) S.payees=p.payees;
             if(p.accounts) S.accounts=p.accounts;
             if(p.particulars) S.particulars=p.particulars;
             if(p.given) S.given=p.given;
             if(p.series) S.series=p.series;
             /* The standing roster is set by the foundation, not by the browser:
                an older save keeps its payees but takes the current staff list. */
             if(n(p.rosterVersion)<ROSTER_VERSION){
               S.people=DEFAULT_PEOPLE.slice(); S.approvers=DEFAULT_APPROVERS.slice();
             } }
  }catch(e){}
  if(!S.entries.length && !Object.keys(S.days).length && Storage.mode!=="frappe") seed();
  renderAll();
}

/* Storage lives in Storage.load/save (storage.js) so this file never
   assumes where the books are kept. Swap that module to move off the browser. */

/* ---------------- static build ---------------- */
function buildStatic(){
  $("#f-date").value=todayISO();
  $("#d-date").value=todayISO();
  buildCatChips();
  buildHeadChips("School");
  suggestAccount("School");
  applySigRules("School");
  setItems();
  fillPeople();
  var tb=$("#d-denoms");
  DENOMS.forEach(function(f){
    var tr=el("tr");
    tr.appendChild(el("td","face","₹"+f));
    var td=el("td","r"); var i=el("input"); i.type="number"; i.min="0"; i.step="1"; i.className="num";
    i.dataset.face=f; i.value=""; i.placeholder="0"; td.appendChild(i); tr.appendChild(td);
    var v=el("td","r num","0"); v.dataset.val=f; tr.appendChild(v);
    tb.appendChild(tr);
  });
  /* tabs */
  $$(".tab").forEach(function(t){
    t.addEventListener("click",function(){ showTab(t.dataset.v); });
  });
  $("#add-by").addEventListener("click",function(){ addPerson("people","#f-by","Name of the accountant","लेखाकार का नाम"); });
  $("#add-appr").addEventListener("click",function(){ addPerson("approvers","#f-appr","Name of the person who passes the voucher","वाउचर पास करने वाले का नाम"); });
  $("#add-payee").addEventListener("click",function(){ addPerson("payees","#f-payee","Name of the vendor, contractor or person paid","जिसे भुगतान हुआ, उसका नाम"); });
  $("#edit-by").addEventListener("click",function(){ managePerson("people","#f-by","by"); });
  $("#edit-appr").addEventListener("click",function(){ managePerson("approvers","#f-appr","approved"); });
  $("#edit-payee").addEventListener("click",function(){ managePerson("payees","#f-payee","payee"); });
  $("#v-submit").addEventListener("click",function(){ if(editingId) submitEntry(editingId); });
  $("#d-print").addEventListener("click",printDay);
  $("#add-item").addEventListener("click",function(){ addItemRow(); });
  ["f-date","f-payee","f-addr","f-acct","f-by","f-appr"].forEach(function(id){
    $("#"+id).addEventListener("input",renderSlip);
  });
  $("#vform").addEventListener("submit",addVoucher);
  $("#v-clear").addEventListener("click",resetForm);
  $("#btn-print").addEventListener("click",function(){
    $("#printarea").innerHTML=$("#slip").outerHTML; setPageSize("A5 landscape"); window.print();
  });
  $("#r-month").addEventListener("change",renderRegister);
  $("#r-cat").addEventListener("change",renderRegister);
  $("#p-month").addEventListener("change",renderReports);
  $("#d-date").addEventListener("change",loadDay);
  ["d-fee","d-bus","d-wdl","d-oth","d-exp","d-dep","d-upi"].forEach(function(id){ $("#"+id).addEventListener("input",calcDay); });
  $("#d-denoms").addEventListener("input",calcDay);
  $("#d-save").addEventListener("click",saveDay);
  $("#d-clear").addEventListener("click",function(){ $$("#d-denoms input").forEach(function(i){i.value="";}); calcDay(); });
  var rd=$("#r-download");
  rd.innerHTML=ICONS.down;
  rd.title="Download this month\u2019s report";
  rd.setAttribute("aria-label","Download this month\u2019s report");
  rd.addEventListener("click",downloadFromRegister);
  $("#x-vouchers").addEventListener("click",exportRegister);
  $("#x-tally").addEventListener("click",exportTally);
  $("#x-month").addEventListener("click",exportMonth);
  $("#p-given-edit").addEventListener("click",function(){
    askGiven($("#p-month").value,true,function(){ renderReports(); });
  });
  $("#x-daybook").addEventListener("click",exportDaybook);
  $("#x-backup").addEventListener("click",backupNow);
  $("#x-restore").addEventListener("click",function(){ $("#f-restore").click(); });
  $("#f-restore").addEventListener("change",function(){ if(this.files[0]) restoreFrom(this.files[0]); this.value=""; });

  $("#ask-yes").addEventListener("click",dialogAccept);
  $("#ask-no").addEventListener("click",dialogHide);
  $("#ask-extra").addEventListener("click",function(){
    var f=askExtraThen; dialogHide(); if(f) f();
  });
  /* clicking the backdrop, never the panel itself, dismisses */
  $("#ask").addEventListener("click",function(ev){ if(ev.target===$("#ask")) dialogHide(); });
  document.addEventListener("keydown",function(ev){
    if($("#ask").hidden) return;
    if(ev.key==="Escape"){ dialogHide(); return; }
    if(ev.key==="Enter"&&!$("#ask-input").hidden){ ev.preventDefault(); dialogAccept(); }
  });
}

/* ---------------- banner ---------------- */
var forcedBanner=null;
function setBanner(kind,title,body){ forcedBanner={kind:kind,title:title,body:body}; renderBanner(); }
function renderBanner(){
  var slot=$("#banner-slot"); slot.innerHTML="";
  if(forcedBanner){
    var b=el("div","banner "+forcedBanner.kind);
    b.appendChild(el("b",null,forcedBanner.title)); b.appendChild(el("span",null,forcedBanner.body));
    slot.appendChild(b); return;
  }
  if(S.sample){
    var s=el("div","banner sample");
    s.appendChild(el("b",null,"Sample data"));
    s.appendChild(el("span",null,"Seven example vouchers and three daybook days are loaded so you can see the reports working. Clear them before the first real entry."));
    var btn=el("button","btn sm","Clear and start real books"); btn.type="button";
    btn.addEventListener("click",startReal);
    s.appendChild(btn); slot.appendChild(s);
  }
}
function startReal(){
  askText({title:"Opening cash in hand today (₹)",
           hindi:"आज हाथ में नकद (₹)",
           note:"The sample vouchers and daybook days are cleared, and the real books start from this figure.",
           noteHindi:"नमूना वाउचर और दिन मिट जाएँगे, और असली बही इसी रकम से शुरू होगी।",
           value:"0",yes:"Start real books",yesHindi:"शुरू करें",danger:true},function(open){
    S.entries=[]; S.days={}; S.sample=false; S.openingSeed=n(open);
    var d=todayISO();
    S.days[d]={date:d,opening:S.openingSeed,fee:0,bus:0,wdl:0,other:0,expenses:0,deposit:0,upi:0,utr:"",denoms:{},closed:false};
    persist(); renderAll();
  });
}

/* ---------------- voucher lines ---------------- */
/* A voucher is a list of lines, like the paper form's numbered rows.
   Older saved entries hold a single particulars/amount pair; itemsOf()
   presents those as a one-line voucher so nothing needs migrating. */
function itemsOf(e){
  if(e && e.items && e.items.length) return e.items;
  return [{particulars:(e&&e.particulars)||"",amount:(e&&e.amount)||0}];
}
function addItemRow(vals){
  var box=$("#f-items"), row=el("div","itemrow");
  var p=el("input"); p.type="text"; p.setAttribute("list","particularsList");
  p.placeholder="e.g. Gas cylinder refilling 1 pcs"; p.className="i-part";
  p.autocomplete="off"; p.value=(vals&&vals.particulars)||"";
  var a=el("input"); a.type="number"; a.min="0"; a.step="1"; a.className="i-amt num";
  a.placeholder="0"; a.value=(vals&&vals.amount)||"";
  var x=el("button","i-del"); x.type="button"; x.textContent="\u00d7"; x.title="Remove this line";
  x.addEventListener("click",function(){
    row.remove();
    if(!$$(".itemrow",box).length) addItemRow();
    renumberItems(); renderSlip();
  });
  [p,a].forEach(function(f){ f.addEventListener("input",function(){ renderSlip(); }); });
  row.appendChild(el("span","i-sn",""));
  row.appendChild(p); row.appendChild(a); row.appendChild(x);
  box.appendChild(row);
  renumberItems();
  return row;
}
function renumberItems(){
  $$("#f-items .itemrow").forEach(function(r,i){ $(".i-sn",r).textContent=(i+1)+"."; });
}
function readItems(){
  return $$("#f-items .itemrow").map(function(r){
    return {particulars:$(".i-part",r).value.trim(), amount:n($(".i-amt",r).value)};
  }).filter(function(i){ return i.particulars || i.amount; });
}
function setItems(list){
  $("#f-items").innerHTML="";
  (list&&list.length?list:[{particulars:"",amount:""}]).forEach(addItemRow);
}

/* ---------------- chips & roster ---------------- */
function pressed(sel){ var c=$(sel+' .chip[aria-pressed="true"]'); return c?c.dataset.val:""; }
function buildCatChips(){
  var box=$("#f-cat"); box.innerHTML="";
  CATS.forEach(function(c,i){
    var b=el("button","chip",c); b.type="button"; b.dataset.val=c;
    b.setAttribute("aria-pressed",String(i===0));
    b.addEventListener("click",function(){
      $$(".chip",box).forEach(function(o){o.setAttribute("aria-pressed",String(o===b));});
      buildHeadChips(c);
      suggestAccount(c);
      applySigRules(c);
      renderSlip();
    });
    box.appendChild(b);
  });
}
/* Contingency is offered for STL only; any other unit falls back to a base head. */
function buildHeadChips(cat){
  var box=$("#f-head"), keep=pressed("#f-head"), opts=headsFor(cat);
  box.innerHTML="";
  $("#f-headwrap").hidden=!opts.length;
  if(!opts.length) return;                     /* no chips pressed => head stays "" */
  if(opts.indexOf(keep)<0) keep=opts[0];
  opts.forEach(function(h){
    var b=el("button","chip",h); b.type="button"; b.dataset.val=h;
    b.setAttribute("aria-pressed",String(h===keep));
    b.addEventListener("click",function(){
      $$(".chip",box).forEach(function(o){o.setAttribute("aria-pressed",String(o===b));});
      renderSlip();
    });
    box.appendChild(b);
  });
}
/* A contractor voucher is signed by the accountant and the contractor only —
   there is no "Passed by" block on the printed construction slip. */
function applySigRules(cat){
  var two=(cat==="Construction");
  $("#f-apprwrap").hidden=two;
  $("#f-sigrow").classList.toggle("one",two);
}
function suggestAccount(cat){
  var f=$("#f-acct"), was=f.value.trim();
  var isDefault=!was||Object.keys(DEFAULT_ACCOUNTS).some(function(k){return DEFAULT_ACCOUNTS[k]===was;});
  if(isDefault) f.value=DEFAULT_ACCOUNTS[cat]||"";
  f.placeholder=cat==="Construction"?"e.g. Science Block Floor-3 Construction A/c":(DEFAULT_ACCOUNTS[cat]||"");
}
/* The roster is four lists on Rokar Settings, not a document per name, so any
   change writes the whole thing back. The browser build keeps it in the saved
   blob and needs nothing here. */
function persistRoster(){
  if(!Storage.saveRoster) return;
  Storage.saveRoster({people:S.people,approvers:S.approvers,
                      payees:S.payees,accounts:S.accounts})
    .catch(function(err){
      setBanner("info","Roster not saved to the server",
                ((err&&err.message)||"unknown error")+
                " \u2014 the change is held in this browser only.");
    });
}
function fillPeople(){
  [["#f-by",S.people],["#f-appr",S.approvers],["#f-payee",S.payees]].forEach(function(p){
    var sel=$(p[0]), was=sel.value;
    sel.innerHTML="";
    p[1].forEach(function(nm){ sel.appendChild(new Option(nm,nm)); });
    if(p[1].indexOf(was)>=0) sel.value=was;
  });
}
/* Adds to the saved roster so the name is picked from a list next time —
   matching case-insensitively so "anand" never becomes a second Anand. */
function addPerson(key,sel,label,hindi){
  askText({title:label,hindi:hindi,yes:"Add",yesHindi:"जोड़ें"},function(raw){
    var nm=(raw||"").trim(); if(!nm) return;
    var exists=S[key].filter(function(x){return x.toLowerCase()===nm.toLowerCase();})[0];
    if(exists) nm=exists; else { S[key].push(nm); S[key].sort(); }
    fillPeople(); $(sel).value=nm; persist(); renderSlip();
    persistRoster();
  });
}

/* Renames or removes one roster name.
   A rename rewrites the saved vouchers too, so a corrected spelling does not
   split one person across two rows of the monthly report. A removal is refused
   while any voucher still names the person: dropping it would leave those
   vouchers pointing at a name the roster no longer knows. Rename instead. */
/* Takes a name off its list, refusing while any voucher still carries it:
   dropping it then would leave those vouchers pointing at a name the roster no
   longer knows. */
function removeName(key,sel,field,cur,used){
  if(used){
    note({title:"\u201c"+cur+"\u201d stays on the list.",
          hindi:"यह नाम सूची में रहेगा।",
          note:used+" voucher"+(used===1?"":"s")+" still name"+(used===1?"s":"")+
               " it. Rename it instead, and the vouchers follow.",
          noteHindi:"इसे हटाया नहीं जा सकता। नाम बदलें — वाउचर अपने आप बदल जाएँगे।"});
    return;
  }
  ask({title:"Remove \u201c"+cur+"\u201d from the list?",
         hindi:"\u0907\u0938 \u0928\u093e\u092e \u0915\u094b \u0938\u0942\u091a\u0940 \u0938\u0947 \u0939\u091f\u093e\u090f\u0901?",
         note:"No voucher names it, so nothing in the books changes.",
         noteHindi:"\u0915\u093f\u0938\u0940 \u0935\u093e\u0909\u091a\u0930 \u092e\u0947\u0902 \u0928\u0939\u0940\u0902 \u0939\u0948, \u0907\u0938\u0932\u093f\u090f \u092c\u0939\u0940 \u092e\u0947\u0902 \u0915\u094b\u0908 \u092c\u0926\u0932\u093e\u0935 \u0928\u0939\u0940\u0902\u0964",
       yes:"Remove",yesHindi:"\u0939\u091f\u093e\u090f\u0901",danger:true},function(){
    S[key]=S[key].filter(function(x){return x!==cur;});
    fillPeople(); persist(); renderSlip();
    persistRoster();
  });
}

function managePerson(key,sel,field){
  var cur=$(sel).value;
  if(!cur){ note("Pick a name in the list first."); return; }
  var used=S.entries.filter(function(e){return e[field]===cur;}).length;
  askText({title:"Rename \u201c"+cur+"\u201d",
           hindi:"नाम बदलें",
           note:used?("It is named on "+used+" saved voucher"+(used===1?"":"s")+
                      ", and a rename carries onto all of them.")
                    :"Or remove it from the list altogether.",
           noteHindi:used?"नाम बदलने पर वाउचर अपने आप बदल जाएँगे।"
                         :"या इसे सूची से हटा दें।",
           value:cur,yes:"Save",yesHindi:"सहेजें",
           extra:{icon:"del",label:"Remove",hindi:"हटाएँ",danger:true,
                  then:function(){ removeName(key,sel,field,cur,used); }}},
    function(raw){
  var nm=(raw||"").trim();

  if(!nm||nm===cur) return;
  var clash=S[key].filter(function(x){return x.toLowerCase()===nm.toLowerCase()&&x!==cur;})[0];
  if(clash){ note("\u201c"+clash+"\u201d is already on the list."); return; }

  S[key]=S[key].map(function(x){return x===cur?nm:x;}); S[key].sort();
  var moved=0;
  S.entries.forEach(function(e){ if(e[field]===cur){ e[field]=nm; moved++; } });
  fillPeople(); $(sel).value=nm; persist(); renderAll();
  persistRoster();
  if(moved) note("Renamed, and carried onto "+moved+" saved voucher"+(moved===1?"":"s")+".");
  });
}

function showTab(name){
  $$(".tab").forEach(function(o){o.setAttribute("aria-selected",String(o.dataset.v===name));});
  $$(".view").forEach(function(v){v.hidden=(v.id!=="v-"+name);});
  if(name==="reports") renderReports();
  if(name==="register") renderRegister();
}

/* ---------------- document lifecycle ----------------
   A voucher is a Draft while it can still be corrected, Submitted once it is
   part of the books. Only Submitted vouchers reach the daybook, the monthly
   reports and the Tally export, so an unfinished entry can sit in the register
   without moving the cash position. A voucher that turns out to be wrong is
   deleted and written again from scratch -- there is no cancel and no
   amendment, because a school cash book gains nothing from carrying a
   withdrawn document around. Vouchers saved before the lifecycle existed carry
   no status and are read as Submitted, so books that already balance keep
   their figures. */
var editingId=null;      /* draft open in the form, if any */
function statusOf(e){ return e.status||"Submitted"; }
function isPosted(e){ return statusOf(e)==="Submitted"; }
function posted(list){ return list.filter(isPosted); }
function entryById(id){ return S.entries.filter(function(x){return x.id===id;})[0]; }
function say(msg){ var b=$("#v-status"); if(b) b.textContent=msg||""; }

function press(sel,val){
  if(!val) return;
  var c=$$(".chip",$(sel)).filter(function(b){return b.dataset.val===val;})[0];
  if(c) c.click();
}
/* Puts a name on its roster if the voucher uses one the list has lost. */
function ensureName(key,sel,nm){
  if(!nm) return;
  if(S[key].indexOf(nm)<0){ S[key].push(nm); S[key].sort(); fillPeople(); }
  $(sel).value=nm;
}
function loadIntoForm(e){
  press("#f-cat",e.category);
  press("#f-head",e.head);
  $("#f-date").value=e.date||todayISO();
  $("#f-acct").value=e.account||"";
  $("#f-addr").value=e.address||"";
  setItems(itemsOf(e).map(function(i){return {particulars:i.particulars,amount:i.amount};}));
  fillPeople();
  ensureName("payees","#f-payee",e.payee);
  ensureName("people","#f-by",e.by);
  ensureName("approvers","#f-appr",e.approved);
  renderSlip(); syncFormMode();
  $("#vform").scrollIntoView({behavior:"smooth",block:"start"});
}
/* Submit only exists while a saved draft is open: you cannot submit a voucher
   that has not been written down yet. */
function syncFormMode(){
  var e=editingId?entryById(editingId):null;
  var draft=!!(e&&statusOf(e)==="Draft");
  $("#v-submit").hidden=!draft;
  $("#v-save").textContent=draft?"Save changes":"Save draft";
}
function editDraft(id){
  var e=entryById(id); if(!e) return;
  if(statusOf(e)!=="Draft"){ note("Only a draft can be edited."); return; }
  editingId=id; showTab("voucher"); loadIntoForm(e);
  say("Editing draft "+e.no+".");
}
function submitEntry(id,asked){
  var e=entryById(id); if(!e) return;
  if(statusOf(e)!=="Draft"){ note("Only a draft can be submitted."); return; }
  function go(){
    e.status="Submitted"; e.submittedAt=Date.now();
    if(editingId===id){ editingId=null; resetForm(); }
    persist(); renderAll(); say("Voucher "+e.no+" submitted.");
    if(Storage.submitVoucher&&e.serverSaved){
      Storage.submitVoucher(e.no).catch(function(err){
        e.status="Draft"; persist(); renderAll();
        note("The server did not submit this voucher: "+((err&&err.message)||"unknown error")+
             " It is a draft again.");
      });
    }
  }
  if(asked){ go(); return; }                    /* the save already asked */
  ask({title:"Submit voucher "+e.no+"?",
       hindi:"यह वाउचर जमा करें?",
       note:"It enters the daybook and the monthly reports. After this it can be corrected only by cancelling and amending it.",
       noteHindi:"यह रोकड़ बही और मासिक रिपोर्ट में दर्ज हो जाएगा। इसके बाद सुधार केवल रद्द कर के ही हो सकेगा।",
       yes:"Submit",yesHindi:"जमा करें"},go);
}
/* ---------------- printing ----------------
   The voucher goes on A5 landscape and the day sheet on A4 landscape. A
   stylesheet can only hold one @page size, so the rule is injected just before
   the print and overrides the default in styles.css by coming later. */
function setPageSize(spec){
  var st=$("#pagesize");
  if(!st){ st=el("style"); st.id="pagesize"; document.head.appendChild(st); }
  st.textContent="@media print{@page{size:"+spec+";margin:0}}";
}

/* The day sheet the foundation already uses: NGHS's own wording and order,
   the cash account and note count down the left, what the money went on and
   the bank transfers down the right. One A4 landscape page.
   "T.B." on their sheet is the Teachers' Block, which this app calls
   Residence. The right-hand itemisation is drawn from the same vouchers as the
   "Expenses" line on the left, so the two always agree. */
function printDay(){
  var dt=$("#d-date").value;
  if(!dt){ note("Pick a date first."); return; }
  var opening=openingFor(dt), exp=n($("#d-exp").value);
  var fee=n($("#d-fee").value), bus=n($("#d-bus").value), wdl=n($("#d-wdl").value),
      oth=n($("#d-oth").value), dep=n($("#d-dep").value), upi=n($("#d-upi").value);
  var utr=($("#d-utr").value||"").trim();
  var gross=opening+fee+bus+wdl+oth;
  var received=fee+bus+oth;                     /* what came over the counter */
  var closing=gross-exp-dep;

  var box=el("div","daysheet");
  box.appendChild(el("div","dtitle1",ORG.toUpperCase()));
  box.appendChild(el("div","dtitle2","DAY BOOK AS ON DATE "+dmy(dt)));

  var cols=el("div","dcols");

  function twoCol(){ return el("table","dt"); }
  function put(tb,label,val,cls){
    var tr=el("tr",cls||null);
    tr.appendChild(el("td",null,label));
    tr.appendChild(el("td","r",val===null?"":inr(val)));
    tb.appendChild(tr);
  }
  function head(tb,label,right){
    var tr=el("tr","subhead");
    tr.appendChild(el("td",null,label));
    tr.appendChild(el("td","r",right||""));
    tb.appendChild(tr);
  }

  /* ---- left: the cash account, then the note count ---- */
  var left=el("div","dstack");
  var t1=twoCol(), b1=el("tbody");
  put(b1,"Opening Balance",opening);
  put(b1,"School fee in cash",fee);
  /* The paper sheet leaves these lines blank; print them only when used. */
  if(bus) put(b1,"Bus fee in cash",bus);
  if(wdl) put(b1,"Cash withdrawn from bank",wdl);
  if(oth) put(b1,"Other cash receipts",oth);
  put(b1,"Gross Total",gross,"grandrow");
  put(b1,"Expenses",exp);
  put(b1,"Total Bank (ICICI)",dep);
  put(b1,"IN UPI Baircode",upi);
  put(b1,"Total Cash received",received);
  put(b1,"Closing balance",closing,"grandrow");
  t1.appendChild(b1);
  left.appendChild(t1);

  var t3=el("table","dt dn"), h3=el("thead"), hr3=el("tr");
  ["Currency","Qty","Amount"].forEach(function(h,i){ hr3.appendChild(el("th",i?"r":null,h)); });
  h3.appendChild(hr3); t3.appendChild(h3);
  var b3=el("tbody"), counted=0;
  $$("#d-denoms input").forEach(function(i){
    var f=Number(i.dataset.face), q=n(i.value);
    counted+=f*q;
    var tr=el("tr");
    tr.appendChild(el("td",null,inr(f)));
    tr.appendChild(el("td","r",q?String(q):""));
    tr.appendChild(el("td","r",inr(f*q)));
    b3.appendChild(tr);
  });
  t3.appendChild(b3);
  var f3=el("tfoot"), fr3=el("tr","grandrow");
  fr3.appendChild(el("td",null,"TOTAL"));
  fr3.appendChild(el("td","r",""));
  fr3.appendChild(el("td","r",inr(counted)));
  f3.appendChild(fr3);
  if(counted!==received){
    var vr=el("tr","memo"), vc=el("td",null,counted>received?"Counted over cash received":"Counted short of cash received");
    vc.colSpan=2; vr.appendChild(vc);
    vr.appendChild(el("td","r",(counted>received?"+":"")+inr(counted-received)));
    f3.appendChild(vr);
  }
  t3.appendChild(f3);
  left.appendChild(t3);
  cols.appendChild(left);

  /* ---- right: the day's spending by block, then the bank transfers ---- */
  var t2=twoCol(), b2=el("tbody");
  var BLOCKS=[["School Expenses","School"],["T.B. Expenses","Residence"],
              ["STL Expenses","STL"],["Construction Expenses","Construction"]];
  BLOCKS.forEach(function(pair,bi){
    var mine=posted(S.entries).filter(function(e){
      return e.date===dt&&e.category===pair[1];
    });
    /* School and T.B. are always on the sheet; the other two only when used. */
    if(!mine.length&&bi>1) return;
    head(b2,pair[0]);
    mine.forEach(function(e){
      itemsOf(e).forEach(function(it){ put(b2,it.particulars||"",n(it.amount)); });
    });
    if(!mine.length) put(b2,"","");
  });
  put(b2,"Total",exp,"grandrow");
  head(b2,"BANK (ICICI)");
  head(b2,"UTR NO","AMOUNT");
  if(dep) put(b2,utr||"—",dep); else put(b2,"","");
  put(b2,"Total",dep,"grandrow");
  t2.appendChild(b2);
  cols.appendChild(t2);

  box.appendChild(cols);

  var sg=el("div","sigs");
  [["","Accountant"],["","Passed by"],["","Verified by"]].forEach(function(pr){
    var b=el("div","sig");
    b.appendChild(el("div","nm",pr[0]));
    b.appendChild(el("div","lb",pr[1]));
    sg.appendChild(b);
  });
  box.appendChild(sg);

  var pa=$("#printarea"); pa.innerHTML=""; pa.appendChild(box);
  setPageSize("A4 landscape");
  window.print();
}


/* Prints a saved voucher \u2014 including one amended after it was first issued.
   The browser's print dialog is also the way to keep a PDF copy: choose
   "Save as PDF" as the destination. */
function printEntry(id){
  var e=entryById(id); if(!e) return;
  var d={date:e.date,payee:e.payee,items:itemsOf(e),amount:n(e.amount),
         category:e.category,head:e.head,account:e.account,address:e.address,
         by:e.by,approved:e.approved};
  var box=el("div","slip");
  fillSlip(box,d,e.no);
  var pa=$("#printarea"); pa.innerHTML=""; pa.appendChild(box);
  setPageSize("A5 landscape");
  window.print();
}

/* ---------------- voucher ---------------- */
/* The next number in the financial year the voucher itself falls in, so a
   voucher back-dated into March takes last year's series, not this year's.

   The series only counts forward. Deleting the newest voucher must not hand
   its number to the next one: the gap is the record that something was taken
   out, and Frappe's own make_autoname counter behaves the same way, so the
   two builds would otherwise drift apart. S.series holds the high-water mark
   per year. */
function nextNo(dateISO){
  var fy=fyOf(dateISO), pre=SERIES+"/"+fy+"/", mx=n((S.series||{})[fy]);
  S.entries.forEach(function(e){
    var no=String(e.no||"");
    if(no.indexOf(pre)!==0) return;              /* another year's series */
    /* a trailing "-1" marks a correction; the series number precedes it */
    var m=/(\d+)(?:-\d+)?$/.exec(no); if(m) mx=Math.max(mx,Number(m[1]));
  });
  return pre+String(mx+1).padStart(4,"0");
}
/* Records that a number has been handed out, so it is never offered again. */
function claimNo(no,dateISO){
  var m=/(\d+)(?:-\d+)?$/.exec(String(no||"")); if(!m) return;
  var fy=fyOf(dateISO);
  S.series=S.series||{};
  S.series[fy]=Math.max(n(S.series[fy]),Number(m[1]));
}
function formData(){
  var items=readItems();
  return {date:$("#f-date").value,payee:$("#f-payee").value,
          items:items,
          particulars:items.map(function(i){return i.particulars;}).filter(Boolean).join("; "),
          amount:items.reduce(function(a,i){return a+n(i.amount);},0),
          category:pressed("#f-cat"),head:pressed("#f-head"),
          account:$("#f-acct").value.trim(),address:$("#f-addr").value.trim(),
          by:$("#f-by").value,
          approved:(pressed("#f-cat")==="Construction")?"":$("#f-appr").value};
}
/* Lays out the same form as the printed NGHS voucher book:
   masthead, Debited A/c / Paid to / Date / Address, a ruled
   S.NO.-Particulars-Amount table, Rupees in Word + Total, three signatures. */
function renderSlip(){
  var d=formData(), cur=editingId?entryById(editingId):null;
  var no=cur?cur.no:nextNo(d.date);
  $("#next-no").textContent=(cur?"Draft: ":"Next: ")+no;
  $("#f-total").textContent=inr(d.amount);
  $("#f-words").textContent=d.amount?words(d.amount):"\u2014";
  var s=$("#slip"); s.innerHTML="";
  fillSlip(s,d,no);
}
/* Draws one voucher into `s`. Used for the live preview and for printing a
   voucher straight out of the register, so both come out identical. */
function fillSlip(s,d,no){
  var mh=el("div","mh");
  mh.appendChild(el("div","nm",ORG));
  mh.appendChild(el("div","pl",PLACE));
  s.appendChild(mh);

  function fieldRow(pairs){
    var r=el("div","fr");
    pairs.forEach(function(p){
      r.appendChild(el("span","fl",p[0]));
      r.appendChild(el("span","fv"+(p[2]?" "+p[2]:""),p[1]||""));
    });
    return r;
  }
  var F=el("div","fields");
  /* STL is the only unit that carries a cost head, and it has to reach the
     paper: the head is what the STL spend is audited against. */
  F.appendChild(d.category==="STL"&&d.head
    ? fieldRow([["Debited A/c :",d.account,"grow2"],["Cost Head :-",d.head]])
    : fieldRow([["Debited A/c :",d.account]]));
  F.appendChild(fieldRow([["Paid to Mr./Mrs./M/s:",d.payee,"grow2"],["Date :-",dmy(d.date)]]));
  F.appendChild(fieldRow([["Address :-",d.address]]));
  F.appendChild(fieldRow([["Voucher No. :",no]]));
  s.appendChild(F);

  var t=el("table","vt");
  var th=el("thead"), htr=el("tr");
  htr.appendChild(el("th","c-sn","S.NO."));
  htr.appendChild(el("th",null,"Particulars"));
  htr.appendChild(el("th","c-amt","Amount"));
  th.appendChild(htr); t.appendChild(th);

  var tb=el("tbody");
  var lines=d.items.filter(function(i){return i.particulars||i.amount;});
  lines.forEach(function(it,i){
    var tr=el("tr");
    tr.appendChild(el("td","c-sn",(i+1)+"."));
    tr.appendChild(el("td",null,it.particulars||""));
    tr.appendChild(el("td","c-amt",it.amount?inr(it.amount):""));
    tb.appendChild(tr);
  });
  for(var b=lines.length;b<4;b++){
    var blank=el("tr","filler");
    blank.appendChild(el("td","c-sn")); blank.appendChild(el("td")); blank.appendChild(el("td","c-amt"));
    tb.appendChild(blank);
  }
  t.appendChild(tb);

  var tf=el("tfoot"), wr=el("tr","wordrow");
  var wc=el("td"); wc.colSpan=2;
  /* The three parts sit on one line inside an inner div: a td set to
     display:flex stops being a table cell and drops its colspan. */
  var wl=el("div","wl");
  wl.appendChild(el("span",null,"Rupees in Word"));
  wl.appendChild(el("span","w",d.amount?words(d.amount).replace(/^Rupees /,"").replace(/ only$/," Rupees Only"):""));
  /* "Total" is pre-printed on the paper book at the right edge of this cell,
     hard against the Amount column -- so it prints whether or not there is a
     figure yet. */
  wl.appendChild(el("span","tl","Total"));
  wc.appendChild(wl);
  wr.appendChild(wc);
  wr.appendChild(el("td","c-amt grand",d.amount?inr(d.amount):""));
  tf.appendChild(wr); t.appendChild(tf);
  s.appendChild(t);

  var isBuild=(d.category==="Construction");
  var blocks=isBuild
    ? [[d.by,"Accountant"],["","Signature of Contractor"]]
    : [[d.by,"Accountant"],[d.approved,"Passed by"],["","Signature of Receiver"]];
  var sg=el("div","sigs"+(isBuild?" two":""));
  blocks.forEach(function(p){
    var b=el("div","sig");
    b.appendChild(el("div","nm",p[0]||""));
    b.appendChild(el("div","lb",p[1]));
    sg.appendChild(b);
  });
  s.appendChild(sg);
}
function addVoucher(ev){
  ev.preventDefault();
  var d=formData();
  if(!d.items.length){ note("Add at least one line to the voucher."); return; }
  var bad=0;
  d.items.forEach(function(i,ix){ if(!i.particulars||!(n(i.amount)>0)) bad=bad||ix+1; });
  if(bad){ note("Line "+bad+" needs both a description and an amount above zero."); return; }
  if(!d.payee){ note("Choose who was paid."); return; }
  if(!d.account){ note("Enter the account to debit \u2014 it prints on the voucher."); $("#f-acct").focus(); return; }
  if(d.category==="STL"&&!d.head){ note("Pick a cost head \u2014 STL vouchers need one."); return; }
  /* Save writes a Draft. Nothing reaches the daybook or the reports until it
     is submitted, so a half-checked voucher can wait here safely. */
  if(editingId){
    var prev=entryById(editingId);
    if(!prev){ note("That draft is no longer in the register."); editingId=null; syncFormMode(); return; }
    if(statusOf(prev)!=="Draft"){ note("Only a draft can be edited \u2014 amend the voucher instead."); return; }
    /* A draft keeps its number while it is corrected. On a Frappe site the
       server owns the name and will not rename a voucher, so renumbering here
       invents a document the server does not have -- the PUT then lands on a
       name that was never created. The "-1" belongs to amendment, where a
       genuinely new document exists. */
    d.id=prev.id; d.no=prev.no; d.ts=prev.ts; d.serverSaved=prev.serverSaved;
    d.status="Draft";
    S.entries=S.entries.map(function(x){return x.id===prev.id?d:x;});
  } else {
    d.id=uid(); d.no=nextNo(d.date); d.ts=Date.now();
    d.status="Draft";
    claimNo(d.no,d.date);
    S.entries.push(d);
  }
  editingId=d.id;
  if(d.account && S.accounts.indexOf(d.account)<0){ S.accounts.push(d.account); persistRoster(); }
  d.items.forEach(function(it){
    if(it.particulars && S.particulars.indexOf(it.particulars)<0) S.particulars.unshift(it.particulars);
  });
  S.particulars=S.particulars.slice(0,400);     /* keep the suggestion list bounded */
  if(!S.days[d.date]) S.days[d.date]={date:d.date,opening:openingFor(d.date),fee:0,bus:0,wdl:0,other:0,expenses:0,deposit:0,upi:0,utr:"",denoms:{},closed:false};
  /* The draft stays in the form, so printing it or submitting it is the next
     click rather than a hunt through the register. */
  persist(); renderAll(); syncFormMode();
  say("Saved as draft "+d.no+".");
  /* Asked once, straight after the save, because that is when the clerk still
     has the paper in hand. Declining leaves a draft, which the register can
     print, amend or submit later. */
  function askSubmit(){
    ask({title:"Saved as draft "+d.no+". Submit it now?",
         hindi:"ड्राफ़्ट सहेजा गया। अब जमा करें?",
         note:"Submitting puts it into the daybook and the monthly reports. Choose Not now to print, correct or submit it later from the register.",
         noteHindi:"जमा करने पर यह रोकड़ बही और मासिक रिपोर्ट में दर्ज हो जाएगा। ‘अभी नहीं’ चुनें तो बही से बाद में छापें, सुधारें या जमा करें।",
         yes:"Submit",yesHindi:"जमा करें"},function(){ submitEntry(d.id,true); });
  }
  if(Storage.saveVoucher){
    /* In Frappe mode wait for the server to name the document, or the submit
       would be aimed at an id the server never issued. */
    Storage.saveVoucher(d).then(function(saved){
      if(editingId===d.id) editingId=saved.name;
      d.no=saved.name; d.id=saved.name; d.serverSaved=true;   /* adopt Frappe's series number */
      claimNo(d.no,d.date);
      persist(); renderAll(); syncFormMode(); askSubmit();
    }).catch(function(err){
      S.entries=S.entries.filter(function(x){return x.id!==d.id;});   /* do not keep a row the server rejected */
      persist(); renderAll();
      note("The server did not accept this voucher:\n\n"+((err&&err.message)||"unknown error")+
            "\n\nNothing was saved. Check the entry and try again.");
    });
  } else {
    askSubmit();
  }
}
/* Keeps date, unit, cost head, Debited A/c and both signatories — a clerk
   entering ten School vouchers in a row only retypes payee, detail, amount. */
function resetForm(){
  editingId=null; say("");
  var keepDate=$("#f-date").value;
  $("#f-addr").value=""; setItems([{particulars:"",amount:""}]);
  $("#f-date").value=keepDate||todayISO();
  renderSlip(); syncFormMode(); $("#f-payee").focus();
}
/* Delete is the only way back from Submitted: there is no cancel and no
   amendment, so a voucher that turns out to be wrong is removed and written
   again from scratch. The number is not reused -- the series only ever counts
   forward -- so the gap in the register is the record that something was
   taken out. */
function delEntry(id){
  var e=entryById(id); if(!e) return;
  var wasSubmitted=statusOf(e)!=="Draft";
  ask({title:"Delete voucher "+e.no+"?",
       hindi:"यह वाउचर मिटाएँ?",
       note:wasSubmitted
         ? "It is submitted and counted in the books. Deleting takes it out of the "+
           "daybook and the reports for good, and a replacement has to be entered fresh."
         : "This removes the draft for good. Nothing in the books changes.",
       noteHindi:wasSubmitted
         ? "यह जमा हो चुका है और बही में गिना जा रहा है। मिटाने पर यह रोकड़ बही और रिपोर्ट से हमेशा के लिए हट जाएगा; नया वाउचर नए सिरे से बनाना होगा।"
         : "यह ड्राफ़्ट स्थायी रूप से मिट जाएगा। बही में कोई बदलाव नहीं होगा।",
       yes:"Delete",yesHindi:"मिटाएँ",danger:true},function(){
    var at=S.entries.indexOf(e);
    S.entries=S.entries.filter(function(x){return x.id!==id;});
    if(editingId===id) resetForm();
    persist(); renderAll(); say("Voucher "+e.no+" deleted.");
    if(Storage.deleteVoucher&&e.serverSaved){
      Storage.deleteVoucher(e.no,wasSubmitted).catch(function(err){
        /* put it back rather than let the register disagree with the server */
        S.entries.splice(at<0?S.entries.length:at,0,e);
        persist(); renderAll();
        note("The server did not delete this voucher: "+((err&&err.message)||"unknown error")+
             " It is back in the register.");
      });
    }
  });
}

/* ---------------- daybook ---------------- */
/* What the clerk records as cash paid out of the box that day.
   Vouchers deliberately do not feed this: the school spends from a fixed
   monthly allocation, not from the fee cash the daybook accounts for, so
   summing vouchers here would take money out of the drawer twice. The
   foundation's own day sheet leaves this row blank for the same reason. */
function expensesOf(date){ return n((S.days[date]||{}).expenses); }
function dayKeys(){ return Object.keys(S.days).sort(); }
function closingOf(d){
  var day=S.days[d]; if(!day) return 0;
  return n(day.opening)+n(day.fee)+n(day.bus)+n(day.wdl)+n(day.other)-n(day.expenses)-n(day.deposit);
}
function openingFor(date){
  var prior=dayKeys().filter(function(k){return k<date;});
  if(!prior.length) return S.openingSeed;
  return closingOf(prior[prior.length-1]);
}
function loadDay(){
  var d=$("#d-date").value; if(!d) return;
  var day=S.days[d]||{date:d,opening:openingFor(d),fee:0,bus:0,wdl:0,other:0,expenses:0,deposit:0,upi:0,utr:"",denoms:{},closed:false};
  $("#d-fee").value=n(day.fee); $("#d-bus").value=n(day.bus); $("#d-wdl").value=n(day.wdl);
  $("#d-oth").value=n(day.other); $("#d-dep").value=n(day.deposit); $("#d-upi").value=n(day.upi);
  $("#d-exp").value=n(day.expenses);
  $("#d-utr").value=day.utr||"";
  $$("#d-denoms input").forEach(function(i){ var q=(day.denoms||{})[i.dataset.face]; i.value=q?q:""; });
  $("#d-note").textContent=day.closed?"Closed":"Open";
  calcDay();
}
function calcDay(){
  var d=$("#d-date").value; if(!d) return;
  var opening=openingFor(d), exp=n($("#d-exp").value);
  var fee=n($("#d-fee").value), bus=n($("#d-bus").value), wdl=n($("#d-wdl").value),
      oth=n($("#d-oth").value), dep=n($("#d-dep").value);
  $("#d-open").textContent=inr(opening);
  $("#d-close").textContent=inr(opening+fee+bus+wdl+oth-exp-dep);
  var counted=0;
  $$("#d-denoms input").forEach(function(i){
    var f=Number(i.dataset.face), q=n(i.value), v=f*q;
    counted+=v;
    var cell=$('#d-denoms td[data-val="'+f+'"]'); if(cell) cell.textContent=inr(v);
  });
  $("#d-dtot").textContent=inr(counted);
  var collected=fee+bus+oth, diff=counted-collected;
  var bar=$("#d-var");
  bar.className="varbar "+(diff===0?"ok":"bad");
  bar.innerHTML="";
  bar.appendChild(el("span",null, diff===0 ? "Count matches collection of "+rs(collected)
      : (diff>0?"Counted more than collected":"Counted short of collection")+" — collection "+rs(collected)));
  bar.appendChild(el("b",null,(diff>0?"+":"")+rs(diff)));
  var fl=$("#d-depflag"); fl.innerHTML="";
  if(dep>0){
    var b=el("div","banner info"); b.style.margin="12px 0 0";
    b.appendChild(el("b",null,"Deposited to bank"));
    b.appendChild(el("span",null,rs(dep)+" moved to ICICI on "+dmy(d)+". This is highlighted in the monthly report."));
    fl.appendChild(b);
  }
  renderDayTable();
}
function saveDay(){
  var d=$("#d-date").value; if(!d) return;
  var dn={};
  $$("#d-denoms input").forEach(function(i){ var q=n(i.value); if(q) dn[i.dataset.face]=q; });
  S.days[d]={date:d,opening:openingFor(d),expenses:n($("#d-exp").value),
             fee:n($("#d-fee").value),bus:n($("#d-bus").value),
             wdl:n($("#d-wdl").value),other:n($("#d-oth").value),deposit:n($("#d-dep").value),
             upi:n($("#d-upi").value),utr:$("#d-utr").value.trim(),denoms:dn,closed:true};
  persist(); $("#d-note").textContent="Closed"; renderAll();
  if(Storage.saveDay){
    Storage.saveDay(S.days[d]).catch(function(err){
      setBanner("info","Day not saved to the server",
                ((err&&err.message)||"unknown error")+" — it is still held in this browser.");
    });
  }
}
function countedOf(d){
  var day=S.days[d]||{}; var t=0;
  Object.keys(day.denoms||{}).forEach(function(f){ t+=Number(f)*n(day.denoms[f]); });
  return t;
}
function renderDayTable(){
  var mk=ym($("#d-date").value);
  var tb=$("#d-table tbody"); tb.innerHTML="";
  var keys=dayKeys().filter(function(k){return ym(k)===mk;});
  $("#d-mnote").textContent=monthLabel(mk)+" · "+keys.length+" day"+(keys.length===1?"":"s")+" recorded";
  if(!keys.length){
    var tr=el("tr"); var td=el("td","empty","No days recorded in "+monthLabel(mk)+" yet."); td.colSpan=10; tr.appendChild(td); tb.appendChild(tr); return;
  }
  keys.forEach(function(k){
    var day=S.days[k], exp=expensesOf(k), counted=countedOf(k), coll=n(day.fee)+n(day.bus)+n(day.other);
    var tr=el("tr");
    tr.appendChild(el("td",null,dmy(k)));
    [day.opening,day.fee,day.bus,day.wdl,exp,day.deposit,closingOf(k),day.upi].forEach(function(v,i){
      var td=el("td","r num",inr(v));
      if(i===5&&n(v)>0) td.style.color="var(--blue)";
      if(i===6) td.style.fontWeight="600";
      tr.appendChild(td);
    });
    var td=el("td");
    if(!Object.keys(day.denoms||{}).length) td.appendChild(el("span","pill p-mute","not counted"));
    else if(counted===coll) td.appendChild(el("span","pill p-ok","tallies"));
    else { var p=el("span","pill p-bad",(counted-coll>0?"+":"")+inr(counted-coll)); td.appendChild(p); }
    tr.appendChild(td);
    tb.appendChild(tr);
  });
}

/* ---------------- register ---------------- */
function months(){
  var set={};
  S.entries.forEach(function(e){ if(e.date) set[ym(e.date)]=1; });
  Object.keys(S.days).forEach(function(d){ set[ym(d)]=1; });
  set[ym(todayISO())]=1;
  return Object.keys(set).sort().reverse();
}
function fillMonths(sel){
  var cur=sel.value, ms=months();
  sel.innerHTML="";
  ms.forEach(function(m){ sel.appendChild(new Option(monthLabel(m),m)); });
  sel.value=(ms.indexOf(cur)>=0)?cur:ms[0];
}
/* Small inline glyphs: no icon font to load, and they take their colour from
   the button so both themes work. */
var ICONS={
  print:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.2V2.6h7v3.6"/>'+
        '<rect x="2" y="6.2" width="12" height="5.2" rx="1"/><path d="M4.5 9.6h7v3.9h-7z"/></svg>',
  edit :'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.3 2.4l2.3 2.3-8 8H3.3v-2.3z"/>'+
        '<path d="M9.9 3.8l2.3 2.3"/></svg>',
  del  :'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 4.6h10.4M6.3 4.6V3h3.4v1.6"/>'+
        '<path d="M4.3 4.6l.5 8.9h6.4l.5-8.9"/><path d="M6.7 7v4M9.3 7v4"/></svg>',
  down :'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.4v7.5"/>'+
        '<path d="M4.9 7l3.1 3.1L11.1 7"/><path d="M2.8 13.2h10.4"/></svg>'
};
var ACTION_LABEL={print:"Print this voucher",edit:"Edit this draft",
                  "delete":"Delete this voucher"};
function actionBtn(name,fn,id){
  var glyph=name==="print"?ICONS.print:name==="edit"?ICONS.edit:name==="delete"?ICONS.del:null;
  var b=el("button",glyph?"ibtn":"lnk",glyph?null:name);
  b.type="button";
  if(glyph){
    b.innerHTML=glyph;
    b.title=ACTION_LABEL[name];
    b.setAttribute("aria-label",ACTION_LABEL[name]);
  }
  b.addEventListener("click",function(){ fn(id); });
  return b;
}
function renderRegister(){
  fillMonths($("#r-month"));
  var mk=$("#r-month").value, cat=$("#r-cat").value;
  var rows=S.entries.filter(function(e){
                      return ym(e.date)===mk&&(!cat||e.category===cat);
                    })
                    .sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:(a.no<b.no?-1:1);});
  var tb=$("#r-table tbody"), tf=$("#r-table tfoot");
  tb.innerHTML=""; tf.innerHTML="";
  var nd=rows.filter(function(e){return statusOf(e)==="Draft";}).length;
  $("#r-note").textContent=rows.length+" voucher"+(rows.length===1?"":"s")+
    (nd?" \u00b7 "+nd+" draft"+(nd===1?"":"s")+" not yet in the books":"");
  if(!rows.length){
    var tr=el("tr"); var td=el("td","empty","No vouchers for "+monthLabel(mk)+(cat?" under "+cat:"")+"."); td.colSpan=11; tr.appendChild(td); tb.appendChild(tr); return;
  }
  var total=0;
  rows.forEach(function(e){
    total+=n(e.amount);
    var tr=el("tr");
    var vn=el("td","vno",e.no);
    tr.appendChild(vn);
    var st=statusOf(e), stc=el("td");
    stc.appendChild(el("span","pill "+(st==="Draft"?"p-warn":st==="Cancelled"?"p-bad":"p-ok"),st));
    tr.appendChild(stc);
    tr.appendChild(el("td",null,dmy(e.date)));
    tr.appendChild(el("td",null,e.account||"\u2014"));
    tr.appendChild(el("td",null,e.payee));
    var its=itemsOf(e);
    var pt=el("td",null,its[0]?its[0].particulars:"");
    if(its.length>1){
      var more=el("div",null,"+"+(its.length-1)+" more line"+(its.length>2?"s":""));
      more.style.cssText="font-size:11px;color:var(--muted);margin-top:2px"; pt.appendChild(more);
    }
    pt.style.maxWidth="280px"; tr.appendChild(pt);
    var c=el("td"); c.appendChild(el("span","pill p-"+e.category.toLowerCase(),e.category)); tr.appendChild(c);
    tr.appendChild(el("td",null,e.head||"\u2014"));
    tr.appendChild(el("td",null,e.by));
    tr.appendChild(el("td","r num",inr(e.amount)));
    /* A draft can be corrected, submitted or thrown away; once submitted the
       only way back is to delete it and write a fresh one. Print, edit and
       delete are icons \u2014 everyone reads them. Submit stays a word: it moves
       money into the books, and a bare glyph on that invites a misclick. */
    var x=el("td","acts");
    var acts=st==="Draft" ? [["print",printEntry],["edit",editDraft],["submit",submitEntry],["delete",delEntry]]
                          : [["print",printEntry],["delete",delEntry]];
    acts.forEach(function(a){ x.appendChild(actionBtn(a[0],a[1],e.id)); });
    tr.appendChild(x);
    tb.appendChild(tr);
  });
  var ftr=el("tr"); var f1=el("td",null,"Total — "+monthLabel(mk)); f1.colSpan=9;
  ftr.appendChild(f1); ftr.appendChild(el("td","r num",inr(total))); ftr.appendChild(el("td"));
  tf.appendChild(ftr);
}

/* ---------------- monthly allocation ----------------
   The school does not spend fee money: each unit is given a fixed sum for the
   month and spends against it, exactly as the foundation's expenses sheet is
   laid out. Balance Amt. is given minus spent, and G.T. is those balances
   added up. The figures are asked for once per month and then remembered. */
function givenFor(mk){ return (S.given&&S.given[mk])||{}; }
function spentByUnit(mk){
  var out={};
  CATS.forEach(function(c){out[c]=0;});
  posted(S.entries).forEach(function(e){
    if(ym(e.date)===mk&&out.hasOwnProperty(e.category)) out[e.category]+=n(e.amount);
  });
  return out;
}
/* Asked only for units that actually spent, so a month with School vouchers
   alone is one question, not four. */
/* Asks the month's budget for each unit in turn, one dialog after another, and
   remembers the answers against that month. */
function askGivenList(mk,units,then){
  var have=givenFor(mk), spent=spentByUnit(mk), got={};
  CATS.forEach(function(c){ if(have[c]!==undefined) got[c]=n(have[c]); });
  var toAsk=units||[];

  function step(i){
    if(i>=toAsk.length){
      if(toAsk.length){ S.given[mk]=got; persist(); }
      if(then) then(S.given[mk]||got);
      return;
    }
    var c=toAsk[i];
    askText({title:"How much was given for "+c+" in "+monthLabel(mk)+"?",
             hindi:c+" के लिए इस महीने कितना दिया गया?",
             note:"Spent so far: "+inr(spent[c])+". Leave blank if nothing was given.",
             noteHindi:"अब तक खर्च: "+inr(spent[c])+"। कुछ न दिया गया हो तो खाली छोड़ें।",
             value:have[c]!==undefined?String(n(have[c])):"",
             yes:"Save",yesHindi:"सहेजें"},
      function(v){ got[c]=n(v); step(i+1); });
  }
  step(0);
}
/* The reports tab asks only for units that spent and are still unanswered. */
function askGiven(mk,force,then){
  var have=givenFor(mk), spent=spentByUnit(mk);
  var toAsk=CATS.filter(function(c){
    if(!spent[c]&&have[c]===undefined) return false;
    return force||have[c]===undefined;
  });
  if(!toAsk.length){ if(then) then(givenFor(mk)); return; }
  askGivenList(mk,toAsk,then);
}

/* The register's download icon: pick the units, give each one its budget for
   the month, then write the file. The month is the one the register is showing. */
function downloadFromRegister(){
  var mk=$("#r-month").value, spent=spentByUnit(mk), only=$("#r-cat").value;
  askChoose({title:"Which units go in the "+monthLabel(mk)+" report?",
             hindi:"रिपोर्ट में कौन-कौन इकाई?",
             note:"Submitted vouchers only \u2014 drafts and cancelled ones stay out.",
             noteHindi:"केवल जमा किए गए वाउचर; ड्राफ़्ट और रद्द बाहर रहेंगे।",
             choices:CATS.map(function(c){
               return {value:c,label:c,amount:spent[c]?inr(spent[c]):"\u2014",
                       checked:only?(c===only):!!spent[c]};
             }),
             yes:"Next",yesHindi:"आगे"},function(units){
    if(!units||!units.length){
      note({title:"Pick at least one unit.",hindi:"कम से कम एक इकाई चुनें।"});
      return;
    }
    askGivenList(mk,units,function(given){ writeMonth(mk,given,units); });
  });
}
function renderGiven(){
  var mk=$("#p-month").value, given=givenFor(mk), spent=spentByUnit(mk);
  var T=$("#p-given"); T.innerHTML="";
  var th=el("thead"), hr=el("tr");
  ["Unit","Given","Total spent","Balance Amt."].forEach(function(h,i){
    hr.appendChild(el("th",i?"r":null,h));
  });
  th.appendChild(hr); T.appendChild(th);
  var tb=el("tbody"), anyGiven=false, gt=0, sumGiven=0, sumSpent=0;
  CATS.forEach(function(c){
    if(!spent[c]&&given[c]===undefined) return;
    var g=n(given[c]), bal=g-spent[c];
    anyGiven=anyGiven||given[c]!==undefined;
    gt+=bal; sumGiven+=g; sumSpent+=spent[c];
    var tr=el("tr");
    var u=el("td"); u.appendChild(el("span","pill p-"+c.toLowerCase(),c)); tr.appendChild(u);
    tr.appendChild(el("td","r num",given[c]===undefined?"\u2014":inr(g)));
    tr.appendChild(el("td","r num",inr(spent[c])));
    var b=el("td","r num",given[c]===undefined?"\u2014":inr(bal));
    if(given[c]!==undefined&&bal<0) b.style.color="var(--bad)";
    tr.appendChild(b);
    tb.appendChild(tr);
  });
  if(!tb.childNodes.length){
    var tr0=el("tr"); var td0=el("td","empty","Nothing spent in "+monthLabel(mk)+".");
    td0.colSpan=4; tr0.appendChild(td0); tb.appendChild(tr0);
  }
  T.appendChild(tb);
  if(anyGiven){
    var tf=el("tfoot"), fr=el("tr");
    fr.appendChild(el("td",null,"G.T"));
    fr.appendChild(el("td","r num",inr(sumGiven)));
    fr.appendChild(el("td","r num",inr(sumSpent)));
    fr.appendChild(el("td","r num",inr(gt)));
    tf.appendChild(fr); T.appendChild(tf);
  }
}
/* The month in the shape the foundation's sheet uses: a block per unit, each
   with its own Total and Balance Amt., then G.T. across the blocks. */
function exportMonth(){
  var mk=$("#p-month").value;
  askGiven(mk,false,function(given){ writeMonth(mk,given); });
}
/* The unit names the foundation's own sheets use. */
var UNIT_TITLE={School:"SCHOOL EXPENSES",
                Residence:"TEACHERS' BLOCK EXPENSES",
                STL:"SCHOOL TO LIVELIHOOD EXPENSES",
                Construction:"CONSTRUCTION EXPENSES"};

/* One sheet per unit, laid out like the sheet the foundation already keeps: a
   banner, then Sl.No. / Date / Cost Head / Discription of Items / Amount /
   Exp By, then Total with the month's budget and what is left of it. Cost Head
   appears for STL alone, which is the only unit that carries one. */
function writeMonth(mk,given,units){
  var spent=spentByUnit(mk);
  var wanted=(units&&units.length?units:CATS).filter(function(c){ return CATS.indexOf(c)>=0; });
  var label=monthLabel(mk);

  var sheets=wanted.map(function(c){
    var heads=(c==="STL");
    var header=heads
      ? ["Sl.No.","Date","Cost Head","Discription of Items","Amount","Exp By"]
      : ["Sl.No.","Date","Discription of Items","Amount","Exp By"];
    var widths=heads?[8,13,22,54,12,16]:[8,13,60,12,16];

    var rows=[], sl=0;
    posted(S.entries)
      .filter(function(e){ return ym(e.date)===mk&&e.category===c; })
      .sort(function(a,b){ return a.date<b.date?-1:a.date>b.date?1:(a.no<b.no?-1:1); })
      .forEach(function(e){
        itemsOf(e).forEach(function(it){
          sl++;
          rows.push(heads
            ? [sl,dmy(e.date),e.head||"",it.particulars||"",n(it.amount),e.by||""]
            : [sl,dmy(e.date),it.particulars||"",n(it.amount),e.by||""]);
        });
      });

    var g=given&&given[c]!==undefined?n(given[c]):null;
    var footer=[["Total",spent[c]]];
    if(g!==null){
      footer.push(["Given",g]);
      footer.push(["Balance Amt.",g-spent[c]]);
    }
    return {name:c,title:(UNIT_TITLE[c]||c.toUpperCase())+" - "+label,
            header:header,widths:widths,rows:rows,footer:footer};
  });

  if(!window.RokarXlsx){
    note("The spreadsheet writer did not load \u2014 reload the page and try again.");
    return;
  }
  offerBlob("expenses-"+label.replace(/ /g,"-")+".xlsx",RokarXlsx.build(sheets));
}

/* ---------------- reports ---------------- */
function renderReports(){
  fillMonths($("#p-month"));
  var mk=$("#p-month").value;
  var ents=posted(S.entries).filter(function(e){return ym(e.date)===mk;});
  var dks=dayKeys().filter(function(k){return ym(k)===mk;});
  var spend=ents.reduce(function(a,e){return a+n(e.amount);},0);
  var feeCash=dks.reduce(function(a,k){return a+n(S.days[k].fee);},0);
  var busCash=dks.reduce(function(a,k){return a+n(S.days[k].bus);},0);
  var upi=dks.reduce(function(a,k){return a+n(S.days[k].upi);},0);
  var wdl=dks.reduce(function(a,k){return a+n(S.days[k].wdl);},0);
  var dep=dks.reduce(function(a,k){return a+n(S.days[k].deposit);},0);
  var closing=dks.length?closingOf(dks[dks.length-1]):S.openingSeed;
  var opening=dks.length?n(S.days[dks[0]].opening):S.openingSeed;

  var T=$("#p-tiles"); T.innerHTML="";
  [["Total expense",rs(spend),ents.length+" vouchers","lead"],
   ["Fee collected — cash",rs(feeCash),dks.length+" days recorded",""],
   ["Bus fee — cash",rs(busCash),"",""],
   ["UPI received",rs(upi),"memo — outside cash book",""],
   ["Withdrawn from bank",rs(wdl),"ICICI",""],
   ["Deposited to bank",rs(dep),"ICICI",""],
   ["Closing cash",rs(closing),"opened at "+rs(opening),""]
  ].forEach(function(t){
    var d=el("div","tile"+(t[3]?" "+t[3]:""));
    d.appendChild(el("div","k",t[0])); d.appendChild(el("div","v",t[1]));
    if(t[2]) d.appendChild(el("div","s",t[2]));
    T.appendChild(d);
  });

  /* matrix */
  var M=$("#p-matrix"); M.innerHTML="";
  var th=el("thead"), htr=el("tr"); htr.appendChild(el("th",null,"Unit"));
  HEADS_ALL.forEach(function(h){ htr.appendChild(el("th","r",h)); });
  htr.appendChild(el("th","r","Total")); th.appendChild(htr); M.appendChild(th);
  var body=el("tbody"), colTot={}, grand=0;
  HEADS_ALL.forEach(function(h){colTot[h]=0;});
  CATS.forEach(function(c){
    var tr=el("tr"); var lab=el("td"); lab.appendChild(el("span","pill p-"+c.toLowerCase(),c)); tr.appendChild(lab);
    var mine=ents.filter(function(e){return e.category===c;});
    var rowTot=mine.reduce(function(a,e){return a+n(e.amount);},0);
    grand+=rowTot;
    if(c==="STL"){
      HEADS_ALL.forEach(function(h){
        var v=mine.filter(function(e){return e.head===h;}).reduce(function(a,e){return a+n(e.amount);},0);
        colTot[h]+=v;
        tr.appendChild(el("td","r num",v?inr(v):"\u2014"));
      });
    } else {
      var na=el("td","r"); na.colSpan=HEADS_ALL.length;
      na.style.cssText="background:var(--surface-2);color:var(--faint);font-size:11.5px;text-align:center";
      na.textContent="no cost head \u2014 booked to account";
      tr.appendChild(na);
    }
    var tt=el("td","r num",rowTot?inr(rowTot):"\u2014"); tt.style.fontWeight="600"; tr.appendChild(tt);
    body.appendChild(tr);
  });
  M.appendChild(body);
  var tf=el("tfoot"), ftr=el("tr"); ftr.appendChild(el("td",null,"Total"));
  HEADS_ALL.forEach(function(h){ ftr.appendChild(el("td","r num",colTot[h]?inr(colTot[h]):"\u2014")); });
  ftr.appendChild(el("td","r num",inr(grand))); tf.appendChild(ftr); M.appendChild(tf);

  renderGiven();

  /* people */
  var P=$("#p-people"); P.innerHTML="";
  var agg={}; ents.forEach(function(e){ agg[e.by]=(agg[e.by]||0)+n(e.amount); });
  var names=Object.keys(agg).sort(function(a,b){return agg[b]-agg[a];});
  var mx=names.length?agg[names[0]]:1;
  var ph=el("thead"); var phr=el("tr");
  ["Person","Share","Amount ₹"].forEach(function(h,i){ phr.appendChild(el("th",i===2?"r":"",h)); });
  ph.appendChild(phr); P.appendChild(ph);
  var pb=el("tbody");
  if(!names.length){ var etr=el("tr"); var etd=el("td","empty","No vouchers this month."); etd.colSpan=3; etr.appendChild(etd); pb.appendChild(etr); }
  names.forEach(function(nm,i){
    var tr=el("tr"); tr.appendChild(el("td",null,nm));
    var bc=el("td"); var w=el("div","barcell");
    var bar=el("div","bar"+(i%3===1?" b2":i%3===2?" b3":""));
    bar.style.width=Math.max(2,Math.round(agg[nm]/mx*130))+"px";
    w.appendChild(bar); w.appendChild(el("span","num",Math.round(agg[nm]/grand*100||0)+"%"));
    $$("span",w)[0].style.cssText="font-size:11.5px;color:var(--muted)";
    bc.appendChild(w); tr.appendChild(bc);
    tr.appendChild(el("td","r num",inr(agg[nm])));
    pb.appendChild(tr);
  });
  P.appendChild(pb);

  /* money movement */
  var MM=$("#p-money"); MM.innerHTML="";
  var mh=el("thead"), mhr=el("tr"); mhr.appendChild(el("th",null,"Line")); mhr.appendChild(el("th","r","Amount ₹"));
  mh.appendChild(mhr); MM.appendChild(mh);
  var mb=el("tbody");
  [["Opening cash",opening],["Fee cash received",feeCash],["Bus fee cash received",busCash],
   ["Withdrawn from bank",wdl],["Cash expenses",-dks.reduce(function(a,k){return a+expensesOf(k);},0)],
   ["Deposited to bank",-dep],["Closing cash",closing]].forEach(function(r,i,arr){
    var tr=el("tr");
    tr.appendChild(el("td",null,r[0]));
    var td=el("td","r num",(r[1]<0?"(":"")+inr(Math.abs(r[1]))+(r[1]<0?")":""));
    if(r[1]<0) td.style.color="var(--accent-ink)";
    if(i===arr.length-1||i===0) td.style.fontWeight="600";
    tr.appendChild(td); mb.appendChild(tr);
  });
  MM.appendChild(mb);

  /* collection */
  var C=$("#p-coll"); C.innerHTML="";
  var ch=el("thead"), chr=el("tr");
  ["Date","Fee cash","Bus cash","Total collected","Counted","Variance","UPI","Bank"].forEach(function(h,i){
    chr.appendChild(el("th",i>0&&i<7?"r":"",h));
  });
  ch.appendChild(chr); C.appendChild(ch);
  var cb=el("tbody");
  if(!dks.length){ var e2=el("tr"); var t2=el("td","empty","No daybook entries for "+monthLabel(mk)+"."); t2.colSpan=8; e2.appendChild(t2); cb.appendChild(e2); }
  dks.forEach(function(k){
    var day=S.days[k], coll=n(day.fee)+n(day.bus)+n(day.other), counted=countedOf(k), diff=counted-coll;
    var tr=el("tr");
    tr.appendChild(el("td",null,dmy(k)));
    tr.appendChild(el("td","r num",inr(day.fee)));
    tr.appendChild(el("td","r num",inr(day.bus)));
    var ct=el("td","r num",inr(coll)); ct.style.fontWeight="600"; tr.appendChild(ct);
    tr.appendChild(el("td","r num",Object.keys(day.denoms||{}).length?inr(counted):"—"));
    var vt=el("td","r");
    if(!Object.keys(day.denoms||{}).length) vt.appendChild(el("span","pill p-mute","not counted"));
    else if(diff===0) vt.appendChild(el("span","pill p-ok","0"));
    else vt.appendChild(el("span","pill p-bad",(diff>0?"+":"")+inr(diff)));
    tr.appendChild(vt);
    var ut=el("td","r num",inr(day.upi)); ut.style.color="var(--blue)"; tr.appendChild(ut);
    var bt=el("td");
    if(n(day.wdl)>0) bt.appendChild(el("span","pill p-warn","withdrew "+inr(day.wdl)));
    if(n(day.deposit)>0) bt.appendChild(el("span","pill p-ok","deposited "+inr(day.deposit)));
    tr.appendChild(bt);
    cb.appendChild(tr);
  });
  C.appendChild(cb);
}

/* ---------------- exports ---------------- */
/* Chrome takes the saved file name from the anchor's download attribute, but
   only if the element is still in the document and the blob URL still alive
   when the download actually begins. Tearing either down in the same tick as
   the click loses the name, and the file lands as a blob UUID with no
   extension, which nothing will open. So the teardown waits. */
function offerBlob(filename,blob){
  var url=URL.createObjectURL(blob);
  var a=document.createElement("a");
  a.href=url;
  a.setAttribute("download",filename);
  a.style.display="none";
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){
    if(a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  },20000);
}
function offer(filename,text,mime){
  /* The byte-order mark is what makes Excel read a CSV as UTF-8; JSON must not
     have one, or a strict parser chokes on the first character. */
  var json=(mime||"").indexOf("json")>=0;
  offerBlob(filename,new Blob([json?text:"\ufeff"+text],
                              {type:(mime||"text/csv")+";charset=utf-8"}));
}

function exportRegister(){
  var mk=$("#r-month").value;
  var rows=[["Voucher No","Status","Line","Date","Debited A/c","Paid To","Address","Particulars",
             "Unit","Cost Head","Accountant","Passed By","Line Amount","Voucher Total"]];
  S.entries.filter(function(e){return ym(e.date)===mk;}).sort(function(a,b){return a.date<b.date?-1:1;})
    .forEach(function(e){
      itemsOf(e).forEach(function(it,i){
        rows.push([e.no,statusOf(e),i+1,dmy(e.date),e.account||"",e.payee,e.address||"",it.particulars,
                   e.category,e.head,e.by,e.approved||"",it.amount,i===0?e.amount:""]);
      });
    });
  offer("register-"+mk+".csv",csv(rows));
}
function exportTally(){
  var mk=$("#r-month").value;
  var rows=[["Date","Voucher No","Voucher Type","Dr Ledger","Cr Ledger","Cost Centre","Amount","Narration"]];
  /* the CA gets submitted vouchers only \u2014 a draft is not yet a transaction */
  posted(S.entries).filter(function(e){return ym(e.date)===mk;}).sort(function(a,b){return a.date<b.date?-1:1;})
    .forEach(function(e){
      var cr="Cash";   /* the mode field is gone; a voucher is a cash payment */
      itemsOf(e).forEach(function(it){
        rows.push([dmy(e.date),e.no,"Payment",e.account||(e.head+" - "+e.category),cr,
                   e.head?(e.category+" : "+e.head):e.category,it.amount,
                   it.particulars+" \u2014 paid to "+e.payee+", by "+e.by]);
      });
    });
  offer("tally-"+mk+".csv",csv(rows));
}
function exportDaybook(){
  var mk=ym($("#d-date").value);
  var rows=[["Date","Opening","Fee Cash","Bus Cash","Other Cash","Bank Withdrawal","Cash Expenses","Bank Deposit","Closing","UPI (memo)","Counted","Variance"]];
  dayKeys().filter(function(k){return ym(k)===mk;}).forEach(function(k){
    var d=S.days[k], coll=n(d.fee)+n(d.bus)+n(d.other), counted=countedOf(k);
    rows.push([dmy(k),d.opening,d.fee,d.bus,d.other,d.wdl,expensesOf(k),d.deposit,closingOf(k),d.upi,
               Object.keys(d.denoms||{}).length?counted:"",Object.keys(d.denoms||{}).length?counted-coll:""]);
  });
  offer("daybook-"+mk+".csv",csv(rows));
}

/* ---------------- render ---------------- */
function renderMast(){
  var sub=$("#mast-sub");
  if(sub) sub.textContent=ORG+" \u00b7 "+FOUNDATION+" \u00b7 FY "+fyLabel();
  var t=$("#mast-title"); if(t) t.textContent=TITLE;
  var lg=$("#mast-logo");
  if(lg){ lg.src=LOGO; lg.alt=ORG; }
  document.title=TITLE;
}
function renderAll(){
  renderMast();
  renderBanner();
  fillPeople();
  function datalist(sel,vals){
    var box=$(sel); box.innerHTML=""; var seen={};
    vals.forEach(function(v){ if(v&&!seen[v]){seen[v]=1; box.appendChild(new Option(v));} });
  }
  datalist("#addresses",S.entries.map(function(e){return e.address;}));
  datalist("#particularsList",S.particulars);
  datalist("#accounts",CATS.map(function(c){return DEFAULT_ACCOUNTS[c];})
            .concat(S.accounts).concat(S.entries.map(function(e){return e.account;})));
  var mk=ym(todayISO());
  var mEnt=posted(S.entries).filter(function(e){return ym(e.date)===mk;});
  var dks=dayKeys();
  $("#m-cash").textContent=rs(dks.length?closingOf(dks[dks.length-1]):S.openingSeed);
  $("#m-vch").textContent=mEnt.length;
  $("#m-spend").textContent=rs(mEnt.reduce(function(a,e){return a+n(e.amount);},0));
  renderSlip(); loadDay(); renderRegister();
  if(!$("#v-reports").hidden) renderReports();
}
boot();

/* ---------------- backup & restore ---------------- */
function backupNow(){
  var stamp=new Date().toISOString().slice(0,10);
  offer("rokar-backup-"+stamp+".json",JSON.stringify(payload(),null,2),"application/json");
  var nb=$("#backup-note");
  nb.textContent="Backed up "+dmy(stamp)+". Keep the file somewhere off this computer.";
  nb.style.color="var(--ok)";
}
function restoreFrom(file){
  var fr=new FileReader();
  fr.onload=function(){
    var p;
    try{ p=JSON.parse(fr.result); }
    catch(e){ note("That file isn't a Rokar backup — it could not be read as JSON."); return; }
    if(!p||!Array.isArray(p.entries)){ note("That file isn't a Rokar backup — no voucher list inside."); return; }
    var msg="Replace the books on this computer with the backup?\n\n"+
            "Backup: "+p.entries.length+" vouchers, "+Object.keys(p.days||{}).length+" daybook days"+
            (p.savedAt?"\nSaved: "+p.savedAt.slice(0,10):"")+
            "\n\nOn this computer now: "+S.entries.length+" vouchers, "+Object.keys(S.days).length+" days.";
    ask({title:"Replace the books on this computer with the backup?",
         hindi:"इस कंप्यूटर की बही को बैकअप से बदलें?",
         note:msg,
         noteHindi:"यहाँ की मौजूदा बही मिट जाएगी और बैकअप की बही आ जाएगी।",
         yes:"Replace",yesHindi:"बदलें",danger:true},function(){ applyRestore(p); });
    return;
  };
  fr.readAsText(file);
}
function applyRestore(p){
  {
    S.entries=p.entries||[]; S.days=p.days||{};
    S.sample=!!p.sample; S.openingSeed=n(p.openingSeed);
    if(p.people&&p.people.length) S.people=p.people;
    if(p.approvers&&p.approvers.length) S.approvers=p.approvers;
    if(p.payees&&p.payees.length) S.payees=p.payees;
    S.accounts=p.accounts||[]; S.particulars=p.particulars||[];
    persist(); renderAll(); renderReports();
    var nb=$("#backup-note");
    nb.textContent="Restored "+S.entries.length+" vouchers from backup.";
    nb.style.color="var(--ok)";
  };
  fr.onerror=function(){ note("The file could not be opened."); };
  fr.readAsText(file);
}
