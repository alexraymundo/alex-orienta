
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
const areas=[["attention_support","Atención"],["instructions_support","Seguimiento de instrucciones"],["organization_support","Organización"],["peer_support","Interacción con pares"],["frustration_support","Manejo de frustración"],["transitions_support","Cambios / transiciones"],["autonomy_support","Autonomía"],["help_seeking_support","Solicitud de ayuda"]];
const teacherDraftFields=["tObsDate","tObsSubject","tObsContext","tObsDescription","tObsAntecedent","tObsStrategy","tObsResult","tObsAdditional"];
function teacherDraftKey(){return currentTeacherId&&currentStudent?`nortia_teacher_draft_${currentTeacherId}_${currentStudent}`:"";}
function saveTeacherDraft(){
  const key=teacherDraftKey(); if(!key)return;
  const draft={}; teacherDraftFields.forEach(id=>draft[id]=$("#"+id)?.value||"");
  areas.forEach(([k])=>draft["rate_"+k]=$("#rate_"+k)?.value||"");
  sessionStorage.setItem(key,JSON.stringify(draft));
  const state=$("#teacherDraftState"); if(state)state.textContent="Borrador guardado en este dispositivo";
}
function restoreTeacherDraft(){
  const key=teacherDraftKey(); if(!key)return;
  let draft={}; try{draft=JSON.parse(sessionStorage.getItem(key)||"{}");}catch{}
  teacherDraftFields.forEach(id=>{if(draft[id]!=null&&$("#"+id))$("#"+id).value=draft[id];});
  areas.forEach(([k])=>{if(draft["rate_"+k]!=null&&$("#rate_"+k))$("#rate_"+k).value=draft["rate_"+k];});
}
function clearTeacherDraft(){const key=teacherDraftKey();if(key)sessionStorage.removeItem(key);const state=$("#teacherDraftState");if(state)state.textContent="Borrador local automático";}

