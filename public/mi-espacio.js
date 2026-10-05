
function clientToast(message, type='info') {
  const region = document.querySelector('#clientToastRegion');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `app-toast ${type}`;
  item.textContent = String(message || '');
  region.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => { item.classList.remove('show'); setTimeout(() => item.remove(), 180); }, 3600);
}

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let clientData = null;
let aiMessagesRemaining = 15;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatDateOnly(value) {
  if (!value) return "";
  const [y,m,d] = String(value).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Intl.DateTimeFormat("es-MX", {day:"numeric",month:"short",year:"numeric"}).format(new Date(y,m-1,d,12));
}

function serviceLabel(value) {
  return ({
    orientacion_vocacional: "Orientación vocacional",
    acompanamiento_personal: "Acompañamiento personal",
    desarrollo_academico: "Desarrollo académico"
  })[value] || String(value || "").replaceAll("_", " ");
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const raw = await response.text();
  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      data.error ||
      (raw && raw.length < 500 ? raw : "") ||
      `Error HTTP ${response.status}`;

    throw new Error(message);
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
      `${formatDateOnly(data.next_appointment.preferred_date)} · ${data.next_appointment.preferred_time}`;

    $("#nextAppointmentType").textContent =
      serviceLabel(data.next_appointment.service_type);
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
  const therapyEligible = !!Number(data.program?.therapy_with_alex);

  if (!therapyEligible) {
    $("#aiAccessState").textContent = "No incluida";
    $("#aiAccessDetail").textContent = "Esta herramienta no forma parte de tu proceso actual.";
  } else if (!access.consent_confirmed) {
    $("#aiAccessState").textContent = "Pendiente";
    $("#aiAccessDetail").textContent = "Falta confirmar consentimiento.";
  } else if (!access.ai_enabled) {
    $("#aiAccessState").textContent = "No habilitada";
    $("#aiAccessDetail").textContent = "Tu profesional todavía no habilita esta herramienta.";
  } else {
    $("#aiAccessState").textContent = "Disponible";
    $("#aiAccessDetail").textContent = "Puedes usarla desde la pestaña RAUDAL Reflexión.";
  }

  renderSharedFields(data.custom_fields);
  renderFollowups(data.followups);
  renderVocational(data.vocational);
  renderExercises(data.exercises);
  renderAIState(access);
  if (access.consent_confirmed && access.ai_enabled) loadAIUsage();
}

function renderSharedFields(items) {
  $("#sharedFieldsHome").innerHTML = items.length
    ? `<div class="shared-field-grid">${items.map(item => `
        <article class="shared-field">
          <span>${escapeHTML(item.field_name)}</span>
          <strong>${escapeHTML(item.field_value || "—")}</strong>
        </article>
      `).join("")}</div>`
    : `<p class="muted">Todavía no hay información adicional compartida en esta sección.</p>`;
}

function renderFollowups(items) {
  $("#clientFollowups").innerHTML = items.length
    ? items.map(item => `
        <article class="client-followup">
          <div class="client-followup-date">${escapeHTML(formatDateOnly(item.followup_date))}</div>
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
            ${item.due_date ? `<small>Fecha sugerida: ${escapeHTML(formatDateOnly(item.due_date))}</small>` : ""}
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
      if (button.disabled) return;
      button.disabled = true;
      const oldText = button.textContent;
      button.textContent = "GUARDANDO…";
      try {
        await request("/api/client/exercise-status", {
          method: "POST",
          body: JSON.stringify({
            id: button.dataset.exerciseId,
            status: button.dataset.nextStatus
          })
        });
        await loadClientData();
      } catch (error) {
        button.disabled = false;
        button.textContent = oldText;
        clientToast(error.message,'error');
      }
    });
  });
}

function renderAIState(access) {
  const therapyEligible = !!Number(clientData?.program?.therapy_with_alex);
  $("#clientAITab").hidden = !therapyEligible;
  const canUseAI =
    therapyEligible &&
    !!access.consent_confirmed &&
    !!access.ai_enabled;

  $("#clientAIDisabled").hidden = canUseAI;
  $("#clientAIEnabled").hidden = !canUseAI;

  if (!canUseAI) {
    $("#clientAIDisabled").innerHTML = `
      <strong>${!therapyEligible ? "RAUDAL Reflexión no forma parte de este tipo de proceso." : "RAUDAL Reflexión todavía no está habilitada."}</strong>
      <p>
        ${!access.consent_confirmed
          ? "Primero debe quedar confirmado el consentimiento correspondiente."
          : "Esta herramienta se habilitará cuando forme parte de tu proceso."}
      </p>
    `;
  }
}

async function loadAIUsage() {
  try { renderAIUsage(await request("/api/client/ai-usage")); } catch {}
}
function renderAIUsage(usage) {
  const used=Number(usage.used||0), limit=Number(usage.limit||15), remaining=Math.max(0,limit-used);
  aiMessagesRemaining = remaining;
  const pct=Math.min(100,Math.round((used/Math.max(1,limit))*100));
  $("#aiUsageText").textContent=`${used} de ${limit} mensajes utilizados · ${remaining} disponibles`;
  $("#aiUsageFill").style.width=`${pct}%`;
  const b=$("#clientAISendBtn");
  b.disabled=remaining<=0;
  b.textContent=remaining<=0?"LÍMITE DE HOY ALCANZADO":"ENVIAR";
}

async function loginClient() {
  const button = $("#clientLoginBtn");
  if (button.disabled) return;
  const code = $("#clientAccessCode").value.trim().toUpperCase();

  if (!code) {
    $("#clientLoginStatus").textContent =
      "Escribe tu código de acceso.";
    return;
  }

  $("#clientLoginStatus").textContent = "Validando...";
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "VALIDANDO…";

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
  } finally {
    button.disabled = false;
    button.textContent = oldText;
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

function activateClientTab(button) {
  $$(".client-tab").forEach(item => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$(".client-view").forEach(view => view.classList.remove("active"));
  $(`#client-view-${button.dataset.clientTab}`)?.classList.add("active");
}

$$(".client-tab").forEach(button => {
  button.addEventListener("click", () => activateClientTab(button));
  button.addEventListener("keydown", event => {
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    const tabs = $$(".client-tab").filter(tab => !tab.hidden);
    if (!tabs.length) return;
    event.preventDefault();
    let index = tabs.indexOf(button);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else index = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].focus();
    activateClientTab(tabs[index]);
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
      ? (risk ? "RAUDAL Reflexión · Revisión humana recomendada" : "RAUDAL Reflexión")
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
    if (data.usage) renderAIUsage(data.usage);
  } catch (error) {
    addAIMessage(
      "assistant",
      error.message
    );
  } finally {
    button.disabled = aiMessagesRemaining <= 0;
    button.textContent = aiMessagesRemaining <= 0 ? "LÍMITE DE HOY ALCANZADO" : oldText;
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

;document.querySelectorAll('.status').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');});
