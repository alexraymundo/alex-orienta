
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
const teacherAreaLabels={
  instructions:"Comprensión de instrucciones",
  attention:"Atención y enfoque",
  participation:"Participación",
  organization:"Organización",
  autonomy:"Autonomía",
  emotional:"Regulación emocional",
  motivation:"Motivación escolar",
  social:"Convivencia social",
  communication:"Comunicación y expresión",
  frustration:"Tolerancia a la frustración"
};
const trendFieldMap={attention:"attention_support",instructions:"instructions_support",organization:"organization_support",participation:"peer_support",emotional:"frustration_support",autonomy:"autonomy_support",social:"peer_support",frustration:"frustration_support"};
const visualProfileAreas=[
  {key:"instructions",label:"Comprensión de instrucciones",short:"Instrucciones",icon:"↳"},
  {key:"attention",label:"Atención y enfoque",short:"Atención",icon:"◎"},
  {key:"participation",label:"Participación",short:"Participación",icon:"◌"},
  {key:"organization",label:"Organización",short:"Organización",icon:"▦"},
  {key:"autonomy",label:"Autonomía",short:"Autonomía",icon:"◇"},
  {key:"emotional",label:"Regulación emocional",short:"Reg. emocional",icon:"≈"},
  {key:"motivation",label:"Motivación escolar",short:"Motivación",icon:"✦"},
  {key:"social",label:"Convivencia social",short:"Convivencia",icon:"☍"},
  {key:"communication",label:"Comunicación y expresión",short:"Comunicación",icon:"◔"},
  {key:"frustration",label:"Tolerancia a la frustración",short:"Frustración",icon:"△"}
];
function normalizeText(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}
function reportText(c={}){return normalizeText([c.general_description,c.strengths,c.support_needs,c.strategies,c.watch_items].filter(Boolean).join(" "));}
function textSignals(c={}, area){
  const strengths=normalizeText(c.strengths), support=normalizeText(c.support_needs), all=reportText(c);
  const patterns={
    instructions:/(instruccion|indicacion|consigna|comprension|seguir indicaciones)/,
    attention:/(atencion|concentr|enfoc|distracci)/,
    participation:/(particip|sesion|grupo|equipo|interaccion|colabor)/,
    organization:/(organiz|planific|material|secuencia|tarea|rutina)/,
    autonomy:/(autonom|independ|por si mismo|trabajo individual|iniciativa propia)/,
    emotional:/(regulacion|emocion|ansiedad|nervi|seguridad emocional|autorreg)/,
    motivation:/(motiv|interes|disposicion|desmotivad|animo|involucr)/,
    social:/(conviv|social|companero|pares|grupo|interaccion|relacion)/,
    communication:/(comunic|expres|verbal|explicar|responder|lenguaje)/,
    frustration:/(frustra|enojo|molest|tolerancia|persistencia|abandona|desespera)/
  };
  const rx=patterns[area] || /$^/;
  return {mentioned:rx.test(all),strength:rx.test(strengths),support:rx.test(support)};
}
function distributionForArea(snapshot={}, area){
  const map={instructions:"instructions",attention:"attention",participation:"peers",organization:"organization",autonomy:"autonomy",emotional:"frustration",social:"peers",frustration:"frustration"};
  return snapshot?.distribution?.[map[area]]||{};
}
function profileAreaState(snapshot={},c={},area){
  const d=distributionForArea(snapshot,area), n=Number(d?.n||0), sig=textSignals(c,area);
  if(n>=3 && d.higher_support_pct!=null){
    const pct=Number(d.higher_support_pct||0);
    if(pct>=60)return{label:"Requiere apoyo",tone:"support",detail:"Apoyo observado con mayor frecuencia"};
    if(pct>=25)return{label:"En desarrollo",tone:"developing",detail:"Conviene mantener seguimiento"};
    if(sig.strength)return{label:"Fortaleza observada",tone:"strength",detail:"Fortaleza descrita en el informe"};
    return{label:"En seguimiento",tone:"developing",detail:"Menor frecuencia de apoyo en los registros"};
  }
  if(sig.support)return{label:"Requiere apoyo",tone:"support",detail:"Identificado en el informe publicado"};
  if(sig.strength)return{label:"Fortaleza observada",tone:"strength",detail:"Identificada en el informe publicado"};
  if(sig.mentioned||n>0)return{label:"En desarrollo",tone:"developing",detail:n?`${n} registro${n===1?"":"s"} disponible${n===1?"":"s"}`:"Área mencionada en el informe"};
  return{label:"Sin información suficiente",tone:"unknown",detail:"Aún sin evidencia específica"};
}
function profileScoreFromState(s){return s.tone==="strength"?3:s.tone==="developing"?2:s.tone==="support"?1:0;}
function profileMap(snapshot,c={}){
  const states=visualProfileAreas.map(a=>({area:a,...profileAreaState(snapshot,c,a.key)}));
  return `<div class="student-profile-map student-profile-map-10"><div class="profile-map-center"><span>PERFIL INTEGRAL</span><strong>Seguimiento escolar</strong><small>Lectura visual para orientar el acompañamiento escolar y socioemocional</small></div>${states.map((item,i)=>`<article class="profile-node profile-node-${i+1} ${item.tone}"><i>${item.area.icon}</i><div><strong>${esc(item.area.label)}</strong><span>${esc(item.label)}</span><small>${esc(item.detail)}</small></div></article>`).join("")}</div><div class="profile-map-legend"><span><i class="dot strength"></i>Fortaleza observada</span><span><i class="dot developing"></i>En desarrollo</span><span><i class="dot support"></i>Requiere apoyo</span><span><i class="dot unknown"></i>Sin información suficiente</span></div>`;
}
function radarInterpretation(snapshot,c={}){
  const states=visualProfileAreas.map(a=>({areaLabel:a.label,state:profileAreaState(snapshot,c,a.key)}));
  const support=states.filter(x=>x.state.tone==="support").map(x=>x.areaLabel).slice(0,3);
  const strengths=states.filter(x=>x.state.tone==="strength").map(x=>x.areaLabel).slice(0,2);
  const developing=states.filter(x=>x.state.tone==="developing").map(x=>x.areaLabel).slice(0,2);
  const supportText=support.length?support.join(', '):'No hay áreas marcadas actualmente como prioridad alta';
  const strengthText=strengths.length?strengths.join(', '):(developing.length?developing.join(', '):'Aún sin fortalezas claramente identificadas');
  return `<div class="radar-explainer"><div class="radar-reading"><strong>¿Cómo leerlo?</strong><p>Mientras más se extiende la figura hacia el borde, mayor consolidación observada hay en esa área. En los ejes con información, una posición más cercana al centro indica mayor necesidad de acompañamiento. Los nombres en gris significan que todavía no hay evidencia suficiente y no deben interpretarse como una dificultad.</p></div><div class="radar-insights"><article><span>Áreas prioritarias hoy</span><p>${esc(supportText)}</p></article><article><span>Áreas más favorables</span><p>${esc(strengthText)}</p></article></div></div>`;
}
function radarVisual(snapshot,c={}){
  const areas=visualProfileAreas.map(a=>({label:a.label,short:a.short||a.label,state:profileAreaState(snapshot,c,a.key)}));
  const values=areas.map(a=>profileScoreFromState(a.state));
  const activeCount=values.filter(v=>v>0).length;
  if(!activeCount){
    return `<div class="radar-empty"><span class="evolution-icon">◎</span><strong>Panorama inicial</strong><p>Todavía no hay suficiente información para construir un perfil gráfico más completo. El radar se irá enriqueciendo con nuevas observaciones.</p></div>`;
  }
  const size=420, cx=210, cy=180, maxR=118, levels=3;
  const angleStep=(Math.PI*2)/areas.length;
  const point=(index,value)=>{
    const angle=-Math.PI/2 + index*angleStep;
    const radius=maxR*(value/levels);
    const x=cx + Math.cos(angle)*radius;
    const y=cy + Math.sin(angle)*radius;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const axisPoint=(index,radius)=>{
    const angle=-Math.PI/2 + index*angleStep;
    return {x:cx + Math.cos(angle)*radius,y:cy + Math.sin(angle)*radius};
  };
  const rings=Array.from({length:levels},(_,i)=>{
    const radius=maxR*((i+1)/levels);
    const pts=areas.map((_,idx)=>{const p=axisPoint(idx,radius);return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(148,163,184,.13)" stroke-width="1"/>`;
  }).join("");
  const axes=areas.map((_,idx)=>{const p=axisPoint(idx,maxR);return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(148,163,184,.10)" stroke-width="1"/>`;}).join("");
  const labels=areas.map((a,idx)=>{const p=axisPoint(idx,maxR+25);return `<text class="radar-label ${a.state.tone}" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle">${esc(a.short)}</text>`;}).join("");
  const areaPolygon=areas.map((_,idx)=>point(idx,values[idx])).join(" ");
  const dots=areas.map((_,idx)=>{const [x,y]=point(idx,values[idx]).split(',');return `<circle cx="${x}" cy="${y}" r="4.5" fill="#38BDF8" stroke="rgba(255,255,255,.35)" stroke-width="1"/>`;}).join("");
  return `<div class="radar-wrap"><div class="radar-shell"><svg class="radar-svg" viewBox="0 0 ${size} 330" role="img" aria-label="Panorama general de observación"><defs><linearGradient id="radarFillTeacher" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="rgba(56,189,248,.35)"/><stop offset="100%" stop-color="rgba(20,184,166,.16)"/></linearGradient></defs><g>${rings}${axes}<polygon class="radar-area" points="${areaPolygon}" fill="url(#radarFillTeacher)"/><g class="radar-dots">${dots}</g>${labels}</g></svg></div><div class="radar-scale"><span>Centro = mayor acompañamiento*</span><span>Borde = mayor consolidación</span></div><div class="radar-legend"><span><i class="radar-swatch radar-swatch-1"></i>Requiere apoyo</span><span><i class="radar-swatch radar-swatch-2"></i>En desarrollo</span><span><i class="radar-swatch radar-swatch-3"></i>Fortaleza observada</span></div>${radarInterpretation(snapshot,c)}<small class="evolution-note">Lectura general por áreas escolares y socioemocionales. Es una visualización descriptiva, no una calificación.</small></div>`;
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
    $("#teacherContinuity").innerHTML=`<article class="continuity-feature teacher-summary-feature"><span>RESUMEN GENERAL</span><h3>Panorama actual</h3><p>${esc(c.general_description||"—")}</p></article><div class="teacher-visual-dashboard"><section class="report-card visual-profile-card"><div class="report-card-head"><div><span class="eyebrow">PERFIL INTEGRAL DEL ALUMNO</span><h3>Mapa visual de acompañamiento</h3></div><small>Lectura descriptiva</small></div>${profileMap(d.snapshot,c)}</section><section class="report-card evolution-card"><div class="report-card-head"><div><span class="eyebrow">PANORAMA GENERAL DE OBSERVACIÓN</span><h3>Lectura general por áreas</h3></div><small>Radar descriptivo</small></div>${radarVisual(d.snapshot,c)}</section></div><div class="continuity-detail-grid teacher-action-grid"><article><span>FORTALEZAS OBSERVADAS</span><p>${esc(c.strengths||"—")}</p></article><article><span>ÁREAS QUE PUEDEN REQUERIR APOYO</span><p>${esc(c.support_needs||"—")}</p></article><article><span>ESTRATEGIAS DE APOYO RECOMENDADAS</span><p>${esc(c.strategies||"—")}</p></article><article><span>ASPECTOS A SEGUIR OBSERVANDO</span><p>${esc(c.watch_items||"—")}</p></article></div>${proBlock}<div class="teacher-report-disclaimer">Este informe presenta información descriptiva para continuidad y acompañamiento escolar. Se basa en observaciones disponibles y no constituye evaluación clínica ni diagnóstico.</div>`;
  }
  $("#teacherOwnObservations").innerHTML=d.own_observations.length?d.own_observations.map(o=>`<article class="note-card"><span>${esc(fmtDate(o.observation_date))} · ${esc(o.subject||o.context||"")}</span><p>${esc(o.description)}</p><small>${o.status==="reviewed"?"Revisado":"Pendiente de revisión"}${o.professional_comment?" · Comentario profesional: "+esc(o.professional_comment):""}</small></article>`).join(""):`<p class="muted">Aún no has enviado comentarios.</p>`;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$("#tObsDate").max=today;$("#tObsDate").value=today;restoreTeacherDraft();
}
$("#backToStudents").onclick=()=>{$("#teacherStudentDetail").hidden=true;$("#teacherStudentListView").hidden=false;};
$("#submitTeacherObservation").onclick=async()=>{const btn=$("#submitTeacherObservation");if(btn.disabled)return;btn.disabled=true;const label=btn.textContent;btn.textContent="ENVIANDO…";try{const p={person_id:currentStudent,observation_date:$("#tObsDate").value,subject:$("#tObsSubject").value,context:$("#tObsContext").value,description:$("#tObsDescription").value};await req("/api/teacher/observation",{method:"POST",body:JSON.stringify(p)});clearTeacherDraft();$("#teacherObsStatus").style.color="#86EFAC";$("#teacherObsStatus").textContent="Comentario enviado a Alex para revisión.";$("#tObsDescription").value="";await openStudent(currentStudent);setTeacherStudentTab("history");}catch(e){$("#teacherObsStatus").style.color="#FDA4AF";$("#teacherObsStatus").textContent=e.message;}finally{btn.disabled=false;btn.textContent=label;}};
(async()=>{try{const s=await req("/api/teacher/session");if(s.authenticated)await boot();else show("teacherLogin");}catch{show("teacherLogin");}})();

;document.querySelectorAll('.status').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});
