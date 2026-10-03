
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
const teacherAreaLabels={attention:"Atención y enfoque",instructions:"Comprensión de instrucciones",organization:"Organización",peers:"Participación",frustration:"Regulación emocional",transitions:"Cambios / transiciones",autonomy:"Autonomía",help_seeking:"Solicitud de ayuda"};
const trendFieldMap={attention:"attention_support",instructions:"instructions_support",organization:"organization_support",peers:"peer_support",frustration:"frustration_support",transitions:"transitions_support",autonomy:"autonomy_support",help_seeking:"help_seeking_support"};
const visualProfileAreas=[
  {key:"instructions",label:"Comprensión de instrucciones",icon:"↳"},
  {key:"attention",label:"Atención y enfoque",icon:"◎"},
  {key:"participation",label:"Participación",icon:"◌"},
  {key:"organization",label:"Organización",icon:"▦"},
  {key:"autonomy",label:"Autonomía",icon:"◇"},
  {key:"emotional",label:"Regulación emocional",icon:"≈"}
];
function normalizeText(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function reportText(c={}){return normalizeText([c.general_description,c.strengths,c.support_needs,c.strategies,c.watch_items].filter(Boolean).join(" "));}
function textSignals(c={}, area){
  const strengths=normalizeText(c.strengths), support=normalizeText(c.support_needs), all=reportText(c);
  const patterns={instructions:/(instruccion|indicacion|consigna|comprension)/,attention:/(atencion|concentr|enfoc|distracci)/,participation:/(particip|sesion|grupo|equipo|interaccion)/,organization:/(organiz|planific|material|secuencia|tarea)/,autonomy:/(autonom|independ|por si mismo|trabajo individual)/,emotional:/(regulacion|frustra|enojo|molest|tolerancia|emocion)/};
  const rx=patterns[area]; return {mentioned:rx.test(all),strength:rx.test(strengths),support:rx.test(support)};
}
function distributionForArea(snapshot={}, area){const map={instructions:"instructions",attention:"attention",participation:"peers",organization:"organization",autonomy:"autonomy",emotional:"frustration"};return snapshot?.distribution?.[map[area]]||{};}
function profileAreaState(snapshot={},c={},area){
  const d=distributionForArea(snapshot,area), n=Number(d?.n||0), sig=textSignals(c,area);
  if(n>=3 && d.higher_support_pct!=null){const pct=Number(d.higher_support_pct||0);if(pct>=60)return{label:"Requiere apoyo",tone:"support",detail:"Apoyo observado con mayor frecuencia"};if(pct>=25)return{label:"En desarrollo",tone:"developing",detail:"Conviene mantener seguimiento"};if(sig.strength)return{label:"Fortaleza observada",tone:"strength",detail:"Fortaleza descrita en el informe"};return{label:"En seguimiento",tone:"developing",detail:"Menor frecuencia de apoyo en los registros"};}
  if(sig.support)return{label:"Requiere apoyo",tone:"support",detail:"Identificado en el informe publicado"};
  if(sig.strength)return{label:"Fortaleza observada",tone:"strength",detail:"Identificada en el informe publicado"};
  if(sig.mentioned||n>0)return{label:"En desarrollo",tone:"developing",detail:n?`${n} registro${n===1?"":"s"} disponible${n===1?"":"s"}`:"Área mencionada en el informe"};
  return{label:"Sin información suficiente",tone:"unknown",detail:"Aún sin evidencia específica"};
}
function profileMap(snapshot,c={}){return `<div class="student-profile-map"><div class="profile-map-center"><span>PERFIL VISUAL</span><strong>Seguimiento escolar</strong><small>Lectura rápida para orientar el acompañamiento</small></div>${visualProfileAreas.map((a,i)=>{const s=profileAreaState(snapshot,c,a.key);return`<article class="profile-node profile-node-${i+1} ${s.tone}"><i>${a.icon}</i><div><strong>${esc(a.label)}</strong><span>${esc(s.label)}</span><small>${esc(s.detail)}</small></div></article>`}).join("")}</div><div class="profile-map-legend"><span><i class="dot strength"></i>Fortaleza observada</span><span><i class="dot developing"></i>En desarrollo</span><span><i class="dot support"></i>Requiere apoyo</span><span><i class="dot unknown"></i>Sin información suficiente</span></div>`;}
function evolutionValue(row,key){const field=trendFieldMap[key];const v=Number(row?.[field]);return Number.isFinite(v)&&v>0?v:null;}
function evolutionVisual(snapshot,c={}){
  const rows=(snapshot?.trend||[]).slice().reverse();
  if(rows.length<2)return `<div class="evolution-empty"><span class="evolution-icon">⌁</span><strong>Seguimiento inicial</strong><p>Aún no hay suficientes registros para mostrar una evolución. La gráfica comenzará a compararse conforme existan nuevas observaciones.</p></div>`;
  const candidateKeys=["instructions","attention","autonomy","organization","peers","frustration"];
  const scored=candidateKeys.map(key=>({key,n:rows.filter(r=>evolutionValue(r,key)!=null).length})).filter(x=>x.n>=2).sort((a,b)=>b.n-a.n).slice(0,3);
  if(!scored.length)return `<div class="evolution-empty"><span class="evolution-icon">⌁</span><strong>Seguimiento en construcción</strong><p>Ya existen varios registros, pero todavía no hay una misma área registrada suficientes veces para compararla.</p></div>`;
  const w=520,h=190,padX=28,padY=24,min=1,max=3;const x=i=>padX+(rows.length===1?0:i*(w-padX*2)/(rows.length-1));const y=v=>h-padY-((v-min)/(max-min))*(h-padY*2);const palette=["var(--cyan)","var(--teal)","#a5b4fc"];
  const paths=scored.map((s,idx)=>{let d="",started=false;rows.forEach((r,i)=>{const v=evolutionValue(r,s.key);if(v==null){started=false;return;}d+=`${started?" L":"M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;started=true;});return`<path d="${d}" fill="none" stroke="${palette[idx]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;}).join("");
  const points=scored.map((s,idx)=>rows.map((r,i)=>{const v=evolutionValue(r,s.key);return v==null?"":`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${palette[idx]}"/>`;}).join("")).join("");
  const labels=rows.map((r,i)=>`<text x="${x(i).toFixed(1)}" y="184" text-anchor="middle">${esc(fmtDate(r.observation_date).replace(/\s+de\s+/g," ").replace(/\s+\d{4}$/,""))}</text>`).join("");
  return `<div class="evolution-chart-wrap"><svg class="evolution-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Evolución observada por registros"><line x1="${padX}" x2="${w-padX}" y1="${y(1)}" y2="${y(1)}"/><line x1="${padX}" x2="${w-padX}" y1="${y(2)}" y2="${y(2)}"/><line x1="${padX}" x2="${w-padX}" y1="${y(3)}" y2="${y(3)}"/>${paths}${points}${labels}</svg><div class="evolution-legend">${scored.map((s,idx)=>`<span><i style="background:${palette[idx]}"></i>${esc(teacherAreaLabels[s.key])}</span>`).join("")}</div><small class="evolution-note">La gráfica muestra cambios entre observaciones disponibles; no representa una calificación.</small></div>`;
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
async function openStudent(id){
  currentStudent=id;const d=await req(`/api/teacher/student/${id}`);
  $("#teacherStudentListView").hidden=true;$("#teacherStudentDetail").hidden=false;setTeacherStudentTab("summary");
  $("#teacherStudentName").textContent=d.person.full_name;$("#teacherStudentMeta").textContent=[d.enrollment?.grade_level||d.program?.grade_level,d.enrollment?.school_year||d.program?.school_year,d.program?.school_name].filter(Boolean).join(" · ");
  const c=d.continuity||{},approved=!!c.approved_at;$("#teacherApprovedReport").hidden=!approved;
  $("#teacherReportState").innerHTML=`${transferReceivedHtml(d.latest_transfer)}${approved?"":`<div class="report-pending-card"><span class="eyebrow">INFORME EN PREPARACIÓN</span><h3>Aún no hay un informe de continuidad publicado.</h3><p>El profesional está revisando la información. Si tienes información útil, puedes enviar un comentario complementario. Alex decidirá si debe integrarse al expediente.</p></div>`}`;
  if(approved){
    const pro=(d.professional_observations||[]);const proBlock=pro.length?`<section class="teacher-professional-observations"><div class="report-card-head"><div><span class="eyebrow">APORTES DEL PROFESIONAL</span><h3>Observaciones compartidas por Alex</h3></div><small>Solo contenido publicado</small></div><div class="teacher-professional-list">${pro.map(o=>`<article><div><strong>${esc(fmtDate(o.observation_date)||"—")}</strong><span>${esc(o.context||o.subject||"Seguimiento profesional")}</span></div><p>${esc(o.description||"")}</p>${o.strategy_used?`<small><b>Estrategia:</b> ${esc(o.strategy_used)}</small>`:""}${o.recommendation_text?`<small><b>Recomendación:</b> ${esc(o.recommendation_text)}</small>`:""}</article>`).join("")}</div></section>`:"";
    $("#teacherContinuity").innerHTML=`<article class="continuity-feature teacher-summary-feature"><span>RESUMEN GENERAL</span><h3>Panorama actual</h3><p>${esc(c.general_description||"—")}</p></article><div class="teacher-visual-dashboard"><section class="report-card visual-profile-card"><div class="report-card-head"><div><span class="eyebrow">PERFIL VISUAL DEL ALUMNO</span><h3>Áreas de acompañamiento</h3></div><small>Lectura descriptiva</small></div>${profileMap(d.snapshot,c)}</section><section class="report-card evolution-card"><div class="report-card-head"><div><span class="eyebrow">EVOLUCIÓN OBSERVADA</span><h3>Seguimiento en el tiempo</h3></div><small>Solo con registros comparables</small></div>${evolutionVisual(d.snapshot,c)}</section></div><div class="continuity-detail-grid teacher-action-grid"><article><span>FORTALEZAS OBSERVADAS</span><p>${esc(c.strengths||"—")}</p></article><article><span>ÁREAS QUE PUEDEN REQUERIR APOYO</span><p>${esc(c.support_needs||"—")}</p></article><article><span>ESTRATEGIAS DE APOYO RECOMENDADAS</span><p>${esc(c.strategies||"—")}</p></article><article><span>ASPECTOS A SEGUIR OBSERVANDO</span><p>${esc(c.watch_items||"—")}</p></article></div>${proBlock}<div class="teacher-report-disclaimer">Este informe presenta información descriptiva para continuidad y acompañamiento escolar. Se basa en observaciones disponibles y no constituye evaluación clínica ni diagnóstico.</div>`;
  }
  $("#teacherOwnObservations").innerHTML=d.own_observations.length?d.own_observations.map(o=>`<article class="note-card"><span>${esc(fmtDate(o.observation_date))} · ${esc(o.subject||o.context||"")}</span><p>${esc(o.description)}</p><small>${o.status==="reviewed"?"Revisado":"Pendiente de revisión"}${o.professional_comment?" · Comentario profesional: "+esc(o.professional_comment):""}</small></article>`).join(""):`<p class="muted">Aún no has enviado comentarios.</p>`;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$("#tObsDate").max=today;$("#tObsDate").value=today;restoreTeacherDraft();
}
$("#backToStudents").onclick=()=>{$("#teacherStudentDetail").hidden=true;$("#teacherStudentListView").hidden=false;};
$("#submitTeacherObservation").onclick=async()=>{const btn=$("#submitTeacherObservation");if(btn.disabled)return;btn.disabled=true;const label=btn.textContent;btn.textContent="ENVIANDO…";try{const p={person_id:currentStudent,observation_date:$("#tObsDate").value,subject:$("#tObsSubject").value,context:$("#tObsContext").value,description:$("#tObsDescription").value};await req("/api/teacher/observation",{method:"POST",body:JSON.stringify(p)});clearTeacherDraft();$("#teacherObsStatus").style.color="#86EFAC";$("#teacherObsStatus").textContent="Comentario enviado a Alex para revisión.";$("#tObsDescription").value="";await openStudent(currentStudent);setTeacherStudentTab("history");}catch(e){$("#teacherObsStatus").style.color="#FDA4AF";$("#teacherObsStatus").textContent=e.message;}finally{btn.disabled=false;btn.textContent=label;}};
(async()=>{try{const s=await req("/api/teacher/session");if(s.authenticated)await boot();else show("teacherLogin");}catch{show("teacherLogin");}})();

;document.querySelectorAll('.status').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});