function ratingFields(){return areas.map(([k,l])=>`<label>${l}<select id="rate_${k}"><option value="">No registrar esta área</option><option value="0">Sin necesidad de apoyo observada</option><option value="1">Apoyo ocasional</option><option value="2">Apoyo moderado</option><option value="3">Apoyo frecuente</option></select></label>`).join("");}
$("#teacherRatings").innerHTML=ratingFields();
[...document.querySelectorAll('#teacherTabObserve input,#teacherTabObserve textarea,#teacherTabObserve select')].forEach(el=>{
  el.addEventListener('input',saveTeacherDraft);
  el.addEventListener('change',saveTeacherDraft);
});
const teacherAreaLabels={attention:"Atención",instructions:"Instrucciones",organization:"Organización",peers:"Interacción con pares",frustration:"Manejo de frustración",transitions:"Cambios / transiciones",autonomy:"Autonomía",help_seeking:"Solicitud de ayuda"};
const trendFieldMap={attention:"attention_support",instructions:"instructions_support",organization:"organization_support",peers:"peer_support",frustration:"frustration_support",transitions:"transitions_support",autonomy:"autonomy_support",help_seeking:"help_seeking_support"};
function frequencyText(dist){
  const n=Number(dist?.n||0);
  if(!n)return"Sin datos";
  if(n<3)return`Datos iniciales · n=${n}`;
  const pct=Number(dist.higher_support_pct||0);
  if(pct<25)return"Pocas veces se registró apoyo moderado/frecuente";
  if(pct<60)return"En parte de los registros se observó apoyo moderado/frecuente";
  return"En la mayoría de registros se observó apoyo moderado/frecuente";
}
function chart(snapshot){
  const entries=Object.entries(teacherAreaLabels);
  $("#teacherSupportChart").innerHTML=entries.map(([k,l])=>{const d=snapshot.distribution?.[k],pct=d?.higher_support_pct==null?0:Number(d.higher_support_pct);return`<div class="support-row enhanced"><div><strong>${l}</strong><small>${frequencyText(d)}</small></div><div class="support-track"><i style="width:${pct}%"></i></div><b>${d?.n?`n=${d.n}`:"—"}</b></div>`}).join("");
  const max=Math.max(1,...(snapshot.contexts||[]).map(x=>Number(x.count)));
  $("#teacherContextChart").innerHTML=(snapshot.contexts||[]).length?snapshot.contexts.map(x=>`<div class="context-visual-row"><div><strong>${esc(x.context)}</strong><small>${x.count} registro${Number(x.count)===1?"":"s"}</small></div><div class="context-track"><i style="width:${Number(x.count)/max*100}%"></i></div></div>`).join(""):`<p class="muted">Aún no hay suficientes registros revisados.</p>`;
  $("#teacherTrendChart").innerHTML=(snapshot.trend||[]).length?snapshot.trend.map(row=>{const n=[row.attention_support,row.instructions_support,row.organization_support,row.peer_support,row.frustration_support,row.transitions_support,row.autonomy_support,row.help_seeking_support].filter(v=>v!=null&&v!=="").length;return`<div class="trend-context-row"><strong>${esc(fmtDate(row.observation_date)||"—")}</strong><span>${esc(row.context||"Sin contexto")}</span><small>${n} área${n===1?"":"s"} registrada${n===1?"":"s"}</small></div>`}).join(""):`<p class="muted">Aún no hay registros revisados.</p>`;
}
function reportKpis(snapshot){
  const vals=Object.entries(snapshot.distribution||{}).filter(([,d])=>Number(d?.n||0)>=3&&d.higher_support_pct!=null).sort((a,b)=>Number(b[1].higher_support_pct)-Number(a[1].higher_support_pct));
  const top=vals[0],ctx=(snapshot.contexts||[])[0];
  return`<article><span>Observaciones revisadas</span><strong>${snapshot.observation_count||0}</strong><small>Registros considerados</small></article><article><span>Área a observar</span><strong>${top?esc(teacherAreaLabels[top[0]]):"—"}</strong><small>${top?frequencyText(top[1]):"Sin datos"}</small></article><article><span>Contexto más registrado</span><strong>${ctx?esc(ctx.context):"—"}</strong><small>${ctx?ctx.count+" registros":"Sin datos"}</small></article><article><span>Última revisión</span><strong>${snapshot.last_reviewed_at?new Date(snapshot.last_reviewed_at).toLocaleDateString():"—"}</strong><small>Información revisada</small></article>`;
}
async function openStudent(id){currentStudent=id;const d=await req(`/api/teacher/student/${id}`);$("#teacherStudentListView").hidden=true;$("#teacherStudentDetail").hidden=false;setTeacherStudentTab("summary");$("#teacherStudentName").textContent=d.person.full_name;$("#teacherStudentMeta").textContent=[d.program?.grade_level,d.program?.school_year,d.program?.school_name].filter(Boolean).join(" · ");const c=d.continuity||{};const approved=!!c.approved_at;$("#teacherApprovedReport").hidden=!approved;$("#teacherReportState").innerHTML=approved?"":`<div class="report-pending-card"><span class="eyebrow">INFORME EN PREPARACIÓN</span><h3>Aún no hay un informe de continuidad publicado.</h3><p>El profesional está revisando la información. Tus observaciones pueden seguir registrándose y aparecerán en el informe cuando sean revisadas.</p></div>`;if(approved){$("#teacherReportKpis").innerHTML=reportKpis(d.snapshot);$("#teacherContinuity").innerHTML=`<article class="continuity-feature"><span>DESCRIPCIÓN GENERAL</span><h3>Panorama actual</h3><p>${esc(c.general_description||"—")}</p></article><div class="continuity-detail-grid"><article><span>FORTALEZAS OBSERVADAS</span><p>${esc(c.strengths||"—")}</p></article><article><span>PUEDE REQUERIR APOYO EN</span><p>${esc(c.support_needs||"—")}</p></article><article><span>ESTRATEGIAS QUE HAN FUNCIONADO</span><p>${esc(c.strategies||"—")}</p></article><article><span>ASPECTOS A SEGUIR OBSERVANDO</span><p>${esc(c.watch_items||"—")}</p></article></div><div class="teacher-report-disclaimer">Este informe resume observaciones escolares revisadas y contenido aprobado por el profesional. No es una evaluación clínica ni un diagnóstico.</div>`;chart(d.snapshot);}$("#teacherOwnObservations").innerHTML=d.own_observations.length?d.own_observations.map(o=>`<article class="note-card"><span>${esc(fmtDate(o.observation_date))} · ${esc(o.subject||o.context||"")}</span><p>${esc(o.description)}</p><small>${o.status==="reviewed"?"Revisado":"Pendiente de revisión"}${o.professional_comment?" · Comentario profesional: "+esc(o.professional_comment):""}</small></article>`).join(""):`<p class="muted">Aún no has enviado observaciones.</p>`;const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$("#tObsDate").max=today;$("#tObsDate").value=today;restoreTeacherDraft();}
$("#backToStudents").onclick=()=>{$("#teacherStudentDetail").hidden=true;$("#teacherStudentListView").hidden=false;};
$("#submitTeacherObservation").onclick=async()=>{const btn=$("#submitTeacherObservation");if(btn.disabled)return;btn.disabled=true;const label=btn.textContent;btn.textContent="ENVIANDO…";try{const p={person_id:currentStudent,observation_date:$("#tObsDate").value,subject:$("#tObsSubject").value,context:$("#tObsContext").value,description:$("#tObsDescription").value,antecedent:$("#tObsAntecedent").value,strategy_used:$("#tObsStrategy").value,result_text:$("#tObsResult").value,additional_comments:$("#tObsAdditional").value};areas.forEach(([k])=>{const value=$("#rate_"+k).value;if(value!=="")p[k]=value;});await req("/api/teacher/observation",{method:"POST",body:JSON.stringify(p)});clearTeacherDraft();$("#teacherObsStatus").style.color="#86EFAC";$("#teacherObsStatus").textContent="Observación enviada a revisión.";["#tObsDescription","#tObsAntecedent","#tObsStrategy","#tObsResult","#tObsAdditional"].forEach(x=>$(x).value="");await openStudent(currentStudent);setTeacherStudentTab("history");}catch(e){$("#teacherObsStatus").style.color="#FDA4AF";$("#teacherObsStatus").textContent=e.message;}finally{btn.disabled=false;btn.textContent=label;}};
(async()=>{try{const s=await req("/api/teacher/session");if(s.authenticated)await boot();else show("teacherLogin");}catch{show("teacherLogin");}})();

;document.querySelectorAll('.status').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});
