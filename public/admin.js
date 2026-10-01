

function adminToast(message, type='info') {
  const region = $('#adminToastRegion');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `app-toast ${type}`;
  item.textContent = String(message || '');
  region.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 180);
  }, 3600);
}
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let peopleCache = [];
let currentPersonId = "";
let currentPersonData = null;

function nortiaToday() {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

function setLocked(locked) {
  $("#loginScreen").hidden = !locked;
  $("#secureApp").hidden = locked;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) setLocked(true);
    throw new Error(data.error || "Error");
  }

  return data;
}

async function loadPrivateData() {
  await Promise.all([
    loadDashboard(),
    loadAppointments(),
    loadPeople(),
    loadNotifications(),
    loadTeachers(),
    loadModuleObservations(),
    loadAudit(),
    loadDeploymentSecurityStatus(),
    loadCidebSummary()
  ]);
}

async function forceFreshLogin() {
  setLocked(true);

  // Explicitly invalidate any old cookie so opening /admin always asks for password.
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      headers: { "content-type": "application/json" }
    });
  } catch {}

  $("#adminPassword").focus();
}

async function login() {
  $("#loginStatus").style.color = "";
  $("#loginStatus").textContent = "Validando...";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: $("#adminPassword").value
      })
    });

    $("#loginStatus").textContent = "";
    $("#adminPassword").value = "";
    setLocked(false);
    await loadPrivateData();
  } catch (error) {
    setLocked(true);
    $("#loginStatus").style.color = "#ffb4b4";
    $("#loginStatus").textContent = error.message;
  }
}

$("#loginBtn").addEventListener("click", login);

$("#adminPassword").addEventListener("keydown", event => {
  if (event.key === "Enter") login();
});

$("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch {}
  try { sessionStorage.removeItem("nortia_recent_cideb_students"); localStorage.removeItem("nortia_favorite_cideb_students"); } catch {}
  location.reload();
});

const cidebTabs = new Set(["cideb","students","teachers","observations","continuity","families","cideb-security"]);
let activeWorkspace = "practice";

function setAdminWorkspace(workspace, openDefault = false) {
  activeWorkspace = workspace === "cideb" ? "cideb" : "practice";
  const school = activeWorkspace === "cideb";

  $("#practiceNav").hidden = school;
  $("#cidebNav").hidden = !school;
  $("#workspacePracticeBtn").classList.toggle("active", !school);
  $("#workspaceCidebBtn").classList.toggle("active", school);
  document.body.classList.toggle("admin-cideb-workspace", school);

  $("#workspaceEyebrow").textContent = school
    ? "CIDEB · SEGUIMIENTO ESCOLAR"
    : "MI PRÁCTICA · PANEL PROFESIONAL";

  $("#workspaceDescription").textContent = school
    ? "Alumnos, docentes, observaciones e informes escolares en un espacio independiente."
    : "Agenda, personas y seguimiento de tu práctica privada.";

  $("#globalSearchShell").hidden = false;
  const searchInput = $("#globalPersonSearch");
  if (searchInput) {
    searchInput.value = "";
    searchInput.placeholder = school ? "Buscar alumno en CIDEB..." : "Buscar en Mi práctica...";
  }
  const searchResults = $("#globalSearchResults");
  if (searchResults) { searchResults.hidden = true; searchResults.innerHTML = ""; }

  if (openDefault) openAdminTab(school ? "cideb" : "dashboard");
}

