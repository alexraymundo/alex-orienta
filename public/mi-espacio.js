
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let clientData = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Error");
  }

  return data;
}

function showClientLogin() {
  $("#clientLogin").hidden = false;
  $("#clientApp").hidden = true;
}

function showClientApp() {
  $("#clientLogin").hidden = true;
  $("#clientApp").hidden = false;
}

async function loadClientData() {
  clientData = await request("/api/client/me");
  renderClientData();
}

function renderClientData() {
  const data = clientData;

  $("#clientWelcomeName").textContent =
    `Hola, ${data.person.full_name.split(" ")[0]}`;

  if (data.next_appointment) {
    $("#nextAppointment").textContent =
      `${data.next_appointment.preferred_date} · ${data.next_appointment.preferred_time}`;

    $("#nextAppointmentType").textContent =
      data.next_appointment.service_type.replaceAll("_", " ");
  } else {
    $("#nextAppointment").textContent = "Por confirmar";
    $("#nextAppointmentType").textContent =
      "Consulta con Alex si necesitas agendar.";
  }

  const pending = data.exercises.filter(item =>
    item.status !== "done"
  ).length;

  $("#pendingExercises").textContent = pending;

  const access = data.access || {};

  if (!access.consent_confirmed) {
    $("#aiAccessState").textContent = "Pendiente";
    $("#aiAccessDetail").textContent =
      "Falta confirmar consentimiento.";
  } else if (!access.ai_enabled) {
    $("#aiAccessState").textContent = "No habilitada";
    $("#aiAccessDetail").textContent =
      "Alex todavía no habilita esta herramienta.";
  } else {
    $("#aiAccessState").textContent = "Disponible";
    $("#aiAccessDetail").textContent =
      "Puedes usarla desde la pestaña Reflexión AI.";
  }

  renderSharedFields(data.custom_fields);
  renderFollowups(data.followups);
  renderVocational(data.vocational);
  renderExercises(data.exercises);
  renderAIState(access);
}

function renderSharedFields(items) {
  $("#sharedFieldsHome").innerHTML = items.length
    ? `<div class="shared-field-grid">${items.map(item => `
        <article class="shared-field">
          <span>${escapeHTML(item.field_name)}</span>
          <strong>${escapeHTML(item.field_value || "—")}</strong>
        </article>
      `).join("")}</div>`
    : `<p class="muted">Alex todavía no ha compartido información adicional en esta sección.</p>`;
}

function renderFollowups(items) {
  $("#clientFollowups").innerHTML = items.length
    ? items.map(item => `
        <article class="client-followup">
          <div class="client-followup-date">${escapeHTML(item.followup_date)}</div>
          <div>
            <h3>${escapeHTML(item.title || "Seguimiento")}</h3>
            ${item.shared_summary ? `<p>${escapeHTML(item.shared_summary)}</p>` : ""}
            ${item.agreements ? `<div class="client-callout"><span>ACUERDOS</span><p>${escapeHTML(item.agreements)}</p></div>` : ""}
            ${item.next_steps ? `<div class="client-callout"><span>SIGUIENTE PASO</span><p>${escapeHTML(item.next_steps)}</p></div>` : ""}
          </div>
        </article>
      `).join("")
    : `<p class="muted">Todavía no hay seguimientos compartidos.</p>`;
}

function renderVocational(v) {
  const fields = [
    ["Intereses", v.interests],
    ["Fortalezas", v.strengths],
    ["Valores", v.values_text],
    ["Materias favoritas", v.favorite_subjects],
    ["Estilo de trabajo", v.work_style],
    ["Carreras consideradas", v.careers_considered],
    ["Preguntas abiertas", v.open_questions]
  ].filter(([, value]) => String(value || "").trim());

  $("#clientVocationalMap").innerHTML = fields.length
    ? fields.map(([label, value]) => `
        <article>
          <span>${escapeHTML(label)}</span>
          <p>${escapeHTML(value)}</p>
        </article>
      `).join("")
    : `<p class="muted">Tu mapa vocacional todavía está en construcción.</p>`;
}

