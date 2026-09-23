
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let peopleCache = [];
let currentPersonId = "";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Error");
  return data;
}

async function showDashboard() {
  $("#loginScreen").hidden = true;
  $("#dashboardApp").hidden = false;
  await Promise.all([loadDashboard(), loadAppointments(), loadPeople()]);
}

async function initSession() {
  try {
    const data = await api("/api/admin/session");
    if (data.authenticated) await showDashboard();
  } catch {}
}

$("#loginBtn").addEventListener("click", async () => {
  $("#loginStatus").textContent = "";
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("#adminPassword").value })
    });
    await showDashboard();
  } catch (error) {
    $("#loginStatus").textContent = error.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST" });
  } finally {
    location.reload();
  }
});

$$(".nav-btn[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    $$(".nav-btn[data-tab]").forEach(item => item.classList.toggle("active", item === button));
    $$(".admin-view").forEach(view => view.classList.remove("active"));
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
  try {
    const data = await api("/api/admin/dashboard");
    $("#statRequested").textContent = data.requested;
    $("#statConfirmed").textContent = data.confirmed;
    $("#statPeople").textContent = data.active_people;
    $("#statRisk").textContent = data.risk_messages;
  } catch {}
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
        <span>${escapeHTML(item.service_type.replaceAll("_", " "))}${item.is_minor ? " · Menor" : ""}</span>
      </div>
      <div>
        <strong>${escapeHTML(item.preferred_date)}</strong>
        <span>${escapeHTML(item.preferred_time)}</span>
      </div>
      <div><span class="pill">${escapeHTML(item.status)}</span></div>
      <div class="row-actions">
        <button onclick="setAppointmentStatus('${item.id}','confirmed')">Confirmar</button>
        <button onclick="setAppointmentStatus('${item.id}','completed')">Realizada</button>
        <button onclick="setAppointmentStatus('${item.id}','cancelled')">Cancelar</button>
      </div>
    </div>
  `).join("");
}

async function loadAppointments() {
  try {
    const data = await api("/api/admin/appointments");
    renderAppointments($("#appointmentsList"), data.appointments);
    renderAppointments($("#dashboardAppointments"), data.appointments.filter(item =>
      item.status === "requested" || item.status === "confirmed"
    ), 5);
  } catch {}
}

window.setAppointmentStatus = async (id, status) => {
  await api("/api/admin/appointments/status", {
    method: "POST",
    body: JSON.stringify({ id, status })
  });
  await Promise.all([loadAppointments(), loadDashboard()]);
};

$("#refreshAppointments").addEventListener("click", loadAppointments);

async function loadPeople() {
  try {
    const data = await api("/api/admin/people");
    peopleCache = data.people;

    if (!peopleCache.length) {
      $("#peopleList").innerHTML = `<p class="muted">Todavía no hay personas registradas.</p>`;
    } else {
      $("#peopleList").innerHTML = peopleCache.map(person => `
        <button class="person-row" onclick="openPerson('${person.id}')">
          <div>
            <strong>${escapeHTML(person.full_name)}</strong>
            <span>${person.age ?? "Edad no indicada"}${person.is_minor ? " · Menor" : ""}</span>
          </div>
          <div><span>${escapeHTML(person.phone || "Sin teléfono")}</span></div>
          <div><span>${person.note_count || 0} notas privadas</span></div>
          <div><span class="pill">${person.risk_count || 0} alertas AI</span></div>
        </button>
      `).join("");
    }

    const options = `<option value="">Selecciona una persona</option>` + peopleCache.map(person =>
      `<option value="${person.id}">${escapeHTML(person.full_name)}</option>`
    ).join("");
    $("#vocPerson").innerHTML = options;
    $("#aiPerson").innerHTML = options;
  } catch {}
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
    </div>
  `;

  $("#notesHistory").innerHTML = data.notes.length
    ? data.notes.map(note => `
        <article class="note-card">
          <span>${new Date(note.created_at).toLocaleString()}</span>
          <p>${escapeHTML(note.note_text)}</p>
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay notas privadas.</p>`;
};

$("#saveNoteBtn").addEventListener("click", async () => {
  const note = $("#privateNote").value.trim();
  if (!currentPersonId || !note) {
    $("#noteStatus").textContent = "Selecciona una persona y escribe una nota.";
    return;
  }

  try {
    await api("/api/admin/note", {
      method: "POST",
      body: JSON.stringify({ person_id: currentPersonId, note_text: note })
    });
    $("#privateNote").value = "";
    $("#noteStatus").style.color = "#96efb0";
    $("#noteStatus").textContent = "Nota privada guardada.";
    await Promise.all([openPerson(currentPersonId), loadPeople()]);
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
      body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries()))
    });
    event.target.reset();
    $("#personStatus").style.color = "#96efb0";
    $("#personStatus").textContent = "Ficha creada.";
    await Promise.all([loadPeople(), loadDashboard()]);
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

$$(".example-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    $("#aiMessage").value = btn.dataset.fill || "";
  });
});

$("#aiSendBtn").addEventListener("click", async () => {
  const personId = $("#aiPerson").value;
  const message = $("#aiMessage").value.trim();
  if (!personId || !message) {
    $("#aiReply").textContent = "Selecciona una persona y escribe un mensaje.";
    return;
  }

  $("#aiReply").textContent = "Pensando...";
  try {
    const data = await api("/api/admin/ai-reflection", {
      method: "POST",
      body: JSON.stringify({ person_id: personId, message })
    });
    $("#aiReply").textContent = (data.risk_flag ? "⚠ Revisión humana recomendada\n\n" : "") + data.reply;
    await loadDashboard();
  } catch (error) {
    $("#aiReply").textContent = error.message;
  }
});

initSession();
