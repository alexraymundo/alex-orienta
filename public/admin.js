
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let peopleCache = [];
let currentPersonId = "";

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
    loadAudit()
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
  location.reload();
});

$$(".nav-btn[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    if ($("#secureApp").hidden) return;

    $$(".nav-btn[data-tab]").forEach(item =>
      item.classList.toggle("active", item === button)
    );

    $$(".admin-view").forEach(view =>
      view.classList.remove("active")
    );

    $(`#view-${button.dataset.tab}`).classList.add("active");

    $("#viewTitle").textContent = {
      dashboard: "Hoy",
      agenda: "Agenda",
      people: "Personas",
      teachers: "Docentes",
      observations: "Observaciones",
      continuity: "Continuidad escolar",
      families: "Familias",
      security: "Seguridad",
      vocational: "Mapa vocacional",
      notifications: "Notificaciones",
      ai: "NORTIA Reflexión"
    }[button.dataset.tab];
  });
});


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
            onclick="markNotificationRead('${item.id}')">
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

      <div class="row-actions">
        <button onclick="setAppointmentStatus('${item.id}','confirmed')">Confirmar</button>
        <button onclick="setAppointmentStatus('${item.id}','completed')">Realizada</button>
        <button onclick="setAppointmentStatus('${item.id}','cancelled')">Cancelar</button>
      </div>
    </div>
  `).join("");
}

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

async function loadPeople() {
  const data=await api("/api/admin/people"); peopleCache=data.people||[];
  if(!peopleCache.length) $("#peopleList").innerHTML=`<p class="muted">Todavía no hay personas registradas.</p>`;
  else $("#peopleList").innerHTML=peopleCache.map(person=>{const archived=person.status==="archived";const contextLabel={private:"Privado",cideb:"CIDEB",mixed:"CIDEB + privado",other:"Otro"}[person.context_type||"private"];return `<button class="person-row ${archived?"archived-person":""}" onclick="openPerson('${person.id}')"><div><strong>${escapeHTML(person.full_name)}</strong><span>${person.age??"Edad no indicada"}${person.is_minor?" · Menor":""} · ${escapeHTML(contextLabel)}</span></div><div><span>${escapeHTML(person.phone||"Sin teléfono")}</span></div><div><span>${person.note_count||0} notas privadas</span></div><div class="person-status-stack"><span class="pill">${person.risk_count||0} alertas AI</span>${archived?`<span class="archive-pill">ARCHIVADO</span>`:""}</div></button>`}).join("");
  const active=peopleCache.filter(p=>p.status!=="archived"),activeOptions=active.map(p=>`<option value="${p.id}">${escapeHTML(p.full_name)}</option>`).join(""),schoolOptions=active.filter(p=>Number(p.school_followup)).map(p=>`<option value="${p.id}">${escapeHTML(p.full_name)}</option>`).join("");
  $("#vocPerson").innerHTML=`<option value="">Selecciona una persona</option>${activeOptions}`; $("#aiPerson").innerHTML=`<option value="__demo__">Prueba general sin persona</option>${activeOptions}`; $("#teacherStudent").innerHTML=`<option value="">Selecciona un alumno</option>${schoolOptions}`; $("#continuityPerson").innerHTML=`<option value="">Selecciona un alumno</option>${schoolOptions}`; $("#familyPerson").innerHTML=`<option value="">Selecciona una persona</option>${activeOptions}`;
}

window.openPerson = async personId => {
  currentPersonId = personId;

  const data = await api(`/api/admin/person/${personId}`);

  $("#personDetailPanel").hidden = false;
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

  $("#followupDate").value =
    new Date().toISOString().slice(0, 10);

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

$("#saveAccessSettingsBtn").addEventListener("click", async () => {
  if (!currentPersonId) return;

  try {
    await api("/api/admin/access/settings", {
      method: "POST",
      body: JSON.stringify({
        person_id: currentPersonId,
        active: $("#accessActive").checked,
        consent_confirmed: $("#accessConsent").checked,
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

$("#newPersonBtn").addEventListener("click", () => {
  $("#personModal").hidden = false;
  document.body.style.overflow = "hidden";
});

$$("[data-close-person]").forEach(button => {
  button.addEventListener("click", () => {
    $("#personModal").hidden = true;
    document.body.style.overflow = "";
  });
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


function renderProgram(program,dataContext={}){$("#programTherapy").checked=!!Number(program.therapy_with_alex);$("#programSchool").checked=!!Number(program.school_followup);$("#programSchoolName").value=program.school_name||"";$("#programGrade").value=program.grade_level||"";$("#programYear").value=program.school_year||"";$("#dataContextType").value=dataContext.context_type||"private";$("#dataInstitution").value=dataContext.institution_name||program.school_name||"";}
function renderPersonDataManagement(person,dataContext={}){const archived=person.status==="archived";$("#personStatusBadge").textContent=archived?"ARCHIVADO":"ACTIVO";$("#personStatusBadge").classList.toggle("archived",archived);$("#archivePersonBtn").hidden=archived;$("#reactivatePersonBtn").hidden=!archived;$("#archiveReason").value=dataContext.archive_reason||"";$("#deletePersonPhrase").textContent=`ELIMINAR ${person.full_name}`;$("#deletePersonConfirmation").value="";}
$("#saveProgramBtn").addEventListener("click",async()=>{if(!currentPersonId)return;try{await Promise.all([api("/api/admin/program",{method:"POST",body:JSON.stringify({person_id:currentPersonId,therapy_with_alex:$("#programTherapy").checked,school_followup:$("#programSchool").checked,school_name:$("#programSchoolName").value,grade_level:$("#programGrade").value,school_year:$("#programYear").value})}),api("/api/admin/data-context",{method:"POST",body:JSON.stringify({person_id:currentPersonId,context_type:$("#dataContextType").value,institution_name:$("#dataInstitution").value})})]);$("#programStatus").style.color="#86EFAC";$("#programStatus").textContent="Tipo de proceso y contexto guardados.";await Promise.all([openPerson(currentPersonId),loadPeople()]);}catch(e){$("#programStatus").style.color="#FDA4AF";$("#programStatus").textContent=e.message;}});
$("#archivePersonBtn").addEventListener("click",async()=>{if(!currentPersonId||!confirm("¿Archivar este expediente? Se desactivarán accesos, pero la información se conservará."))return;try{const d=await api("/api/admin/person/archive",{method:"POST",body:JSON.stringify({person_id:currentPersonId,archive:true,reason:$("#archiveReason").value})});$("#personDataStatus").style.color="#86EFAC";$("#personDataStatus").textContent=d.message;await Promise.all([openPerson(currentPersonId),loadPeople(),loadAudit()]);}catch(e){$("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=e.message;}});
$("#reactivatePersonBtn").addEventListener("click",async()=>{if(!currentPersonId)return;try{const d=await api("/api/admin/person/archive",{method:"POST",body:JSON.stringify({person_id:currentPersonId,archive:false})});$("#personDataStatus").style.color="#86EFAC";$("#personDataStatus").textContent=d.message;await Promise.all([openPerson(currentPersonId),loadPeople(),loadAudit()]);}catch(e){$("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=e.message;}});
$("#deletePersonBtn").addEventListener("click",async()=>{if(!currentPersonId)return;const person=peopleCache.find(x=>x.id===currentPersonId);if(!person)return;const expected=`ELIMINAR ${person.full_name}`,confirmation=$("#deletePersonConfirmation").value.trim();if(confirmation.toLocaleUpperCase("es-MX")!==expected.toLocaleUpperCase("es-MX")){ $("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=`Escribe exactamente: ${expected}`;return;}if(!confirm("Esta acción es irreversible. ¿Eliminar definitivamente este expediente?"))return;try{const d=await api("/api/admin/person/delete",{method:"POST",body:JSON.stringify({person_id:currentPersonId,confirmation})});$("#personDetailPanel").hidden=true;currentPersonId="";await Promise.all([loadPeople(),loadDashboard(),loadAudit()]);alert(d.message);}catch(e){$("#personDataStatus").style.color="#FDA4AF";$("#personDataStatus").textContent=e.message;}});

async function loadTeachers(){try{const d=await api("/api/admin/teachers");$("#adminTeachersList").innerHTML=d.teachers.length?d.teachers.map(t=>`<article class="admin-record"><div><strong>${escapeHTML(t.full_name)}</strong><span>${escapeHTML(t.school_name||"")} · ${t.student_count||0} alumno(s)</span></div><small>${t.agreement_accepted_at?"Acuerdo aceptado":"Acuerdo pendiente"}${t.last_login_at?" · Último acceso "+new Date(t.last_login_at).toLocaleString():""}</small></article>`).join(""):`<p class="muted">Aún no hay docentes.</p>`;}catch{}}
$("#createTeacherBtn").addEventListener("click",async()=>{try{const d=await api("/api/admin/teachers/create",{method:"POST",body:JSON.stringify({full_name:$("#teacherName").value,email:$("#teacherEmail").value,school_name:$("#teacherSchool").value,person_id:$("#teacherStudent").value,school_year:$("#teacherYear").value})});$("#teacherCreateResult").hidden=false;$("#teacherCreateResult").innerHTML=`<span>CÓDIGO DOCENTE</span><strong>${escapeHTML(d.access_code)}</strong><small>Entrar en /docente.html. El docente deberá firmar el acuerdo antes de ver información.</small>`;$("#teacherAdminStatus").style.color="#86EFAC";$("#teacherAdminStatus").textContent=`Acceso creado para ${d.student_name}.`;await loadTeachers();}catch(e){$("#teacherAdminStatus").style.color="#FDA4AF";$("#teacherAdminStatus").textContent=e.message;}});

function obsCard(o,type){const isTeacher=type==="teacher";return `<article class="review-card ${o.status}"><div class="review-meta"><span>${isTeacher?"DOCENTE":"FAMILIA"} · ${escapeHTML(isTeacher?o.teacher_name:o.guardian_name)}</span><span>${escapeHTML(o.observation_date)}</span></div><strong>${escapeHTML(o.person_name)}</strong><p>${escapeHTML(isTeacher?o.description:o.observation_text)}</p>${isTeacher&&o.strategy_used?`<small>Estrategia: ${escapeHTML(o.strategy_used)}</small>`:""}<textarea id="comment_${o.id}" rows="2" placeholder="Comentario profesional"></textarea><button class="secondary-btn" onclick="reviewObservation('${type}','${o.id}')">${o.status==="reviewed"?"ACTUALIZAR COMENTARIO":"MARCAR REVISADO"}</button></article>`;}
async function loadModuleObservations(){try{const [t,f]=await Promise.all([api("/api/admin/teacher-observations"),api("/api/admin/family-observations")]);$("#adminTeacherObservations").innerHTML=t.observations.length?t.observations.map(o=>obsCard(o,"teacher")).join(""):`<p class="muted">Sin observaciones docentes.</p>`;$("#adminFamilyObservations").innerHTML=f.observations.length?f.observations.map(o=>obsCard(o,"family")).join(""):`<p class="muted">Sin observaciones familiares.</p>`;}catch{}}
window.reviewObservation=async(type,id)=>{try{await api(type==="teacher"?"/api/admin/teacher-observations/review":"/api/admin/family-observations/review",{method:"POST",body:JSON.stringify({id,professional_comment:$("#comment_"+id).value})});await Promise.all([loadModuleObservations(),loadAudit()]);}catch(e){alert(e.message);}};

function renderAdminSnapshot(s){const labels={attention:"Atención",instructions:"Instrucciones",organization:"Organización",peers:"Interacción con pares",frustration:"Frustración",transitions:"Transiciones",autonomy:"Autonomía",help_seeking:"Solicitud de ayuda"};const bars=Object.entries(labels).map(([k,l])=>{const v=s.support?.[k],pct=v==null?0:v/3*100;return `<div class="support-row"><span>${l}</span><div><i style="width:${pct}%"></i></div><b>${v==null?"—":Number(v).toFixed(1)}</b></div>`}).join("");return `<p class="muted">${s.observation_count||0} observación(es). Escala descriptiva de apoyo requerido 0–3; no es diagnóstico.</p>${bars}`;}
$("#continuityPerson").addEventListener("change",async()=>{const id=$("#continuityPerson").value;if(!id)return;try{const d=await api(`/api/admin/school-continuity?person_id=${encodeURIComponent(id)}`);const c=d.continuity||{};$("#contGeneral").value=c.general_description||"";$("#contStrengths").value=c.strengths||"";$("#contSupport").value=c.support_needs||"";$("#contStrategies").value=c.strategies||"";$("#contWatch").value=c.watch_items||"";$("#contApprove").checked=!!c.approved_at;$("#adminSchoolSnapshot").innerHTML=renderAdminSnapshot(d.snapshot);}catch(e){$("#continuityStatus").textContent=e.message;}});
$("#saveContinuityBtn").addEventListener("click",async()=>{const id=$("#continuityPerson").value;if(!id)return;try{await api("/api/admin/school-continuity",{method:"POST",body:JSON.stringify({person_id:id,general_description:$("#contGeneral").value,strengths:$("#contStrengths").value,support_needs:$("#contSupport").value,strategies:$("#contStrategies").value,watch_items:$("#contWatch").value,approve:$("#contApprove").checked})});$("#continuityStatus").style.color="#86EFAC";$("#continuityStatus").textContent=$("#contApprove").checked?"Ficha guardada y aprobada para docentes asignados.":"Borrador guardado.";await loadAudit();}catch(e){$("#continuityStatus").style.color="#FDA4AF";$("#continuityStatus").textContent=e.message;}});

async function loadFamilyData(){const id=$("#familyPerson").value;if(!id)return;try{const [a,p]=await Promise.all([api(`/api/admin/family/access?person_id=${encodeURIComponent(id)}`),api(`/api/admin/family-profile?person_id=${encodeURIComponent(id)}`)]);$("#familyAccessList").innerHTML=a.guardians.length?a.guardians.map(g=>`<article class="admin-record"><div><strong>${escapeHTML(g.full_name)}</strong><span>${escapeHTML(g.relationship||"Tutor")} · ••••${escapeHTML(g.access_hint||"")}</span></div><small>${g.agreement_accepted_at?"Aviso aceptado":"Aviso pendiente"}${g.last_login_at?" · Último acceso "+new Date(g.last_login_at).toLocaleString():""}</small></article>`).join(""):`<p class="muted">Sin accesos familiares.</p>`;const x=p.profile||{};$("#familySummary").value=x.summary||"";$("#familyStrengths").value=x.strengths||"";$("#familyGoals").value=x.current_goals||"";$("#familyRecommendations").value=x.recommendations_home||"";}catch(e){$("#familyAdminStatus").textContent=e.message;}}
$("#familyPerson").addEventListener("change",loadFamilyData);
$("#createFamilyBtn").addEventListener("click",async()=>{try{const d=await api("/api/admin/family/access/create",{method:"POST",body:JSON.stringify({person_id:$("#familyPerson").value,full_name:$("#familyName").value,relationship:$("#familyRelation").value,email:$("#familyEmail").value})});$("#familyCreateResult").hidden=false;$("#familyCreateResult").innerHTML=`<span>CÓDIGO FAMILIAR</span><strong>${escapeHTML(d.access_code)}</strong><small>Entrar en /familia.html. El acceso no incluye IA.</small>`;$("#familyAdminStatus").style.color="#86EFAC";$("#familyAdminStatus").textContent="Acceso familiar creado.";await loadFamilyData();}catch(e){$("#familyAdminStatus").style.color="#FDA4AF";$("#familyAdminStatus").textContent=e.message;}});
$("#saveFamilyProfileBtn").addEventListener("click",async()=>{try{await api("/api/admin/family-profile",{method:"POST",body:JSON.stringify({person_id:$("#familyPerson").value,summary:$("#familySummary").value,strengths:$("#familyStrengths").value,current_goals:$("#familyGoals").value,recommendations_home:$("#familyRecommendations").value})});$("#familyProfileStatus").style.color="#86EFAC";$("#familyProfileStatus").textContent="Información familiar guardada.";}catch(e){$("#familyProfileStatus").style.color="#FDA4AF";$("#familyProfileStatus").textContent=e.message;}});

async function loadAudit(){try{const d=await api("/api/admin/audit");$("#auditList").innerHTML=d.audit.length?d.audit.map(a=>`<article class="admin-record"><div><strong>${escapeHTML(a.actor_name||a.actor_role)}</strong><span>${escapeHTML(a.action)}${a.person_name?" · "+escapeHTML(a.person_name):""}</span></div><small>${new Date(a.created_at).toLocaleString()}${a.detail?" · "+escapeHTML(a.detail):""}</small></article>`).join(""):`<p class="muted">Aún no hay movimientos registrados.</p>`;}catch{}}
$("#refreshAuditBtn").addEventListener("click",loadAudit);


async function loadInstitutionPreview(){try{const d=await api("/api/admin/institution/preview?institution=CIDEB");$("#institutionPreview").innerHTML=`<article><span>Expedientes relacionados</span><strong>${d.people}</strong></article><article><span>Solo escolares</span><strong>${d.school_only}</strong></article><article><span>Terapia privada preservada</span><strong>${d.private_therapy_preserved}</strong></article><article><span>Docentes activos</span><strong>${d.active_teachers}</strong></article><article><span>Asignaciones activas</span><strong>${d.teacher_assignments}</strong></article><article><span>Observaciones docentes</span><strong>${d.teacher_observations}</strong></article><article><span>Fichas de continuidad</span><strong>${d.continuity_records}</strong></article><article><span>Accesos familiares</span><strong>${d.family_accesses}</strong></article>`;}catch(e){$("#institutionPreview").innerHTML=`<p class="muted">${escapeHTML(e.message)}</p>`;}}
$("#refreshInstitutionPreviewBtn").addEventListener("click",loadInstitutionPreview);
$("#closeInstitutionBtn").addEventListener("click",async()=>{if(!confirm("Esto desactivará accesos CIDEB y archivará expedientes exclusivamente escolares. Los procesos terapéuticos privados se conservarán. ¿Continuar?"))return;try{const d=await api("/api/admin/institution/close",{method:"POST",body:JSON.stringify({institution:"CIDEB",mode:"archive"})});$("#institutionStatus").style.color="#86EFAC";$("#institutionStatus").textContent=d.message;await Promise.all([loadInstitutionPreview(),loadPeople(),loadTeachers(),loadModuleObservations(),loadAudit()]);}catch(e){$("#institutionStatus").style.color="#FDA4AF";$("#institutionStatus").textContent=e.message;}});
$("#deleteInstitutionBtn").addEventListener("click",async()=>{const confirmation=$("#institutionDeleteConfirmation").value.trim();if(confirmation.toLocaleUpperCase("es-MX")!=="CERRAR CIDEB Y ELIMINAR"){$("#institutionStatus").style.color="#FDA4AF";$("#institutionStatus").textContent="Escribe exactamente: CERRAR CIDEB Y ELIMINAR";return;}if(!confirm("ÚLTIMA CONFIRMACIÓN: se eliminarán datos escolares CIDEB y expedientes exclusivamente escolares. Esta acción no puede deshacerse. ¿Continuar?"))return;try{const d=await api("/api/admin/institution/close",{method:"POST",body:JSON.stringify({institution:"CIDEB",mode:"delete",confirmation})});$("#institutionDeleteConfirmation").value="";$("#institutionStatus").style.color="#86EFAC";$("#institutionStatus").textContent=d.message;await Promise.all([loadInstitutionPreview(),loadPeople(),loadTeachers(),loadModuleObservations(),loadAudit(),loadDashboard()]);}catch(e){$("#institutionStatus").style.color="#FDA4AF";$("#institutionStatus").textContent=e.message;}});

loadInstitutionPreview();

forceFreshLogin();
