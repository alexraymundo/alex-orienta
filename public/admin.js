
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
    loadPeople()
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
      vocational: "Mapa vocacional",
      ai: "Reflexión AI"
    }[button.dataset.tab];
  });
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
  const data = await api("/api/admin/people");
  peopleCache = data.people;

  if (!peopleCache.length) {
    $("#peopleList").innerHTML =
      `<p class="muted">Todavía no hay personas registradas.</p>`;
  } else {
    $("#peopleList").innerHTML = peopleCache.map(person => `
      <button class="person-row" onclick="openPerson('${person.id}')">
        <div>
          <strong>${escapeHTML(person.full_name)}</strong>
          <span>
            ${person.age ?? "Edad no indicada"}
            ${person.is_minor ? " · Menor" : ""}
          </span>
        </div>

        <div>
          <span>${escapeHTML(person.phone || "Sin teléfono")}</span>
        </div>

        <div>
          <span>${person.note_count || 0} notas privadas</span>
        </div>

        <div>
          <span class="pill">${person.risk_count || 0} alertas AI</span>
        </div>
      </button>
    `).join("");
  }

  const personOptions = peopleCache.map(person =>
    `<option value="${person.id}">${escapeHTML(person.full_name)}</option>`
  ).join("");

  $("#vocPerson").innerHTML =
    `<option value="">Selecciona una persona</option>${personOptions}`;

  $("#aiPerson").innerHTML =
    `<option value="__demo__">Prueba general sin persona</option>${personOptions}`;
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

  renderAccess(data.access, data.person);
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

function renderAccess(access, person) {
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
    private: "Solo Alex",
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
          <span>${item.role === "assistant" ? "Reflexión AI" : "Usuario"} · ${new Date(item.created_at).toLocaleString()}</span>
          <p>${escapeHTML(item.content)}</p>
          ${item.risk_flag ? `<b class="risk-flag">Requiere revisión humana</b>` : ""}
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay conversaciones desde Mi Espacio.</p>`;
}

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

forceFreshLogin();