function openAdminTab(tab) {
  if ($("#secureApp").hidden) return;

  const school = cidebTabs.has(tab);
  if ((school ? "cideb" : "practice") !== activeWorkspace) {
    setAdminWorkspace(school ? "cideb" : "practice", false);
  }

  $$(".nav-btn[data-tab]").forEach(item => {
    const active = item.dataset.tab === tab;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  $$(".admin-view").forEach(view => view.classList.remove("active"));
  const target = $(`#view-${tab}`);
  if (!target) return;
  target.classList.add("active");

  $("#viewTitle").textContent = {
    dashboard: "Hoy",
    agenda: "Agenda",
    people: "Personas",
    cideb: "Resumen CIDEB",
    students: "Alumnos",
    teachers: "Docentes",
    observations: "Observaciones",
    continuity: "Informes para docentes",
    families: "Familias",
    "cideb-security": "Seguridad CIDEB",
    security: "Seguridad",
    vocational: "Mapa vocacional",
    notifications: "Notificaciones",
    ai: "NORTIA Reflexión"
  }[tab] || "NORTIA";

  if (school) {
    loadInstitutionPreview();
    loadCidebSummary();
  }
  if (tab === "students") loadCidebStudents(1);
  if (tab === "security") { loadAudit(); loadDeploymentSecurityStatus(); }
}

$("#workspacePracticeBtn")?.addEventListener("click", () => setAdminWorkspace("practice", true));
$("#workspaceCidebBtn")?.addEventListener("click", () => setAdminWorkspace("cideb", true));

$$(".nav-btn[data-tab]").forEach(button => {
  button.addEventListener("click", () => openAdminTab(button.dataset.tab));
});

$$("[data-cideb-open]").forEach(button => {
  button.addEventListener("click", () => openAdminTab(button.dataset.cidebOpen));
});

$$('[data-dashboard-open]').forEach(button => {
  button.addEventListener('click', () => openAdminTab(button.dataset.dashboardOpen));
});




$("#showNewTeacherBtn")?.addEventListener("click", () => {
  $("#teacherListPanel").hidden = true;
  $("#teacherCreatePanel").hidden = false;
  $("#teacherName")?.focus();
});
$("#cancelNewTeacherBtn")?.addEventListener("click", () => {
  $("#teacherCreatePanel").hidden = true;
  $("#teacherListPanel").hidden = false;
});

$$("[data-observation-source]").forEach(button => button.addEventListener("click", () => {
  const source = button.dataset.observationSource;
  $$("[data-observation-source]").forEach(x => { const active=x===button; x.classList.toggle("active",active); x.setAttribute("aria-selected",active?"true":"false"); });
  $("#teacherObservationPanel").hidden = source !== "teacher";
  $("#familyObservationPanel").hidden = source !== "family";
}));

function setReportStep(step) {
  const map = { context: "#reportStepContext", write: "#reportStepWrite", preview: "#reportStepPreview" };
  Object.entries(map).forEach(([name, selector]) => {
    const el = $(selector);
    if (el) el.hidden = name !== step;
    el?.classList.toggle("active", name === step);
  });
  $$("[data-report-step]").forEach(button => { const active=button.dataset.reportStep===step; button.classList.toggle("active",active); button.setAttribute("aria-selected",active?"true":"false"); });
  if (step === "preview" && currentContinuityData) renderTeacherReportPreview(currentContinuityData, true);
  window.scrollTo({top:0,behavior:"smooth"});
}
$$("[data-report-step]").forEach(button => button.addEventListener("click", () => setReportStep(button.dataset.reportStep)));
$$("[data-go-report-step]").forEach(button => button.addEventListener("click", () => setReportStep(button.dataset.goReportStep)));

$$("[data-family-admin-tab]").forEach(button => button.addEventListener("click", () => {
  const tab = button.dataset.familyAdminTab;
  $$("[data-family-admin-tab]").forEach(x => { const active=x===button; x.classList.toggle("active",active); x.setAttribute("aria-selected",active?"true":"false"); });
  $("#familyAdminAccess").hidden = tab !== "access";
  $("#familyAdminContent").hidden = tab !== "content";
}));

let cidebDirectoryPage = 1;
let cidebDirectoryFiltersLoaded = false;
let cidebImportRows = [];
let globalSearchTimer = null;
let cidebSearchTimer = null;
const recentStudentKey = "nortia_recent_cideb_students";
const favoriteStudentKey = "nortia_favorite_cideb_students";

let lastModalFocus = null;
function modalState(id, open) {
  const el = $(id);
  if (!el) return;
  if (open) {
    lastModalFocus = document.activeElement;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => el.querySelector("input,select,textarea,button")?.focus(), 0);
  } else {
    el.hidden = true;
    document.body.style.overflow = "";
    lastModalFocus?.focus?.();
  }
}
document.addEventListener("keydown", event => {
  const openModal = document.querySelector(".modal:not([hidden])");
  if (!openModal) return;
  if (event.key === "Escape") {
    modalState(`#${openModal.id}`, false);
    return;
  }
  if (event.key !== "Tab") return;
  const focusable=[...openModal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden && el.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
});

function storedIds(key, storage = localStorage) {
  try { return JSON.parse(storage.getItem(key) || "[]"); } catch { return []; }
}
function saveIds(key, ids, storage = localStorage) { storage.setItem(key, JSON.stringify(ids.slice(0,12))); }
const recentStudentMemory = new Map();
function rememberStudent(student) {
  recentStudentMemory.set(student.id, { full_name: student.full_name, student_number: student.student_number || "" });
  const ids = storedIds(recentStudentKey, sessionStorage).filter(id => id !== student.id);
  ids.unshift(student.id);
  saveIds(recentStudentKey, ids.slice(0,5), sessionStorage);
  renderRecentStudents();
}
function toggleFavorite(id) {
  let ids = storedIds(favoriteStudentKey);
  ids = ids.includes(id) ? ids.filter(x=>x!==id) : [id,...ids];
  saveIds(favoriteStudentKey, ids);
  loadCidebStudents(cidebDirectoryPage);
}
window.toggleFavorite = toggleFavorite;

async function renderRecentStudents() {
  const bar = $("#recentStudentsBar");
  if (!bar) return;
  const ids = storedIds(recentStudentKey, sessionStorage).slice(0,5);
  bar.hidden = !ids.length;
  if (!ids.length) { bar.innerHTML = ""; return; }
  const items=[];
  for (const id of ids) {
    let info=recentStudentMemory.get(id);
    if (!info) {
      try { const d=await api(`/api/admin/cideb/student?person_id=${encodeURIComponent(id)}`); info={full_name:d.person.full_name,student_number:d.enrollment?.student_number||""}; recentStudentMemory.set(id,info); } catch { continue; }
    }
    items.push({id,...info});
  }
  bar.innerHTML = `<span>RECIENTES</span>${items.map(x=>`<button data-action="open-cideb-student" data-id="${escapeHTML(x.id)}"><strong>${escapeHTML(x.full_name)}</strong><small>${escapeHTML(x.student_number||"")}</small></button>`).join("")}`;
}

async function loadCidebSummary() {
  if (!$("#cidebPendingStrip")) return;
  try {
    const d = await api("/api/admin/cideb/summary");
    $("#cidebPendingStrip").innerHTML = `
      <button type="button" data-action="open-admin-tab" data-tab="students"><span>Sin docente</span><strong>${d.without_teacher}</strong><small>Revisar alumnos →</small></button>
      <button type="button" data-action="open-admin-tab" data-tab="observations"><span>Observaciones por revisar</span><strong>${d.pending_observations}</strong><small>Revisar →</small></button>
      <button type="button" data-action="open-admin-tab" data-tab="continuity"><span>Sin informe publicado</span><strong>${d.missing_report}</strong><small>Preparar informes →</small></button>
      <button type="button" data-action="open-admin-tab" data-tab="families"><span>Consentimientos pendientes</span><strong>${d.pending_family_consent}</strong><small>Revisar familias →</small></button>
      <button type="button" data-action="open-admin-tab" data-tab="students"><span>Revisar grado/grupo</span><strong>${d.cycle_review}</strong><small>Ir al directorio →</small></button>`;
  } catch {}
}

function fillDirectorySelect(selector, values, firstText, key="") {
  const el=$(selector); if(!el) return;
  const current=el.value;
  const opts=(values||[]).map(v => key ? `<option value="${escapeHTML(v[key])}">${escapeHTML(v.full_name)}</option>` : `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
  el.innerHTML=`<option value="">${firstText}</option>${opts}`;
  if([...el.options].some(o=>o.value===current)) el.value=current;
}

function renderStudentDirectory(students) {
  const favorites = new Set(storedIds(favoriteStudentKey));
  const table = $("#cidebStudentsTable");
  if (!students.length) {
    table.innerHTML = `<div class="directory-empty"><strong>No encontramos alumnos con esos filtros.</strong><span>Prueba otra búsqueda o agrega un alumno.</span></div>`;
    return;
  }
  table.innerHTML = `
    <div class="student-table-head"><span>Alumno</span><span>Escolar</span><span>Docente</span><span>Seguimiento</span><span></span></div>
    ${students.map(s=>`<article class="student-table-row ${s.needs_review?"needs-review":""}">
      <div class="student-name-cell"><button class="favorite-star ${favorites.has(s.id)?"active":""}" data-action="toggle-favorite" data-id="${escapeHTML(s.id)}" title="Favorito" aria-label="Marcar favorito">★</button><button class="student-name-button" data-action="open-cideb-student" data-id="${escapeHTML(s.id)}"><strong>${escapeHTML(s.full_name)}</strong><small>${escapeHTML(s.student_number||"Sin matrícula")}${s.status==='archived'?' · Archivado':''}</small></button></div>
      <div><strong>${escapeHTML([s.grade_level,s.group_name].filter(Boolean).join(" · ")||"Por completar")}</strong><small>${escapeHTML(s.school_year||"Sin ciclo")}${s.needs_review?' · Revisar':''}</small></div>
      <div><strong>${escapeHTML(s.teacher_names||"Sin docente")}</strong><small>${s.family_access_count||0} acceso(s) familiar(es)</small></div>
      <div><span class="directory-state ${s.report_published_at?'ok':'pending'}">${s.report_published_at?'Informe publicado':'Informe pendiente'}</span><small>${s.pending_observations||0} obs. por revisar</small></div>
      <button class="row-open-btn" data-action="open-cideb-student" data-id="${escapeHTML(s.id)}">VER</button>
    </article>`).join("")}`;
}

function renderDirectoryPagination(p) {
  const box=$("#cidebPagination");
  if(!box)return;
  box.innerHTML=`<button class="secondary-btn" ${p.page<=1?'disabled':''} id="prevCidebPage">ANTERIOR</button><span>Página <strong>${p.page}</strong> de ${p.pages}</span><button class="secondary-btn" ${p.page>=p.pages?'disabled':''} id="nextCidebPage">SIGUIENTE</button>`;
  const prev=$("#prevCidebPage"),next=$("#nextCidebPage");
  if(prev)prev.onclick=()=>loadCidebStudents(p.page-1);
  if(next)next.onclick=()=>loadCidebStudents(p.page+1);
}

async function loadCidebStudents(page=1) {
  if (!$("#cidebStudentsTable")) return;
  cidebDirectoryPage = page;
  const params = new URLSearchParams({
    page:String(page),
    page_size:$("#cidebPageSize")?.value||"25",
    q:$("#cidebStudentSearch")?.value||"",
    year:$("#cidebYearFilter")?.value||"",
    grade:$("#cidebGradeFilter")?.value||"",
    group:$("#cidebGroupFilter")?.value||"",
    teacher:$("#cidebTeacherFilter")?.value||"",
    status:$("#cidebStatusFilter")?.value||"active"
  });
  $("#cidebStudentsTable").innerHTML=`<div class="directory-loading">Buscando alumnos...</div>`;
  try {
    const d=await api(`/api/admin/cideb/students?${params.toString()}`);
    renderStudentDirectory(d.students||[]);
    $("#cidebDirectoryCount").textContent=`${d.pagination.total} alumno${d.pagination.total===1?'':'s'}`;
    renderDirectoryPagination(d.pagination);
    if(!cidebDirectoryFiltersLoaded){
      fillDirectorySelect("#cidebYearFilter",d.filters.years,"Todos los ciclos");
      fillDirectorySelect("#cidebGradeFilter",d.filters.grades,"Todos los grados");
      fillDirectorySelect("#cidebGroupFilter",d.filters.groups,"Todos los grupos");
      fillDirectorySelect("#cidebTeacherFilter",d.filters.teachers,"Todos los docentes","id");
      cidebDirectoryFiltersLoaded=true;
    }
    renderRecentStudents();
  }catch(e){$("#cidebStudentsTable").innerHTML=`<div class="directory-empty"><strong>No fue posible cargar el directorio.</strong><span>${escapeHTML(e.message)}</span></div>`;}
}
window.loadCidebStudents=loadCidebStudents;


function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function currentCidebDirectoryParams(page = 1, pageSize = 50) {
  return new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    q: $("#cidebStudentSearch")?.value || "",
    year: $("#cidebYearFilter")?.value || "",
    grade: $("#cidebGradeFilter")?.value || "",
    group: $("#cidebGroupFilter")?.value || "",
    teacher: $("#cidebTeacherFilter")?.value || "",
    status: $("#cidebStatusFilter")?.value || "active"
  });
}

async function exportCidebDirectory() {
  const button = $("#exportCidebDirectoryBtn");
  if (!button) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "EXPORTANDO...";

  try {
    const first = await api(
      `/api/admin/cideb/students?${currentCidebDirectoryParams(1, 50).toString()}`
    );

    const totalPages = Math.max(1, Number(first.pagination?.pages || 1));
    let students = [...(first.students || [])];

    for (let page = 2; page <= totalPages; page++) {
      button.textContent = `EXPORTANDO ${page}/${totalPages}...`;

      const next = await api(
        `/api/admin/cideb/students?${currentCidebDirectoryParams(page, 50).toString()}`
      );

      students.push(...(next.students || []));
    }

    if (!students.length) {
      adminToast('No hay alumnos que coincidan con los filtros actuales.','info');
      return;
    }

    const rows = [
      [
        "Matrícula",
        "Nombre",
        "Edad",
        "Grado",
        "Grupo",
        "Ciclo escolar",
        "Docente(s)",
        "Estado",
        "Correo",
        "Teléfono",
        "Observaciones pendientes",
        "Informe publicado",
        "Accesos familiares"
      ],
      ...students.map(student => [
        student.student_number || "",
        student.full_name || "",
        student.age ?? "",
        student.grade_level || "",
        student.group_name || "",
        student.school_year || "",
        student.teacher_names || "",
        student.status === "active" ? "Activo" : "Archivado",
        student.email || "",
        student.phone || "",
        Number(student.pending_observations || 0),
        student.report_published_at ? "Sí" : "No",
        Number(student.family_access_count || 0)
      ])
    ];

    const cycle = $("#cidebYearFilter")?.value || "todos_los_ciclos";
    const today = nortiaToday();
    const safeCycle = String(cycle).replace(/[^a-z0-9áéíóúñ_-]+/gi, "_");

    try {
      await api("/api/admin/cideb/export-audit", {
        method: "POST",
        body: JSON.stringify({
          total: students.length,
          filter_summary: [
            $("#cidebYearFilter")?.value,
            $("#cidebGradeFilter")?.value,
            $("#cidebGroupFilter")?.value,
            $("#cidebStatusFilter")?.value
          ].filter(Boolean).join(" · ") || "sin filtros adicionales"
        })
      });
    } catch {}

    downloadCsv(
      `NORTIA_CIDEB_${safeCycle}_${today}.csv`,
      rows
    );
  } catch (e) {
    adminToast(`No fue posible exportar el directorio: ${e.message}`,'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

$("#exportCidebDirectoryBtn")?.addEventListener(
  "click",
  exportCidebDirectory
);

async function openCidebStudent(id) {
  try {
    const d=await api(`/api/admin/cideb/student?person_id=${encodeURIComponent(id)}`);
    rememberStudent({...d.person,student_number:d.enrollment?.student_number});
    const e=d.enrollment||{}, teacherNames=(d.teachers||[]).map(x=>x.full_name).join(", ")||"Sin docente asignado";
    $("#cidebStudentQuickContent").innerHTML=`
      <span class="eyebrow">FICHA ESCOLAR</span><h2>${escapeHTML(d.person.full_name)}</h2>
      <div class="quick-student-kpis"><article><span>Matrícula</span><strong>${escapeHTML(e.student_number||"—")}</strong></article><article><span>Ciclo</span><strong>${escapeHTML(e.school_year||"—")}</strong></article><article><span>Observaciones</span><strong>${d.counts?.observations||0}</strong></article></div>
      <div class="quick-student-form">
        <div class="two-cols"><label>Matrícula / ID<input id="quickStudentNumber" value="${escapeHTML(e.student_number||"")}"></label><label>Ciclo<input id="quickStudentYear" value="${escapeHTML(e.school_year||"")}"></label></div>
        <div class="two-cols"><label>Grado<input id="quickStudentGrade" value="${escapeHTML(e.grade_level||"")}"></label><label>Grupo<input id="quickStudentGroup" value="${escapeHTML(e.group_name||"")}"></label></div>
        ${e.needs_review?`<div class="review-needed-note">Revisa grado y grupo para el nuevo ciclo.</div>`:""}
        <label>Docente(s)<div class="readonly-field">${escapeHTML(teacherNames)}</div></label>
      </div>
      <div class="quick-actions">
        <button class="primary-btn" data-action="save-school-student" data-id="${escapeHTML(id)}">GUARDAR ESCOLAR</button>
        <button class="secondary-btn" data-action="open-student-report" data-id="${escapeHTML(id)}">INFORME VISUAL</button>
        <button class="secondary-btn" data-action="export-student" data-id="${escapeHTML(id)}" data-name="${escapeHTML(d.person.full_name)}">EXPORTAR DATOS</button>
        ${Number(d.program?.therapy_with_alex) ? `<button class="text-action" data-action="open-professional-record" data-id="${escapeHTML(id)}">Abrir proceso privado →</button>` : ""}
      </div>
      <div id="quickStudentStatus" class="status"></div>`;
    $("#cidebStudentQuickPanel").hidden=false;
  }catch(e){adminToast(e.message,'error');}
}
window.openCidebStudent=openCidebStudent;

async function saveQuickCidebStudent(id){
  try{
    await api('/api/admin/cideb/student/update',{method:'POST',body:JSON.stringify({person_id:id,student_number:$("#quickStudentNumber").value,school_year:$("#quickStudentYear").value,grade_level:$("#quickStudentGrade").value,group_name:$("#quickStudentGroup").value})});
    $("#quickStudentStatus").style.color='#86EFAC';$("#quickStudentStatus").textContent='Datos escolares actualizados.';
    cidebDirectoryFiltersLoaded=false; await Promise.all([loadCidebStudents(cidebDirectoryPage),loadPeople(),loadCidebSummary()]);
  }catch(e){$("#quickStudentStatus").style.color='#FDA4AF';$("#quickStudentStatus").textContent=e.message;}
}
window.saveQuickCidebStudent=saveQuickCidebStudent;
function openProfessionalRecord(id){openAdminTab('people');openPerson(id);}
window.openProfessionalRecord=openProfessionalRecord;
async function openStudentReport(id){
  openAdminTab('continuity');
  try{
    const d=await api(`/api/admin/cideb/student?person_id=${encodeURIComponent(id)}`);
    const select=$("#continuityPerson");
    if(![...select.options].some(option=>option.value===id)){
      const option=document.createElement("option");
      option.value=id;
      option.textContent=`${d.person.full_name}${d.enrollment?.student_number ? ` · ${d.enrollment.student_number}` : ""}`;
      select.appendChild(option);
    }
    select.value=id;
    select.dispatchEvent(new Event('change'));
  }catch(e){
    adminToast(`No fue posible abrir el informe: ${e.message}`,'error');
  }
}
window.openStudentReport=openStudentReport;

async function exportCidebStudent(id,name){
  try{
    const data=await api(`/api/admin/cideb/student/export?person_id=${encodeURIComponent(id)}`);
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NORTIA_${String(name||'alumno').replace(/[^a-z0-9áéíóúñ_-]+/gi,'_')}.json`;a.click();URL.revokeObjectURL(a.href);
  }catch(e){adminToast(e.message,'error');}
}
window.exportCidebStudent=exportCidebStudent;

$("#closeCidebStudentPanel")?.addEventListener('click',()=>$("#cidebStudentQuickPanel").hidden=true);

["#cidebYearFilter","#cidebGradeFilter","#cidebGroupFilter","#cidebTeacherFilter","#cidebStatusFilter","#cidebPageSize"].forEach(sel=>$(sel)?.addEventListener('change',()=>loadCidebStudents(1)));
$("#cidebStudentSearch")?.addEventListener('input',()=>{clearTimeout(cidebSearchTimer);cidebSearchTimer=setTimeout(()=>loadCidebStudents(1),220);});

$("#openNewCidebStudentBtn")?.addEventListener('click',()=>modalState('#cidebStudentModal',true));
$$('[data-close-cideb-student]').forEach(x=>x.addEventListener('click',()=>modalState('#cidebStudentModal',false)));
$("#cidebStudentForm")?.addEventListener('submit',async event=>{
  event.preventDefault(); const payload=Object.fromEntries(new FormData(event.target).entries());
  const status=$("#cidebStudentFormStatus"); status.textContent='Validando...';
  const create=async allow=>api('/api/admin/cideb/student/create',{method:'POST',body:JSON.stringify({...payload,allow_duplicate_name:allow})});
  try{
    let d;
    try{d=await create(false);}catch(e){
      if(e.message.includes('mismo nombre')&&confirm(`${e.message}\n\n¿Confirmas que se trata de otra persona distinta?`))d=await create(true); else throw e;
    }
    event.target.reset();status.style.color='#86EFAC';status.textContent='Alumno creado.';cidebDirectoryFiltersLoaded=false;
    await Promise.all([loadCidebStudents(1),loadPeople(),loadCidebSummary(),loadInstitutionPreview()]);
    setTimeout(()=>modalState('#cidebStudentModal',false),650);
  }catch(e){status.style.color='#FDA4AF';status.textContent=e.message;}
});

function parseCsvLine(line, delimiter){
  const out=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){out.push(value.trim());value='';}else value+=c;}
  out.push(value.trim());return out;
}
function normalizeHeader(h){return h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function parseStudentCsv(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()); if(lines.length<2)return [];
  const delimiter=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
  const headers=parseCsvLine(lines[0],delimiter).map(normalizeHeader);
  return lines.slice(1).map(line=>{const vals=parseCsvLine(line,delimiter),obj={};headers.forEach((h,i)=>obj[h]=vals[i]??'');return obj;});
}
$("#openImportStudentsBtn")?.addEventListener('click',()=>modalState('#cidebImportModal',true));
$$('[data-close-cideb-import]').forEach(x=>x.addEventListener('click',()=>modalState('#cidebImportModal',false)));
$("#cidebCsvFile")?.addEventListener('change',async event=>{
  const file=event.target.files?.[0]; if(!file)return; cidebImportRows=parseStudentCsv(await file.text());
  const preview=cidebImportRows.slice(0,8);
  $("#cidebImportPreview").innerHTML=`<div class="import-summary"><strong>${cidebImportRows.length}</strong><span>filas detectadas</span></div>${preview.length?`<div class="import-mini-table"><div><b>Matrícula</b><b>Nombre</b><b>Grado / Grupo</b><b>Ciclo</b></div>${preview.map(r=>`<div><span>${escapeHTML(r.matricula||r.student_number||r.id||'—')}</span><span>${escapeHTML(r.nombre||r.full_name||'—')}</span><span>${escapeHTML([r.grado||r.grade_level,r.grupo||r.group_name].filter(Boolean).join(' · ')||'—')}</span><span>${escapeHTML(r.ciclo||r.school_year||'—')}</span></div>`).join('')}</div>`:''}`;
  $("#runCidebImportBtn").disabled=!cidebImportRows.length;
});
$("#runCidebImportBtn")?.addEventListener('click',async()=>{
  if(!cidebImportRows.length)return; const status=$("#cidebImportStatus");status.textContent='Importando...';
  try{const d=await api('/api/admin/cideb/import',{method:'POST',body:JSON.stringify({rows:cidebImportRows})});status.style.color='#86EFAC';status.textContent=`${d.created} creados · ${d.skipped.length} omitidos.`;cidebDirectoryFiltersLoaded=false;await Promise.all([loadCidebStudents(1),loadPeople(),loadCidebSummary(),loadInstitutionPreview()]);}catch(e){status.style.color='#FDA4AF';status.textContent=e.message;}
});

