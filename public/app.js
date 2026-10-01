const modal = document.getElementById("bookingModal");
const form = document.getElementById("bookingForm");
const statusBox = document.getElementById("bookingStatus");
const turnstileHelp = document.getElementById("turnstileHelp");
const bookingSubmitBtn = document.getElementById("bookingSubmitBtn");
let lastFocus = null;
let turnstileToken = "";
let turnstileWidgetId = null;
let publicSecurityConfig = null;

function setBookingOpen(open) {
  if (open) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => modal.querySelector("input,select,textarea,button")?.focus(), 0);
  } else {
    modal.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }
}

document.querySelectorAll("[data-open-booking]").forEach(button => button.addEventListener("click", () => setBookingOpen(true)));
document.querySelectorAll("[data-close-booking]").forEach(button => button.addEventListener("click", () => setBookingOpen(false)));
document.addEventListener("keydown", event => {
  if (modal.hidden) return;
  if (event.key === "Escape") { setBookingOpen(false); return; }
  if (event.key !== "Tab") return;
  const focusable=[...modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden && el.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
});

function loadTurnstileScript() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const existing = document.querySelector('script[data-nortia-turnstile]');
    if (existing) { existing.addEventListener('load', resolve, {once:true}); existing.addEventListener('error', reject, {once:true}); return; }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true; script.dataset.nortiaTurnstile = '1';
    script.onload = resolve; script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function initPublicSecurity() {
  try {
    const response = await fetch('/api/security/public-config', {headers:{'accept':'application/json'}});
    publicSecurityConfig = await response.json();
    document.getElementById('privacyVersion').value = publicSecurityConfig.privacy_version || '2.0';

    const wrap = document.getElementById('turnstileWrap');
    const misconfigured = Boolean(publicSecurityConfig.turnstile_misconfigured);
    const enabled = Boolean(publicSecurityConfig.turnstile_enabled && publicSecurityConfig.turnstile_site_key);
    if (misconfigured) {
      if (wrap) wrap.hidden = false;
      bookingSubmitBtn.disabled = true;
      turnstileHelp.textContent = 'La verificación de seguridad está incompleta. Intenta más tarde.';
      return;
    }
    if (!enabled) {
      if (wrap) wrap.hidden = true;
      bookingSubmitBtn.disabled = false;
      return;
    }

    if (wrap) wrap.hidden = false;
    bookingSubmitBtn.disabled = true;
    await loadTurnstileScript();
    turnstileWidgetId = window.turnstile.render('#turnstileWidget', {
      sitekey: publicSecurityConfig.turnstile_site_key,
      callback: token => { turnstileToken = token; bookingSubmitBtn.disabled = false; turnstileHelp.textContent = 'Verificación completada.'; },
      'expired-callback': () => { turnstileToken = ''; bookingSubmitBtn.disabled = true; turnstileHelp.textContent = 'La verificación expiró. Complétala nuevamente.'; },
      'error-callback': () => { turnstileToken = ''; bookingSubmitBtn.disabled = true; turnstileHelp.textContent = 'No fue posible cargar la verificación. Intenta nuevamente.'; }
    });
    turnstileHelp.textContent = 'Completa la verificación antes de enviar.';
  } catch {
    // Si Turnstile no está configurado, el rate limit del servidor sigue protegiendo el formulario.
    bookingSubmitBtn.disabled = false;
    document.getElementById('turnstileWrap')?.setAttribute('hidden', '');
  }
}

const ageInput = document.getElementById('bookingAge');
const guardianBox = document.getElementById('guardianBox');
const preferredDate = document.getElementById('preferredDate');
const todayISO = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if (preferredDate) preferredDate.min = todayISO;

function updateGuardianFields() {
  const age = Number(ageInput?.value || 0);
  const minor = Number.isFinite(age) && age > 0 && age < 18;
  if (guardianBox) guardianBox.hidden = !minor;
  ['guardian_name','guardian_phone','guardian_email'].forEach(name => {
    const field = form.elements[name];
    if (!field) return;
    field.disabled = !minor;
    if (!minor) field.value = '';
  });
  const guardianName = form.elements.guardian_name;
  if (guardianName) guardianName.required = minor;
}
ageInput?.addEventListener('input', updateGuardianFields);
updateGuardianFields();


form.addEventListener("submit", async event => {
  event.preventDefault();
  if (bookingSubmitBtn.dataset.busy === "1") return;
  bookingSubmitBtn.dataset.busy = "1";
  const originalSubmitText = bookingSubmitBtn.textContent;
  bookingSubmitBtn.disabled = true;
  bookingSubmitBtn.textContent = "ENVIANDO…";
  statusBox.style.color = "";
  statusBox.textContent = "Enviando...";
  const payload = Object.fromEntries(new FormData(form).entries());
  const age = payload.age === "" ? null : Number(payload.age);
  const minor = Number.isFinite(age) && age < 18;
  const clientContact = String(payload.client_email || "").trim() || String(payload.client_phone || "").trim();
  const guardianContact = String(payload.guardian_email || "").trim() || String(payload.guardian_phone || "").trim();
  if (minor && !guardianContact) {
    statusBox.textContent = "Para una persona menor de edad agrega correo o teléfono del padre, madre o tutor.";
    bookingSubmitBtn.dataset.busy = ""; bookingSubmitBtn.disabled = false; bookingSubmitBtn.textContent = originalSubmitText;
    return;
  }
  if (!minor && !clientContact) {
    statusBox.textContent = "Agrega un correo o teléfono para poder confirmar la sesión.";
    bookingSubmitBtn.dataset.busy = ""; bookingSubmitBtn.disabled = false; bookingSubmitBtn.textContent = originalSubmitText;
    return;
  }
  if (payload.preferred_date && payload.preferred_date < todayISO) {
    statusBox.textContent = "Selecciona una fecha de hoy en adelante.";
    bookingSubmitBtn.dataset.busy = ""; bookingSubmitBtn.disabled = false; bookingSubmitBtn.textContent = originalSubmitText;
    return;
  }
  payload.turnstile_token = turnstileToken;
  try {
    const response = await fetch("/api/appointments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo enviar la solicitud.");
    form.reset(); updateGuardianFields(); turnstileToken = "";
    const turnstileEnabled = Boolean(publicSecurityConfig?.turnstile_enabled && publicSecurityConfig?.turnstile_site_key);
    bookingSubmitBtn.disabled = turnstileEnabled;
    if (window.turnstile && turnstileWidgetId != null) window.turnstile.reset(turnstileWidgetId);
    statusBox.style.color = "#96efb0";
    statusBox.textContent = "Solicitud enviada. Alex confirmará el horario.";
  } catch (error) {
    statusBox.style.color = "#ffb4b4";
    statusBox.textContent = error.message;
  } finally {
    bookingSubmitBtn.dataset.busy = "";
    bookingSubmitBtn.textContent = originalSubmitText;
    bookingSubmitBtn.disabled = Boolean(publicSecurityConfig?.turnstile_enabled && publicSecurityConfig?.turnstile_site_key) && !turnstileToken;
  }
});

document.querySelectorAll('.status').forEach(el => { el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); });
initPublicSecurity();
