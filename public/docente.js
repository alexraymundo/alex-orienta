
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)]; let currentStudent="", currentTeacherId="";
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function fmtDate(v){if(!v)return"";const [y,m,d]=String(v).split("-").map(Number);return y&&m&&d?new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short",year:"numeric"}).format(new Date(y,m-1,d,12)):String(v);}
async function req(path,opt={}){const r=await fetch(path,{...opt,headers:{"content-type":"application/json",...(opt.headers||{})}}),raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{}if(!r.ok)throw new Error(d.error||`Error HTTP ${r.status}`);return d;}
function show(id){["teacherLogin","teacherAgreement","teacherApp"].forEach(x=>$("#"+x).hidden=x!==id);}
async function login(){const b=$("#teacherLoginBtn");if(b.disabled)return;b.disabled=true;const old=b.textContent;b.textContent="VALIDANDO…";try{await req("/api/teacher/login",{method:"POST",body:JSON.stringify({code:$("#teacherCode").value.trim().toUpperCase()})});await boot();}catch(e){$("#teacherLoginStatus").textContent=e.message;}finally{b.disabled=false;b.textContent=old;}}
$("#teacherLoginBtn").onclick=login; $("#teacherCode").onkeydown=e=>{if(e.key==="Enter")login();};
async function boot(){try{const me=await req("/api/teacher/me");currentTeacherId=me.teacher.id;$("#teacherIdentity").textContent=me.teacher.full_name;if(me.agreement_required){show("teacherAgreement");return;}show("teacherApp");await loadStudents();}catch{show("teacherLogin");}}
$("#teacherAcceptBtn").onclick=async()=>{try{await req("/api/teacher/accept-agreement",{method:"POST",body:JSON.stringify({signed_name:$("#teacherSignedName").value,accepted:$("#teacherAgreementCheck").checked})});await boot();}catch(e){$("#teacherAgreementStatus").textContent=e.message;}};
$("#teacherLogout").onclick=async()=>{try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith(`nortia_teacher_draft_${currentTeacherId}_`))sessionStorage.removeItem(key);}await req("/api/teacher/logout",{method:"POST"});}finally{location.reload();}};
let teacherStudentsCache=[];function renderTeacherStudents(list){$("#teacherStudents").innerHTML=list.length?list.map(s=>`<button class="student-card" data-id="${s.id}"><span>${esc(s.grade_level||"Grado no indicado")}</span><strong>${esc(s.full_name)}</strong><small>${esc(s.school_name||"")}${s.school_year?" · "+esc(s.school_year):""}</small></button>`).join(""):`<p class="muted">No encontramos alumnos.</p>`; $$(".student-card").forEach(b=>b.onclick=()=>openStudent(b.dataset.id));}async function loadStudents(){const d=await req("/api/teacher/students");teacherStudentsCache=d.students||[];renderTeacherStudents(teacherStudentsCache);}$("#teacherStudentSearch")?.addEventListener("input",e=>{const q=e.target.value.trim().toLowerCase();renderTeacherStudents(!q?teacherStudentsCache:teacherStudentsCache.filter(s=>[s.full_name,s.grade_level,s.school_year,s.school_name].some(v=>String(v||"").toLowerCase().includes(q))));});