$("#openCycleBtn")?.addEventListener('click',()=>modalState('#cidebCycleModal',true));
$$('[data-close-cideb-cycle]').forEach(x=>x.addEventListener('click',()=>modalState('#cidebCycleModal',false)));
$("#advanceCycleBtn")?.addEventListener('click',async()=>{
  const from_year=$("#cycleFrom").value.trim(),to_year=$("#cycleTo").value.trim();
  if(!confirm(`¿Crear el ciclo ${to_year} a partir de ${from_year}? Se cerrarán las asignaciones docentes del ciclo anterior.`))return;
  const status=$("#cycleStatus");status.textContent='Procesando...';
  try{const d=await api('/api/admin/cideb/cycle/advance',{method:'POST',body:JSON.stringify({from_year,to_year})});status.style.color='#86EFAC';status.textContent=d.message;cidebDirectoryFiltersLoaded=false;await Promise.all([loadCidebStudents(1),loadPeople(),loadCidebSummary()]);}catch(e){status.style.color='#FDA4AF';status.textContent=e.message;}
});

$("#globalPersonSearch")?.addEventListener('input',event=>{
  clearTimeout(globalSearchTimer); const q=event.target.value.trim(),box=$("#globalSearchResults");
  if(q.length<2){box.hidden=true;box.innerHTML='';return;}
  globalSearchTimer=setTimeout(async()=>{try{
    const d=await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
    const schoolMode=activeWorkspace==="cideb";
    const results=(d.results||[]).filter(r=>schoolMode ? (Number(r.school_followup)||r.context_type==="cideb"||r.context_type==="mixed") : r.context_type!=="cideb");
    box.hidden=false;
    box.innerHTML=results.length?results.map(r=>`<button data-id="${r.id}" data-school="${schoolMode?'1':'0'}"><strong>${escapeHTML(r.full_name)}</strong><span>${schoolMode?`CIDEB${r.student_number?' · '+escapeHTML(r.student_number):''}${r.grade_level?' · '+escapeHTML(r.grade_level):''}`:'Mi práctica'}${r.status==='archived'?' · Archivado':''}</span></button>`).join(''):`<div class="search-empty">Sin resultados en este espacio</div>`;
    $$('#globalSearchResults button').forEach(btn=>btn.onclick=()=>{box.hidden=true;$("#globalPersonSearch").value='';if(schoolMode){openAdminTab('students');openCidebStudent(btn.dataset.id);}else{openAdminTab('people');openPerson(btn.dataset.id);}});
  }catch{box.hidden=true;}},180);
});
document.addEventListener('click',event=>{if(!event.target.closest('.global-search-shell')&&$("#globalSearchResults"))$("#globalSearchResults").hidden=true;});

function notificationTypeLabel(type) {
  return {
    appointment: "Cita",
    exercise_done: "Actividad",
    ai_risk: "Alerta",
    ai_limit: "Uso de IA"
  }[type] || "Notificación";
}

function renderNotificationBadge(count) {
  const badge = $("#notificationBadge");
  const value = Number(count || 0);

  badge.textContent = value > 99 ? "99+" : String(value);
  badge.hidden = value <= 0;
}

function renderEmailStatus(status) {
  const box = $("#emailNotificationStatus");

  if (status.email_configured) {
    box.className = "email-config-card ok";
    box.innerHTML = `
      <strong>✓ Correo conectado</strong>
      <span>
        Destino: ${escapeHTML(status.recipient)}
        · Remitente: ${escapeHTML(status.from)}
      </span>
    `;
  } else {
    box.className = "email-config-card warning";
    box.innerHTML = `
      <strong>Falta activar el envío por correo</strong>
      <span>
        Las notificaciones ya se guardan dentro de NORTIA.
        Para enviarlas también a ${escapeHTML(status.recipient)},
        agrega el secret RESEND_API_KEY en Cloudflare.
      </span>
    `;
  }
}

async function loadNotifications() {
  try {
    const [data, status] = await Promise.all([
      api("/api/admin/notifications"),
      api("/api/admin/notifications/status")
    ]);

    renderNotificationBadge(data.unread_count);
    renderEmailStatus(status);

    const items = data.notifications || [];

    $("#notificationsList").innerHTML = items.length
      ? items.map(item => `
          <button
            class="notification-row ${item.is_read ? "" : "unread"} ${escapeHTML(item.priority || "normal")}"
            data-action="read-notification" data-id="${escapeHTML(item.id)}">
            <div class="notification-icon">
              ${item.priority === "critical" ? "!" : "•"}
            </div>

            <div class="notification-content">
              <div class="notification-meta">
                <span>${escapeHTML(notificationTypeLabel(item.type))}</span>
                <span>${new Date(item.created_at).toLocaleString()}</span>
              </div>

              <strong>${escapeHTML(item.title)}</strong>
              <p>${escapeHTML(item.message)}</p>

              <small class="email-state ${escapeHTML(item.email_status || "")}">
                Correo: ${
                  item.email_status === "sent"
                    ? "enviado"
                    : item.email_status === "not_configured"
                    ? "pendiente de configurar"
                    : item.email_status === "error"
                    ? "error de envío"
                    : "pendiente"
                }
              </small>
            </div>
          </button>
        `).join("")
      : `<p class="muted">Todavía no hay notificaciones.</p>`;
  } catch (error) {
    $("#notificationsList").innerHTML =
      `<p class="muted">${escapeHTML(error.message)}</p>`;
  }
}