function renderExercises(items) {
  $("#clientExercises").innerHTML = items.length
    ? items.map(item => `
        <article class="client-exercise ${item.status === "done" ? "done" : ""}">
          <div>
            <span class="exercise-status">${item.status === "done" ? "COMPLETADO" : "PENDIENTE"}</span>
            <h3>${escapeHTML(item.title)}</h3>
            ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
            ${item.due_date ? `<small>Fecha sugerida: ${escapeHTML(item.due_date)}</small>` : ""}
          </div>
          <button
            class="secondary-btn client-exercise-toggle"
            data-exercise-id="${item.id}"
            data-next-status="${item.status === "done" ? "pending" : "done"}">
            ${item.status === "done" ? "MARCAR PENDIENTE" : "MARCAR COMPLETADO"}
          </button>
        </article>
      `).join("")
    : `<p class="muted">No tienes actividades asignadas por ahora.</p>`;

  $$(".client-exercise-toggle").forEach(button => {
    button.addEventListener("click", async () => {
      await request("/api/client/exercise-status", {
        method: "POST",
        body: JSON.stringify({
          id: button.dataset.exerciseId,
          status: button.dataset.nextStatus
        })
      });

      await loadClientData();
    });
  });
}

function renderAIState(access) {
  const canUseAI =
    !!access.consent_confirmed &&
    !!access.ai_enabled;

  $("#clientAIDisabled").hidden = canUseAI;
  $("#clientAIEnabled").hidden = !canUseAI;

  if (!canUseAI) {
    $("#clientAIDisabled").innerHTML = `
      <strong>Reflexión AI todavía no está habilitada.</strong>
      <p>
        ${!access.consent_confirmed
          ? "Primero debe quedar confirmado el consentimiento correspondiente."
          : "Alex decidirá cuándo esta herramienta forma parte de tu proceso."}
      </p>
    `;
  }
}

async function loginClient() {
  const code = $("#clientAccessCode").value.trim();

  if (!code) {
    $("#clientLoginStatus").textContent =
      "Escribe tu código de acceso.";
    return;
  }

  $("#clientLoginStatus").textContent = "Validando...";

  try {
    await request("/api/client/login", {
      method: "POST",
      body: JSON.stringify({ code })
    });

    $("#clientLoginStatus").textContent = "";
    $("#clientAccessCode").value = "";
    showClientApp();
    await loadClientData();
  } catch (error) {
    $("#clientLoginStatus").textContent = error.message;
  }
}

$("#clientLoginBtn").addEventListener("click", loginClient);

$("#clientAccessCode").addEventListener("keydown", event => {
  if (event.key === "Enter") loginClient();
});

$("#clientLogoutBtn").addEventListener("click", async () => {
  try {
    await request("/api/client/logout", {
      method: "POST"
    });
  } catch {}

  location.reload();
});

$$(".client-tab").forEach(button => {
  button.addEventListener("click", () => {
    $$(".client-tab").forEach(item =>
      item.classList.toggle("active", item === button)
    );

    $$(".client-view").forEach(view =>
      view.classList.remove("active")
    );

    $(`#client-view-${button.dataset.clientTab}`)
      .classList.add("active");
  });
});

$$("[data-client-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    $("#clientAIInput").value =
      button.dataset.clientPrompt || "";
    $("#clientAIInput").focus();
  });
});

function addAIMessage(role, text, risk = false) {
  const div = document.createElement("div");
  div.className = `client-ai-message ${role}`;

  const label = document.createElement("span");
  label.textContent =
    role === "assistant"
      ? (risk ? "Reflexión AI · Revisión humana recomendada" : "Reflexión AI")
      : "Tú";

  const p = document.createElement("p");
  p.textContent = text;

  div.append(label, p);
  $("#clientAIMessages").appendChild(div);
  $("#clientAIMessages").scrollTop =
    $("#clientAIMessages").scrollHeight;
}

$("#clientAISendBtn").addEventListener("click", async () => {
  const input = $("#clientAIInput");
  const message = input.value.trim();

  if (!message) return;

  addAIMessage("user", message);
  input.value = "";

  const button = $("#clientAISendBtn");
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "PENSANDO...";

  try {
    const data = await request("/api/client/ai", {
      method: "POST",
      body: JSON.stringify({ message })
    });

    addAIMessage(
      "assistant",
      data.reply,
      !!data.risk_flag
    );
  } catch (error) {
    addAIMessage(
      "assistant",
      error.message
    );
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
});

async function initClient() {
  try {
    const session = await request("/api/client/session");

    if (session.authenticated) {
      showClientApp();
      await loadClientData();
    } else {
      showClientLogin();
    }
  } catch {
    showClientLogin();
  }
}

initClient();