function setTeacherStudentTab(tab){
  const map={summary:"#teacherTabSummary",observe:"#teacherTabObserve",history:"#teacherTabHistory"};
  Object.entries(map).forEach(([name,selector])=>{const el=$(selector);if(el)el.hidden=name!==tab;});
  $$('[data-teacher-tab]').forEach(button=>{const active=button.dataset.teacherTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false');});
}
$$('[data-teacher-tab]').forEach(button=>button.addEventListener('click',()=>setTeacherStudentTab(button.dataset.teacherTab)));
function teacherTabKeydown(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=$$('[role="tab"][data-teacher-tab]');if(!tabs.length)return;event.preventDefault();let i=tabs.indexOf(event.currentTarget);if(event.key==='Home')i=0;else if(event.key==='End')i=tabs.length-1;else i=(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[i].focus();setTeacherStudentTab(tabs[i].dataset.teacherTab);}
$$('[role="tab"][data-teacher-tab]').forEach(tab=>tab.addEventListener('keydown',teacherTabKeydown));
const teacherDraftFields=["tObsDate","tObsSubject","tObsContext","tObsDescription"];
function teacherDraftKey(){return currentTeacherId&&currentStudent?`nortia_teacher_draft_${currentTeacherId}_${currentStudent}`:"";}
function saveTeacherDraft(){
  const key=teacherDraftKey(); if(!key)return;
  const draft={}; teacherDraftFields.forEach(id=>draft[id]=$("#"+id)?.value||"");
  sessionStorage.setItem(key,JSON.stringify(draft));
  const state=$("#teacherDraftState"); if(state)state.textContent="Borrador guardado en este dispositivo";
}
function restoreTeacherDraft(){
  const key=teacherDraftKey(); if(!key)return;
  let draft={}; try{draft=JSON.parse(sessionStorage.getItem(key)||"{}");}catch{}
  teacherDraftFields.forEach(id=>{if(draft[id]!=null&&$("#"+id))$("#"+id).value=draft[id];});
}
function clearTeacherDraft(){const key=teacherDraftKey();if(key)sessionStorage.removeItem(key);const state=$("#teacherDraftState");if(state)state.textContent="Borrador local automático";}

[...document.querySelectorAll('#teacherTabObserve input,#teacherTabObserve textarea,#teacherTabObserve select')].forEach(el=>{
  el.addEventListener('input',saveTeacherDraft);
  el.addEventListener('change',saveTeacherDraft);
});
const teacherAreaLabels={attention:"Atención",instructions:"Instrucciones",organization:"Organización",peers:"Interacción con pares",frustration:"Manejo de frustración",transitions:"Cambios / transiciones",autonomy:"Autonomía",help_seeking:"Solicitud de ayuda"};
const trendFieldMap={attention:"attention_support",instructions:"instructions_support",organization:"organization_support",peers:"peer_support",frustration:"frustration_support",transitions:"transitions_support",autonomy:"autonomy_support",help_seeking:"help_seeking_support"};
function frequencyText(dist){
  const n=Number(dist?.n||0);
  if(!n)return"Sin registros";
  if(n<3)return`${n} registro${n===1?"":"s"} · evidencia inicial`;
  const pct=Number(dist.higher_support_pct||0);
  if(pct<25)return"Poca frecuencia de apoyo moderado/frecuente";
  if(pct<60)return"Frecuencia intermedia de apoyo moderado/frecuente";
  return"Frecuencia alta de apoyo moderado/frecuente";
}
function observedTeacherAreas(snapshot){
  return Object.entries(teacherAreaLabels)
    .map(([key,label])=>({key,label,data:snapshot?.distribution?.[key]||{}}))
    .filter(item=>Number(item.data?.n||0)>0);
}

function inferredTeacherAreas(c={}){
  const text=[c.general_description,c.strengths,c.support_needs,c.strategies,c.watch_items].filter(Boolean).join(" ").toLowerCase();
  const rules=[
    ["instructions","Instrucciones",/(instrucci|indicacion|consigna|comprensi[oó]n)/],
    ["attention","Atención",/(atenci[oó]n|concentr|enfoc|distracci)/],
    ["organization","Organización",/(organiz|planific|material|tarea|secuencia)/],
    ["peers","Interacción con pares",/(pares|compa[nñ]er|equipo|grupo|convivencia)/],
    ["frustration","Manejo de frustración",/(frustra|enojo|molest|tolerancia|regulaci[oó]n)/],
    ["transitions","Cambios / transiciones",/(transici[oó]n|cambio de actividad|cambiar de actividad)/],
    ["autonomy","Autonomía",/(autonom|independ|por s[ií] mismo|trabajo individual)/],
    ["help_seeking","Solicitud de ayuda",/(pedir ayuda|solicitar ayuda|buscar apoyo|requiere apoyo|necesita apoyo|orientaci[oó]n)/]
  ];
  return rules.filter(([, ,rx])=>rx.test(text)).map(([key,label])=>({key,label}));
}

function initialAreaCards(snapshot,c={}){
  const items=observedTeacherAreas(snapshot);
  if(!items.length){const inferred=inferredTeacherAreas(c);if(!inferred.length)return`<p class="muted">Todavía no hay áreas observadas identificadas.</p>`;return`<div class="initial-evidence-note"><strong>Áreas identificadas en el registro</strong><span>Se identificaron a partir del contenido publicado. No representan una tendencia ni una puntuación.</span></div><div class="observed-area-chips">${inferred.map(item=>`<span><b>${esc(item.label)}</b><small>Identificada en el informe</small></span>`).join("")}</div>`;}
  return`<div class="initial-evidence-note"><strong>Información todavía inicial</strong><span>Con menos de 3 registros por área no se muestran porcentajes ni barras de tendencia. Esto evita que una sola observación parezca un patrón.</span></div><div class="observed-area-chips">${items.map(item=>`<span><b>${esc(item.label)}</b><small>${Number(item.data.n)} registro${Number(item.data.n)===1?"":"s"}</small></span>`).join("")}</div>`;
}
function supportVisual(snapshot,c={}){
  const items=observedTeacherAreas(snapshot);
  const stable=items.filter(item=>Number(item.data?.n||0)>=3);
  const initial=items.filter(item=>Number(item.data?.n||0)<3);
  if(!stable.length)return initialAreaCards(snapshot,c);
  const rows=stable.map(item=>{const pct=Number(item.data.higher_support_pct||0);return`<div class="support-row enhanced"><div><strong>${esc(item.label)}</strong><small>${frequencyText(item.data)}</small></div><div class="support-track"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`}).join("");
  const initialBlock=initial.length?`<div class="initial-evidence-secondary"><small>Áreas con evidencia todavía inicial</small><div class="observed-area-chips compact">${initial.map(item=>`<span><b>${esc(item.label)}</b><small>${Number(item.data.n)} registro${Number(item.data.n)===1?"":"s"}</small></span>`).join("")}</div></div>`:"";
  return rows+initialBlock;
}
function contextVisual(snapshot){
  const contexts=snapshot.contexts||[];
  if(!contexts.length)return`<p class="muted">Aún no hay contextos registrados.</p>`;
  const total=contexts.reduce((sum,x)=>sum+Number(x.count||0),0);
  if(total<3)return`<div class="initial-evidence-note slim"><strong>Contexto inicial</strong><span>Se mostrarán comparaciones cuando existan al menos 3 registros.</span></div><div class="context-count-chips">${contexts.map(x=>`<span><b>${esc(x.context)}</b><small>${Number(x.count)} registro${Number(x.count)===1?"":"s"}</small></span>`).join("")}</div>`;
  const max=Math.max(1,...contexts.map(x=>Number(x.count)));
  return contexts.map(x=>`<div class="context-visual-row"><div><strong>${esc(x.context)}</strong><small>${x.count} registro${Number(x.count)===1?"":"s"}</small></div><div class="context-track"><i style="width:${Number(x.count)/max*100}%"></i></div></div>`).join("");
}
function chart(snapshot,c={}){
  $("#teacherSupportChart").innerHTML=supportVisual(snapshot,c);
  $("#teacherContextChart").innerHTML=contextVisual(snapshot);
  $("#teacherTrendChart").innerHTML=(snapshot.trend||[]).length?snapshot.trend.map(row=>{const n=[row.attention_support,row.instructions_support,row.organization_support,row.peer_support,row.frustration_support,row.transitions_support,row.autonomy_support,row.help_seeking_support].filter(v=>v!=null&&v!=="").length;return`<div class="trend-context-row"><strong>${esc(fmtDate(row.observation_date)||"—")}</strong><span>${esc(row.context||"Sin contexto")}</span><small>${row.source==="professional"?"Profesional":"Docente"} · ${n} área${n===1?"":"s"} registrada${n===1?"":"s"}</small></div>`}).join(""):`<p class="muted">Aún no hay registros revisados.</p>`;
}
function reportKpis(snapshot){
  const vals=Object.entries(snapshot.distribution||{}).filter(([,d])=>Number(d?.n||0)>=3&&d.higher_support_pct!=null).sort((a,b)=>Number(b[1].higher_support_pct)-Number(a[1].higher_support_pct));
  const top=vals[0],ctx=(snapshot.contexts||[])[0],count=Number(snapshot.observation_count||0);
  return`<article><span>Observaciones revisadas</span><strong>${count}</strong><small>${count<3?"Información todavía inicial":"Registros considerados"}</small></article><article><span>Tendencia por área</span><strong>${top?esc(teacherAreaLabels[top[0]]):"Aún sin tendencia"}</strong><small>${top?frequencyText(top[1]):"Se requiere más evidencia"}</small></article><article><span>${count<3?"Contexto registrado":"Contexto más registrado"}</span><strong>${ctx?esc(ctx.context):"—"}</strong><small>${ctx?ctx.count+" registro"+(Number(ctx.count)===1?"":"s"):"Sin datos"}</small></article><article><span>Última revisión</span><strong>${snapshot.last_reviewed_at?new Date(snapshot.last_reviewed_at).toLocaleDateString():"—"}</strong><small>Información revisada</small></article>`;
}

function transferReceivedHtml(transfer){
  if(!transfer)return "";
  const previous=transfer.from_teacher_name?esc(transfer.from_teacher_name):"Asignación inicial";
  const date=fmtDate(transfer.transfer_date)||"—";
  const hasSnapshot=[transfer.general_description,transfer.strengths,transfer.support_needs,transfer.strategies,transfer.watch_items].some(Boolean);
  return `<section class="transfer-received-card">
    <div class="transfer-received-head">
      <div><span class="eyebrow">CONTINUIDAD RECIBIDA</span><h3>Entrega para iniciar con este alumno</h3></div>
      <span class="transfer-date-pill">${esc(date)}</span>
    </div>
    <p class="transfer-origin">${transfer.from_teacher_name?`Docente anterior: <strong>${previous}</strong>`:"Primera asignación de docente"}${transfer.school_period?` · Periodo ${esc(transfer.school_period)}`:""}</p>
    ${hasSnapshot?`<div class="transfer-received-grid">
      ${transfer.general_description?`<article><span>Panorama</span><p>${esc(transfer.general_description)}</p></article>`:""}
      ${transfer.strengths?`<article><span>Fortalezas</span><p>${esc(transfer.strengths)}</p></article>`:""}
      ${transfer.support_needs?`<article><span>Apoyos</span><p>${esc(transfer.support_needs)}</p></article>`:""}
      ${transfer.strategies?`<article><span>Estrategias recomendadas</span><p>${esc(transfer.strategies)}</p></article>`:""}
      ${transfer.watch_items?`<article><span>Seguir observando</span><p>${esc(transfer.watch_items)}</p></article>`:""}
    </div>`:`<div class="transfer-empty-note">La transferencia quedó registrada, pero al momento del cambio todavía no había un informe de continuidad publicado.</div>`}
    ${transfer.transfer_note?`<small class="transfer-admin-note">Nota de coordinación: ${esc(transfer.transfer_note)}</small>`:""}
  </section>`;
}
async function openStudent(id){currentStudent=id;const d=await req(`/api/teacher/student/${id}`);$("#teacherStudentListView").hidden=true;$("#teacherStudentDetail").hidden=false;setTeacherStudentTab("summary");$("#teacherStudentName").textContent=d.person.full_name;$("#teacherStudentMeta").textContent=[d.enrollment?.grade_level||d.program?.grade_level,d.enrollment?.school_year||d.program?.school_year,d.program?.school_name].filter(Boolean).join(" · ");const c=d.continuity||{};const approved=!!c.approved_at;$("#teacherApprovedReport").hidden=!approved;$("#teacherReportState").innerHTML=`${transferReceivedHtml(d.latest_transfer)}${approved?"":`<div class="report-pending-card"><span class="eyebrow">INFORME EN PREPARACIÓN</span><h3>Aún no hay un informe de continuidad publicado.</h3><p>El profesional está revisando la información. Si tienes información útil, puedes enviar un comentario complementario. Alex decidirá si debe integrarse al expediente.</p></div>`}`;if(approved){$("#teacherReportKpis").innerHTML=reportKpis(d.snapshot);const pro=(d.professional_observations||[]);const proBlock=pro.length?`<section class="teacher-professional-observations"><div class="report-card-head"><div><span class="eyebrow">APORTES DEL PROFESIONAL</span><h3>Observaciones compartidas por Alex</h3></div><small>Solo contenido publicado</small></div><div class="teacher-professional-list">${pro.map(o=>`<article><div><strong>${esc(fmtDate(o.observation_date)||"—")}</strong><span>${esc(o.context||o.subject||"Seguimiento profesional")}</span></div><p>${esc(o.description||"")}</p>${o.strategy_used?`<small><b>Estrategia:</b> ${esc(o.strategy_used)}</small>`:""}${o.recommendation_text?`<small><b>Recomendación:</b> ${esc(o.recommendation_text)}</small>`:""}</article>`).join("")}</div></section>`:"";$("#teacherContinuity").innerHTML=`<article class="continuity-feature"><span>DESCRIPCIÓN GENERAL</span><h3>Panorama actual</h3><p>${esc(c.general_description||"—")}</p></article><div class="continuity-detail-grid"><article><span>FORTALEZAS OBSERVADAS</span><p>${esc(c.strengths||"—")}</p></article><article><span>PUEDE REQUERIR APOYO EN</span><p>${esc(c.support_needs||"—")}</p></article><article><span>ESTRATEGIAS DE APOYO RECOMENDADAS</span><p>${esc(c.strategies||"—")}</p></article><article><span>ASPECTOS A SEGUIR OBSERVANDO</span><p>${esc(c.watch_items||"—")}</p></article></div>${proBlock}<div class="teacher-report-disclaimer">Este informe resume observaciones escolares revisadas y contenido publicado por el profesional. No es una evaluación clínica ni un diagnóstico.</div>`;chart(d.snapshot,c);}$("#teacherOwnObservations").innerHTML=d.own_observations.length?d.own_observations.map(o=>`<article class="note-card"><span>${esc(fmtDate(o.observation_date))} · ${esc(o.subject||o.context||"")}</span><p>${esc(o.description)}</p><small>${o.status==="reviewed"?"Revisado":"Pendiente de revisión"}${o.professional_comment?" · Comentario profesional: "+esc(o.professional_comment):""}</small></article>`).join(""):`<p class="muted">Aún no has enviado comentarios.</p>`;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$("#tObsDate").max=today;$("#tObsDate").value=today;restoreTeacherDraft();}
$("#backToStudents").onclick=()=>{$("#teacherStudentDetail").hidden=true;$("#teacherStudentListView").hidden=false;};
$("#submitTeacherObservation").onclick=async()=>{const btn=$("#submitTeacherObservation");if(btn.disabled)return;btn.disabled=true;const label=btn.textContent;btn.textContent="ENVIANDO…";try{const p={person_id:currentStudent,observation_date:$("#tObsDate").value,subject:$("#tObsSubject").value,context:$("#tObsContext").value,description:$("#tObsDescription").value};await req("/api/teacher/observation",{method:"POST",body:JSON.stringify(p)});clearTeacherDraft();$("#teacherObsStatus").style.color="#86EFAC";$("#teacherObsStatus").textContent="Comentario enviado a Alex para revisión.";$("#tObsDescription").value="";await openStudent(currentStudent);setTeacherStudentTab("history");}catch(e){$("#teacherObsStatus").style.color="#FDA4AF";$("#teacherObsStatus").textContent=e.message;}finally{btn.disabled=false;btn.textContent=label;}};
(async()=>{try{const s=await req("/api/teacher/session");if(s.authenticated)await boot();else show("teacherLogin");}catch{show("teacherLogin");}})();

;document.querySelectorAll('.status').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});