window.markNotificationRead = async id => {
  try {
    await api("/api/admin/notifications/read", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    await loadNotifications();
  } catch {}
};

$("#markAllReadBtn").addEventListener("click", async () => {
  $("#notificationActionStatus").textContent = "";

  try {
    await api("/api/admin/notifications/read", {
      method: "POST",
      body: JSON.stringify({})
    });

    $("#notificationActionStatus").style.color = "#96efb0";
    $("#notificationActionStatus").textContent =
      "Notificaciones marcadas como leídas.";

    await loadNotifications();
  } catch (error) {
    $("#notificationActionStatus").style.color = "#ffb4b4";
    $("#notificationActionStatus").textContent = error.message;
  }
});

$("#testEmailBtn").addEventListener("click", async () => {
  const button = $("#testEmailBtn");
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "ENVIANDO...";
  $("#notificationActionStatus").textContent = "";

  try {
    const data = await api("/api/admin/notifications/test-email", {
      method: "POST"
    });

    $("#notificationActionStatus").style.color = "#96efb0";
    $("#notificationActionStatus").textContent =
      `Correo de prueba enviado a ${data.recipient}.`;
  } catch (error) {
    $("#notificationActionStatus").style.color = "#ffb4b4";
    $("#notificationActionStatus").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = oldText;
    await loadNotifications();
  }
});

async function loadDashboard() {
  const data = await api("/api/admin/dashboard");
  $("#statRequested").textContent = data.requested;
  $("#statConfirmed").textContent = data.confirmed;
  $("#statPeople").textContent = data.active_people;
  $("#statRisk").textContent = data.risk_messages;
}

function renderAppointments(container, appointments, limit = null) {
  const list = limit ? appointments.slice(0, limit) : appointments;

  if (!list.length) {
    container.innerHTML = `<p class="muted">No hay solicitudes todavía.</p>`;
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="data-row appointment-row">
      <div>
        <strong>${escapeHTML(item.client_name)}</strong>
        <span>
          ${escapeHTML(item.service_type.replaceAll("_", " "))}
          ${item.is_minor ? " · Menor" : ""}
        </span>
      </div>

      <div>
        <strong>${escapeHTML(item.preferred_date)}</strong>
        <span>${escapeHTML(item.preferred_time)}</span>
      </div>

      <div>
        <span class="pill">${escapeHTML(item.status)}</span>
      </div>

      <div class="appointment-link-state">
        ${item.person_id ? `<small>Vinculada a</small><strong>${escapeHTML(item.linked_person_name || "Expediente")}</strong>` : `<button class="text-action" data-action="link-appointment" data-id="${escapeHTML(item.id)}">VINCULAR EXPEDIENTE</button>`}
        <small class="privacy-proof">${item.privacy_accepted_at ? `Privacidad V${escapeHTML(item.privacy_consent_version || "—")} · ${new Date(item.privacy_accepted_at).toLocaleDateString()}` : "Registro legado · sin constancia digital"}</small>
      </div>
      <div class="row-actions">
        <button data-action="appointment-status" data-id="${escapeHTML(item.id)}" data-status="confirmed">Confirmar</button>
        <button data-action="appointment-status" data-id="${escapeHTML(item.id)}" data-status="completed">Realizada</button>
        <button data-action="appointment-status" data-id="${escapeHTML(item.id)}" data-status="cancelled">Cancelar</button>
      </div>
    </div>
  `).join("");
}

let appointmentToLink = "";
let appointmentLinkTimer = null;
function closeAppointmentLink(){appointmentToLink="";$("#appointmentLinkSearch").value="";$("#appointmentLinkResults").innerHTML="";modalState("#appointmentLinkModal",false);}
$$('[data-close-appointment-link]').forEach(el=>el.addEventListener('click',closeAppointmentLink));
async function openAppointmentLink(id){appointmentToLink=id;modalState("#appointmentLinkModal",true);$("#appointmentLinkSearch").value="";$("#appointmentLinkResults").innerHTML='<p class="muted">Escribe al menos 2 caracteres.</p>';}
$("#appointmentLinkSearch")?.addEventListener('input',()=>{clearTimeout(appointmentLinkTimer);appointmentLinkTimer=setTimeout(async()=>{const q=$("#appointmentLinkSearch").value.trim();if(q.length<2){$("#appointmentLinkResults").innerHTML='<p class="muted">Escribe al menos 2 caracteres.</p>';return;}try{const d=await api(`/api/admin/search?q=${encodeURIComponent(q)}`);$("#appointmentLinkResults").innerHTML=(d.results||[]).filter(r=>r.context_type!=="cideb").map(r=>`<button class="admin-record button-record" data-action="choose-appointment-person" data-id="${escapeHTML(r.id)}"><div><strong>${escapeHTML(r.full_name)}</strong><span>${escapeHTML(r.email||r.phone||"")}</span></div></button>`).join("")||'<p class="muted">Sin resultados.</p>';}catch(e){$("#appointmentLinkStatus").textContent=e.message;}},220);});
async function chooseAppointmentPerson(personId){if(!appointmentToLink)return;try{await api('/api/admin/appointments/link',{method:'POST',body:JSON.stringify({id:appointmentToLink,person_id:personId})});closeAppointmentLink();await loadAppointments();}catch(e){$("#appointmentLinkStatus").textContent=e.message;}}

async function loadAppointments() {
  const data = await api("/api/admin/appointments");

  renderAppointments(
    $("#appointmentsList"),
    data.appointments
  );

  renderAppointments(
    $("#dashboardAppointments"),
    data.appointments.filter(item =>
      item.status === "requested" ||
      item.status === "confirmed"
    ),
    5
  );
}

window.setAppointmentStatus = async (id, status) => {
  await api("/api/admin/appointments/status", {
    method: "POST",
    body: JSON.stringify({ id, status })
  });

  await Promise.all([
    loadAppointments(),
    loadDashboard()
  ]);
};

$("#refreshAppointments").addEventListener("click", loadAppointments);

let schoolOptionSearchTimer = null;
async function loadSchoolOptions(selectId, query = "", selectedId = "") {
  const select = $(selectId); if (!select) return;
  const params = new URLSearchParams({page:"1",page_size:"25",q:query,status:"active"});
  try {
    const d=await api(`/api/admin/cideb/students?${params.toString()}`);
    const options=(d.students||[]).map(student=>`<option value="${escapeHTML(student.id)}">${escapeHTML(student.full_name)}${student.student_number?` · ${escapeHTML(student.student_number)}`:""}</option>`).join("");
    select.innerHTML=`<option value="">Selecciona un alumno</option>${options}`;
    if (selectedId && [...select.options].some(o=>o.value===selectedId)) select.value=selectedId;
  } catch { select.innerHTML='<option value="">No fue posible buscar</option>'; }
}
function bindSchoolSearch(inputSelector, selectSelector) {
  const input=$(inputSelector); if(!input)return;
  input.addEventListener('input',()=>{clearTimeout(schoolOptionSearchTimer);schoolOptionSearchTimer=setTimeout(()=>loadSchoolOptions(selectSelector,input.value.trim()),220);});
}
[["#teacherStudentSearchAdmin","#teacherStudent"],["#continuityPersonSearch","#continuityPerson"],["#familyPersonSearch","#familyPerson"],["#teacherAssignSearch","#teacherAssignStudent"]].forEach(([i,s])=>bindSchoolSearch(i,s));

async function loadPeople() {
  const data=await api("/api/admin/people");
  peopleCache=data.people||[];

  const practicePeople=peopleCache.filter(p=>p.context_type!=="cideb");
  const activePractice=practicePeople.filter(p=>p.status!=="archived");

  if(!practicePeople.length) {
    $("#peopleList").innerHTML=`<div class="directory-empty"><strong>Aún no hay personas en Mi práctica.</strong><span>Los alumnos exclusivamente CIDEB se administran desde el espacio escolar.</span></div>`;
  } else {
    $("#peopleList").innerHTML=practicePeople.map(person=>{
      const archived=person.status==="archived";
      const contextLabel=person.context_type==="mixed"?"Privado + CIDEB":person.context_type==="other"?"Privado · otro contexto":"Privado";
      return `<button class="person-row ${archived?"archived-person":""}" data-action="open-person" data-id="${escapeHTML(person.id)}"><div><strong>${escapeHTML(person.full_name)}</strong><span>${person.age??"Edad no indicada"}${person.is_minor?" · Menor":""} · ${escapeHTML(contextLabel)}</span></div><div><span>${escapeHTML(person.phone||"Sin teléfono")}</span></div><div><span>${person.note_count||0} notas privadas</span></div><div class="person-status-stack"><span class="pill">${person.risk_count||0} alertas AI</span>${archived?`<span class="archive-pill">ARCHIVADO</span>`:""}</div></button>`;
    }).join("");
  }

  const practiceOptions=activePractice.map(p=>`<option value="${p.id}">${escapeHTML(p.full_name)}</option>`).join("");
  $("#vocPerson").innerHTML=`<option value="">Selecciona una persona</option>${practiceOptions}`;
  $("#aiPerson").innerHTML=`<option value="__demo__">Prueba general sin persona</option>${practiceOptions}`;
}

loadSchoolOptions("#teacherStudent");
loadSchoolOptions("#continuityPerson");
loadSchoolOptions("#familyPerson");

function setPersonDetailTab(tab="summary") {
  $$('[data-person-tab]').forEach(button=>{const active=button.dataset.personTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false');});
  $$('[data-person-group]').forEach(section=>{ section.hidden=section.dataset.personGroup!==tab; });
}
$$('[data-person-tab]').forEach(button=>button.addEventListener('click',()=>setPersonDetailTab(button.dataset.personTab)));
function enableAdminTabKeyboard(selector, activate){
  $$(selector).forEach(tab=>tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const tabs=$$(selector).filter(x=>!x.hidden);if(!tabs.length)return;event.preventDefault();
    let i=tabs.indexOf(tab);if(event.key==='Home')i=0;else if(event.key==='End')i=tabs.length-1;else i=(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    tabs[i].focus();activate(tabs[i]);
  }));
}
enableAdminTabKeyboard('[data-person-tab]',tab=>setPersonDetailTab(tab.dataset.personTab));
enableAdminTabKeyboard('[data-observation-source]',tab=>tab.click());
enableAdminTabKeyboard('[data-report-step]',tab=>setReportStep(tab.dataset.reportStep));
enableAdminTabKeyboard('[data-family-admin-tab]',tab=>tab.click());

window.openPerson = async personId => {
  currentPersonId = personId;

  const data = await api(`/api/admin/person/${personId}`);
  currentPersonData = data.person;

  $("#personDetailPanel").hidden = false;
  setPersonDetailTab("summary");
  $("#personDetailName").textContent = data.person.full_name;

  $("#personGeneral").innerHTML = `
    <div class="detail-list">
      <span>Edad <b>${data.person.age ?? "No indicada"}</b></span>
      <span>Teléfono <b>${escapeHTML(data.person.phone || "—")}</b></span>
      <span>Correo <b>${escapeHTML(data.person.email || "—")}</b></span>
      <span>Tutor <b>${escapeHTML(data.person.guardian_name || "No aplica")}</b></span>
      <span>Tipo <b>${data.person.is_minor ? "Menor de edad" : "Adulto"}</b></span>
    </div>
  `;

  renderProgram(data.program || {}, data.data_context || {});
  renderPersonDataManagement(data.person, data.data_context || {});
  renderAccess(data.access, data.person, data.program || {});
  loadAdminAIUsage(personId);
  renderFollowups(data.followups || []);
  renderCustomFields(data.custom_fields || []);
  renderExercises(data.exercises || []);
  renderClientAIHistory(data.client_ai_history || []);

  $("#notesHistory").innerHTML = data.notes.length
    ? data.notes.map(note => `
        <article class="note-card">
          <span>${new Date(note.created_at).toLocaleString()}</span>
          <p>${escapeHTML(note.note_text)}</p>
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay notas privadas.</p>`;

  $("#followupDate").value = nortiaToday();

  $("#personDetailPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
};

function renderAccess(access, person, program = {}) {
  $("#accessAI").disabled = !Number(program.therapy_with_alex);
  if (!access) {
    $("#accessSummary").innerHTML =
      `<strong>Sin acceso creado</strong><span>Genera un código para habilitar Mi Espacio.</span>`;

    $("#accessActive").checked = true;
    $("#accessConsent").checked = false;
    $("#accessConsentBy").value = "";
    $("#accessConsentByWrap").hidden = true;
    $("#accessConsentMeta").textContent = "";
    $("#accessAI").checked = false;
    return;
  }

  $("#accessSummary").innerHTML = `
    <strong>Acceso ${access.active ? "activo" : "desactivado"}</strong>
    <span>
      Código terminado en ••••${escapeHTML(access.access_hint || "----")}
      ${access.last_login_at
        ? ` · Último acceso ${new Date(access.last_login_at).toLocaleString()}`
        : " · Aún no ha ingresado"}
    </span>
  `;

  $("#accessActive").checked = !!access.active;
  $("#accessConsent").checked = !!access.consent_confirmed;
  $("#accessConsentBy").value = access.consent_confirmed_by || "";
  $("#accessConsentByWrap").hidden = !access.consent_confirmed;
  $("#accessConsentMeta").textContent = access.consent_confirmed_at ? `Registrado ${new Date(access.consent_confirmed_at).toLocaleString()} · versión ${access.consent_version || "—"}` : "";
  $("#accessAI").checked = !!access.ai_enabled;
  $("#accessAI").disabled = !Number(program.therapy_with_alex);
}

function renderFollowups(items) {
  $("#followupHistory").innerHTML = items.length
    ? items.map(item => `
        <article class="timeline-item">
          <div class="timeline-date">${escapeHTML(item.followup_date)}</div>
          <div>
            <strong>${escapeHTML(item.title || "Seguimiento")}</strong>
            ${item.private_notes ? `<p class="private-copy"><b>Privado:</b> ${escapeHTML(item.private_notes)}</p>` : ""}
            ${item.shared_summary ? `<p><b>Compartido:</b> ${escapeHTML(item.shared_summary)}</p>` : ""}
            ${item.agreements ? `<p><b>Acuerdos:</b> ${escapeHTML(item.agreements)}</p>` : ""}
            ${item.next_steps ? `<p><b>Siguiente:</b> ${escapeHTML(item.next_steps)}</p>` : ""}
          </div>
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay seguimientos registrados.</p>`;
}

function visibilityLabel(value) {
  return {
    private: "Solo profesional",
    shared: "Mi Espacio",
    ai: "Contexto IA",
    shared_ai: "Mi Espacio + IA"
  }[value] || value;
}

function renderCustomFields(items) {
  $("#customFieldsList").innerHTML = items.length
    ? items.map(item => `
        <article class="custom-field-card">
          <div>
            <strong>${escapeHTML(item.field_name)}</strong>
            <span class="pill">${escapeHTML(visibilityLabel(item.visibility))}</span>
          </div>
          <p>${escapeHTML(item.field_value || "Sin contenido")}</p>
        </article>
      `).join("")
    : `<p class="muted">Agrega cualquier dato que necesites llevar para esta persona.</p>`;
}

function renderExercises(items) {
  $("#exerciseList").innerHTML = items.length
    ? items.map(item => `
        <article class="exercise-admin-card">
          <div>
            <strong>${escapeHTML(item.title)}</strong>
            <span>${item.due_date ? escapeHTML(item.due_date) : "Sin fecha"} · ${item.shared ? "Visible" : "Privado"} · ${escapeHTML(item.status)}</span>
          </div>
          <p>${escapeHTML(item.description || "")}</p>
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay actividades asignadas.</p>`;
}

function renderClientAIHistory(items) {
  $("#clientAIHistory").innerHTML = items.length
    ? items.map(item => `
        <article class="client-ai-history ${item.role}">
          <span>${item.role === "assistant" ? "NORTIA Reflexión" : "Usuario"} · ${new Date(item.created_at).toLocaleString()}</span>
          <p>${escapeHTML(item.content)}</p>
          ${item.risk_flag ? `<b class="risk-flag">Requiere revisión humana</b>` : ""}
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay conversaciones desde Mi Espacio.</p>`;
}

async function loadAdminAIUsage(personId) {
  try {
    const u=await api(`/api/admin/ai-usage?person_id=${encodeURIComponent(personId)}`);
    $("#adminAIUsageText").textContent=`Uso de hoy: ${u.used} de ${u.limit} · ${u.remaining} disponibles`;
  } catch { $("#adminAIUsageText").textContent="Uso de hoy: no disponible"; }
}

$("#grantAIMessagesBtn").addEventListener("click", async () => {
  if(!currentPersonId) return;
  try {
    const data=await api("/api/admin/ai-usage/grant",{method:"POST",body:JSON.stringify({person_id:currentPersonId,amount:5})});
    $("#adminAIUsageText").textContent=`Uso de hoy: ${data.usage.used} de ${data.usage.limit} · ${data.usage.remaining} disponibles`;
    $("#accessStatus").style.color="#96efb0";
    $("#accessStatus").textContent="Se agregaron 5 mensajes adicionales para hoy.";
  } catch(e){ $("#accessStatus").style.color="#ffb4b4"; $("#accessStatus").textContent=e.message; }
});

$("#createAccessBtn").addEventListener("click", async () => {
  if (!currentPersonId) return;

  $("#accessStatus").textContent = "Generando acceso...";

  try {
    const data = await api("/api/admin/access/create", {
      method: "POST",
      body: JSON.stringify({ person_id: currentPersonId })
    });

    $("#accessCodeResult").hidden = false;
    $("#accessCodeResult").innerHTML = `
      <span>CÓDIGO NUEVO</span>
      <strong id="generatedAccessCode">${escapeHTML(data.access_code)}</strong>
      <button class="secondary-btn" id="copyAccessCodeBtn">COPIAR</button>
      <small>Este código se muestra completo solo ahora. Envíalo a la persona por un medio adecuado.</small>
    `;

    $("#copyAccessCodeBtn").addEventListener("click", async () => {
      await navigator.clipboard.writeText(data.access_code);
      $("#copyAccessCodeBtn").textContent = "COPIADO";
    });

    $("#accessStatus").style.color = "#96efb0";
    $("#accessStatus").textContent =
      "Acceso creado. La IA permanece deshabilitada hasta confirmar consentimiento y activarla.";

    await openPerson(currentPersonId);
  } catch (error) {
    $("#accessStatus").style.color = "#ffb4b4";
    $("#accessStatus").textContent = error.message;
  }
});

$("#accessConsent").addEventListener("change", () => {
  $("#accessConsentByWrap").hidden = !$("#accessConsent").checked;
});

$("#saveAccessSettingsBtn").addEventListener("click", async () => {
  if (!currentPersonId) return;

  try {
    await api("/api/admin/access/settings", {
      method: "POST",
      body: JSON.stringify({
        person_id: currentPersonId,
        active: $("#accessActive").checked,
        consent_confirmed: $("#accessConsent").checked,
        consent_confirmed_by: $("#accessConsentBy").value,
        ai_enabled: $("#accessAI").checked
      })
    });

    $("#accessStatus").style.color = "#96efb0";
    $("#accessStatus").textContent = "Configuración de acceso guardada.";
    await openPerson(currentPersonId);
  } catch (error) {
    $("#accessStatus").style.color = "#ffb4b4";
    $("#accessStatus").textContent = error.message;
  }
});

$("#saveFollowupBtn").addEventListener("click", async () => {
  if (!currentPersonId) return;

  try {
    await api("/api/admin/followup", {
      method: "POST",
      body: JSON.stringify({
        person_id: currentPersonId,
        followup_date: $("#followupDate").value,
        title: $("#followupTitle").value,
        private_notes: $("#followupPrivate").value,
        shared_summary: $("#followupShared").value,
        agreements: $("#followupAgreements").value,
        next_steps: $("#followupNext").value
      })
    });

    [
      "#followupTitle",
      "#followupPrivate",
      "#followupShared",
      "#followupAgreements",
      "#followupNext"
    ].forEach(selector => $(selector).value = "");

    $("#followupStatus").style.color = "#96efb0";
    $("#followupStatus").textContent = "Seguimiento guardado.";
    await openPerson(currentPersonId);
  } catch (error) {
    $("#followupStatus").style.color = "#ffb4b4";
    $("#followupStatus").textContent = error.message;
  }
});

$("#addCustomFieldBtn").addEventListener("click", async () => {
  if (!currentPersonId) return;

  const name = $("#customFieldName").value.trim();

  if (!name) {
    $("#customFieldStatus").textContent = "Escribe el nombre del campo.";
    return;
  }

  try {
    await api("/api/admin/custom-field", {
      method: "POST",
      body: JSON.stringify({
        person_id: currentPersonId,
        field_name: name,
        field_value: $("#customFieldValue").value,
        visibility: $("#customFieldVisibility").value
      })
    });

    $("#customFieldName").value = "";
    $("#customFieldValue").value = "";

    $("#customFieldStatus").style.color = "#96efb0";
    $("#customFieldStatus").textContent = "Campo agregado.";
    await openPerson(currentPersonId);
  } catch (error) {
    $("#customFieldStatus").style.color = "#ffb4b4";
    $("#customFieldStatus").textContent = error.message;
  }
});

$("#addExerciseBtn").addEventListener("click", async () => {
  if (!currentPersonId) return;

  const title = $("#exerciseTitle").value.trim();

  if (!title) {
    $("#exerciseStatus").textContent = "Escribe un título.";
    return;
  }

  try {
    await api("/api/admin/exercise", {
      method: "POST",
      body: JSON.stringify({
        person_id: currentPersonId,
        title,
        description: $("#exerciseDescription").value,
        due_date: $("#exerciseDue").value,
        shared: $("#exerciseShared").checked
      })
    });

    $("#exerciseTitle").value = "";
    $("#exerciseDescription").value = "";
    $("#exerciseDue").value = "";

    $("#exerciseStatus").style.color = "#96efb0";
    $("#exerciseStatus").textContent = "Actividad agregada.";
    await openPerson(currentPersonId);
  } catch (error) {
    $("#exerciseStatus").style.color = "#ffb4b4";
    $("#exerciseStatus").textContent = error.message;
  }
});

$("#saveNoteBtn").addEventListener("click", async () => {
  const note = $("#privateNote").value.trim();

  if (!currentPersonId || !note) {
    $("#noteStatus").textContent =
      "Selecciona una persona y escribe una nota.";
    return;
  }

  try {
    await api("/api/admin/note", {
      method: "POST",
      body: JSON.stringify({
        person_id: currentPersonId,
        note_text: note
      })
    });

    $("#privateNote").value = "";
    $("#noteStatus").style.color = "#96efb0";
    $("#noteStatus").textContent = "Nota privada guardada.";

    await Promise.all([
      openPerson(currentPersonId),
      loadPeople()
    ]);
  } catch (error) {
    $("#noteStatus").style.color = "#ffb4b4";
    $("#noteStatus").textContent = error.message;
  }
});

function updateNewPersonGuardianFields() {
  const age = Number($("#newPersonAge")?.value || 0);
  const minor = Number.isFinite(age) && age > 0 && age < 18;
  const box = $("#newPersonGuardianBox");
  if (box) box.hidden = !minor;
  box?.querySelectorAll('input').forEach(input => {
    input.disabled = !minor;
    if (!minor) input.value = '';
  });
}
$("#newPersonAge")?.addEventListener("input", updateNewPersonGuardianFields);
$("#newPersonBtn").addEventListener("click", () => modalState("#personModal", true));
$$("[data-close-person]").forEach(button => {
  button.addEventListener("click", () => modalState("#personModal", false));
});

$("#personForm").addEventListener("submit", async event => {
  event.preventDefault();
  $("#personStatus").textContent = "Guardando...";

  try {
    await api("/api/admin/people", {
      method: "POST",
      body: JSON.stringify(
        Object.fromEntries(
          new FormData(event.target).entries()
        )
      )
    });

    event.target.reset();
    updateNewPersonGuardianFields();
    $("#personStatus").style.color = "#96efb0";
    $("#personStatus").textContent = "Ficha creada.";

    await Promise.all([
      loadPeople(),
      loadDashboard()
    ]);
  } catch (error) {
    $("#personStatus").style.color = "#ffb4b4";
    $("#personStatus").textContent = error.message;
  }
});

$("#vocPerson").addEventListener("change", async () => {
  const personId = $("#vocPerson").value;
  if (!personId) return;

  const data = await api(`/api/admin/person/${personId}`);
  const v = data.vocational || {};

  $("#vocInterests").value = v.interests || "";
  $("#vocStrengths").value = v.strengths || "";
  $("#vocValues").value = v.values_text || "";
  $("#vocSubjects").value = v.favorite_subjects || "";
  $("#vocWorkStyle").value = v.work_style || "";
  $("#vocCareers").value = v.careers_considered || "";
  $("#vocQuestions").value = v.open_questions || "";
  $("#vocPlan").value = v.guidance_plan || "";
  $("#vocAIContext").value = v.ai_context || "";
});

$("#saveVocBtn").addEventListener("click", async () => {
  const personId = $("#vocPerson").value;

  if (!personId) {
    $("#vocStatus").textContent = "Selecciona una persona.";
    return;
  }

  try {
    await api("/api/admin/vocational", {
      method: "POST",
      body: JSON.stringify({
        person_id: personId,
        interests: $("#vocInterests").value,
        strengths: $("#vocStrengths").value,
        values_text: $("#vocValues").value,
        favorite_subjects: $("#vocSubjects").value,
        work_style: $("#vocWorkStyle").value,
        careers_considered: $("#vocCareers").value,
        open_questions: $("#vocQuestions").value,
        guidance_plan: $("#vocPlan").value,
        ai_context: $("#vocAIContext").value
      })
    });

    $("#vocStatus").style.color = "#96efb0";
    $("#vocStatus").textContent = "Mapa vocacional guardado.";
  } catch (error) {
    $("#vocStatus").style.color = "#ffb4b4";
    $("#vocStatus").textContent = error.message;
  }
});

$$(".example-btn").forEach(button => {
  button.addEventListener("click", () => {
    $("#aiMessage").value = button.dataset.fill || "";
    $("#aiMessage").focus();
  });
});

$("#testAIButton").addEventListener("click", async () => {
  $("#aiHealth").className = "ai-health checking";
  $("#aiHealth").textContent = "Probando conexión con Workers AI...";

  try {
    const data = await api("/api/admin/ai-health", {
      method: "POST"
    });

    $("#aiHealth").className = "ai-health ok";
    $("#aiHealth").textContent =
      `✓ IA conectada · ${data.model}`;
  } catch (error) {
    $("#aiHealth").className = "ai-health error";
    $("#aiHealth").textContent =
      `No se pudo conectar: ${error.message}`;
  }
});

$("#aiSendBtn").addEventListener("click", async () => {
  const personId = $("#aiPerson").value || "__demo__";
  const message = $("#aiMessage").value.trim();

  if (!message) {
    $("#aiReply").textContent = "Escribe una situación para probar la IA.";
    return;
  }

  const button = $("#aiSendBtn");
  button.disabled = true;
  const oldText = button.textContent;
  let seconds = 0;
  $("#aiReply").textContent = "Generando reflexión… 0 s";

  const timer = setInterval(() => {
    seconds += 1;
    $("#aiReply").textContent = `Generando reflexión… ${seconds} s`;
  }, 1000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("/api/admin/ai-reflection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ person_id: personId, message }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Error al generar la respuesta.");
    }

    $("#aiReply").textContent =
      (data.risk_flag ? "⚠ Revisión humana recomendada\n\n" : "") + data.reply;

    await loadDashboard();
  } catch (error) {
    $("#aiReply").textContent =
      error.name === "AbortError"
        ? "La IA tardó más de 20 segundos y cancelé la espera. Prueba nuevamente o usa “Probar conexión IA”."
        : `No se pudo generar la respuesta.\n\n${error.message}`;
  } finally {
    clearInterval(timer);
    button.disabled = false;
    button.textContent = oldText;
  }
});


function renderProgram(program,dataContext={}){
  $("#programTherapy").checked=!!Number(program.therapy_with_alex);
  const linked=Number(program.school_followup)||dataContext.context_type==="mixed";
  $("#practiceCidebLink").hidden=!linked;
}
$("#openCidebFromPracticeBtn")?.addEventListener("click",()=>{
  if(!currentPersonId)return;
  openAdminTab("students");
  openCidebStudent(currentPersonId);
});
function renderPersonDataManagement(person,dataContext={}){const archived=person.status==="archived";$("#personStatusBadge").textContent=archived?"ARCHIVADO":"ACTIVO";$("#personStatusBadge").classList.toggle("archived",archived);$("#archivePersonBtn").hidden=archived;$("#reactivatePersonBtn").hidden=!archived;$("#archiveReason").value=dataContext.archive_reason||"";$("#deletePersonPhrase").textContent=`ELIMINAR ${person.full_name}`;$("#deletePersonConfirmation").value="";}
$("#saveProgramBtn").addEventListener("click",async()=>{
  if(!currentPersonId)return;
  try{
    await api("/api/admin/program",{method:"POST",body:JSON.stringify({person_id:currentPersonId,therapy_with_alex:$("#programTherapy").checked})});
    $("#programStatus").style.color="#86EFAC";
    $("#programStatus").textContent="Proceso privado guardado.";
    await Promise.all([openPerson(currentPersonId),loadPeople()]);
  }catch(e){
    $("#programStatus").style.color="#FDA4AF";
    $("#programStatus").textContent=e.message;
  }
});
$("#archivePersonBtn").addEventListener("click",async()=>{if(!currentPersonId||!confirm("¿Archivar este expediente? Se desactivarán accesos, pero la información se conservará."))return;try{const d=await api("/api/admin/person/archive",{method:"POST",body:JSON.stringify({person_id:currentPersonId,archive:true,reason:$("#archiveReason").value})});$("#personDataStatus").style.color="#86EFAC";$("#personDataStatus").textContent=d.message;await Promise.all([openPerson(currentPersonId),loadPeople(),loadAudit()]);}catch(e){$("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=e.message;}});
$("#reactivatePersonBtn").addEventListener("click",async()=>{if(!currentPersonId)return;try{const d=await api("/api/admin/person/archive",{method:"POST",body:JSON.stringify({person_id:currentPersonId,archive:false})});$("#personDataStatus").style.color="#86EFAC";$("#personDataStatus").textContent=d.message;await Promise.all([openPerson(currentPersonId),loadPeople(),loadAudit()]);}catch(e){$("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=e.message;}});
$("#deletePersonBtn").addEventListener("click",async()=>{if(!currentPersonId)return;const person=currentPersonData||peopleCache.find(x=>x.id===currentPersonId);if(!person)return;const expected=`ELIMINAR ${person.full_name}`,confirmation=$("#deletePersonConfirmation").value.trim();if(confirmation.toLocaleUpperCase("es-MX")!==expected.toLocaleUpperCase("es-MX")){ $("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=`Escribe exactamente: ${expected}`;return;}if(!confirm("Esta acción es irreversible. ¿Eliminar definitivamente este expediente?"))return;try{const d=await api("/api/admin/person/delete",{method:"POST",body:JSON.stringify({person_id:currentPersonId,confirmation})});$("#personDetailPanel").hidden=true;currentPersonId="";currentPersonData=null;await Promise.all([loadPeople(),loadDashboard(),loadAudit()]);adminToast(d.message,'success');}catch(e){$("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=e.message;}});

let currentManagedTeacherId = "";
async function loadTeachers(){
  try{
    const d=await api("/api/admin/teachers");
    $("#adminTeachersList").innerHTML=d.teachers.length?d.teachers.map(t=>`<article class="admin-record"><div><strong>${escapeHTML(t.full_name)}</strong><span>${escapeHTML(t.school_name||"")} · ${t.student_count||0} alumno(s) · ${t.active?"Activo":"Desactivado"}</span></div><small>${t.agreement_accepted_at?"Acuerdo aceptado":"Acuerdo pendiente"}${t.last_login_at?" · Último acceso "+new Date(t.last_login_at).toLocaleString():""}</small><button class="secondary-btn small" data-action="manage-teacher" data-id="${escapeHTML(t.id)}">GESTIONAR</button></article>`).join(""):`<p class="muted">Aún no hay docentes.</p>`;
  }catch{}
}
async function manageTeacher(id){
  currentManagedTeacherId=id;
  const d=await api(`/api/admin/teachers/detail?teacher_id=${encodeURIComponent(id)}`);
  $("#teacherManagePanel").hidden=false;
  $("#teacherManageName").textContent=d.teacher.full_name;
  $("#teacherManageSummary").innerHTML=`<strong>Acceso ${d.teacher.active?"activo":"desactivado"}</strong><span>••••${escapeHTML(d.teacher.access_hint||"----")} · ${d.teacher.agreement_accepted_at?"Acuerdo aceptado":"Acuerdo pendiente"}</span>`;
  const activeAssignments=(d.assignments||[]).filter(a=>Number(a.active));
  $("#teacherAssignmentsList").innerHTML=activeAssignments.length?activeAssignments.map(a=>`<article class="admin-record"><div><strong>${escapeHTML(a.full_name)}</strong><span>${escapeHTML(a.school_year||"Sin ciclo")}</span></div><button class="text-action danger-text" data-action="unassign-teacher" data-person-id="${escapeHTML(a.person_id)}" data-year="${escapeHTML(a.school_year||"")}">Quitar</button></article>`).join(""):`<p class="muted">Sin alumnos asignados actualmente.</p>`;
  $("#toggleTeacherAccessBtn").textContent=d.teacher.active?"DESACTIVAR ACCESO":"ACTIVAR ACCESO";
  $("#toggleTeacherAccessBtn").dataset.active=d.teacher.active?"1":"0";
  await loadSchoolOptions("#teacherAssignStudent");
}
$("#closeTeacherManageBtn")?.addEventListener("click",()=>{$("#teacherManagePanel").hidden=true;currentManagedTeacherId="";});
$("#assignTeacherStudentBtn")?.addEventListener("click",async()=>{if(!currentManagedTeacherId||!$("#teacherAssignStudent").value)return;try{await api("/api/admin/teachers/assign",{method:"POST",body:JSON.stringify({teacher_id:currentManagedTeacherId,person_id:$("#teacherAssignStudent").value,school_year:$("#teacherAssignYear").value})});$("#teacherManageStatus").textContent="Alumno asignado.";await Promise.all([manageTeacher(currentManagedTeacherId),loadTeachers()]);}catch(e){$("#teacherManageStatus").textContent=e.message;}});
$("#toggleTeacherAccessBtn")?.addEventListener("click",async()=>{if(!currentManagedTeacherId)return;const active=$("#toggleTeacherAccessBtn").dataset.active!=="1";await api("/api/admin/teachers/access",{method:"POST",body:JSON.stringify({teacher_id:currentManagedTeacherId,active})});await Promise.all([manageTeacher(currentManagedTeacherId),loadTeachers()]);});
$("#regenTeacherCodeBtn")?.addEventListener("click",async()=>{if(!currentManagedTeacherId||!confirm("El código anterior dejará de funcionar y el docente deberá aceptar nuevamente el acuerdo. ¿Continuar?"))return;const d=await api("/api/admin/teachers/regenerate",{method:"POST",body:JSON.stringify({teacher_id:currentManagedTeacherId})});$("#teacherManageCode").hidden=false;$("#teacherManageCode").innerHTML=`<span>NUEVO CÓDIGO DOCENTE</span><strong>${escapeHTML(d.access_code)}</strong><small>El código anterior quedó invalidado.</small>`;await Promise.all([manageTeacher(currentManagedTeacherId),loadTeachers()]);});
$("#createTeacherBtn").addEventListener("click",async()=>{try{const d=await api("/api/admin/teachers/create",{method:"POST",body:JSON.stringify({full_name:$("#teacherName").value,email:$("#teacherEmail").value,school_name:$("#teacherSchool").value,person_id:$("#teacherStudent").value,school_year:$("#teacherYear").value})});$("#teacherCreateResult").hidden=false;$("#teacherCreateResult").innerHTML=`<span>CÓDIGO DOCENTE</span><strong>${escapeHTML(d.access_code)}</strong><small>Entrar en /docente.html. El docente deberá aceptar el acuerdo antes de ver información.</small>`;$("#teacherAdminStatus").style.color="#86EFAC";$("#teacherAdminStatus").textContent=`Acceso creado para ${d.student_name}.`;await loadTeachers();}catch(e){$("#teacherAdminStatus").style.color="#FDA4AF";$("#teacherAdminStatus").textContent=e.message;}});


function obsCard(o,type){const isTeacher=type==="teacher";const audience=isTeacher?"docente":"familia";return `<article class="review-card ${o.status}"><div class="review-meta"><span>${isTeacher?"DOCENTE":"FAMILIA"} · ${escapeHTML(isTeacher?o.teacher_name:o.guardian_name)}</span><span>${escapeHTML(o.observation_date)}</span></div><strong>${escapeHTML(o.person_name)}</strong><p>${escapeHTML(isTeacher?o.description:o.observation_text)}</p>${isTeacher&&o.strategy_used?`<small>Estrategia: ${escapeHTML(o.strategy_used)}</small>`:""}<div class="review-privacy-fields"><label><span>NOTA INTERNA · SOLO ALEX</span><textarea id="private_${o.id}" rows="2" placeholder="Esta nota nunca se muestra al ${audience}.">${escapeHTML(o.private_note||"")}</textarea></label><label><span>RESPUESTA COMPARTIDA · VISIBLE PARA ${audience.toUpperCase()}</span><textarea id="comment_${o.id}" rows="2" placeholder="Opcional. Solo escribe aquí lo que sí puede leer el ${audience}.">${escapeHTML(o.professional_comment||"")}</textarea></label></div><button class="secondary-btn" data-action="review-observation" data-type="${type}" data-id="${escapeHTML(o.id)}">${o.status==="reviewed"?"GUARDAR CAMBIOS":"MARCAR REVISADO"}</button></article>`;}
async function loadModuleObservations(){try{const [t,f]=await Promise.all([api("/api/admin/teacher-observations"),api("/api/admin/family-observations")]);$("#adminTeacherObservations").innerHTML=t.observations.length?t.observations.map(o=>obsCard(o,"teacher")).join(""):`<p class="muted">Sin observaciones docentes.</p>`;$("#adminFamilyObservations").innerHTML=f.observations.length?f.observations.map(o=>obsCard(o,"family")).join(""):`<p class="muted">Sin observaciones familiares.</p>`;}catch{}}
window.reviewObservation=async(type,id)=>{try{await api(type==="teacher"?"/api/admin/teacher-observations/review":"/api/admin/family-observations/review",{method:"POST",body:JSON.stringify({id,private_note:$("#private_"+id).value,professional_comment:$("#comment_"+id).value})});await Promise.all([loadModuleObservations(),loadAudit()]);}catch(e){adminToast(e.message,'error');}};

const schoolAreaLabels = {
  attention: "Atención",
  instructions: "Seguimiento de instrucciones",
  organization: "Organización",
  peers: "Interacción con pares",
  frustration: "Manejo de frustración",
  transitions: "Cambios / transiciones",
  autonomy: "Autonomía",
  help_seeking: "Solicitud de ayuda"
};

let currentContinuityData = null;


function topSupportArea(snapshot) {
  const entries = Object.entries(snapshot?.distribution || {}).filter(([,d]) => Number(d?.n || 0) >= 3 && d.higher_support_pct != null);
  if (!entries.length) return { label: "Sin datos", value: null, n: 0 };
  entries.sort((a,b) => Number(b[1].higher_support_pct) - Number(a[1].higher_support_pct));
  return { label: schoolAreaLabels[entries[0][0]] || entries[0][0], value: Number(entries[0][1].higher_support_pct), n:Number(entries[0][1].n||0) };
}
function supportFrequencyText(dist) {
  const n=Number(dist?.n||0);
  if (!n) return "Sin datos";
  if (n < 3) return `Datos iniciales · n=${n}`;
  const pct=Number(dist.higher_support_pct||0);
  if (pct < 25) return "Pocas veces se registró apoyo moderado/frecuente";
  if (pct < 60) return "En parte de los registros se observó apoyo moderado/frecuente";
  return "En la mayoría de registros se observó apoyo moderado/frecuente";
}

function renderAdminSnapshot(s) {
  if (!s || !s.observation_count) {
    return `<div class="empty-visual"><strong>Aún no hay observaciones suficientes</strong><span>Las gráficas aparecerán conforme existan registros docentes revisados.</span></div>`;
  }
  const top = topSupportArea(s);
  return `<div class="mini-snapshot-grid"><article><span>Registros</span><strong>${s.observation_count}</strong></article><article><span>Área con más apoyo registrado</span><strong>${escapeHTML(top.label)}</strong></article><article><span>Último registro</span><strong>${s.last_reviewed_at ? new Date(s.last_reviewed_at).toLocaleDateString() : "—"}</strong></article></div>`;
}

function continuityFields() {
  return {
    general_description: $("#contGeneral").value,
    strengths: $("#contStrengths").value,
    support_needs: $("#contSupport").value,
    strategies: $("#contStrategies").value,
    watch_items: $("#contWatch").value
  };
}

function renderTeacherReportPreview(data, useCurrentFields = false) {
  if (!data?.person) {
    $("#continuityPreview").className = "teacher-report-preview-empty";
    $("#continuityPreview").innerHTML = "Selecciona un alumno para ver el informe visual.";
    return;
  }

  const c = useCurrentFields ? continuityFields() : (data.continuity || {});
  const s = data.snapshot || { distribution:{}, contexts:[], trend:[] };
  const program = data.program || {};
  const top = topSupportArea(s);
  const topContext = (s.contexts || [])[0];

  const bars = Object.entries(schoolAreaLabels).map(([key,label]) => {
    const d = s.distribution?.[key];
    const pct = d?.higher_support_pct == null ? 0 : Number(d.higher_support_pct);
    return `<div class="preview-support-row"><div><strong>${label}</strong><small>${supportFrequencyText(d)}</small></div><div class="preview-bar"><i style="width:${pct}%"></i></div><b>${d?.n ? `n=${d.n}` : "—"}</b></div>`;
  }).join("");

  const contexts = (s.contexts || []).length ? (() => {
    const max = Math.max(1, ...(s.contexts || []).map(x => Number(x.count)));
    return s.contexts.slice(0,5).map(x => `<div class="preview-context-row"><span>${escapeHTML(x.context)}</span><div><i style="width:${Number(x.count)/max*100}%"></i></div><b>${x.count}</b></div>`).join("");
  })() : `<p class="muted">Aún no hay contextos registrados.</p>`;

  const sections = [
    ["Descripción general", c.general_description],
    ["Fortalezas observadas", c.strengths],
    ["Puede requerir apoyo en", c.support_needs],
    ["Estrategias que han funcionado", c.strategies],
    ["Aspectos a seguir observando", c.watch_items]
  ].map(([title,text]) => `<article><span>${escapeHTML(title)}</span><p>${escapeHTML(text || "Pendiente de completar.")}</p></article>`).join("");

  $("#continuityPreview").className = "teacher-report-preview";
  $("#continuityPreview").innerHTML = `
    <div class="preview-report-head">
      <div><small>INFORME DE CONTINUIDAD · CIDEB</small><h3>${escapeHTML(data.person.full_name)}</h3><p>${escapeHTML(program.grade_level || "Grado no indicado")}${program.school_year ? " · "+escapeHTML(program.school_year) : ""}${program.school_name ? " · "+escapeHTML(program.school_name) : ""}</p></div>
      <span>${$("#contApprove").checked ? "PUBLICADO" : "BORRADOR"}</span>
    </div>
    <div class="preview-kpis">
      <article><span>Observaciones</span><strong>${s.observation_count || 0}</strong></article>
      <article><span>Mayor apoyo observado</span><strong>${escapeHTML(top.label)}</strong></article>
      <article><span>Contexto más registrado</span><strong>${escapeHTML(topContext?.context || "—")}</strong></article>
    </div>
    <section class="preview-chart-card"><h4>Frecuencia de apoyo observado <small>moderado/frecuente · sin puntaje psicológico</small></h4>${bars}</section>
    <section class="preview-chart-card"><h4>Contextos registrados</h4>${contexts}</section>
    <div class="preview-text-grid">${sections}</div>
    <div class="preview-disclaimer">Información descriptiva para continuidad escolar. No constituye diagnóstico ni evaluación clínica.</div>
  `;
}

$("#continuityPerson").addEventListener("change", async () => {
  setReportStep("context");
  const id = $("#continuityPerson").value;
  if (!id) return;
  try {
    const d = await api(`/api/admin/school-continuity?person_id=${encodeURIComponent(id)}`);
    currentContinuityData = d;
    const c = d.continuity || {};
    $("#contGeneral").value = c.general_description || "";
    $("#contStrengths").value = c.strengths || "";
    $("#contSupport").value = c.support_needs || "";
    $("#contStrategies").value = c.strategies || "";
    $("#contWatch").value = c.watch_items || "";
    $("#contApprove").checked = false;
    const hasPublished = !!d.published?.approved_at;
    $("#continuityDraftState").textContent = d.has_draft ? (hasPublished ? "BORRADOR · PUBLICADO SE CONSERVA" : "BORRADOR") : (hasPublished ? "PUBLICADO" : "BORRADOR");
    $("#continuityDraftState").classList.toggle("published", hasPublished && !d.has_draft);
    $("#continuityVersionLabel").textContent = d.latest_version ? `Versión publicada V${d.latest_version}` : "Sin versiones publicadas";
    $("#adminSchoolSnapshot").innerHTML = renderAdminSnapshot(d.snapshot);
    renderTeacherReportPreview(d, true);
  } catch (e) {
    $("#continuityStatus").textContent = e.message;
  }
});

["#contGeneral","#contStrengths","#contSupport","#contStrategies","#contWatch"].forEach(selector => {
  $(selector).addEventListener("input", () => currentContinuityData && renderTeacherReportPreview(currentContinuityData, true));
});
$("#contApprove").addEventListener("change", () => {
  $("#continuityDraftState").textContent = $("#contApprove").checked ? "LISTO PARA PUBLICAR" : (currentContinuityData?.published?.approved_at ? "BORRADOR · PUBLICADO SE CONSERVA" : "BORRADOR");
  $("#continuityDraftState").classList.toggle("published", false);
  if (currentContinuityData) renderTeacherReportPreview(currentContinuityData, true);
});

$("#saveContinuityBtn").addEventListener("click", async () => {
  const id = $("#continuityPerson").value;
  if (!id) return;
  try {
    await api("/api/admin/school-continuity", {
      method: "POST",
      body: JSON.stringify({
        person_id:id,
        general_description:$("#contGeneral").value,
        strengths:$("#contStrengths").value,
        support_needs:$("#contSupport").value,
        strategies:$("#contStrategies").value,
        watch_items:$("#contWatch").value,
        approve:$("#contApprove").checked
      })
    });
    $("#continuityStatus").style.color="#86EFAC";
    $("#continuityStatus").textContent=$("#contApprove").checked ? "Informe guardado y publicado para docentes asignados." : "Borrador guardado. El docente todavía no lo ve.";
    const fresh = await api(`/api/admin/school-continuity?person_id=${encodeURIComponent(id)}`);
    currentContinuityData = fresh;
    $("#contApprove").checked = false;
    $("#continuityDraftState").textContent = fresh.has_draft ? "BORRADOR · PUBLICADO SE CONSERVA" : (fresh.published?.approved_at ? "PUBLICADO" : "BORRADOR");
    $("#continuityVersionLabel").textContent = fresh.latest_version ? `Versión publicada V${fresh.latest_version}` : "Sin versiones publicadas";
    renderTeacherReportPreview(fresh, true);
    await loadAudit();
  } catch(e) {
    $("#continuityStatus").style.color="#FDA4AF";
    $("#continuityStatus").textContent=e.message;
  }
});

async function loadFamilyData(){
  const id=$("#familyPerson").value;if(!id)return;
  try{
    const [a,p]=await Promise.all([api(`/api/admin/family/access?person_id=${encodeURIComponent(id)}`),api(`/api/admin/family-profile?person_id=${encodeURIComponent(id)}`)]);
    $("#familyAccessList").innerHTML=a.guardians.length?a.guardians.map(g=>`<article class="admin-record"><div><strong>${escapeHTML(g.full_name)}</strong><span>${escapeHTML(g.relationship||"Tutor")} · ••••${escapeHTML(g.access_hint||"")} · ${g.active?"Activo":"Desactivado"}</span></div><small>${g.agreement_accepted_at?"Aviso aceptado":"Aviso pendiente"}${g.last_login_at?" · Último acceso "+new Date(g.last_login_at).toLocaleString():""}</small><div class="row-actions"><button class="secondary-btn small" data-action="toggle-family" data-id="${escapeHTML(g.id)}" data-active="${g.active?"1":"0"}">${g.active?"DESACTIVAR":"ACTIVAR"}</button><button class="secondary-btn small" data-action="regen-family" data-id="${escapeHTML(g.id)}">REGENERAR CÓDIGO</button></div></article>`).join(""):`<p class="muted">Sin accesos familiares.</p>`;
    const x=p.profile||{};$("#familySummary").value=x.summary||"";$("#familyStrengths").value=x.strengths||"";$("#familyGoals").value=x.current_goals||"";$("#familyRecommendations").value=x.recommendations_home||"";
  }catch(e){$("#familyAdminStatus").textContent=e.message;}
}
$("#familyPerson").addEventListener("change",loadFamilyData);
$("#createFamilyBtn").addEventListener("click",async()=>{try{const d=await api("/api/admin/family/access/create",{method:"POST",body:JSON.stringify({person_id:$("#familyPerson").value,full_name:$("#familyName").value,relationship:$("#familyRelation").value,email:$("#familyEmail").value})});$("#familyCreateResult").hidden=false;$("#familyCreateResult").innerHTML=`<span>CÓDIGO FAMILIAR</span><strong>${escapeHTML(d.access_code)}</strong><small>Entrar en /familia.html. El acceso no incluye IA.</small>`;$("#familyAdminStatus").style.color="#86EFAC";$("#familyAdminStatus").textContent="Acceso familiar creado.";await loadFamilyData();}catch(e){$("#familyAdminStatus").style.color="#FDA4AF";$("#familyAdminStatus").textContent=e.message;}});
$("#saveFamilyProfileBtn").addEventListener("click",async()=>{try{await api("/api/admin/family-profile",{method:"POST",body:JSON.stringify({person_id:$("#familyPerson").value,summary:$("#familySummary").value,strengths:$("#familyStrengths").value,current_goals:$("#familyGoals").value,recommendations_home:$("#familyRecommendations").value})});$("#familyProfileStatus").style.color="#86EFAC";$("#familyProfileStatus").textContent="Información familiar guardada.";}catch(e){$("#familyProfileStatus").style.color="#FDA4AF";$("#familyProfileStatus").textContent=e.message;}});

async function loadDeploymentSecurityStatus(){
  const box=$("#deploymentSecurityStatus");
  if(!box)return;
  try{
    const d=await api("/api/admin/security/status");
    const checks=[
      [d.admin_password_configured,"Contraseña de administrador","Requerido"],
      [d.session_secret_configured,"Firma de sesiones","Requerido"],
      [d.legal_texts_reviewed,"Textos de privacidad/confidencialidad validados","Antes de usar datos reales"]
    ];
    box.innerHTML=checks.map(([ok,label,pending])=>`<article class="security-check ${ok?"ok":"warn"}"><span>${ok?"✓":"!"}</span><div><strong>${label}</strong><small>${ok?"Configurado":pending}</small></div></article>`).join("")+
      `<article class="security-check ${d.turnstile_misconfigured?"warn":d.turnstile_configured?"ok":"external"}"><span>${d.turnstile_misconfigured?"!":d.turnstile_configured?"✓":"○"}</span><div><strong>Protección anti-bot</strong><small>${d.turnstile_misconfigured?"Configuración incompleta: revisa las dos claves":d.turnstile_configured?"Turnstile activo":"Opcional · el formulario mantiene límite de solicitudes"}</small></div></article>`+
      `<article class="security-check external"><span>↗</span><div><strong>MFA de Cloudflare y GitHub</strong><small>Se administra fuera de NORTIA y no puede verificarse desde este panel.</small></div></article>`;
  }catch(e){box.innerHTML=`<p class="muted">No fue posible revisar el estado: ${escapeHTML(e.message)}</p>`;}
}

async function loadAudit(){try{const d=await api("/api/admin/audit");$("#auditList").innerHTML=d.audit.length?d.audit.map(a=>`<article class="admin-record"><div><strong>${escapeHTML(a.actor_name||a.actor_role)}</strong><span>${escapeHTML(a.action)}${a.person_name?" · "+escapeHTML(a.person_name):""}</span></div><small>${new Date(a.created_at).toLocaleString()}${a.detail?" · "+escapeHTML(a.detail):""}</small></article>`).join(""):`<p class="muted">Aún no hay movimientos registrados.</p>`;}catch{}}
$("#refreshAuditBtn").addEventListener("click",loadAudit);


async function loadInstitutionPreview(){try{const d=await api("/api/admin/institution/preview?institution=CIDEB");const cards=`<article><span>Expedientes relacionados</span><strong>${d.people}</strong></article><article><span>Solo escolares</span><strong>${d.school_only}</strong></article><article><span>Terapia privada preservada</span><strong>${d.private_therapy_preserved}</strong></article><article><span>Docentes activos</span><strong>${d.active_teachers}</strong></article><article><span>Asignaciones activas</span><strong>${d.teacher_assignments}</strong></article><article><span>Observaciones docentes</span><strong>${d.teacher_observations}</strong></article><article><span>Fichas de continuidad</span><strong>${d.continuity_records}</strong></article><article><span>Accesos familiares</span><strong>${d.family_accesses}</strong></article>`;if($("#institutionPreview"))$("#institutionPreview").innerHTML=cards;if($("#cidebOverviewStats"))$("#cidebOverviewStats").innerHTML=`<article><span>Alumnos activos</span><strong>${d.people}</strong></article><article><span>Docentes activos</span><strong>${d.active_teachers}</strong></article><article><span>Informes publicados</span><strong>${d.continuity_records}</strong></article>`;}catch(e){if($("#institutionPreview"))$("#institutionPreview").innerHTML=`<p class="muted">${escapeHTML(e.message)}</p>`;}}
$("#refreshInstitutionPreviewBtn").addEventListener("click",loadInstitutionPreview);
$("#closeInstitutionBtn").addEventListener("click",async()=>{if(!confirm("Esto desactivará accesos CIDEB y archivará expedientes exclusivamente escolares. Los procesos terapéuticos privados se conservarán. ¿Continuar?"))return;try{const d=await api("/api/admin/institution/close",{method:"POST",body:JSON.stringify({institution:"CIDEB",mode:"archive"})});$("#institutionStatus").style.color="#86EFAC";$("#institutionStatus").textContent=d.message;await Promise.all([loadInstitutionPreview(),loadPeople(),loadTeachers(),loadModuleObservations(),loadAudit()]);}catch(e){$("#institutionStatus").style.color="#FDA4AF";$("#institutionStatus").textContent=e.message;}});
$("#deleteInstitutionBtn").addEventListener("click",async()=>{const confirmation=$("#institutionDeleteConfirmation").value.trim();if(confirmation.toLocaleUpperCase("es-MX")!=="CERRAR CIDEB Y ELIMINAR"){$("#institutionStatus").style.color="#FDA4AF";$("#institutionStatus").textContent="Escribe exactamente: CERRAR CIDEB Y ELIMINAR";return;}if(!confirm("ÚLTIMA CONFIRMACIÓN: se eliminarán datos escolares CIDEB y expedientes exclusivamente escolares. Esta acción no puede deshacerse. ¿Continuar?"))return;try{const d=await api("/api/admin/institution/close",{method:"POST",body:JSON.stringify({institution:"CIDEB",mode:"delete",confirmation})});$("#institutionDeleteConfirmation").value="";$("#institutionStatus").style.color="#86EFAC";$("#institutionStatus").textContent=d.message;await Promise.all([loadInstitutionPreview(),loadPeople(),loadTeachers(),loadModuleObservations(),loadAudit(),loadDashboard()]);}catch(e){$("#institutionStatus").style.color="#FDA4AF";$("#institutionStatus").textContent=e.message;}});

document.addEventListener('click', async event => {
  const button=event.target.closest('[data-action]'); if(!button)return;
  const action=button.dataset.action; const id=button.dataset.id;
  if(action==='open-admin-tab') return openAdminTab(button.dataset.tab);
  if(action==='open-cideb-student') return openCidebStudent(id);
  if(action==='toggle-favorite'){event.stopPropagation();return toggleFavorite(id);}
  if(action==='save-school-student') return saveQuickCidebStudent(id);
  if(action==='open-student-report') return openStudentReport(id);
  if(action==='export-student') return exportCidebStudent(id,button.dataset.name||'alumno');
  if(action==='open-professional-record') return openProfessionalRecord(id);
  if(action==='read-notification') return markNotificationRead(id);
  if(action==='appointment-status') return setAppointmentStatus(id,button.dataset.status);
  if(action==='link-appointment') return openAppointmentLink(id);
  if(action==='choose-appointment-person') return chooseAppointmentPerson(id);
  if(action==='open-person') return openPerson(id);
  if(action==='review-observation') return reviewObservation(button.dataset.type,id);
  if(action==='manage-teacher') return manageTeacher(id);
  if(action==='unassign-teacher'){if(!currentManagedTeacherId)return;await api('/api/admin/teachers/unassign',{method:'POST',body:JSON.stringify({teacher_id:currentManagedTeacherId,person_id:button.dataset.personId,school_year:button.dataset.year})});return Promise.all([manageTeacher(currentManagedTeacherId),loadTeachers()]);}
  if(action==='toggle-family'){await api('/api/admin/family/access/update',{method:'POST',body:JSON.stringify({guardian_id:id,active:button.dataset.active!=="1"})});return loadFamilyData();}
  if(action==='regen-family'){if(!confirm('El código anterior dejará de funcionar y deberá aceptar nuevamente el aviso. ¿Continuar?'))return;const d=await api('/api/admin/family/access/regenerate',{method:'POST',body:JSON.stringify({guardian_id:id})});$("#familyManageResult").hidden=false;$("#familyManageResult").innerHTML=`<span>NUEVO CÓDIGO FAMILIAR</span><strong>${escapeHTML(d.access_code)}</strong><small>El código anterior quedó invalidado.</small>`;return loadFamilyData();}
});

document.querySelectorAll('.status').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});

loadInstitutionPreview();

forceFreshLogin();
