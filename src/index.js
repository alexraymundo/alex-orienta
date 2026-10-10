
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function safeText(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

async function parseBody(req) {
  try { return await req.json(); } catch { return {}; }
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a || ""));
  const right = encoder.encode(String(b || ""));
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

async function createSessionToken(env) {
  const expiresAt = String(Date.now() + 8 * 60 * 60 * 1000);
  return `${expiresAt}.${await hmac(env.SESSION_SECRET, expiresAt)}`;
}

async function hasValidAdminSession(req, env) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)alex_orienta_session=([^;]+)/);
  if (!match) return false;
  const [expiresAt, signature] = match[1].split(".");
  if (!expiresAt || !signature || Number(expiresAt) <= Date.now()) return false;
  const expected = await hmac(env.SESSION_SECRET, expiresAt);
  return constantTimeEqual(signature, expected);
}

async function requireAdmin(req, env) {
  const ok = await hasValidAdminSession(req, env);
  return ok ? null : json({ error: "No autorizado" }, 401);
}

function highRiskLanguage(text) {
  const value = String(text || "").toLowerCase();
  return [
    "me quiero matar", "quiero morir", "no quiero vivir",
    "hacerme daño", "lastimarme", "matarme", "suicid", "autoles"
  ].some(p => value.includes(p));
}

function extractAIText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;
  if (typeof result.result === "string") return result.result;
  if (result.result && typeof result.result.response === "string") return result.result.response;
  if (Array.isArray(result.choices) && result.choices[0]?.message?.content) {
    const content = result.choices[0].message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map(x => x?.text || x?.content || "").join("\n").trim();
    }
  }
  if (Array.isArray(result.output_text)) return result.output_text.join("\n").trim();
  return "";
}

function repairJsonStringNewlines(value) {
  const source = String(value || "");
  let out = "", inString = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function parseAIJsonObject(text) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Sin objeto JSON utilizable.");
  const candidate = raw.slice(start, end + 1);
  const attempts = [
    candidate,
    repairJsonStringNewlines(candidate),
    repairJsonStringNewlines(candidate).replace(/,\s*([}\]])/g, "$1")
  ];
  for (const attempt of attempts) {
    try { return JSON.parse(attempt); } catch {}
  }
  throw new Error("JSON no interpretable.");
}

function continuityDraftFromAIText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("La IA respondió sin contenido.");

  try {
    const parsed = parseAIJsonObject(raw);
    const normalize = value => Array.isArray(value) ? value.map(x => safeText(x, 1000)).filter(Boolean).join("\n") : safeText(value, 5000);
    return {
      general_description: normalize(parsed.general_description),
      strengths: normalize(parsed.strengths),
      support_needs: normalize(parsed.support_needs),
      strategies: normalize(parsed.strategies),
      watch_items: normalize(parsed.watch_items)
    };
  } catch {}

  const tags = ["general_description", "strengths", "support_needs", "strategies", "watch_items"];
  const result = {};
  for (const tag of tags) {
    const match = raw.match(new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, "i"));
    result[tag] = safeText(match?.[1] || "", 5000);
  }
  if (Object.values(result).some(Boolean)) return result;

  const aliases = {
    general_description: ["GENERAL", "DESCRIPCIÓN GENERAL", "DESCRIPCION GENERAL"],
    strengths: ["STRENGTHS", "FORTALEZAS"],
    support_needs: ["SUPPORT", "APOYO", "ÁREAS DE APOYO", "AREAS DE APOYO"],
    strategies: ["STRATEGIES", "ESTRATEGIAS", "RECOMENDACIONES"],
    watch_items: ["WATCH", "OBSERVAR", "ASPECTOS A OBSERVAR"]
  };
  const lines = raw.split(/\r?\n/);
  let current = null;
  const buckets = Object.fromEntries(tags.map(k => [k, []]));
  for (const line of lines) {
    const trimmed = line.trim();
    let matchedKey = null;
    for (const [key, names] of Object.entries(aliases)) {
      if (names.some(name => trimmed.toLocaleUpperCase("es-MX").startsWith(name + ":"))) { matchedKey = key; break; }
    }
    if (matchedKey) {
      current = matchedKey;
      const after = trimmed.slice(trimmed.indexOf(":") + 1).trim();
      if (after) buckets[current].push(after);
    } else if (current && trimmed) {
      buckets[current].push(trimmed.replace(/^[-•]\s*/, ""));
    }
  }
  const labeled = Object.fromEntries(tags.map(k => [k, safeText(buckets[k].join("\n"), 5000)]));
  if (Object.values(labeled).some(Boolean)) return labeled;

  throw new Error("La IA no devolvió secciones utilizables.");
}


async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(String(value))
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}


async function ensureSecurityTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS security_login_attempts (
      attempt_key TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at TEXT NOT NULL,
      blocked_until TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
}

async function loginAttemptKey(req, scope) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const ua = safeText(req.headers.get("user-agent") || "unknown", 180);
  return sha256(`${scope}|${ip}|${ua}`);
}

async function loginRateState(req, env, scope) {
  await ensureSecurityTables(env);
  const key = await loginAttemptKey(req, scope);
  const row = await env.DB.prepare(`
    SELECT fail_count, first_failed_at, blocked_until, updated_at
    FROM security_login_attempts
    WHERE attempt_key=?
  `).bind(key).first();

  if (!row) return { allowed: true, key, remaining: 7 };

  const now = Date.now();
  const blockedUntil = row.blocked_until ? Date.parse(row.blocked_until) : 0;
  if (blockedUntil && blockedUntil > now) {
    return {
      allowed: false,
      key,
      retry_after_seconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000))
    };
  }

  const updatedAt = Date.parse(row.updated_at || row.first_failed_at || 0);
  if (!updatedAt || now - updatedAt > 15 * 60 * 1000) {
    await env.DB.prepare(`DELETE FROM security_login_attempts WHERE attempt_key=?`).bind(key).run();
    return { allowed: true, key, remaining: 7 };
  }

  return { allowed: true, key, remaining: Math.max(0, 7 - Number(row.fail_count || 0)) };
}

async function recordLoginFailure(req, env, scope) {
  await ensureSecurityTables(env);
  const key = await loginAttemptKey(req, scope);
  const now = nowISO();
  const existing = await env.DB.prepare(`
    SELECT fail_count, updated_at
    FROM security_login_attempts
    WHERE attempt_key=?
  `).bind(key).first();

  let count = 1;
  if (existing) {
    const updatedAt = Date.parse(existing.updated_at || 0);
    count = (updatedAt && Date.now() - updatedAt <= 15 * 60 * 1000)
      ? Number(existing.fail_count || 0) + 1
      : 1;
  }

  const blockedUntil = count >= 7
    ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
    : null;

  await env.DB.prepare(`
    INSERT INTO security_login_attempts (
      attempt_key, scope, fail_count, first_failed_at, blocked_until, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      scope=excluded.scope,
      fail_count=excluded.fail_count,
      blocked_until=excluded.blocked_until,
      updated_at=excluded.updated_at
  `).bind(key, scope, count, now, blockedUntil, now).run();

  await env.DB.prepare(`DELETE FROM security_login_attempts WHERE datetime(updated_at) < datetime('now','-2 days')`).run();
  return { count, blocked_until: blockedUntil };
}

async function clearLoginFailures(req, env, scope) {
  await ensureSecurityTables(env);
  const key = await loginAttemptKey(req, scope);
  await env.DB.prepare(`DELETE FROM security_login_attempts WHERE attempt_key=?`).bind(key).run();
}

async function enforceLoginRateLimit(req, env, scope) {
  const state = await loginRateState(req, env, scope);
  if (state.allowed) return null;
  return json(
    { error: "Demasiados intentos. Espera unos minutos antes de volver a intentar." },
    429,
    { "retry-after": String(state.retry_after_seconds || 900) }
  );
}

function isCrossSiteMutation(req, url) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(req.method)) return false;
  const fetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return true;
  return false;
}

function addSecurityHeaders(response, isApi = false) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
  );
  if (isApi) headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  let code = "";
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }

  return `NT-${code.slice(0, 4)}-${code.slice(4)}`;
}

async function createClientSession(env, personId) {
  const expiresAt = String(Date.now() + 12 * 60 * 60 * 1000);
  const payload = `${personId}.${expiresAt}`;
  const signature = await hmac(env.SESSION_SECRET, payload);
  return `${payload}.${signature}`;
}

async function getClientSession(req, env) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)alex_orienta_client=([^;]+)/);

  if (!match) return null;

  const parts = match[1].split(".");
  if (parts.length !== 3) return null;

  const [personId, expiresAt, signature] = parts;
  if (!personId || !expiresAt || !signature) return null;
  if (Number(expiresAt) <= Date.now()) return null;

  const payload = `${personId}.${expiresAt}`;
  const expected = await hmac(env.SESSION_SECRET, payload);

  if (!constantTimeEqual(signature, expected)) return null;

  return { personId, expiresAt: Number(expiresAt) };
}

async function requireClient(req, env) {
  const session = await getClientSession(req, env);
  return session
    ? { session, response: null }
    : { session: null, response: json({ error: "Acceso requerido" }, 401) };
}

function clientCookie(token) {
  return `alex_orienta_client=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`;
}

function clearClientCookie() {
  return "alex_orienta_client=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";
}

async function getClientVisibleData(env, personId) {
  const person = await env.DB.prepare(`
    SELECT id, full_name, age, email, phone, is_minor
    FROM people
    WHERE id=?
  `).bind(personId).first();

  if (!person) return null;

  const access = await env.DB.prepare(`
    SELECT active, consent_confirmed, ai_enabled, last_login_at
    FROM client_access
    WHERE person_id=?
  `).bind(personId).first();

  const vocational = await env.DB.prepare(`
    SELECT
      interests,
      strengths,
      values_text,
      favorite_subjects,
      work_style,
      careers_considered,
      open_questions
    FROM vocational_profiles
    WHERE person_id=?
  `).bind(personId).first();

  const { results: followups } = await env.DB.prepare(`
    SELECT id, followup_date, title, shared_summary, agreements, next_steps
    FROM followups
    WHERE person_id=?
      AND (
        COALESCE(shared_summary, '') <> ''
        OR COALESCE(agreements, '') <> ''
        OR COALESCE(next_steps, '') <> ''
      )
    ORDER BY followup_date DESC, created_at DESC
  `).bind(personId).all();

  const { results: customFields } = await env.DB.prepare(`
    SELECT id, field_name, field_value, visibility
    FROM custom_fields
    WHERE person_id=?
      AND visibility IN ('shared','shared_ai')
    ORDER BY created_at ASC
  `).bind(personId).all();

  const { results: exercises } = await env.DB.prepare(`
    SELECT id, title, description, due_date, status
    FROM exercises
    WHERE person_id=? AND shared=1
    ORDER BY
      CASE status WHEN 'pending' THEN 0 ELSE 1 END,
      COALESCE(due_date, '9999-12-31'),
      created_at DESC
  `).bind(personId).all();

  const nextAppointment = await env.DB.prepare(`
    SELECT preferred_date, preferred_time, service_type, status
    FROM appointments
    WHERE person_id = ?
      AND status='confirmed'
      AND preferred_date >= date('now')
    ORDER BY preferred_date ASC, preferred_time ASC
    LIMIT 1
  `).bind(personId).first();

  const program = await getPersonProgram(env, personId);

  return {
    person,
    access,
    program,
    vocational: vocational || {},
    followups: followups || [],
    custom_fields: customFields || [],
    exercises: exercises || [],
    next_appointment: nextAppointment || null
  };
}

async function getAIContextForClient(env, personId) {
  const person = await env.DB.prepare(`
    SELECT full_name, age
    FROM people
    WHERE id=?
  `).bind(personId).first();

  const vocational = await env.DB.prepare(`
    SELECT *
    FROM vocational_profiles
    WHERE person_id=?
  `).bind(personId).first();

  const { results: fields } = await env.DB.prepare(`
    SELECT field_name, field_value
    FROM custom_fields
    WHERE person_id=?
      AND visibility IN ('ai','shared_ai')
    ORDER BY created_at ASC
  `).bind(personId).all();

  const { results: followups } = await env.DB.prepare(`
    SELECT followup_date, title, shared_summary, agreements, next_steps
    FROM followups
    WHERE person_id=?
      AND (
        COALESCE(shared_summary, '') <> ''
        OR COALESCE(agreements, '') <> ''
        OR COALESCE(next_steps, '') <> ''
      )
    ORDER BY followup_date DESC
    LIMIT 5
  `).bind(personId).all();

  const { results: recentMessages } = await env.DB.prepare(`
    SELECT role, content
    FROM client_ai_messages
    WHERE person_id=? AND risk_flag=0
    ORDER BY created_at DESC
    LIMIT 8
  `).bind(personId).all();

  return {
    person,
    vocational: vocational || {},
    fields: fields || [],
    followups: followups || [],
    recent_messages: (recentMessages || []).reverse()
  };
}

function nortiaLocalDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isValidDateOnly(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y,m,d] = text.split("-").map(Number);
  const test = new Date(Date.UTC(y, m - 1, d));
  return test.getUTCFullYear() === y && test.getUTCMonth() === m - 1 && test.getUTCDate() === d;
}

function isValidTimeOnly(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function isReasonableEmail(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 160;
}


async function ensureAIUsageTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS ai_daily_usage (
      person_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      used_count INTEGER NOT NULL DEFAULT 0,
      extra_messages INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(person_id, usage_date),
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ai_daily_usage_date
    ON ai_daily_usage(usage_date)
  `).run();
}

async function getAIUsage(env, personId) {
  await ensureAIUsageTable(env);
  const usageDate = nortiaLocalDate();
  const row = await env.DB.prepare(`SELECT used_count, extra_messages FROM ai_daily_usage WHERE person_id=? AND usage_date=?`).bind(personId, usageDate).first();
  const used = Number(row?.used_count || 0);
  const extra = Number(row?.extra_messages || 0);
  const limit = 15 + extra;
  return { usage_date: usageDate, used, extra, limit, remaining: Math.max(0, limit-used) };
}

async function incrementAIUsage(env, personId) {
  await ensureAIUsageTable(env);
  const usageDate=nortiaLocalDate(), now=nowISO();
  await env.DB.prepare(`INSERT INTO ai_daily_usage (person_id,usage_date,used_count,extra_messages,updated_at) VALUES (?,?,1,0,?) ON CONFLICT(person_id,usage_date) DO UPDATE SET used_count=ai_daily_usage.used_count+1, updated_at=excluded.updated_at`).bind(personId,usageDate,now).run();
  return getAIUsage(env,personId);
}


const ALEX_NOTIFICATION_EMAIL = "alex_raymundo@hotmail.com";

function escapeEmailHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function ensureNotificationsTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      person_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      is_read INTEGER NOT NULL DEFAULT 0,
      email_status TEXT NOT NULL DEFAULT 'pending',
      email_error TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
    )
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications(created_at DESC)
  `).run();

  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications(is_read, created_at DESC)
  `).run();
}

async function sendAlexEmail(env, subject, text, html = "") {
  if (!env.RESEND_API_KEY) {
    return {
      ok: false,
      status: "not_configured",
      error: "Falta configurar RESEND_API_KEY en Cloudflare Secrets."
    };
  }

  const from =
    safeText(env.RESEND_FROM_EMAIL, 240) ||
    "RAUDAL <onboarding@resend.dev>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [ALEX_NOTIFICATION_EMAIL],
        subject: safeText(subject, 250),
        text: safeText(text, 12000),
        html: html || undefined
      })
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {}

    if (!response.ok) {
      return {
        ok: false,
        status: "error",
        error: safeText(
          data?.message ||
          data?.error?.message ||
          raw ||
          `HTTP ${response.status}`,
          800
        )
      };
    }

    return {
      ok: true,
      status: "sent",
      id: data?.id || null
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      error: safeText(error?.message || error, 800)
    };
  }
}

async function createNotification(env, {
  type,
  personId = null,
  title,
  message,
  priority = "normal",
  emailSubject = "",
  emailText = "",
  emailHTML = ""
}) {
  await ensureNotificationsTable(env);

  const id = makeId("notify");
  const now = nowISO();

  await env.DB.prepare(`
    INSERT INTO notifications (
      id, type, person_id, title, message, priority,
      is_read, email_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?)
  `).bind(
    id,
    safeText(type, 60),
    personId || null,
    safeText(title, 220),
    safeText(message, 3000),
    safeText(priority, 30) || "normal",
    now
  ).run();

  const emailResult = await sendAlexEmail(
    env,
    emailSubject || `RAUDAL · ${title}`,
    `Hay una nueva actividad en RAUDAL que requiere tu atención.\n\nTipo: ${safeText(type, 60)}\n\nIngresa al Panel Profesional para revisar los detalles.`,
    ""
  );

  await env.DB.prepare(`
    UPDATE notifications
    SET email_status=?, email_error=?
    WHERE id=?
  `).bind(
    emailResult.status,
    emailResult.error || null,
    id
  ).run();

  return {
    id,
    email: emailResult
  };
}


const TEACHER_AGREEMENT_VERSION = "2.0";
const FAMILY_AGREEMENT_VERSION = "2.0";
const COORDINATOR_AGREEMENT_VERSION = "1.0";
const PUBLIC_PRIVACY_VERSION = "2.0";
const AI_CONSENT_VERSION = "2.0";

let v82SchemaPromise = null;
async function ensureColumn(env, tableName, columnName, definition) {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!(results || []).some(row => row.name === columnName)) {
    await env.DB.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

async function ensureV82Tables(env) {
  if (v82SchemaPromise) return v82SchemaPromise;
  v82SchemaPromise = (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS school_continuity_drafts (
      person_id TEXT PRIMARY KEY,
      general_description TEXT,
      strengths TEXT,
      support_needs TEXT,
      strategies TEXT,
      watch_items TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS security_action_limits (
      action_key TEXT PRIMARY KEY,
      action_scope TEXT NOT NULL,
      window_started_at TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`).run();
    await ensureColumn(env, 'appointments', 'person_id', 'TEXT');
    await ensureColumn(env, 'appointments', 'privacy_consent_version', 'TEXT');
    await ensureColumn(env, 'appointments', 'privacy_accepted_at', 'TEXT');
    await ensureColumn(env, 'client_access', 'consent_version', 'TEXT');
    await ensureColumn(env, 'client_access', 'consent_confirmed_at', 'TEXT');
    await ensureColumn(env, 'client_access', 'consent_confirmed_by', 'TEXT');
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_appointments_person_v82 ON appointments(person_id)`).run();
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_continuity_drafts_updated_v82 ON school_continuity_drafts(updated_at)`).run();
  })();
  try {
    return await v82SchemaPromise;
  } catch (error) {
    v82SchemaPromise = null;
    throw error;
  }
}

async function enforceActionRateLimit(req, env, scope, limit = 6, windowSeconds = 1800) {
  await ensureV82Tables(env);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await sha256(`${scope}|${ip}`);
  const now = Date.now();
  const row = await env.DB.prepare(`SELECT window_started_at,request_count FROM security_action_limits WHERE action_key=?`).bind(key).first();
  let started = row?.window_started_at ? Date.parse(row.window_started_at) : 0;
  let count = Number(row?.request_count || 0);
  if (!started || now - started >= windowSeconds * 1000) {
    started = now;
    count = 0;
  }
  if (count >= limit) {
    const retry = Math.max(1, Math.ceil((started + windowSeconds * 1000 - now) / 1000));
    return json({ error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' }, 429, { 'retry-after': String(retry) });
  }
  count += 1;
  const iso = new Date(started).toISOString();
  await env.DB.prepare(`INSERT INTO security_action_limits (action_key,action_scope,window_started_at,request_count,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(action_key) DO UPDATE SET action_scope=excluded.action_scope,window_started_at=excluded.window_started_at,request_count=excluded.request_count,updated_at=excluded.updated_at`)
    .bind(key, scope, iso, count, nowISO()).run();
  await env.DB.prepare(`DELETE FROM security_action_limits WHERE datetime(updated_at) < datetime('now','-2 days')`).run();
  return null;
}

async function verifyTurnstile(req, env, token) {
  const hasSecret = Boolean(env.TURNSTILE_SECRET_KEY);
  const hasSite = Boolean(env.TURNSTILE_SITE_KEY);
  if (!hasSecret && !hasSite) return { ok: true, skipped: true };
  if (hasSecret !== hasSite) return { ok: false, configuration_error: true, error: 'La verificación anti-bot está configurada de forma incompleta.' };
  if (!token) return { ok: false, error: 'Completa la verificación de seguridad.' };
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await response.json();
    return data?.success ? { ok: true } : { ok: false, error: 'No fue posible validar la verificación de seguridad.' };
  } catch {
    return { ok: false, error: 'No fue posible validar la verificación de seguridad.' };
  }
}


let schoolModuleSchemaPromise = null;
async function ensureSchoolModuleTables(env) {
  if (schoolModuleSchemaPromise) return schoolModuleSchemaPromise;
  schoolModuleSchemaPromise = (async () => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS person_programs (person_id TEXT PRIMARY KEY, therapy_with_alex INTEGER NOT NULL DEFAULT 0, school_followup INTEGER NOT NULL DEFAULT 0, school_name TEXT, grade_level TEXT, school_year TEXT, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT, school_name TEXT, access_hash TEXT NOT NULL, access_hint TEXT, active INTEGER NOT NULL DEFAULT 1, agreement_version TEXT NOT NULL DEFAULT '1.0', agreement_accepted_at TEXT, agreement_signed_name TEXT, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS coordinators (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT, school_name TEXT NOT NULL DEFAULT 'CIDEB', access_hash TEXT NOT NULL, access_hint TEXT, active INTEGER NOT NULL DEFAULT 1, agreement_version TEXT NOT NULL DEFAULT '1.0', agreement_accepted_at TEXT, agreement_signed_name TEXT, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS teacher_assignments (teacher_id TEXT NOT NULL, person_id TEXT NOT NULL, school_year TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, PRIMARY KEY(teacher_id, person_id, school_year), FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS teacher_observations (id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, person_id TEXT NOT NULL, observation_date TEXT NOT NULL, subject TEXT, context TEXT, attention_support INTEGER, instructions_support INTEGER, organization_support INTEGER, peer_support INTEGER, frustration_support INTEGER, transitions_support INTEGER, autonomy_support INTEGER, help_seeking_support INTEGER, description TEXT NOT NULL, antecedent TEXT, strategy_used TEXT, result_text TEXT, additional_comments TEXT, status TEXT NOT NULL DEFAULT 'submitted', included_in_record INTEGER NOT NULL DEFAULT 0, private_note TEXT, professional_comment TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS professional_school_observations (id TEXT PRIMARY KEY, person_id TEXT NOT NULL, observation_date TEXT NOT NULL, subject TEXT, context TEXT, attention_support INTEGER, instructions_support INTEGER, organization_support INTEGER, peer_support INTEGER, frustration_support INTEGER, transitions_support INTEGER, autonomy_support INTEGER, help_seeking_support INTEGER, description TEXT NOT NULL, strategy_used TEXT, recommendation_text TEXT, visible_to_teachers INTEGER NOT NULL DEFAULT 0, published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS school_continuity (person_id TEXT PRIMARY KEY, general_description TEXT, strengths TEXT, support_needs TEXT, strategies TEXT, watch_items TEXT, approved_at TEXT, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS guardians (id TEXT PRIMARY KEY, person_id TEXT NOT NULL, full_name TEXT NOT NULL, relationship TEXT, email TEXT, access_hash TEXT NOT NULL, access_hint TEXT, active INTEGER NOT NULL DEFAULT 1, agreement_version TEXT NOT NULL DEFAULT '1.0', agreement_accepted_at TEXT, agreement_signed_name TEXT, last_login_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS family_profiles (person_id TEXT PRIMARY KEY, summary TEXT, strengths TEXT, current_goals TEXT, recommendations_home TEXT, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS family_observations (id TEXT PRIMARY KEY, guardian_id TEXT NOT NULL, person_id TEXT NOT NULL, observation_date TEXT NOT NULL, context TEXT, observation_text TEXT NOT NULL, what_helped TEXT, questions TEXT, status TEXT NOT NULL DEFAULT 'submitted', private_note TEXT, professional_comment TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(guardian_id) REFERENCES guardians(id) ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS teacher_transfers (id TEXT PRIMARY KEY, person_id TEXT NOT NULL, from_teacher_id TEXT, to_teacher_id TEXT NOT NULL, transfer_date TEXT NOT NULL, school_period TEXT, general_description TEXT, strengths TEXT, support_needs TEXT, strategies TEXT, watch_items TEXT, transfer_note TEXT, created_by_role TEXT NOT NULL, created_by_id TEXT, created_at TEXT NOT NULL, undone_at TEXT, undone_by_role TEXT, undone_by_id TEXT, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE, FOREIGN KEY(from_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL, FOREIGN KEY(to_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_teacher_transfers_person ON teacher_transfers(person_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_teacher_transfers_to_teacher ON teacher_transfers(to_teacher_id, person_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, actor_role TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL, person_id TEXT, detail TEXT, created_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL)`
  ];
  for (const sql of statements) await env.DB.prepare(sql).run();
  // Notas internas separadas de cualquier respuesta visible para docentes o familias.
  await ensureColumn(env, "teachers", "archived_at", "TEXT");
  await ensureColumn(env, "teacher_observations", "private_note", "TEXT");
  await ensureColumn(env, "teacher_observations", "included_in_record", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "family_observations", "private_note", "TEXT");
  })();
  try {
    return await schoolModuleSchemaPromise;
  } catch (error) {
    schoolModuleSchemaPromise = null;
    throw error;
  }
}


async function ensureDataManagementTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS person_data_context (person_id TEXT PRIMARY KEY, context_type TEXT NOT NULL DEFAULT 'private', institution_name TEXT, archive_reason TEXT, archived_at TEXT, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_person_data_context_type ON person_data_context(context_type, institution_name)`).run();
}

async function ensureCidebDirectoryTables(env) {
  await ensureSchoolModuleTables(env);
  await ensureDataManagementTables(env);

  const statements = [
    `CREATE TABLE IF NOT EXISTS school_enrollments (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      institution_name TEXT NOT NULL DEFAULT 'CIDEB',
      student_number TEXT,
      grade_level TEXT,
      group_name TEXT,
      school_year TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      is_current INTEGER NOT NULL DEFAULT 1,
      needs_review INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_school_enrollments_person ON school_enrollments(person_id, is_current)`,
    `CREATE INDEX IF NOT EXISTS idx_school_enrollments_directory ON school_enrollments(institution_name, school_year, grade_level, group_name, status)`,
    `CREATE INDEX IF NOT EXISTS idx_school_enrollments_student_number ON school_enrollments(institution_name, student_number)`,
    `CREATE TABLE IF NOT EXISTS school_continuity_versions (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      general_description TEXT,
      strengths TEXT,
      support_needs TEXT,
      strategies TEXT,
      watch_items TEXT,
      published_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_school_continuity_versions_unique ON school_continuity_versions(person_id, version_number)`,
    `CREATE TABLE IF NOT EXISTS school_continuity_drafts (person_id TEXT PRIMARY KEY, general_description TEXT, strengths TEXT, support_needs TEXT, strategies TEXT, watch_items TEXT, updated_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE)`
  ];

  for (const sql of statements) await env.DB.prepare(sql).run();

  const now = nowISO();
  await env.DB.prepare(`
    INSERT INTO school_enrollments (
      id, person_id, institution_name, student_number,
      grade_level, group_name, school_year, status,
      is_current, needs_review, created_at, updated_at
    )
    SELECT
      'legacy_' || p.id,
      p.id,
      CASE
        WHEN COALESCE(pp.school_name,'') <> '' THEN pp.school_name
        WHEN COALESCE(dc.institution_name,'') <> '' THEN dc.institution_name
        ELSE 'CIDEB'
      END,
      NULL,
      COALESCE(pp.grade_level,''),
      '',
      COALESCE(pp.school_year,''),
      CASE WHEN p.status='archived' THEN 'archived' ELSE 'active' END,
      1,
      0,
      ?,
      ?
    FROM people p
    JOIN person_programs pp ON pp.person_id=p.id
    LEFT JOIN person_data_context dc ON dc.person_id=p.id
    WHERE COALESCE(pp.school_followup,0)=1
      AND (
        LOWER(COALESCE(pp.school_name,'')) LIKE '%cideb%'
        OR LOWER(COALESCE(dc.institution_name,'')) LIKE '%cideb%'
        OR COALESCE(dc.context_type,'') IN ('cideb','mixed')
      )
      AND NOT EXISTS (
        SELECT 1 FROM school_enrollments se
        WHERE se.person_id=p.id AND se.is_current=1
      )
  `).bind(now, now).run();
}

function cleanSchoolValue(value, max = 120) {
  return safeText(value, max).replace(/\\s+/g, ' ').trim();
}

function normalizeStudentNumber(value) {
  return cleanSchoolValue(value, 80).toLocaleUpperCase('es-MX');
}

async function currentEnrollment(env, personId) {
  await ensureCidebDirectoryTables(env);
  return env.DB.prepare(`
    SELECT * FROM school_enrollments
    WHERE person_id=? AND is_current=1
    ORDER BY updated_at DESC LIMIT 1
  `).bind(personId).first();
}

async function cidebStudentNumberExists(env, studentNumber, excludePersonId = '') {
  const number = normalizeStudentNumber(studentNumber);
  if (!number) return null;
  const sql = excludePersonId
    ? `SELECT se.person_id, p.full_name FROM school_enrollments se JOIN people p ON p.id=se.person_id WHERE UPPER(TRIM(COALESCE(se.student_number,'')))=? AND LOWER(COALESCE(se.institution_name,'')) LIKE '%cideb%' AND se.person_id<>? LIMIT 1`
    : `SELECT se.person_id, p.full_name FROM school_enrollments se JOIN people p ON p.id=se.person_id WHERE UPPER(TRIM(COALESCE(se.student_number,'')))=? AND LOWER(COALESCE(se.institution_name,'')) LIKE '%cideb%' LIMIT 1`;
  return excludePersonId
    ? env.DB.prepare(sql).bind(number, excludePersonId).first()
    : env.DB.prepare(sql).bind(number).first();
}

async function getPersonDataContext(env, personId) {
  await ensureDataManagementTables(env);
  const row=await env.DB.prepare(`SELECT * FROM person_data_context WHERE person_id=?`).bind(personId).first();
  return row||{person_id:personId,context_type:'private',institution_name:'',archive_reason:'',archived_at:null};
}
function normalizeConfirmation(value){return safeText(value,300).replace(/\s+/g,' ').trim().toLocaleUpperCase('es-MX');}
async function getInstitutionPeople(env,institution='CIDEB'){
  await ensureSchoolModuleTables(env); await ensureDataManagementTables(env);
  const needle=`%${String(institution||'CIDEB').toLowerCase()}%`;
  const {results}=await env.DB.prepare(`SELECT p.id,p.full_name,p.status,COALESCE(pp.therapy_with_alex,0) AS therapy_with_alex,COALESCE(pp.school_followup,0) AS school_followup,COALESCE(pp.school_name,'') AS school_name,COALESCE(dc.context_type,'private') AS context_type,COALESCE(dc.institution_name,'') AS institution_name FROM people p LEFT JOIN person_programs pp ON pp.person_id=p.id LEFT JOIN person_data_context dc ON dc.person_id=p.id WHERE LOWER(COALESCE(pp.school_name,'')) LIKE ? OR LOWER(COALESCE(dc.institution_name,'')) LIKE ? OR COALESCE(dc.context_type,'') IN ('cideb','mixed') ORDER BY p.full_name`).bind(needle,needle).all();
  return results||[];
}
async function institutionPreview(env,institution='CIDEB'){
  const people=await getInstitutionPeople(env,institution),ids=people.map(x=>x.id),needle=`%${String(institution).toLowerCase()}%`;
  const tr=await env.DB.prepare(`SELECT COUNT(*) AS count FROM teachers WHERE LOWER(COALESCE(school_name,'')) LIKE ? AND active=1`).bind(needle).first();
  if(!ids.length){const cr=await env.DB.prepare(`SELECT COUNT(*) AS count FROM coordinators WHERE LOWER(COALESCE(school_name,'')) LIKE ? AND active=1`).bind(needle).first();return{institution,people:0,school_only:0,private_therapy_preserved:0,active_teachers:Number(tr?.count||0),active_coordinators:Number(cr?.count||0),teacher_assignments:0,teacher_observations:0,continuity_records:0,family_accesses:0};}
  const marks=ids.map(()=>'?').join(',');
  const [a,o,c,f]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM teacher_assignments WHERE person_id IN (${marks}) AND active=1`).bind(...ids).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM teacher_observations WHERE person_id IN (${marks})`).bind(...ids).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM school_continuity WHERE person_id IN (${marks}) AND approved_at IS NOT NULL`).bind(...ids).first(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM guardians WHERE person_id IN (${marks}) AND active=1`).bind(...ids).first()
  ]);
  const cr=await env.DB.prepare(`SELECT COUNT(*) AS count FROM coordinators WHERE LOWER(COALESCE(school_name,'')) LIKE ? AND active=1`).bind(needle).first();
  return{institution,people:people.length,school_only:people.filter(x=>!Number(x.therapy_with_alex)).length,private_therapy_preserved:people.filter(x=>Number(x.therapy_with_alex)).length,active_teachers:Number(tr?.count||0),active_coordinators:Number(cr?.count||0),teacher_assignments:Number(a?.count||0),teacher_observations:Number(o?.count||0),continuity_records:Number(c?.count||0),family_accesses:Number(f?.count||0)};
}
function generateRoleAccessCode(prefix) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `NT-${prefix}-${code.slice(0,4)}-${code.slice(4)}`;
}

async function createSignedRoleSession(env, role, actorId) {
  const expiresAt = String(Date.now() + 12 * 60 * 60 * 1000);
  const payload = `${role}.${actorId}.${expiresAt}`;
  const signature = await hmac(env.SESSION_SECRET, payload);
  return `${actorId}.${expiresAt}.${signature}`;
}

function roleCookieName(role) {
  return ({ teacher: "nortia_teacher", family: "nortia_family", coordinator: "nortia_coordinator" })[role] || "";
}

async function getSignedRoleSession(req, env, role) {
  const cookieName = roleCookieName(role);
  if (!cookieName) return null;
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\s*)${cookieName}=([^;]+)`));
  if (!match) return null;
  const [actorId, expiresAt, signature] = match[1].split(".");
  if (!actorId || !expiresAt || !signature || Number(expiresAt) <= Date.now()) return null;
  const expected = await hmac(env.SESSION_SECRET, `${role}.${actorId}.${expiresAt}`);
  if (!constantTimeEqual(signature, expected)) return null;
  return { actorId, expiresAt: Number(expiresAt) };
}

function roleCookie(role, token) {
  const name = roleCookieName(role);
  return `${name}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`;
}

function clearRoleCookie(role) {
  const name = roleCookieName(role);
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

async function logAudit(env, actorRole, actorId, action, personId = null, detail = "") {
  await ensureSchoolModuleTables(env);
  await env.DB.prepare(`INSERT INTO audit_log (id, actor_role, actor_id, action, person_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(makeId("audit"), actorRole, actorId || null, action, personId || null, safeText(detail, 1000), nowISO()).run();
}

async function getPersonProgram(env, personId) {
  await ensureSchoolModuleTables(env);
  const row = await env.DB.prepare(`SELECT * FROM person_programs WHERE person_id=?`).bind(personId).first();
  return row || { person_id: personId, therapy_with_alex: 0, school_followup: 0, school_name: "", grade_level: "", school_year: "" };
}

async function assertTherapyAI(env, personId) {
  const program = await getPersonProgram(env, personId);
  return !!program.therapy_with_alex;
}

async function teacherAssignment(env, teacherId, personId) {
  return env.DB.prepare(`
    SELECT ta.*
    FROM teacher_assignments ta
    JOIN people p ON p.id=ta.person_id
    LEFT JOIN person_programs pp ON pp.person_id=p.id
    WHERE ta.teacher_id=?
      AND ta.person_id=?
      AND ta.active=1
      AND p.status='active'
      AND COALESCE(pp.school_followup,0)=1
      AND ta.teacher_id=(
        SELECT ta2.teacher_id
        FROM teacher_assignments ta2
        JOIN teachers t2 ON t2.id=ta2.teacher_id
        WHERE ta2.person_id=ta.person_id AND ta2.active=1 AND t2.active=1
        ORDER BY ta2.created_at DESC, ta2.teacher_id DESC
        LIMIT 1
      )
    LIMIT 1
  `).bind(teacherId, personId).first();
}


async function currentTeacherForStudent(env, personId) {
  await ensureSchoolModuleTables(env);
  return env.DB.prepare(`
    SELECT ta.teacher_id, ta.school_year, ta.created_at, t.full_name, t.email
    FROM teacher_assignments ta
    JOIN teachers t ON t.id=ta.teacher_id
    WHERE ta.person_id=? AND ta.active=1 AND t.active=1
    ORDER BY ta.created_at DESC, ta.teacher_id DESC
    LIMIT 1
  `).bind(personId).first();
}

async function isCidebStudent(env, personId) {
  await ensureCidebDirectoryTables(env);
  const row = await env.DB.prepare(`
    SELECT p.id
    FROM people p
    LEFT JOIN person_programs pp ON pp.person_id=p.id
    LEFT JOIN person_data_context dc ON dc.person_id=p.id
    LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
    WHERE p.id=? AND p.status='active' AND COALESCE(pp.school_followup,0)=1
      AND (LOWER(COALESCE(se.institution_name,pp.school_name,dc.institution_name,'')) LIKE '%cideb%'
           OR COALESCE(dc.context_type,'') IN ('cideb','mixed'))
  `).bind(personId).first();
  return !!row;
}

async function latestTeacherTransfer(env, personId, toTeacherId = '') {
  await ensureSchoolModuleTables(env);
  const sql = toTeacherId
    ? `SELECT tr.*, old.full_name AS from_teacher_name, new.full_name AS to_teacher_name
       FROM teacher_transfers tr
       LEFT JOIN teachers old ON old.id=tr.from_teacher_id
       LEFT JOIN teachers new ON new.id=tr.to_teacher_id
       WHERE tr.person_id=? AND tr.to_teacher_id=? AND tr.undone_at IS NULL
       ORDER BY tr.created_at DESC LIMIT 1`
    : `SELECT tr.*, old.full_name AS from_teacher_name, new.full_name AS to_teacher_name
       FROM teacher_transfers tr
       LEFT JOIN teachers old ON old.id=tr.from_teacher_id
       LEFT JOIN teachers new ON new.id=tr.to_teacher_id
       WHERE tr.person_id=? AND tr.undone_at IS NULL
       ORDER BY tr.created_at DESC LIMIT 1`;
  return toTeacherId
    ? env.DB.prepare(sql).bind(personId, toTeacherId).first()
    : env.DB.prepare(sql).bind(personId).first();
}

async function performTeacherTransfer(env, { personId, toTeacherId, actorRole, actorId, transferNote = '' }) {
  await ensureCidebDirectoryTables(env);
  if (!(await isCidebStudent(env, personId))) throw new Error('Alumno CIDEB no encontrado o inactivo.');
  const target = await env.DB.prepare(`SELECT id,full_name FROM teachers WHERE id=? AND active=1`).bind(toTeacherId).first();
  if (!target) throw new Error('Selecciona un docente activo.');
  const current = await currentTeacherForStudent(env, personId);
  if (current?.teacher_id === toTeacherId) throw new Error('Ese docente ya es el maestro actual del alumno.');
  const [enrollment, continuity] = await Promise.all([
    currentEnrollment(env, personId),
    env.DB.prepare(`SELECT general_description,strengths,support_needs,strategies,watch_items,approved_at FROM school_continuity WHERE person_id=? AND approved_at IS NOT NULL`).bind(personId).first()
  ]);
  const now = nowISO();
  const transferId = makeId('transfer');
  const period = safeText(enrollment?.school_year || '', 60);
  await env.DB.batch([
    env.DB.prepare(`UPDATE teacher_assignments SET active=0 WHERE person_id=? AND active=1`).bind(personId),
    env.DB.prepare(`INSERT INTO teacher_assignments (teacher_id,person_id,school_year,active,created_at) VALUES (?,?,?,1,?) ON CONFLICT(teacher_id,person_id,school_year) DO UPDATE SET active=1,created_at=excluded.created_at`).bind(toTeacherId,personId,period,now),
    env.DB.prepare(`INSERT INTO teacher_transfers (id,person_id,from_teacher_id,to_teacher_id,transfer_date,school_period,general_description,strengths,support_needs,strategies,watch_items,transfer_note,created_by_role,created_by_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(transferId,personId,current?.teacher_id||null,toTeacherId,nortiaLocalDate(),period,safeText(continuity?.general_description,5000),safeText(continuity?.strengths,5000),safeText(continuity?.support_needs,5000),safeText(continuity?.strategies,5000),safeText(continuity?.watch_items,5000),safeText(transferNote,1500),actorRole,safeText(actorId,120)||null,now)
  ]);
  await logAudit(env,actorRole,actorId,current?'transfer_teacher':'assign_current_teacher',personId,`${current?.full_name||'Sin docente'} → ${target.full_name}${period?` · ${period}`:''}`);
  return { ok:true, transfer_id:transferId, from_teacher:current?.full_name||'', to_teacher:target.full_name, school_period:period, has_continuity:!!continuity };
}

async function getSchoolSnapshot(env, personId, reviewedOnly = true) {
  await ensureSchoolModuleTables(env);
  const fields = {
    attention: 'attention_support',
    instructions: 'instructions_support',
    organization: 'organization_support',
    peers: 'peer_support',
    frustration: 'frustration_support',
    transitions: 'transitions_support',
    autonomy: 'autonomy_support',
    help_seeking: 'help_seeking_support'
  };

  // The teacher-facing visual summary uses only information Alex explicitly
  // authorized for the record. Teacher comments remain supplementary unless
  // Alex marks them for inclusion; professional observations remain primary.
  const teacherFilter = reviewedOnly ? "status='reviewed' AND included_in_record=1" : "included_in_record=1";
  const proFilter = reviewedOnly ? "visible_to_teachers=1" : "1=1";
  const combined = `
    WITH combined AS (
      SELECT
        observation_date,
        context,
        attention_support,
        instructions_support,
        organization_support,
        peer_support,
        frustration_support,
        transitions_support,
        autonomy_support,
        help_seeking_support,
        COALESCE(reviewed_at, updated_at, created_at) AS review_time,
        'teacher' AS source
      FROM teacher_observations
      WHERE person_id=? AND ${teacherFilter}

      UNION ALL

      SELECT
        observation_date,
        context,
        attention_support,
        instructions_support,
        organization_support,
        peer_support,
        frustration_support,
        transitions_support,
        autonomy_support,
        help_seeking_support,
        COALESCE(published_at, updated_at, created_at) AS review_time,
        'professional' AS source
      FROM professional_school_observations
      WHERE person_id=? AND ${proFilter}
    )
  `;

  const statsQuery = env.DB.prepare(`${combined}
    SELECT COUNT(*) AS observation_count,
      MAX(review_time) AS last_reviewed_at,
      SUM(CASE WHEN source='teacher' THEN 1 ELSE 0 END) AS teacher_count,
      SUM(CASE WHEN source='professional' THEN 1 ELSE 0 END) AS professional_count
    FROM combined
  `).bind(personId, personId).first();

  const distributionSelect = Object.entries(fields).flatMap(([key, field]) => [
    `SUM(CASE WHEN ${field} IS NOT NULL THEN 1 ELSE 0 END) AS ${key}_n`,
    `SUM(CASE WHEN ${field}=0 THEN 1 ELSE 0 END) AS ${key}_0`,
    `SUM(CASE WHEN ${field}=1 THEN 1 ELSE 0 END) AS ${key}_1`,
    `SUM(CASE WHEN ${field}=2 THEN 1 ELSE 0 END) AS ${key}_2`,
    `SUM(CASE WHEN ${field}=3 THEN 1 ELSE 0 END) AS ${key}_3`
  ]).join(', ');

  const distributionQuery = env.DB.prepare(`${combined}
    SELECT ${distributionSelect} FROM combined
  `).bind(personId, personId).first();

  const contextsQuery = env.DB.prepare(`${combined}
    SELECT COALESCE(NULLIF(context,''),'Sin contexto') AS context, COUNT(*) AS count
    FROM combined
    GROUP BY COALESCE(NULLIF(context,''),'Sin contexto')
    ORDER BY count DESC, context ASC
    LIMIT 8
  `).bind(personId, personId).all();

  const trendQuery = env.DB.prepare(`${combined}
    SELECT observation_date, context, source,
      attention_support,instructions_support,organization_support,peer_support,
      frustration_support,transitions_support,autonomy_support,help_seeking_support
    FROM combined
    ORDER BY observation_date DESC, review_time DESC
    LIMIT 10
  `).bind(personId, personId).all();

  const [stats, distRow, contextsResult, trendResult] = await Promise.all([
    statsQuery,
    distributionQuery,
    contextsQuery,
    trendQuery
  ]);

  const distribution = {};
  for (const key of Object.keys(fields)) {
    const n = Number(distRow?.[`${key}_n`] || 0);
    const c0 = Number(distRow?.[`${key}_0`] || 0);
    const c1 = Number(distRow?.[`${key}_1`] || 0);
    const c2 = Number(distRow?.[`${key}_2`] || 0);
    const c3 = Number(distRow?.[`${key}_3`] || 0);
    distribution[key] = {
      n,
      counts: [c0, c1, c2, c3],
      higher_support_pct: n ? Math.round(((c2 + c3) / n) * 100) : null
    };
  }

  const contexts = contextsResult?.results || [];
  const trendDesc = trendResult?.results || [];

  return {
    observation_count: Number(stats?.observation_count || 0),
    teacher_count: Number(stats?.teacher_count || 0),
    professional_count: Number(stats?.professional_count || 0),
    last_reviewed_at: stats?.last_reviewed_at || null,
    distribution,
    contexts: contexts || [],
    trend: (trendDesc || []).reverse()
  };
}

async function api(req, env, url) {
  const path = url.pathname;
  await ensureV82Tables(env);

  if (path === "/api/security/public-config" && req.method === "GET") {
    const turnstileEnabled = Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
    const turnstileMisconfigured = Boolean(env.TURNSTILE_SECRET_KEY) !== Boolean(env.TURNSTILE_SITE_KEY);
    return json({ turnstile_site_key: turnstileEnabled ? env.TURNSTILE_SITE_KEY : '', turnstile_enabled: turnstileEnabled, turnstile_misconfigured: turnstileMisconfigured, privacy_version: PUBLIC_PRIVACY_VERSION });
  }

  if (path === "/api/admin/security/status" && req.method === "GET") {
    const auth = await requireAdmin(req, env);
    if (auth) return auth;
    return json({
      turnstile_configured: Boolean(env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY),
      turnstile_misconfigured: Boolean(env.TURNSTILE_SECRET_KEY) !== Boolean(env.TURNSTILE_SITE_KEY),
      session_secret_configured: Boolean(env.SESSION_SECRET),
      admin_password_configured: Boolean(env.ADMIN_PASSWORD),
      legal_texts_reviewed: String(env.LEGAL_TEXTS_REVIEWED || "").toLowerCase() === "true",
      cloudflare_access: "external_check_required"
    });
  }

  if (path === "/api/admin/login" && req.method === "POST") {
    const limited = await enforceLoginRateLimit(req, env, "admin");
    if (limited) return limited;

    const body = await parseBody(req);
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return json({ error: "La configuración de seguridad del administrador está incompleta." }, 500);
    }
    if (!constantTimeEqual(safeText(body.password, 200), env.ADMIN_PASSWORD)) {
      await recordLoginFailure(req, env, "admin");
      return json({ error: "Credenciales incorrectas" }, 401);
    }
    await clearLoginFailures(req, env, "admin");
    const token = await createSessionToken(env);
    return json({ ok: true }, 200, {
      "set-cookie": `alex_orienta_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`
    });
  }

  if (path === "/api/admin/logout" && req.method === "POST") {
    return json({ ok: true }, 200, {
      "set-cookie": "alex_orienta_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    });
  }

  if (path === "/api/admin/session" && req.method === "GET") {
    return json({ authenticated: await hasValidAdminSession(req, env) });
  }


  if (path === "/api/client/login" && req.method === "POST") {
    const limited = await enforceLoginRateLimit(req, env, "client");
    if (limited) return limited;

    const b = await parseBody(req);
    const code = safeText(b.code, 40).toUpperCase();

    if (!code) {
      return json({ error: "Escribe tu código de acceso." }, 400);
    }

    const hash = await sha256(code);

    const access = await env.DB.prepare(`
      SELECT ca.person_id, ca.active, p.full_name
      FROM client_access ca
      JOIN people p ON p.id=ca.person_id
      WHERE ca.access_hash=? AND p.status='active'
    `).bind(hash).first();

    if (!access || !access.active) {
      await recordLoginFailure(req, env, "client");
      return json({ error: "Código de acceso inválido o desactivado." }, 401);
    }

    await clearLoginFailures(req, env, "client");
    const token = await createClientSession(env, access.person_id);

    await env.DB.prepare(`
      UPDATE client_access
      SET last_login_at=?, updated_at=?
      WHERE person_id=?
    `).bind(nowISO(), nowISO(), access.person_id).run();

    return json({
      ok: true,
      name: access.full_name
    }, 200, {
      "set-cookie": clientCookie(token)
    });
  }

  if (path === "/api/client/logout" && req.method === "POST") {
    return json({ ok: true }, 200, {
      "set-cookie": clearClientCookie()
    });
  }

  if (path === "/api/client/session" && req.method === "GET") {
    const session = await getClientSession(req, env);
    return json({ authenticated: !!session });
  }

  if (path === "/api/client/me" && req.method === "GET") {
    const check = await requireClient(req, env);
    if (check.response) return check.response;

    const data = await getClientVisibleData(env, check.session.personId);

    if (!data || !data.access?.active) {
      return json({ error: "Acceso no disponible." }, 403);
    }

    return json(data);
  }

  if (path === "/api/client/exercise-status" && req.method === "POST") {
    const check = await requireClient(req, env);
    if (check.response) return check.response;

    const b = await parseBody(req);
    const exerciseId = safeText(b.id, 120);
    const status = b.status === "done" ? "done" : "pending";

    const exercise = await env.DB.prepare(`
      SELECT e.id, e.title, p.full_name
      FROM exercises e
      JOIN people p ON p.id=e.person_id
      WHERE e.id=? AND e.person_id=? AND e.shared=1
    `).bind(exerciseId, check.session.personId).first();

    if (!exercise) {
      return json({ error: "Ejercicio no encontrado." }, 404);
    }

    await env.DB.prepare(`
      UPDATE exercises
      SET status=?, updated_at=?
      WHERE id=?
    `).bind(status, nowISO(), exerciseId).run();

    if (status === "done") {
      await createNotification(env, {
        type: "exercise_done",
        personId: check.session.personId,
        title: "Actividad completada",
        message: `${exercise.full_name} completó: ${exercise.title}.`,
        priority: "normal",
        emailSubject: "RAUDAL · Actividad completada",
        emailText:
          `${exercise.full_name} marcó una actividad como completada.\n\n` +
          `Actividad: ${exercise.title}\n\n` +
          `Puedes revisar su seguimiento desde el Panel Profesional.`
      });
    }

    return json({ ok: true });
  }

  if (path === "/api/client/ai-usage" && req.method === "GET") {
    const check=await requireClient(req,env); if(check.response) return check.response;
    return json(await getAIUsage(env,check.session.personId));
  }

  if (path === "/api/client/ai" && req.method === "POST") {
    const check = await requireClient(req, env);
    if (check.response) return check.response;

    const personId = check.session.personId;
    if (!(await assertTherapyAI(env, personId))) return json({ error: "RAUDAL Reflexión está disponible únicamente para procesos terapéuticos activos con Alex." }, 403);
    const b = await parseBody(req);
    const message = safeText(b.message, 4000);

    if (!message) {
      return json({ error: "Escribe un mensaje." }, 400);
    }

    const access = await env.DB.prepare(`
      SELECT active, consent_confirmed, ai_enabled
      FROM client_access
      WHERE person_id=?
    `).bind(personId).first();

    if (!access?.active) {
      return json({ error: "Acceso desactivado." }, 403);
    }

    if (!access.consent_confirmed) {
      return json({
        error: "RAUDAL Reflexión todavía no está habilitada porque falta confirmar el consentimiento."
      }, 403);
    }

    if (!access.ai_enabled) {
      return json({
        error: "Alex todavía no ha habilitado RAUDAL Reflexión para este proceso."
      }, 403);
    }

    if (!env.AI || typeof env.AI.run !== "function") {
      return json({
        error: "RAUDAL Reflexión no está disponible en este momento."
      }, 503);
    }

    const usageBefore = await getAIUsage(env, personId);
    if (usageBefore.remaining <= 0) {
      return json({
        error: "Has utilizado tus reflexiones disponibles por hoy. Puedes continuar mañana o guardar esta pregunta para tu próxima sesión con Alex.",
        usage: usageBefore
      }, 429);
    }

    if (highRiskLanguage(message)) {
      const reply =
        "Lo que escribes puede indicar que necesitas apoyo humano inmediato. " +
        "Este espacio no está diseñado para manejar una crisis. " +
        "Si existe riesgo de hacerte daño o estás en peligro, busca ahora a un adulto de confianza, " +
        "a Alex u otro profesional, o contacta los servicios de emergencia de tu localidad.";

      const createdAt = nowISO();

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO client_ai_messages
          (id, person_id, role, content, risk_flag, created_at)
          VALUES (?, ?, 'user', ?, 1, ?)
        `).bind(makeId("cmsg"), personId, message, createdAt),

        env.DB.prepare(`
          INSERT INTO client_ai_messages
          (id, person_id, role, content, risk_flag, created_at)
          VALUES (?, ?, 'assistant', ?, 1, ?)
        `).bind(makeId("cmsg"), personId, reply, createdAt)
      ]);

      const riskPerson = await env.DB.prepare(`
        SELECT full_name
        FROM people
        WHERE id=?
      `).bind(personId).first();

      await createNotification(env, {
        type: "ai_risk",
        personId,
        title: "Alerta de seguimiento en RAUDAL Reflexión",
        message:
          `${riskPerson?.full_name || "Una persona"} generó una alerta que requiere revisión humana.`,
        priority: "critical",
        emailSubject: "RAUDAL · Alerta de seguimiento",
        emailText:
          `Se generó una alerta de seguimiento en RAUDAL Reflexión.\n\n` +
          `Persona: ${riskPerson?.full_name || "Sin nombre"}\n\n` +
          `Por privacidad, el contenido de la conversación no se incluye en este correo.\n` +
          `Ingresa al Panel Profesional para revisarla.`
      });

      return json({
        ok: true,
        risk_flag: true,
        reply
      });
    }

    const context = await getAIContextForClient(env, personId);

    const fieldText = context.fields.length
      ? context.fields.map(item =>
          `${item.field_name}: ${item.field_value || "Sin dato"}`
        ).join("\n")
      : "Sin campos adicionales autorizados.";

    const followupText = context.followups.length
      ? context.followups.map(item =>
          [
            item.followup_date,
            item.title || "",
            item.shared_summary || "",
            item.agreements ? `Acuerdos: ${item.agreements}` : "",
            item.next_steps ? `Siguiente paso: ${item.next_steps}` : ""
          ].filter(Boolean).join(" · ")
        ).join("\n")
      : "Sin seguimientos compartidos.";

    const system = `
Eres "RAUDAL Reflexión", una herramienta complementaria dentro de RAUDAL.

OBJETIVO:
Ayudar a la persona a ordenar ideas, explorar opciones, preparar conversaciones,
reflexionar sobre intereses/valores y convertir inquietudes en próximos pasos.

LÍMITES:
- No eres terapeuta.
- No diagnostiques.
- No recomiendes medicamentos.
- No sustituyas atención profesional.
- No tomes decisiones vocacionales por la persona.
- No digas que una carrera específica es definitivamente "la correcta".
- No fomentes dependencia emocional hacia la IA.
- No prometas resultados.

FORMA:
- Español natural.
- Máximo 220 palabras salvo que una comparación necesite más.
- Sé concreto, humano y útil.
- Evita frases genéricas.
- Cuando sea útil, usa 3 a 5 bullets.
- Termina con una sola pregunta breve si ayuda a continuar.

CONTEXTO AUTORIZADO POR ALEX:
Nombre: ${context.person?.full_name || "Persona"}
Edad: ${context.person?.age ?? "No indicada"}
Intereses: ${context.vocational?.interests || "No registrados"}
Fortalezas: ${context.vocational?.strengths || "No registradas"}
Valores: ${context.vocational?.values_text || "No registrados"}
Materias favoritas: ${context.vocational?.favorite_subjects || "No registradas"}
Estilo de trabajo: ${context.vocational?.work_style || "No registrado"}
Carreras consideradas: ${context.vocational?.careers_considered || "No registradas"}
Preguntas abiertas: ${context.vocational?.open_questions || "No registradas"}
Plan de orientación: ${context.vocational?.guidance_plan || "No registrado"}
Contexto específico permitido para IA: ${context.vocational?.ai_context || "Ninguno"}

CAMPOS ADICIONALES AUTORIZADOS:
${fieldText}

SEGUIMIENTOS COMPARTIDOS:
${followupText}

IMPORTANTE:
Nunca tienes acceso a las notas privadas de Alex.
`.trim();

    const messages = [
      { role: "system", content: system },
      ...context.recent_messages.map(item => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content
      })),
      { role: "user", content: message }
    ];

    const model = "@cf/meta/llama-3.1-8b-instruct-fast";

    try {
      const result = await env.AI.run(model, {
        messages,
        max_tokens: 320
      });

      const reply = extractAIText(result).trim();

      if (!reply) {
        return json({
          error: "RAUDAL Reflexión no pudo generar texto en este momento."
        }, 502);
      }

      const createdAt = nowISO();

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO client_ai_messages
          (id, person_id, role, content, risk_flag, created_at)
          VALUES (?, ?, 'user', ?, 0, ?)
        `).bind(makeId("cmsg"), personId, message, createdAt),

        env.DB.prepare(`
          INSERT INTO client_ai_messages
          (id, person_id, role, content, risk_flag, created_at)
          VALUES (?, ?, 'assistant', ?, 0, ?)
        `).bind(makeId("cmsg"), personId, reply, createdAt)
      ]);

      const usage = await incrementAIUsage(env, personId);

      if (usage.remaining === 0) {
        const limitPerson = await env.DB.prepare(`
          SELECT full_name
          FROM people
          WHERE id=?
        `).bind(personId).first();

        await createNotification(env, {
          type: "ai_limit",
          personId,
          title: "Límite diario de RAUDAL Reflexión",
          message:
            `${limitPerson?.full_name || "Una persona"} alcanzó su límite diario de ${usage.limit} mensajes.`,
          priority: "low",
          emailSubject: "RAUDAL · Límite diario de Reflexión",
          emailText:
            `${limitPerson?.full_name || "Una persona"} alcanzó el límite diario de ` +
            `${usage.limit} mensajes en RAUDAL Reflexión.\n\n` +
            `Si lo consideras necesario, puedes otorgarle mensajes adicionales desde su ficha.`
        });
      }

      return json({
        ok: true,
        risk_flag: false,
        reply,
        usage
      });
    } catch (error) {
      return json({
        error: `RAUDAL Reflexión: ${safeText(error?.message || error, 500)}`
      }, 502);
    }
  }


  if (path === "/api/teacher/login" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const limited = await enforceLoginRateLimit(req, env, "teacher");
    if (limited) return limited;

    const b = await parseBody(req);
    const code = safeText(b.code, 60).toUpperCase();
    if (!code) return json({ error: "Escribe tu código de acceso." }, 400);
    const hash = await sha256(code);
    const teacher = await env.DB.prepare(`SELECT * FROM teachers WHERE access_hash=? AND active=1`).bind(hash).first();
    if (!teacher) {
      await recordLoginFailure(req, env, "teacher");
      return json({ error: "Código docente inválido o desactivado." }, 401);
    }
    await clearLoginFailures(req, env, "teacher");
    const token = await createSignedRoleSession(env, "teacher", teacher.id);
    await env.DB.prepare(`UPDATE teachers SET last_login_at=?, updated_at=? WHERE id=?`).bind(nowISO(), nowISO(), teacher.id).run();
    await logAudit(env, "teacher", teacher.id, "login", null, "Inicio de sesión docente");
    return json({ ok: true, name: teacher.full_name }, 200, { "set-cookie": roleCookie("teacher", token) });
  }

  if (path === "/api/teacher/logout" && req.method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": clearRoleCookie("teacher") });
  }

  if (path === "/api/teacher/session" && req.method === "GET") {
    return json({ authenticated: !!(await getSignedRoleSession(req, env, "teacher")) });
  }

  if (path === "/api/teacher/me" && req.method === "GET") {
    await ensureSchoolModuleTables(env);
    const session = await getSignedRoleSession(req, env, "teacher");
    if (!session) return json({ error: "Acceso requerido" }, 401);
    const teacher = await env.DB.prepare(`SELECT id,full_name,email,school_name,agreement_version,agreement_accepted_at,agreement_signed_name FROM teachers WHERE id=? AND active=1`).bind(session.actorId).first();
    if (!teacher) return json({ error: "Acceso docente no disponible." }, 403);
    return json({ teacher, agreement_required: !teacher.agreement_accepted_at || teacher.agreement_version !== TEACHER_AGREEMENT_VERSION, current_version: TEACHER_AGREEMENT_VERSION });
  }

  if (path === "/api/teacher/accept-agreement" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const session = await getSignedRoleSession(req, env, "teacher");
    if (!session) return json({ error: "Acceso requerido" }, 401);
    const b = await parseBody(req);
    const signed = safeText(b.signed_name, 160);
    if (!b.accepted || signed.length < 3) return json({ error: "Escribe tu nombre completo y acepta el acuerdo." }, 400);
    await env.DB.prepare(`UPDATE teachers SET agreement_version=?, agreement_accepted_at=?, agreement_signed_name=?, updated_at=? WHERE id=?`)
      .bind(TEACHER_AGREEMENT_VERSION, nowISO(), signed, nowISO(), session.actorId).run();
    await logAudit(env, "teacher", session.actorId, "accept_confidentiality", null, `Versión ${TEACHER_AGREEMENT_VERSION}`);
    return json({ ok: true });
  }

  if (path === "/api/teacher/students" && req.method === "GET") {
    await ensureSchoolModuleTables(env);
    const session = await getSignedRoleSession(req, env, "teacher");
    if (!session) return json({ error: "Acceso requerido" }, 401);
    const teacher = await env.DB.prepare(`SELECT agreement_accepted_at,agreement_version FROM teachers WHERE id=? AND active=1`).bind(session.actorId).first();
    if (!teacher?.agreement_accepted_at || teacher.agreement_version !== TEACHER_AGREEMENT_VERSION) return json({ error: "Primero acepta el acuerdo de confidencialidad." }, 403);
    const { results } = await env.DB.prepare(`
      SELECT p.id,p.full_name,p.age,COALESCE(se.grade_level,pp.grade_level,'') AS grade_level,pp.school_name,COALESCE(se.school_year,pp.school_year,'') AS school_year
      FROM teacher_assignments ta JOIN people p ON p.id=ta.person_id
      LEFT JOIN person_programs pp ON pp.person_id=p.id
      LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
      WHERE ta.teacher_id=? AND ta.active=1
        AND p.status='active'
        AND COALESCE(pp.school_followup,0)=1
        AND ta.teacher_id=(
          SELECT ta2.teacher_id
          FROM teacher_assignments ta2
          JOIN teachers t2 ON t2.id=ta2.teacher_id
          WHERE ta2.person_id=ta.person_id AND ta2.active=1 AND t2.active=1
          ORDER BY ta2.created_at DESC, ta2.teacher_id DESC
          LIMIT 1
        )
      ORDER BY p.full_name
    `).bind(session.actorId).all();
    return json({ students: results || [] });
  }

  if (path.startsWith("/api/teacher/student/") && req.method === "GET") {
    await ensureSchoolModuleTables(env);
    const session = await getSignedRoleSession(req, env, "teacher");
    if (!session) return json({ error: "Acceso requerido" }, 401);
    const teacher = await env.DB.prepare(`SELECT agreement_accepted_at,agreement_version FROM teachers WHERE id=? AND active=1`).bind(session.actorId).first();
    if (!teacher?.agreement_accepted_at || teacher.agreement_version !== TEACHER_AGREEMENT_VERSION) return json({ error: "Primero acepta el acuerdo de confidencialidad." }, 403);
    const personId = path.split("/").pop();
    if (!(await teacherAssignment(env, session.actorId, personId))) return json({ error: "No tienes acceso a este alumno." }, 403);
    const [person, program, continuity, ownResult, professionalResult, enrollment, transfer] = await Promise.all([
      env.DB.prepare(`SELECT id,full_name,age FROM people WHERE id=?`).bind(personId).first(),
      getPersonProgram(env, personId),
      env.DB.prepare(`SELECT general_description,strengths,support_needs,strategies,watch_items,approved_at,updated_at FROM school_continuity WHERE person_id=? AND approved_at IS NOT NULL`).bind(personId).first(),
      env.DB.prepare(`SELECT id,observation_date,subject,context,description,status,professional_comment FROM teacher_observations WHERE teacher_id=? AND person_id=? ORDER BY observation_date DESC,created_at DESC LIMIT 20`).bind(session.actorId, personId).all(),
      env.DB.prepare(`SELECT id,observation_date,subject,context,description,strategy_used,recommendation_text,published_at FROM professional_school_observations WHERE person_id=? AND visible_to_teachers=1 ORDER BY observation_date DESC,created_at DESC LIMIT 12`).bind(personId).all(),
      currentEnrollment(env,personId),
      latestTeacherTransfer(env,personId,session.actorId)
    ]);
    const snapshotPromise = continuity
      ? getSchoolSnapshot(env, personId, true)
      : Promise.resolve({ observation_count: 0, teacher_count: 0, professional_count: 0, distribution: {}, contexts: [], trend: [], last_reviewed_at: null });
    const auditPromise = logAudit(env, "teacher", session.actorId, "view_student_continuity", personId, "Consulta de ficha de continuidad escolar");
    const [snapshot] = await Promise.all([snapshotPromise, auditPromise]);
    return json({ person, program, enrollment: enrollment || {}, continuity: continuity || {}, snapshot, latest_transfer: transfer || null, own_observations: ownResult?.results || [], professional_observations: professionalResult?.results || [] });
  }

  if (path === "/api/teacher/observation" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const session = await getSignedRoleSession(req, env, "teacher");
    if (!session) return json({ error: "Acceso requerido" }, 401);
    const teacher = await env.DB.prepare(`SELECT full_name,agreement_accepted_at,agreement_version FROM teachers WHERE id=? AND active=1`).bind(session.actorId).first();
    if (!teacher?.agreement_accepted_at || teacher.agreement_version !== TEACHER_AGREEMENT_VERSION) return json({ error: "Primero acepta el acuerdo de confidencialidad." }, 403);
    const b = await parseBody(req);
    const personId = safeText(b.person_id,120);
    if (!(await teacherAssignment(env, session.actorId, personId))) return json({ error: "No tienes acceso a este alumno." }, 403);
    const description = safeText(b.description,5000);
    if (!description) return json({ error: "Escribe tu comentario." },400);
    const observationDate = safeText(b.observation_date,20) || nortiaLocalDate();
    if (!isValidDateOnly(observationDate)) return json({ error: "Selecciona una fecha válida para la observación." },400);
    if (observationDate > nortiaLocalDate()) return json({ error: "La fecha de observación no puede ser futura." },400);
    const clamp = v => { if (v == null || v === "") return null; const n=Number(v); return Number.isFinite(n) ? Math.max(0,Math.min(3,Math.round(n))) : null; };
    const id=makeId("tobs"), now=nowISO();
    await env.DB.prepare(`INSERT INTO teacher_observations (id,teacher_id,person_id,observation_date,subject,context,attention_support,instructions_support,organization_support,peer_support,frustration_support,transitions_support,autonomy_support,help_seeking_support,description,antecedent,strategy_used,result_text,additional_comments,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?)`)
      .bind(id,session.actorId,personId,observationDate,safeText(b.subject,120),safeText(b.context,120),clamp(b.attention_support),clamp(b.instructions_support),clamp(b.organization_support),clamp(b.peer_support),clamp(b.frustration_support),clamp(b.transitions_support),clamp(b.autonomy_support),clamp(b.help_seeking_support),description,safeText(b.antecedent,3000),safeText(b.strategy_used,3000),safeText(b.result_text,3000),safeText(b.additional_comments,3000),now,now).run();
    const person = await env.DB.prepare(`SELECT full_name FROM people WHERE id=?`).bind(personId).first();
    await logAudit(env,"teacher",session.actorId,"submit_observation",personId,"Comentario docente enviado a revisión");
    await createNotification(env,{type:"teacher_observation",personId,title:"Nuevo comentario docente",message:`${teacher.full_name} envió un comentario sobre ${person?.full_name || "un alumno"}.`,priority:"normal",emailSubject:"RAUDAL · Nuevo comentario docente",emailText:`${teacher.full_name} envió un comentario escolar para ${person?.full_name || "un alumno"}.\n\nIngresa al Panel Profesional para revisarlo y decidir si debe integrarse al expediente.`});
    return json({ok:true,id});
  }


  if (path === "/api/coordinator/login" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const limited = await enforceLoginRateLimit(req, env, "coordinator");
    if (limited) return limited;
    const b = await parseBody(req), code = safeText(b.code,60).toUpperCase();
    if (!code) return json({error:"Escribe tu código de acceso."},400);
    const hash = await sha256(code);
    const coordinator = await env.DB.prepare(`SELECT * FROM coordinators WHERE access_hash=? AND active=1`).bind(hash).first();
    if (!coordinator) { await recordLoginFailure(req,env,"coordinator"); return json({error:"Código de coordinación inválido o desactivado."},401); }
    await clearLoginFailures(req,env,"coordinator");
    const token = await createSignedRoleSession(env,"coordinator",coordinator.id);
    await env.DB.prepare(`UPDATE coordinators SET last_login_at=?,updated_at=? WHERE id=?`).bind(nowISO(),nowISO(),coordinator.id).run();
    await logAudit(env,"coordinator",coordinator.id,"login",null,"Inicio de sesión de coordinación CIDEB");
    return json({ok:true,name:coordinator.full_name},200,{"set-cookie":roleCookie("coordinator",token)});
  }

  if (path === "/api/coordinator/logout" && req.method === "POST") return json({ok:true},200,{"set-cookie":clearRoleCookie("coordinator")});
  if (path === "/api/coordinator/session" && req.method === "GET") return json({authenticated:!!(await getSignedRoleSession(req,env,"coordinator"))});

  if (path === "/api/coordinator/me" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const session=await getSignedRoleSession(req,env,"coordinator"); if(!session)return json({error:"Acceso requerido"},401);
    const coordinator=await env.DB.prepare(`SELECT id,full_name,email,school_name,agreement_version,agreement_accepted_at,agreement_signed_name FROM coordinators WHERE id=? AND active=1`).bind(session.actorId).first();
    if(!coordinator)return json({error:"Acceso de coordinación no disponible."},403);
    return json({coordinator,agreement_required:!coordinator.agreement_accepted_at||coordinator.agreement_version!==COORDINATOR_AGREEMENT_VERSION,current_version:COORDINATOR_AGREEMENT_VERSION});
  }

  if (path === "/api/coordinator/accept-agreement" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const session=await getSignedRoleSession(req,env,"coordinator"); if(!session)return json({error:"Acceso requerido"},401);
    const b=await parseBody(req),signed=safeText(b.signed_name,160); if(!b.accepted||signed.length<3)return json({error:"Escribe tu nombre completo y acepta el acuerdo."},400);
    await env.DB.prepare(`UPDATE coordinators SET agreement_version=?,agreement_accepted_at=?,agreement_signed_name=?,updated_at=? WHERE id=?`).bind(COORDINATOR_AGREEMENT_VERSION,nowISO(),signed,nowISO(),session.actorId).run();
    await logAudit(env,"coordinator",session.actorId,"accept_coordination_confidentiality",null,`Versión ${COORDINATOR_AGREEMENT_VERSION}`);
    return json({ok:true});
  }

  async function requireCoordinatorAgreement() {
    const session=await getSignedRoleSession(req,env,"coordinator"); if(!session)return {error:json({error:"Acceso requerido"},401)};
    const coordinator=await env.DB.prepare(`SELECT id,full_name,agreement_version,agreement_accepted_at FROM coordinators WHERE id=? AND active=1`).bind(session.actorId).first();
    if(!coordinator)return {error:json({error:"Acceso de coordinación no disponible."},403)};
    if(!coordinator.agreement_accepted_at||coordinator.agreement_version!==COORDINATOR_AGREEMENT_VERSION)return {error:json({error:"Primero acepta el acuerdo de confidencialidad."},403)};
    return {session,coordinator};
  }

  if (path === "/api/coordinator/summary" && req.method === "GET") {
    await ensureCidebDirectoryTables(env); const auth=await requireCoordinatorAgreement(); if(auth.error)return auth.error;
    const base=`FROM people p LEFT JOIN person_programs pp ON pp.person_id=p.id LEFT JOIN person_data_context dc ON dc.person_id=p.id LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1 WHERE p.status='active' AND COALESCE(pp.school_followup,0)=1 AND (LOWER(COALESCE(se.institution_name,pp.school_name,dc.institution_name,'')) LIKE '%cideb%' OR COALESCE(dc.context_type,'') IN ('cideb','mixed'))`;
    const [students,unassigned,reports,teachers]=await Promise.all([
      env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base}`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base} AND NOT EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.person_id=p.id AND ta.active=1)`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base} AND EXISTS (SELECT 1 FROM school_continuity sc WHERE sc.person_id=p.id AND sc.approved_at IS NOT NULL)`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM teachers WHERE active=1 AND LOWER(COALESCE(school_name,'')) LIKE '%cideb%'`).first()
    ]);
    return json({students:Number(students?.count||0),unassigned:Number(unassigned?.count||0),reports:Number(reports?.count||0),teachers:Number(teachers?.count||0)});
  }

  if (path === "/api/coordinator/students" && req.method === "GET") {
    await ensureCidebDirectoryTables(env); const auth=await requireCoordinatorAgreement(); if(auth.error)return auth.error;
    const q=cleanSchoolValue(url.searchParams.get('q'),120).toLowerCase(), like=`%${q}%`;
    const page=Math.max(1,Number(url.searchParams.get('page')||1)),pageSize=50,offset=(page-1)*pageSize;
    const base=`FROM people p LEFT JOIN person_programs pp ON pp.person_id=p.id LEFT JOIN person_data_context dc ON dc.person_id=p.id LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1 WHERE p.status='active' AND COALESCE(pp.school_followup,0)=1 AND (LOWER(COALESCE(se.institution_name,pp.school_name,dc.institution_name,'')) LIKE '%cideb%' OR COALESCE(dc.context_type,'') IN ('cideb','mixed')) AND (?='' OR LOWER(p.full_name) LIKE ? OR LOWER(COALESCE(se.student_number,'')) LIKE ? OR LOWER(COALESCE(se.grade_level,pp.grade_level,'')) LIKE ? OR LOWER(COALESCE(se.group_name,'')) LIKE ?)`;
    const bind=[q,like,like,like,like];
    const count=await env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base}`).bind(...bind).first();
    const {results}=await env.DB.prepare(`
      SELECT p.id,p.full_name,p.age,COALESCE(se.student_number,'') AS student_number,COALESCE(se.grade_level,pp.grade_level,'') AS grade_level,COALESCE(se.group_name,'') AS group_name,COALESCE(se.school_year,pp.school_year,'') AS school_period,
        (SELECT t.full_name FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.person_id=p.id AND ta.active=1 AND t.active=1 ORDER BY ta.created_at DESC LIMIT 1) AS teacher_name,
        (SELECT ta.teacher_id FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.person_id=p.id AND ta.active=1 AND t.active=1 ORDER BY ta.created_at DESC LIMIT 1) AS teacher_id,
        CASE WHEN EXISTS(SELECT 1 FROM school_continuity sc WHERE sc.person_id=p.id AND sc.approved_at IS NOT NULL) THEN 1 ELSE 0 END AS has_report
      ${base}
      ORDER BY p.full_name LIMIT ? OFFSET ?
    `).bind(...bind,pageSize,offset).all();
    const total=Number(count?.count||0); return json({students:results||[],pagination:{page,page_size:pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))}});
  }

  if (path === "/api/coordinator/teachers" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const auth=await requireCoordinatorAgreement(); if(auth.error)return auth.error;
    const {results}=await env.DB.prepare(`SELECT id,full_name,email FROM teachers WHERE active=1 AND LOWER(COALESCE(school_name,'')) LIKE '%cideb%' ORDER BY full_name`).all();
    return json({teachers:results||[]});
  }

  if (path.startsWith("/api/coordinator/student/") && req.method === "GET") {
    await ensureCidebDirectoryTables(env); const auth=await requireCoordinatorAgreement(); if(auth.error)return auth.error;
    const personId=path.split('/').pop(); if(!(await isCidebStudent(env,personId)))return json({error:"Alumno no encontrado."},404);
    const [person,enrollment,continuity,currentTeacher,transfer,professional]=await Promise.all([
      env.DB.prepare(`SELECT id,full_name,age FROM people WHERE id=?`).bind(personId).first(),
      currentEnrollment(env,personId),
      env.DB.prepare(`SELECT general_description,strengths,support_needs,strategies,watch_items,approved_at,updated_at FROM school_continuity WHERE person_id=? AND approved_at IS NOT NULL`).bind(personId).first(),
      currentTeacherForStudent(env,personId),
      latestTeacherTransfer(env,personId),
      env.DB.prepare(`SELECT observation_date,context,description,strategy_used,recommendation_text FROM professional_school_observations WHERE person_id=? AND visible_to_teachers=1 ORDER BY observation_date DESC,created_at DESC LIMIT 8`).bind(personId).all()
    ]);
    await logAudit(env,"coordinator",auth.session.actorId,"view_student_school_summary",personId,"Consulta de continuidad escolar por coordinación");
    return json({person,enrollment:enrollment||{},continuity:continuity||{},current_teacher:currentTeacher||null,latest_transfer:transfer||null,professional_observations:professional.results||[]});
  }

  if (path === "/api/coordinator/transfer" && req.method === "POST") {
    await ensureCidebDirectoryTables(env); const auth=await requireCoordinatorAgreement(); if(auth.error)return auth.error;
    const b=await parseBody(req),personId=safeText(b.person_id,120),toTeacherId=safeText(b.to_teacher_id,120);
    if(!personId||!toTeacherId)return json({error:"Alumno y nuevo docente son obligatorios."},400);
    try { return json(await performTeacherTransfer(env,{personId,toTeacherId,actorRole:'coordinator',actorId:auth.session.actorId,transferNote:safeText(b.transfer_note,1500)})); }
    catch(e){return json({error:safeText(e.message||e,500)},400);}
  }

  if (path === "/api/family/login" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const limited = await enforceLoginRateLimit(req, env, "family");
    if (limited) return limited;

    const b=await parseBody(req); const code=safeText(b.code,60).toUpperCase();
    if(!code) return json({error:"Escribe tu código de acceso."},400);
    const hash=await sha256(code);
    const guardian=await env.DB.prepare(`SELECT g.* FROM guardians g JOIN people p ON p.id=g.person_id WHERE g.access_hash=? AND g.active=1 AND p.status='active'`).bind(hash).first();
    if(!guardian) {
      await recordLoginFailure(req, env, "family");
      return json({error:"Código familiar inválido o desactivado."},401);
    }
    await clearLoginFailures(req, env, "family");
    const token=await createSignedRoleSession(env,"family",guardian.id);
    await env.DB.prepare(`UPDATE guardians SET last_login_at=?,updated_at=? WHERE id=?`).bind(nowISO(),nowISO(),guardian.id).run();
    await logAudit(env,"family",guardian.id,"login",guardian.person_id,"Inicio de sesión familiar");
    return json({ok:true,name:guardian.full_name},200,{"set-cookie":roleCookie("family",token)});
  }

  if (path === "/api/family/logout" && req.method === "POST") return json({ok:true},200,{"set-cookie":clearRoleCookie("family")});
  if (path === "/api/family/session" && req.method === "GET") return json({authenticated:!!(await getSignedRoleSession(req,env,"family"))});

  if (path === "/api/family/me" && req.method === "GET") {
    await ensureSchoolModuleTables(env);
    const session=await getSignedRoleSession(req,env,"family"); if(!session) return json({error:"Acceso requerido"},401);
    const guardian=await env.DB.prepare(`SELECT id,person_id,full_name,relationship,email,agreement_version,agreement_accepted_at,agreement_signed_name FROM guardians WHERE id=? AND active=1`).bind(session.actorId).first();
    if(!guardian) return json({error:"Acceso familiar no disponible."},403);
    const person=await env.DB.prepare(`SELECT id,full_name,age FROM people WHERE id=? AND status='active'`).bind(guardian.person_id).first();
    if(!person) return json({error:"Este expediente ya no está activo."},403);
    return json({guardian,person,agreement_required:!guardian.agreement_accepted_at||guardian.agreement_version!==FAMILY_AGREEMENT_VERSION,current_version:FAMILY_AGREEMENT_VERSION});
  }

  if (path === "/api/family/accept-agreement" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const session=await getSignedRoleSession(req,env,"family"); if(!session) return json({error:"Acceso requerido"},401);
    const b=await parseBody(req), signed=safeText(b.signed_name,160); if(!b.accepted||signed.length<3) return json({error:"Escribe tu nombre completo y acepta el aviso."},400);
    const guardian=await env.DB.prepare(`SELECT person_id FROM guardians WHERE id=?`).bind(session.actorId).first();
    await env.DB.prepare(`UPDATE guardians SET agreement_version=?,agreement_accepted_at=?,agreement_signed_name=?,updated_at=? WHERE id=?`).bind(FAMILY_AGREEMENT_VERSION,nowISO(),signed,nowISO(),session.actorId).run();
    await logAudit(env,"family",session.actorId,"accept_family_privacy",guardian?.person_id||null,`Versión ${FAMILY_AGREEMENT_VERSION}`);
    return json({ok:true});
  }

  if (path === "/api/family/overview" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const session=await getSignedRoleSession(req,env,"family"); if(!session) return json({error:"Acceso requerido"},401);
    const guardian=await env.DB.prepare(`SELECT * FROM guardians WHERE id=? AND active=1`).bind(session.actorId).first();
    if(!guardian?.agreement_accepted_at||guardian.agreement_version!==FAMILY_AGREEMENT_VERSION) return json({error:"Primero acepta el aviso y compromiso de privacidad."},403);
    const person=await env.DB.prepare(`SELECT id,full_name,age FROM people WHERE id=? AND status='active'`).bind(guardian.person_id).first();
    if(!person) return json({error:"Este expediente ya no está activo."},403);
    const profile=await env.DB.prepare(`SELECT summary,strengths,current_goals,recommendations_home,updated_at FROM family_profiles WHERE person_id=?`).bind(guardian.person_id).first();
    const {results: own}=await env.DB.prepare(`SELECT observation_date,context,observation_text,what_helped,questions,status,professional_comment FROM family_observations WHERE guardian_id=? ORDER BY observation_date DESC,created_at DESC LIMIT 20`).bind(session.actorId).all();
    await logAudit(env,"family",session.actorId,"view_family_portal",guardian.person_id,"Consulta de Portal Familiar");
    return json({guardian:{full_name:guardian.full_name,relationship:guardian.relationship},person,profile:profile||{},own_observations:own||[]});
  }

  if (path === "/api/family/observation" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const session=await getSignedRoleSession(req,env,"family"); if(!session) return json({error:"Acceso requerido"},401);
    const guardian=await env.DB.prepare(`SELECT * FROM guardians WHERE id=? AND active=1`).bind(session.actorId).first();
    if(!guardian?.agreement_accepted_at||guardian.agreement_version!==FAMILY_AGREEMENT_VERSION) return json({error:"Primero acepta el aviso y compromiso de privacidad."},403);
    const b=await parseBody(req), observation=safeText(b.observation_text,5000); if(!observation) return json({error:"Escribe la observación que quieres compartir."},400);
    const observationDate=safeText(b.observation_date,20)||nortiaLocalDate();
    if(!isValidDateOnly(observationDate)) return json({error:"Selecciona una fecha válida para la observación."},400);
    if(observationDate>nortiaLocalDate()) return json({error:"La fecha de observación no puede ser futura."},400);
    const id=makeId("fobs"),now=nowISO();
    await env.DB.prepare(`INSERT INTO family_observations (id,guardian_id,person_id,observation_date,context,observation_text,what_helped,questions,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'submitted',?,?)`).bind(id,guardian.id,guardian.person_id,observationDate,safeText(b.context,160),observation,safeText(b.what_helped,3000),safeText(b.questions,3000),now,now).run();
    const person=await env.DB.prepare(`SELECT full_name FROM people WHERE id=?`).bind(guardian.person_id).first();
    await logAudit(env,"family",guardian.id,"submit_family_observation",guardian.person_id,"Observación familiar enviada a revisión");
    await createNotification(env,{type:"family_observation",personId:guardian.person_id,title:"Nueva observación familiar",message:`${guardian.full_name} compartió una observación sobre ${person?.full_name || "un menor"}.`,priority:"normal",emailSubject:"RAUDAL · Nueva observación familiar",emailText:`${guardian.full_name} compartió una nueva observación familiar sobre ${person?.full_name || "un menor"}.\n\nIngresa al Panel Profesional para revisarla.`});
    return json({ok:true,id});
  }

  if (path === "/api/appointments" && req.method === "POST") {
    const limited = await enforceActionRateLimit(req, env, 'public_appointment', 6, 1800);
    if (limited) return limited;
    const b = await parseBody(req);
    if (!(b.privacy_consent === true || b.privacy_consent === 'yes' || b.privacy_consent === 'on')) {
      return json({ error: 'Debes aceptar el aviso de privacidad para enviar la solicitud.' }, 400);
    }
    const turnstile = await verifyTurnstile(req, env, safeText(b.turnstile_token, 3000));
    if (!turnstile.ok) return json({ error: turnstile.error }, turnstile.configuration_error ? 503 : 400);
    const name = safeText(b.client_name, 120);
    const date = safeText(b.preferred_date, 20);
    const time = safeText(b.preferred_time, 20);
    if (!name || !date || !time) return json({ error: "Nombre, fecha y horario son obligatorios." }, 400);
    if (!isValidTimeOnly(time)) return json({ error: "Selecciona un horario válido." }, 400);
    const allowedServices = new Set(['orientacion_vocacional','acompanamiento_personal','desarrollo_academico']);
    const serviceType = safeText(b.service_type,80) || 'orientacion_vocacional';
    if (!allowedServices.has(serviceType)) return json({ error: "Selecciona un tipo de acompañamiento válido." }, 400);
    const age = b.age === "" || b.age == null ? null : Number(b.age);
    if (age === null || !Number.isFinite(age) || age < 8 || age > 99) return json({ error: "Indica una edad válida." }, 400);
    if (!isValidDateOnly(date)) return json({ error: "Selecciona una fecha válida." }, 400);
    const isMinor = age < 18 ? 1 : 0;
    if (isMinor && !safeText(b.guardian_name, 120)) return json({ error: "Para una persona menor de edad necesitamos el nombre del padre, madre o tutor." }, 400);
    const email = safeText(b.client_email, 160).toLowerCase();
    const phone = safeText(b.client_phone, 40);
    const guardianEmail = safeText(b.guardian_email, 160).toLowerCase();
    const guardianPhone = safeText(b.guardian_phone, 40);
    if (!isReasonableEmail(email) || !isReasonableEmail(guardianEmail)) return json({ error: "Revisa el formato del correo electrónico." }, 400);
    if (date < nortiaLocalDate()) return json({ error: "Selecciona una fecha de hoy en adelante." }, 400);
    if (isMinor && !guardianEmail && !guardianPhone) return json({ error: "Para una persona menor de edad necesitamos correo o teléfono del padre, madre o tutor." }, 400);
    if (!isMinor && !email && !phone) return json({ error: "Agrega un correo o teléfono para poder confirmar la sesión." }, 400);
    let personId = null;
    // Solo se vincula automáticamente por correo único. Los teléfonos pueden ser compartidos por familias.
    if (email) {
      const { results } = await env.DB.prepare(`SELECT id FROM people WHERE status='active' AND LOWER(TRIM(COALESCE(email,'')))=? LIMIT 2`).bind(email).all();
      if ((results || []).length === 1) personId = results[0].id;
    }
    const id = makeId("appt");
    const now = nowISO();
    await env.DB.prepare(`
      INSERT INTO appointments (
        id, person_id, client_name, age, client_email, client_phone,
        is_minor, guardian_name, guardian_email, guardian_phone,
        service_type, reason_summary, preferred_date, preferred_time,
        status, privacy_consent_version, privacy_accepted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)
    `).bind(
      id, personId, name, Number.isFinite(age) ? age : null,
      email, phone, isMinor,
      safeText(b.guardian_name, 120), guardianEmail, guardianPhone,
      serviceType, safeText(b.reason_summary, 1500), date, time,
      PUBLIC_PRIVACY_VERSION, now, now, now
    ).run();
    await createNotification(env, {
      type: "appointment", personId,
      title: "Nueva solicitud de cita",
      message: `${name} solicitó una sesión para ${date} a las ${time}.`,
      priority: "normal",
      emailSubject: "RAUDAL · Nueva solicitud de cita"
    });
    return json({ ok: true, appointment_id: id });
  }

  if (path.startsWith("/api/admin/")) {
    const denied = await requireAdmin(req, env);
    if (denied) return denied;
  }

  if (path === "/api/admin/notifications/status" && req.method === "GET") {
    await ensureNotificationsTable(env);

    const unread = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE is_read=0
    `).first();

    return json({
      recipient: ALEX_NOTIFICATION_EMAIL,
      email_configured: !!env.RESEND_API_KEY,
      from: safeText(env.RESEND_FROM_EMAIL, 240) || "RAUDAL <onboarding@resend.dev>",
      unread_count: Number(unread?.count || 0)
    });
  }

  if (path === "/api/admin/notifications" && req.method === "GET") {
    await ensureNotificationsTable(env);

    const { results } = await env.DB.prepare(`
      SELECT
        n.*,
        p.full_name AS person_name
      FROM notifications n
      LEFT JOIN people p ON p.id=n.person_id
      ORDER BY n.created_at DESC
      LIMIT 100
    `).all();

    const unread = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE is_read=0
    `).first();

    return json({
      notifications: results || [],
      unread_count: Number(unread?.count || 0)
    });
  }

  if (path === "/api/admin/notifications/read" && req.method === "POST") {
    await ensureNotificationsTable(env);
    const b = await parseBody(req);
    const id = safeText(b.id, 120);
    const now = nowISO();

    if (id) {
      await env.DB.prepare(`
        UPDATE notifications
        SET is_read=1, read_at=?
        WHERE id=?
      `).bind(now, id).run();
    } else {
      await env.DB.prepare(`
        UPDATE notifications
        SET is_read=1, read_at=?
        WHERE is_read=0
      `).bind(now).run();
    }

    return json({ ok: true });
  }

  if (path === "/api/admin/notifications/test-email" && req.method === "POST") {
    const result = await sendAlexEmail(
      env,
      "RAUDAL · Correo de prueba",
      "La conexión de notificaciones de RAUDAL está funcionando correctamente.",
      `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
          <div style="font-size:12px;letter-spacing:2px;color:#0ea5e9;font-weight:700">RAUDAL</div>
          <h2 style="color:#0f172a">Notificaciones activas</h2>
          <p style="color:#475569;line-height:1.6">
            La conexión de correo de RAUDAL está funcionando correctamente.
          </p>
          <p style="color:#64748b;font-size:13px">
            Destinatario: ${escapeEmailHTML(ALEX_NOTIFICATION_EMAIL)}
          </p>
        </div>
      `
    );

    if (!result.ok) {
      return json({
        error: result.error || "No se pudo enviar el correo de prueba.",
        email_status: result.status
      }, 500);
    }

    return json({
      ok: true,
      recipient: ALEX_NOTIFICATION_EMAIL
    });
  }



  if (path === "/api/admin/data-context" && req.method === "GET") {
    const personId=safeText(url.searchParams.get("person_id"),120); if(!personId)return json({error:"Persona obligatoria."},400);
    const person=await env.DB.prepare(`SELECT id,full_name,status FROM people WHERE id=?`).bind(personId).first(); if(!person)return json({error:"Persona no encontrada."},404);
    return json({person,data_context:await getPersonDataContext(env,personId)});
  }
  if (path === "/api/admin/data-context" && req.method === "POST") {
    await ensureDataManagementTables(env); const b=await parseBody(req),personId=safeText(b.person_id,120),contextType=safeText(b.context_type,30); const allowed=new Set(["private","cideb","mixed","other"]); if(!personId||!allowed.has(contextType))return json({error:"Contexto de expediente inválido."},400);
    const p=await env.DB.prepare(`SELECT id FROM people WHERE id=?`).bind(personId).first(); if(!p)return json({error:"Persona no encontrada."},404); const now=nowISO();
    await env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,updated_at) VALUES (?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET context_type=excluded.context_type,institution_name=excluded.institution_name,updated_at=excluded.updated_at`).bind(personId,contextType,safeText(b.institution_name,180),now).run();
    await logAudit(env,"admin","alex","update_data_context",personId,`Contexto: ${contextType}`); return json({ok:true});
  }
  if (path === "/api/admin/person/archive" && req.method === "POST") {
    await ensureSchoolModuleTables(env); await ensureDataManagementTables(env); const b=await parseBody(req),personId=safeText(b.person_id,120),archive=b.archive!==false; const person=await env.DB.prepare(`SELECT id,full_name,status FROM people WHERE id=?`).bind(personId).first(); if(!person)return json({error:"Persona no encontrada."},404); const now=nowISO();
    if(archive){
      await env.DB.batch([env.DB.prepare(`UPDATE people SET status='archived',updated_at=? WHERE id=?`).bind(now,personId),env.DB.prepare(`UPDATE client_access SET active=0,updated_at=? WHERE person_id=?`).bind(now,personId),env.DB.prepare(`UPDATE teacher_assignments SET active=0 WHERE person_id=?`).bind(personId),env.DB.prepare(`UPDATE guardians SET active=0,updated_at=? WHERE person_id=?`).bind(now,personId)]);
      const cur=await getPersonDataContext(env,personId); await env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,archive_reason,archived_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET archive_reason=excluded.archive_reason,archived_at=excluded.archived_at,updated_at=excluded.updated_at`).bind(personId,cur.context_type||'private',cur.institution_name||'',safeText(b.reason,500),now,now).run();
      await logAudit(env,"admin","alex","archive_person",personId,safeText(b.reason,500)||"Expediente archivado"); return json({ok:true,status:"archived",message:"Expediente archivado. Los accesos del usuario, familia y docentes quedaron desactivados."});
    }
    await env.DB.batch([env.DB.prepare(`UPDATE people SET status='active',updated_at=? WHERE id=?`).bind(now,personId),env.DB.prepare(`UPDATE person_data_context SET archive_reason=NULL,archived_at=NULL,updated_at=? WHERE person_id=?`).bind(now,personId)]); await logAudit(env,"admin","alex","reactivate_person",personId,"Expediente reactivado; accesos previos permanecen desactivados por seguridad."); return json({ok:true,status:"active",message:"Expediente reactivado. Por seguridad, los accesos anteriores no se reactivaron automáticamente."});
  }
  if (path === "/api/admin/person/delete" && req.method === "POST") {
    await ensureSchoolModuleTables(env); await ensureDataManagementTables(env); const b=await parseBody(req),personId=safeText(b.person_id,120); const person=await env.DB.prepare(`SELECT id,full_name FROM people WHERE id=?`).bind(personId).first(); if(!person)return json({error:"Persona no encontrada."},404);
    if(normalizeConfirmation(b.confirmation)!==normalizeConfirmation(`ELIMINAR ${person.full_name}`))return json({error:`Para confirmar escribe exactamente: ELIMINAR ${person.full_name}`},400);
    await env.DB.batch([env.DB.prepare(`DELETE FROM notifications WHERE person_id=?`).bind(personId),env.DB.prepare(`DELETE FROM audit_log WHERE person_id=?`).bind(personId),env.DB.prepare(`DELETE FROM appointments WHERE person_id=?`).bind(personId)]); await env.DB.prepare(`DELETE FROM people WHERE id=?`).bind(personId).run(); await logAudit(env,"admin","alex","delete_person_definitive",null,"Se eliminó definitivamente un expediente individual y sus citas vinculadas."); return json({ok:true,deleted:true,message:"Expediente eliminado definitivamente junto con sus citas vinculadas por ID."});
  }
  if (path === "/api/admin/institution/preview" && req.method === "GET") { const institution=safeText(url.searchParams.get("institution")||"CIDEB",120); return json(await institutionPreview(env,institution)); }
  if (path === "/api/admin/institution/close" && req.method === "POST") {
    await ensureSchoolModuleTables(env); await ensureDataManagementTables(env); const b=await parseBody(req),institution=safeText(b.institution||"CIDEB",120),mode=safeText(b.mode,30),people=await getInstitutionPeople(env,institution),now=nowISO();
    if(!people.length)return json({ok:true,message:`No se encontraron expedientes asociados a ${institution}.`,preview:await institutionPreview(env,institution)});
    if(mode==="archive"){
      for(const person of people){ await env.DB.prepare(`UPDATE teacher_assignments SET active=0 WHERE person_id=?`).bind(person.id).run(); await env.DB.prepare(`UPDATE guardians SET active=0,updated_at=? WHERE person_id=?`).bind(now,person.id).run(); await env.DB.prepare(`UPDATE school_continuity SET approved_at=NULL,updated_at=? WHERE person_id=?`).bind(now,person.id).run(); await env.DB.prepare(`UPDATE person_programs SET school_followup=0,updated_at=? WHERE person_id=?`).bind(now,person.id).run();
        if(Number(person.therapy_with_alex)){await env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,updated_at) VALUES (?,'private','',?) ON CONFLICT(person_id) DO UPDATE SET context_type='private',institution_name='',updated_at=excluded.updated_at`).bind(person.id,now).run();}
        else {await env.DB.prepare(`UPDATE people SET status='archived',updated_at=? WHERE id=?`).bind(now,person.id).run(); await env.DB.prepare(`UPDATE client_access SET active=0,updated_at=? WHERE person_id=?`).bind(now,person.id).run(); await env.DB.prepare(`UPDATE guardians SET active=0,updated_at=? WHERE person_id=?`).bind(now,person.id).run(); const cur=await getPersonDataContext(env,person.id); await env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,archive_reason,archived_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET archive_reason=excluded.archive_reason,archived_at=excluded.archived_at,updated_at=excluded.updated_at`).bind(person.id,cur.context_type||'cideb',cur.institution_name||institution,`Cierre de uso institucional: ${institution}`,now,now).run();}
      }
      await env.DB.prepare(`UPDATE teachers SET active=0,updated_at=? WHERE LOWER(COALESCE(school_name,'')) LIKE ?`).bind(now,`%${institution.toLowerCase()}%`).run(); await env.DB.prepare(`UPDATE coordinators SET active=0,updated_at=? WHERE LOWER(COALESCE(school_name,'')) LIKE ?`).bind(now,`%${institution.toLowerCase()}%`).run(); await logAudit(env,"admin","alex","close_institution_access",null,`Se cerraron accesos institucionales de ${institution}. Los procesos terapéuticos privados se conservaron.`); return json({ok:true,mode,message:`Accesos de ${institution} cerrados. Los expedientes exclusivamente escolares quedaron archivados; los procesos terapéuticos privados se conservaron.`,preview:await institutionPreview(env,institution)});
    }
    if(mode==="delete"){
      if(normalizeConfirmation(b.confirmation)!==normalizeConfirmation(`CERRAR ${institution} Y ELIMINAR`))return json({error:`Para confirmar escribe exactamente: CERRAR ${institution} Y ELIMINAR`},400);
      for(const person of people){ await env.DB.batch([env.DB.prepare(`DELETE FROM teacher_observations WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM teacher_assignments WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM school_continuity WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM school_continuity_drafts WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM school_continuity_versions WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM teacher_transfers WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM school_enrollments WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM family_observations WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM family_profiles WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM guardians WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM notifications WHERE person_id=? AND type IN ('teacher_observation','family_observation')`).bind(person.id)]);
        if(Number(person.therapy_with_alex)){await env.DB.prepare(`UPDATE person_programs SET school_followup=0,school_name='',grade_level='',school_year='',updated_at=? WHERE person_id=?`).bind(now,person.id).run(); await env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,updated_at) VALUES (?,'private','',?) ON CONFLICT(person_id) DO UPDATE SET context_type='private',institution_name='',archive_reason=NULL,archived_at=NULL,updated_at=excluded.updated_at`).bind(person.id,now).run();}
        else {await env.DB.batch([env.DB.prepare(`DELETE FROM notifications WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM audit_log WHERE person_id=?`).bind(person.id),env.DB.prepare(`DELETE FROM appointments WHERE person_id=?`).bind(person.id)]); await env.DB.prepare(`DELETE FROM people WHERE id=?`).bind(person.id).run();}
      }
      await env.DB.prepare(`DELETE FROM teachers WHERE LOWER(COALESCE(school_name,'')) LIKE ?`).bind(`%${institution.toLowerCase()}%`).run(); await env.DB.prepare(`DELETE FROM coordinators WHERE LOWER(COALESCE(school_name,'')) LIKE ?`).bind(`%${institution.toLowerCase()}%`).run(); await logAudit(env,"admin","alex","delete_institution_data",null,`Se eliminaron datos escolares asociados a ${institution}; se preservaron procesos terapéuticos privados.`); return json({ok:true,mode,message:`Datos escolares de ${institution} eliminados. Los procesos terapéuticos privados se conservaron y dejaron de estar vinculados a la institución.`,preview:await institutionPreview(env,institution)});
    }
    return json({error:"Modo inválido. Usa archive o delete."},400);
  }

  if (path === "/api/admin/program" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const b=await parseBody(req), personId=safeText(b.person_id,120);
    if(!personId) return json({error:"Persona obligatoria."},400);
    const current=await getPersonProgram(env,personId);
    const has=(key)=>Object.prototype.hasOwnProperty.call(b,key);
    const therapy=has("therapy_with_alex")?(b.therapy_with_alex?1:0):Number(current.therapy_with_alex||0);
    const school=has("school_followup")?(b.school_followup?1:0):Number(current.school_followup||0);
    const schoolName=has("school_name")?safeText(b.school_name,180):safeText(current.school_name,180);
    const grade=has("grade_level")?safeText(b.grade_level,100):safeText(current.grade_level,100);
    const year=has("school_year")?safeText(b.school_year,60):safeText(current.school_year,60);
    await env.DB.prepare(`INSERT INTO person_programs (person_id,therapy_with_alex,school_followup,school_name,grade_level,school_year,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET therapy_with_alex=excluded.therapy_with_alex,school_followup=excluded.school_followup,school_name=excluded.school_name,grade_level=excluded.grade_level,school_year=excluded.school_year,updated_at=excluded.updated_at`)
      .bind(personId,therapy,school,schoolName,grade,year,nowISO()).run();
    if(!therapy) await env.DB.prepare(`UPDATE client_access SET ai_enabled=0,updated_at=? WHERE person_id=?`).bind(nowISO(),personId).run();
    return json({ok:true,program:await getPersonProgram(env,personId)});
  }

  if (path === "/api/admin/teachers" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const {results}=await env.DB.prepare(`SELECT t.id,t.full_name,t.email,t.school_name,t.active,t.agreement_accepted_at,t.last_login_at,COUNT(CASE WHEN ta.active=1 THEN 1 END) AS student_count FROM teachers t LEFT JOIN teacher_assignments ta ON ta.teacher_id=t.id WHERE t.archived_at IS NULL GROUP BY t.id ORDER BY t.full_name`).all();
    return json({teachers:results||[]});
  }

  if (path === "/api/admin/teachers/create" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req); const name=safeText(b.full_name,160); if(!name) return json({error:"Nombre del docente obligatorio."},400);
    const code=generateRoleAccessCode("D"),hash=await sha256(code),id=makeId("teacher"),now=nowISO();
    await env.DB.prepare(`INSERT INTO teachers (id,full_name,email,school_name,access_hash,access_hint,active,agreement_version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?,?)`).bind(id,name,safeText(b.email,180),safeText(b.school_name,180)||'CIDEB',hash,code.slice(-4),TEACHER_AGREEMENT_VERSION,now,now).run();
    await logAudit(env,"admin","alex","create_teacher_access",null,`Docente: ${name}`);
    return json({ok:true,teacher_id:id,access_code:code});
  }

  if (path === "/api/admin/teachers/assign" && req.method === "POST") {
    await ensureCidebDirectoryTables(env); const b=await parseBody(req),teacherId=safeText(b.teacher_id,120),personId=safeText(b.person_id,120); if(!teacherId||!personId) return json({error:"Docente y alumno son obligatorios."},400);
    const current=await currentTeacherForStudent(env,personId); if(current) return json({error:`${current.full_name} ya es el maestro actual. Usa “Transferir docente” desde la ficha del alumno.`},409);
    try{return json(await performTeacherTransfer(env,{personId,toTeacherId:teacherId,actorRole:'admin',actorId:'alex',transferNote:'Asignación inicial'}));}catch(e){return json({error:safeText(e.message||e,500)},400);}
  }

  if (path === "/api/admin/teachers/detail" && req.method === "GET") {
    await ensureSchoolModuleTables(env);
    const teacherId=safeText(url.searchParams.get('teacher_id'),120);
    const teacher=await env.DB.prepare(`SELECT id,full_name,email,school_name,active,access_hint,agreement_version,agreement_accepted_at,last_login_at,archived_at FROM teachers WHERE id=? AND archived_at IS NULL`).bind(teacherId).first();
    if(!teacher)return json({error:'Docente no encontrado.'},404);
    const {results}=await env.DB.prepare(`SELECT ta.person_id,ta.school_year,ta.active,p.full_name FROM teacher_assignments ta JOIN people p ON p.id=ta.person_id WHERE ta.teacher_id=? AND ta.active=1 ORDER BY p.full_name`).bind(teacherId).all();
    return json({teacher,assignments:results||[]});
  }

  if (path === "/api/admin/teachers/access" && req.method === "POST") {
    const b=await parseBody(req),teacherId=safeText(b.teacher_id,120);
    await env.DB.prepare(`UPDATE teachers SET active=?,updated_at=? WHERE id=?`).bind(b.active?1:0,nowISO(),teacherId).run();
    await logAudit(env,'admin','alex',b.active?'activate_teacher':'deactivate_teacher',null,`Docente ${teacherId}`);
    return json({ok:true});
  }

  if (path === "/api/admin/teachers/regenerate" && req.method === "POST") {
    const b=await parseBody(req),teacherId=safeText(b.teacher_id,120);
    const teacher=await env.DB.prepare(`SELECT id FROM teachers WHERE id=?`).bind(teacherId).first();
    if(!teacher)return json({error:'Docente no encontrado.'},404);
    const code=generateRoleAccessCode('D'),hash=await sha256(code),now=nowISO();
    await env.DB.prepare(`UPDATE teachers SET access_hash=?,access_hint=?,active=1,agreement_accepted_at=NULL,agreement_signed_name=NULL,agreement_version=?,updated_at=? WHERE id=?`).bind(hash,code.slice(-4),TEACHER_AGREEMENT_VERSION,now,teacherId).run();
    await logAudit(env,'admin','alex','regenerate_teacher_access',null,`Docente ${teacherId}`);
    return json({ok:true,access_code:code});
  }

  if (path === "/api/admin/teachers/delete" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const b=await parseBody(req),teacherId=safeText(b.teacher_id,120),confirmation=safeText(b.confirmation,40).toUpperCase();
    if(!teacherId)return json({error:'Docente obligatorio.'},400);
    if(confirmation!=='ELIMINAR')return json({error:'Confirmación inválida. Escribe ELIMINAR.'},400);
    const teacher=await env.DB.prepare(`SELECT id,full_name,archived_at FROM teachers WHERE id=?`).bind(teacherId).first();
    if(!teacher||teacher.archived_at)return json({error:'Docente no encontrado.'},404);
    const assigned=await env.DB.prepare(`SELECT COUNT(*) AS count FROM teacher_assignments WHERE teacher_id=? AND active=1`).bind(teacherId).first();
    if(Number(assigned?.count||0)>0)return json({error:`Este docente todavía tiene ${Number(assigned.count)} alumno(s) asignado(s). Transfiérelos o quítalos antes de eliminarlo.`},409);
    const now=nowISO();
    await env.DB.prepare(`UPDATE teachers SET active=0,archived_at=?,updated_at=? WHERE id=?`).bind(now,now,teacherId).run();
    await logAudit(env,'admin','alex','delete_teacher_access',null,`Docente: ${teacher.full_name} · ${teacherId}`);
    return json({ok:true,message:`${teacher.full_name} fue eliminado de la lista de docentes. Su historial se conservó.`});
  }

  if (path === "/api/admin/teachers/unassign" && req.method === "POST") {
    const b=await parseBody(req),teacherId=safeText(b.teacher_id,120),personId=safeText(b.person_id,120),year=safeText(b.school_year,60);
    await env.DB.prepare(`UPDATE teacher_assignments SET active=0 WHERE teacher_id=? AND person_id=? AND school_year=?`).bind(teacherId,personId,year).run();
    await logAudit(env,'admin','alex','unassign_teacher',personId,`Docente ${teacherId} · ${year}`);
    return json({ok:true});
  }



  if (path === "/api/admin/coordinators" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const {results}=await env.DB.prepare(`SELECT id,full_name,email,school_name,active,access_hint,agreement_accepted_at,last_login_at FROM coordinators ORDER BY full_name`).all();
    return json({coordinators:results||[]});
  }
  if (path === "/api/admin/coordinators/create" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req),name=safeText(b.full_name,160); if(!name)return json({error:"Nombre obligatorio."},400);
    const code=generateRoleAccessCode('C'),hash=await sha256(code),id=makeId('coord'),now=nowISO();
    await env.DB.prepare(`INSERT INTO coordinators (id,full_name,email,school_name,access_hash,access_hint,active,agreement_version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?,?)`).bind(id,name,safeText(b.email,180),safeText(b.school_name,180)||'CIDEB',hash,code.slice(-4),COORDINATOR_AGREEMENT_VERSION,now,now).run();
    await logAudit(env,'admin','alex','create_coordinator_access',null,`Coordinación: ${name}`); return json({ok:true,coordinator_id:id,access_code:code});
  }
  if (path === "/api/admin/coordinators/access" && req.method === "POST") {
    const b=await parseBody(req),id=safeText(b.coordinator_id,120); await env.DB.prepare(`UPDATE coordinators SET active=?,updated_at=? WHERE id=?`).bind(b.active?1:0,nowISO(),id).run();
    await logAudit(env,'admin','alex',b.active?'activate_coordinator':'deactivate_coordinator',null,`Coordinación ${id}`); return json({ok:true});
  }
  if (path === "/api/admin/coordinators/regenerate" && req.method === "POST") {
    const b=await parseBody(req),id=safeText(b.coordinator_id,120),row=await env.DB.prepare(`SELECT id FROM coordinators WHERE id=?`).bind(id).first(); if(!row)return json({error:'Acceso no encontrado.'},404);
    const code=generateRoleAccessCode('C'),hash=await sha256(code),now=nowISO();
    await env.DB.prepare(`UPDATE coordinators SET access_hash=?,access_hint=?,active=1,agreement_accepted_at=NULL,agreement_signed_name=NULL,agreement_version=?,updated_at=? WHERE id=?`).bind(hash,code.slice(-4),COORDINATOR_AGREEMENT_VERSION,now,id).run();
    await logAudit(env,'admin','alex','regenerate_coordinator_access',null,`Coordinación ${id}`); return json({ok:true,access_code:code});
  }
  if (path === "/api/admin/teacher-transfer/preview" && req.method === "GET") {
    await ensureCidebDirectoryTables(env); const personId=safeText(url.searchParams.get('person_id'),120); if(!personId)return json({error:'Alumno obligatorio.'},400);
    if(!(await isCidebStudent(env,personId)))return json({error:'Alumno CIDEB no encontrado.'},404);
    const [current,enrollment,continuity,{results:teachers},latest]=await Promise.all([
      currentTeacherForStudent(env,personId),currentEnrollment(env,personId),env.DB.prepare(`SELECT general_description,strengths,support_needs,strategies,watch_items,approved_at FROM school_continuity WHERE person_id=? AND approved_at IS NOT NULL`).bind(personId).first(),env.DB.prepare(`SELECT id,full_name FROM teachers WHERE active=1 AND LOWER(COALESCE(school_name,'')) LIKE '%cideb%' ORDER BY full_name`).all(),latestTeacherTransfer(env,personId)
    ]);
    return json({current_teacher:current||null,enrollment:enrollment||{},continuity:continuity||{},teachers:(teachers||[]).filter(t=>t.id!==current?.teacher_id),latest_transfer:latest||null});
  }
  if (path === "/api/admin/teacher-transfer" && req.method === "POST") {
    const b=await parseBody(req),personId=safeText(b.person_id,120),toTeacherId=safeText(b.to_teacher_id,120); if(!personId||!toTeacherId)return json({error:'Alumno y nuevo docente son obligatorios.'},400);
    try{return json(await performTeacherTransfer(env,{personId,toTeacherId,actorRole:'admin',actorId:'alex',transferNote:safeText(b.transfer_note,1500)}));}catch(e){return json({error:safeText(e.message||e,500)},400);}
  }
  if (path === "/api/admin/teacher-transfer/undo" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req),transferId=safeText(b.transfer_id,120); if(!transferId)return json({error:'Transferencia obligatoria.'},400);
    const tr=await env.DB.prepare(`SELECT * FROM teacher_transfers WHERE id=? AND undone_at IS NULL`).bind(transferId).first(); if(!tr)return json({error:'Transferencia no encontrada o ya deshecha.'},404);
    if(Date.now()-Date.parse(tr.created_at)>24*60*60*1000)return json({error:'La ventana de 24 horas para deshacer esta transferencia ya terminó.'},409);
    const activity=await env.DB.prepare(`SELECT COUNT(*) AS count FROM teacher_observations WHERE person_id=? AND teacher_id=? AND datetime(created_at)>datetime(?)`).bind(tr.person_id,tr.to_teacher_id,tr.created_at).first();
    if(Number(activity?.count||0)>0)return json({error:'No se puede deshacer porque el nuevo docente ya registró información.'},409);
    const now=nowISO(),enrollment=await currentEnrollment(env,tr.person_id),period=safeText(enrollment?.school_year||tr.school_period||'',60);
    const ops=[env.DB.prepare(`UPDATE teacher_assignments SET active=0 WHERE person_id=? AND active=1`).bind(tr.person_id),env.DB.prepare(`UPDATE teacher_transfers SET undone_at=?,undone_by_role='admin',undone_by_id='alex' WHERE id=?`).bind(now,transferId)];
    if(tr.from_teacher_id){const old=await env.DB.prepare(`SELECT id FROM teachers WHERE id=? AND active=1`).bind(tr.from_teacher_id).first();if(old)ops.push(env.DB.prepare(`INSERT INTO teacher_assignments (teacher_id,person_id,school_year,active,created_at) VALUES (?,?,?,1,?) ON CONFLICT(teacher_id,person_id,school_year) DO UPDATE SET active=1,created_at=excluded.created_at`).bind(tr.from_teacher_id,tr.person_id,period,now));}
    await env.DB.batch(ops); await logAudit(env,'admin','alex','undo_teacher_transfer',tr.person_id,`Transferencia ${transferId}`); return json({ok:true});
  }

  if (path === "/api/admin/professional-school-observations" && req.method === "GET") {
    await ensureSchoolModuleTables(env);
    const personId = safeText(url.searchParams.get("person_id"), 120);
    if (!personId) return json({ error: "Alumno obligatorio." }, 400);
    const { results } = await env.DB.prepare(`
      SELECT *
      FROM professional_school_observations
      WHERE person_id=?
      ORDER BY observation_date DESC, created_at DESC
      LIMIT 100
    `).bind(personId).all();
    return json({ observations: results || [] });
  }

  if (path === "/api/admin/professional-school-observations" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const observationDate = safeText(b.observation_date, 20);
    const description = safeText(b.description, 5000);
    if (!personId || !observationDate || !description) {
      return json({ error: "Alumno, fecha y observación son obligatorios." }, 400);
    }
    if (!isValidDateOnly(observationDate) || observationDate > nortiaLocalDate()) {
      return json({ error: "La fecha de observación no es válida." }, 400);
    }
    const person = await env.DB.prepare(`SELECT id FROM people WHERE id=? AND status='active'`).bind(personId).first();
    if (!person) return json({ error: "Alumno no encontrado o inactivo." }, 404);

    const rating = value => {
      if (value === "" || value == null) return null;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
    };
    const published = b.visible_to_teachers === true || b.visible_to_teachers === 1 || b.visible_to_teachers === "1";
    const now = nowISO();
    const id = makeId("probs");

    await env.DB.prepare(`
      INSERT INTO professional_school_observations (
        id,person_id,observation_date,subject,context,
        attention_support,instructions_support,organization_support,peer_support,
        frustration_support,transitions_support,autonomy_support,help_seeking_support,
        description,strategy_used,recommendation_text,visible_to_teachers,published_at,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, personId, observationDate,
      safeText(b.subject, 300), safeText(b.context, 200),
      rating(b.attention_support), rating(b.instructions_support), rating(b.organization_support), rating(b.peer_support),
      rating(b.frustration_support), rating(b.transitions_support), rating(b.autonomy_support), rating(b.help_seeking_support),
      description, safeText(b.strategy_used, 5000), safeText(b.recommendation_text, 5000),
      published ? 1 : 0, published ? now : null, now, now
    ).run();

    await logAudit(
      env,
      "admin",
      "alex",
      published ? "publish_professional_school_observation" : "save_professional_school_observation",
      personId,
      published ? "Observación profesional publicada para docentes asignados." : "Observación profesional guardada como privada."
    );
    return json({ ok: true, id, published });
  }

  if (path === "/api/admin/professional-school-observations/visibility" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const b = await parseBody(req);
    const id = safeText(b.id, 120);
    const row = await env.DB.prepare(`SELECT person_id FROM professional_school_observations WHERE id=?`).bind(id).first();
    if (!row) return json({ error: "Observación no encontrada." }, 404);
    const visible = b.visible === true || b.visible === 1 || b.visible === "1";
    const now = nowISO();
    await env.DB.prepare(`
      UPDATE professional_school_observations
      SET visible_to_teachers=?, published_at=?, updated_at=?
      WHERE id=?
    `).bind(visible ? 1 : 0, visible ? now : null, now, id).run();
    await logAudit(env,"admin","alex",visible?"publish_professional_school_observation":"hide_professional_school_observation",row.person_id,visible?"Observación profesional visible para docentes.":"Observación profesional retirada de la vista docente.");
    return json({ ok: true, visible });
  }

  if (path === "/api/admin/professional-school-observations/delete" && req.method === "POST") {
    await ensureSchoolModuleTables(env);
    const b = await parseBody(req);
    const id = safeText(b.id, 120);
    const row = await env.DB.prepare(`SELECT person_id FROM professional_school_observations WHERE id=?`).bind(id).first();
    if (!row) return json({ error: "Observación no encontrada." }, 404);
    await env.DB.prepare(`DELETE FROM professional_school_observations WHERE id=?`).bind(id).run();
    await logAudit(env,"admin","alex","delete_professional_school_observation",row.person_id,"Observación profesional eliminada.");
    return json({ ok: true });
  }

  if (path === "/api/admin/teacher-observations" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const {results}=await env.DB.prepare(`SELECT o.*,t.full_name AS teacher_name,p.full_name AS person_name FROM teacher_observations o JOIN teachers t ON t.id=o.teacher_id JOIN people p ON p.id=o.person_id ORDER BY CASE o.status WHEN 'submitted' THEN 0 ELSE 1 END,o.created_at DESC LIMIT 100`).all(); return json({observations:results||[]});
  }

  if (path === "/api/admin/teacher-observations/review" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req),id=safeText(b.id,120); if(!id)return json({error:"Comentario obligatorio."},400);
    const row=await env.DB.prepare(`SELECT person_id FROM teacher_observations WHERE id=?`).bind(id).first(); if(!row)return json({error:"Comentario no encontrado."},404);
    const included=b.included_in_record?1:0;
    await env.DB.prepare(`UPDATE teacher_observations SET status='reviewed',included_in_record=?,private_note=?,professional_comment=?,reviewed_at=?,updated_at=? WHERE id=?`).bind(included,safeText(b.private_note,5000),safeText(b.professional_comment,5000),nowISO(),nowISO(),id).run();
    await logAudit(env,"admin","alex","review_teacher_observation",row.person_id,included?"Comentario docente revisado e integrado al expediente.":"Comentario docente revisado como antecedente, sin integrarlo al expediente."); return json({ok:true,included_in_record:included});
  }

  if (path === "/api/admin/school-continuity/ai-draft" && req.method === "POST") {
    await ensureCidebDirectoryTables(env);
    const limited = await enforceActionRateLimit(req, env, "admin_school_report_ai", 20, 600);
    if (limited) return limited;

    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const alexNotes = safeText(b.alex_notes, 3000);
    if (!personId) return json({ error: "Persona obligatoria." }, 400);
    if (!env.AI || typeof env.AI.run !== "function") {
      return json({ error: "La IA interna de RAUDAL no está disponible en este momento." }, 503);
    }

    const [person, program, snapshot, teacherRows, professionalRows] = await Promise.all([
      env.DB.prepare(`SELECT id,full_name,age,status FROM people WHERE id=?`).bind(personId).first(),
      getPersonProgram(env, personId),
      getSchoolSnapshot(env, personId, true),
      env.DB.prepare(`
        SELECT observation_date,subject,context,description,strategy_used,result_text,professional_comment,
          attention_support,instructions_support,organization_support,peer_support,frustration_support,
          transitions_support,autonomy_support,help_seeking_support
        FROM teacher_observations
        WHERE person_id=? AND status='reviewed' AND included_in_record=1
        ORDER BY observation_date DESC, COALESCE(reviewed_at,updated_at,created_at) DESC
        LIMIT 20
      `).bind(personId).all(),
      env.DB.prepare(`
        SELECT observation_date,subject,context,description,strategy_used,recommendation_text,
          attention_support,instructions_support,organization_support,peer_support,frustration_support,
          transitions_support,autonomy_support,help_seeking_support
        FROM professional_school_observations
        WHERE person_id=? AND visible_to_teachers=1
        ORDER BY observation_date DESC, COALESCE(published_at,updated_at,created_at) DESC
        LIMIT 20
      `).bind(personId).all()
    ]);

    if (!person) return json({ error: "Alumno no encontrado." }, 404);
    const structuredEvidenceCount = Number(snapshot?.observation_count || 0);
    if (!structuredEvidenceCount && !alexNotes) {
      return json({ error: "Escribe una observación en el cuadro de texto o registra al menos una observación profesional/comentario docente integrado antes de generar el borrador." }, 400);
    }

    const evidenceCount = structuredEvidenceCount + (alexNotes ? 1 : 0);
    const evidenceLabel = evidenceCount <= 2 ? "Datos iniciales" : evidenceCount <= 5 ? "Patrón emergente" : "Mayor consistencia";
    const reviewNote = evidenceCount <= 2
      ? `Borrador basado en ${evidenceCount} registro${evidenceCount===1?'':'s'}. No representa una tendencia y debe verificarse con nuevas observaciones.`
      : evidenceCount <= 5
        ? `Borrador basado en ${evidenceCount} registros. Hay señales emergentes, pero deben seguir verificándose.`
        : `Borrador basado en ${evidenceCount} registros. Describe patrones observados, sin constituir diagnóstico.`;

    const teacherEvidence = (teacherRows.results || []).map((o, i) => ({
      source: "docente",
      date: o.observation_date,
      subject: o.subject || "",
      context: o.context || "",
      description: safeText(o.description, 1200),
      strategy: safeText(o.strategy_used, 800),
      result: safeText(o.result_text, 800),
      reviewed_comment: safeText(o.professional_comment, 800)
    }));
    const professionalEvidence = (professionalRows.results || []).map((o, i) => ({
      source: "profesional",
      date: o.observation_date,
      subject: o.subject || "",
      context: o.context || "",
      description: safeText(o.description, 1200),
      strategy: safeText(o.strategy_used, 800),
      recommendation: safeText(o.recommendation_text, 800)
    }));

    const system = `
Eres un asistente interno de redacción para RAUDAL. Tu trabajo es preparar un BORRADOR de continuidad escolar para que Alex lo revise antes de publicarlo.

REGLAS OBLIGATORIAS:
- Usa únicamente la evidencia escolar autorizada incluida en el mensaje y, si existen, las notas textuales de Alex incluidas como contexto adicional. No inventes hechos.
- Nunca diagnostiques ni sugieras trastornos, condiciones clínicas, intenciones, personalidad fija o causas psicológicas.
- No uses lenguaje estigmatizante ni etiquetas sobre el alumno.
- Si hay 1 o 2 registros, NO hables de tendencias, patrones estables ni generalices. Usa expresiones como "en el registro disponible", "se observó" o "puede ser útil probar".
- Si no hay evidencia suficiente para una fortaleza o necesidad específica, dilo con prudencia en vez de inventarla.
- Las recomendaciones deben ser prácticas, escolares, reversibles y fáciles de observar.
- No menciones IA en el texto del informe final.
- Español claro y profesional. Párrafos breves.
- El contenido será revisado por Alex antes de que docentes o coordinación puedan verlo.

RESPONDE EXCLUSIVAMENTE CON ESTAS 5 ETIQUETAS, SIN JSON, SIN MARKDOWN Y SIN TEXTO FUERA DE ELLAS:
<general_description>máximo 90 palabras</general_description>
<strengths>máximo 70 palabras; si no hay evidencia suficiente, indícalo con prudencia</strengths>
<support_needs>máximo 80 palabras</support_needs>
<strategies>3 a 5 estrategias de apoyo recomendadas para probar con el alumno, una por línea. No afirmes que ya funcionaron salvo que la evidencia lo indique expresamente.</strategies>
<watch_items>3 a 5 aspectos concretos para seguir observando, uno por línea</watch_items>
`.trim();

    const userContext = {
      student: { full_name: person.full_name, age: person.age ?? null },
      school: { school_name: program?.school_name || "CIDEB", grade_level: program?.grade_level || "", school_period: program?.school_year || "" },
      alex_notes: alexNotes || "",
      evidence_level: evidenceLabel,
      observation_count: evidenceCount,
      distribution: snapshot.distribution,
      contexts: snapshot.contexts,
      teacher_observations: teacherEvidence,
      professional_observations: professionalEvidence
    };

    try {
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(userContext) }
        ],
        max_tokens: 760
      });
      let aiText = extractAIText(result).trim();
      let draft;
      try {
        draft = continuityDraftFromAIText(aiText);
      } catch {
        // Segundo intento deliberadamente más simple: algunos modelos pequeños pueden
        // responder con prosa aunque el primer prompt pida una estructura concreta.
        const retry = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
          messages: [
            { role: "system", content: `${system}\nIMPORTANTE: Este es un reintento. Devuelve las cinco etiquetas exactamente como se solicitaron.` },
            { role: "user", content: JSON.stringify(userContext) }
          ],
          max_tokens: 760
        });
        aiText = extractAIText(retry).trim();
        draft = continuityDraftFromAIText(aiText);
      }
      if (!Object.values(draft).some(Boolean)) return json({ error: "La IA no pudo generar un borrador útil en este momento." }, 502);
      await logAudit(env, "admin", "alex", "generate_school_continuity_ai_draft", personId, `${evidenceLabel} · ${evidenceCount} registro${evidenceCount===1?'':'s'} · borrador no publicado`);
      return json({ ok: true, draft, evidence_label: evidenceLabel, observation_count: evidenceCount, review_note: reviewNote });
    } catch (error) {
      console.error("school-continuity ai-draft failed", safeText(error?.message || error, 500));
      return json({ error: "No fue posible generar el borrador en este intento. Intenta nuevamente; tus observaciones no se perdieron." }, 502);
    }
  }

  if (path === "/api/admin/school-continuity" && req.method === "GET") {
    await ensureCidebDirectoryTables(env);
    const personId=safeText(url.searchParams.get("person_id"),120);
    if(!personId)return json({error:"Persona obligatoria."},400);
    const [published,draft,person,program,version] = await Promise.all([
      env.DB.prepare(`SELECT * FROM school_continuity WHERE person_id=? AND approved_at IS NOT NULL`).bind(personId).first(),
      env.DB.prepare(`SELECT * FROM school_continuity_drafts WHERE person_id=?`).bind(personId).first(),
      env.DB.prepare(`SELECT id,full_name,age,status FROM people WHERE id=?`).bind(personId).first(),
      getPersonProgram(env,personId),
      env.DB.prepare(`SELECT COUNT(*) AS count,MAX(version_number) AS latest FROM school_continuity_versions WHERE person_id=?`).bind(personId).first()
    ]);
    const snapshot=await getSchoolSnapshot(env,personId,true);
    return json({
      person, program,
      continuity: draft || published || {},
      published: published || {},
      has_draft: !!draft,
      snapshot,
      version_count:Number(version?.count||0),
      latest_version:Number(version?.latest||0)
    });
  }

  if (path === "/api/admin/school-continuity" && req.method === "POST") {
    await ensureCidebDirectoryTables(env);
    const b=await parseBody(req),personId=safeText(b.person_id,120);
    if(!personId)return json({error:"Persona obligatoria."},400);
    const now=nowISO();
    const general=safeText(b.general_description,5000),strengths=safeText(b.strengths,5000),support=safeText(b.support_needs,5000),strategies=safeText(b.strategies,5000),watch=safeText(b.watch_items,5000);
    if (!b.approve) {
      await env.DB.prepare(`INSERT INTO school_continuity_drafts (person_id,general_description,strengths,support_needs,strategies,watch_items,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET general_description=excluded.general_description,strengths=excluded.strengths,support_needs=excluded.support_needs,strategies=excluded.strategies,watch_items=excluded.watch_items,updated_at=excluded.updated_at`)
        .bind(personId,general,strengths,support,strategies,watch,now).run();
      await logAudit(env,"admin","alex","save_school_continuity_draft",personId,"Borrador privado guardado; la versión publicada permanece sin cambios.");
      return json({ok:true,published:false});
    }
    const v=await env.DB.prepare(`SELECT COALESCE(MAX(version_number),0)+1 AS next FROM school_continuity_versions WHERE person_id=?`).bind(personId).first();
    const versionNumber=Number(v?.next||1);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO school_continuity (person_id,general_description,strengths,support_needs,strategies,watch_items,approved_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET general_description=excluded.general_description,strengths=excluded.strengths,support_needs=excluded.support_needs,strategies=excluded.strategies,watch_items=excluded.watch_items,approved_at=excluded.approved_at,updated_at=excluded.updated_at`).bind(personId,general,strengths,support,strategies,watch,now,now),
      env.DB.prepare(`INSERT INTO school_continuity_versions (id,person_id,version_number,general_description,strengths,support_needs,strategies,watch_items,published_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(makeId('contver'),personId,versionNumber,general,strengths,support,strategies,watch,now,now),
      env.DB.prepare(`DELETE FROM school_continuity_drafts WHERE person_id=?`).bind(personId)
    ]);
    await logAudit(env,"admin","alex","approve_school_continuity",personId,`Ficha de continuidad escolar · versión ${versionNumber}`);
    return json({ok:true,published:true,version_number:versionNumber});
  }

  if (path === "/api/admin/family/access" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const personId=safeText(url.searchParams.get("person_id"),120); const {results}=await env.DB.prepare(`SELECT id,full_name,relationship,email,access_hint,active,agreement_accepted_at,last_login_at FROM guardians WHERE person_id=? ORDER BY created_at DESC`).bind(personId).all(); return json({guardians:results||[]});
  }

  if (path === "/api/admin/family/access/create" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req),personId=safeText(b.person_id,120),name=safeText(b.full_name,160); if(!personId||!name)return json({error:"Alumno y nombre del tutor son obligatorios."},400); const person=await env.DB.prepare(`SELECT full_name FROM people WHERE id=?`).bind(personId).first(); if(!person)return json({error:"Persona no encontrada."},404);
    const code=generateRoleAccessCode("F"),hash=await sha256(code),id=makeId("guardian"),now=nowISO();
    await env.DB.prepare(`INSERT INTO guardians (id,person_id,full_name,relationship,email,access_hash,access_hint,active,agreement_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)`).bind(id,personId,name,safeText(b.relationship,80),safeText(b.email,180),hash,code.slice(-4),FAMILY_AGREEMENT_VERSION,now,now).run();
    await logAudit(env,"admin","alex","create_family_access",personId,`Tutor: ${name}`); return json({ok:true,guardian_id:id,access_code:code,person_name:person.full_name});
  }

  if (path === "/api/admin/family/access/update" && req.method === "POST") {
    const b=await parseBody(req),id=safeText(b.guardian_id,120);
    const guardian=await env.DB.prepare(`SELECT person_id FROM guardians WHERE id=?`).bind(id).first();
    if(!guardian)return json({error:'Acceso familiar no encontrado.'},404);
    await env.DB.prepare(`UPDATE guardians SET active=?,updated_at=? WHERE id=?`).bind(b.active?1:0,nowISO(),id).run();
    await logAudit(env,'admin','alex',b.active?'activate_family_access':'deactivate_family_access',guardian.person_id,`Tutor ${id}`);
    return json({ok:true});
  }

  if (path === "/api/admin/family/access/regenerate" && req.method === "POST") {
    const b=await parseBody(req),id=safeText(b.guardian_id,120);
    const guardian=await env.DB.prepare(`SELECT person_id FROM guardians WHERE id=?`).bind(id).first();
    if(!guardian)return json({error:'Acceso familiar no encontrado.'},404);
    const code=generateRoleAccessCode('F'),hash=await sha256(code),now=nowISO();
    await env.DB.prepare(`UPDATE guardians SET access_hash=?,access_hint=?,active=1,agreement_accepted_at=NULL,agreement_signed_name=NULL,agreement_version=?,updated_at=? WHERE id=?`).bind(hash,code.slice(-4),FAMILY_AGREEMENT_VERSION,now,id).run();
    await logAudit(env,'admin','alex','regenerate_family_access',guardian.person_id,`Tutor ${id}`);
    return json({ok:true,access_code:code});
  }

  if (path === "/api/admin/family-profile" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const personId=safeText(url.searchParams.get("person_id"),120); const profile=await env.DB.prepare(`SELECT * FROM family_profiles WHERE person_id=?`).bind(personId).first(); return json({profile:profile||{}});
  }

  if (path === "/api/admin/family-profile" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req),personId=safeText(b.person_id,120); if(!personId)return json({error:"Persona obligatoria."},400);
    await env.DB.prepare(`INSERT INTO family_profiles (person_id,summary,strengths,current_goals,recommendations_home,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET summary=excluded.summary,strengths=excluded.strengths,current_goals=excluded.current_goals,recommendations_home=excluded.recommendations_home,updated_at=excluded.updated_at`).bind(personId,safeText(b.summary,5000),safeText(b.strengths,5000),safeText(b.current_goals,5000),safeText(b.recommendations_home,5000),nowISO()).run(); return json({ok:true});
  }

  if (path === "/api/admin/family-observations" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const {results}=await env.DB.prepare(`SELECT o.*,g.full_name AS guardian_name,p.full_name AS person_name FROM family_observations o JOIN guardians g ON g.id=o.guardian_id JOIN people p ON p.id=o.person_id ORDER BY CASE o.status WHEN 'submitted' THEN 0 ELSE 1 END,o.created_at DESC LIMIT 100`).all(); return json({observations:results||[]});
  }

  if (path === "/api/admin/family-observations/review" && req.method === "POST") {
    await ensureSchoolModuleTables(env); const b=await parseBody(req),id=safeText(b.id,120); const row=await env.DB.prepare(`SELECT person_id FROM family_observations WHERE id=?`).bind(id).first(); if(!row)return json({error:"Observación no encontrada."},404);
    await env.DB.prepare(`UPDATE family_observations SET status='reviewed',private_note=?,professional_comment=?,reviewed_at=?,updated_at=? WHERE id=?`).bind(safeText(b.private_note,5000),safeText(b.professional_comment,5000),nowISO(),nowISO(),id).run(); await logAudit(env,"admin","alex","review_family_observation",row.person_id,"Observación familiar revisada"); return json({ok:true});
  }

  if (path === "/api/admin/audit" && req.method === "GET") {
    await ensureSchoolModuleTables(env); const personId=safeText(url.searchParams.get("person_id"),120); const filter=personId?"WHERE a.person_id=?":""; const sql=`SELECT a.*,p.full_name AS person_name,CASE WHEN a.actor_role='teacher' THEN (SELECT full_name FROM teachers WHERE id=a.actor_id) WHEN a.actor_role='family' THEN (SELECT full_name FROM guardians WHERE id=a.actor_id) WHEN a.actor_role='coordinator' THEN (SELECT full_name FROM coordinators WHERE id=a.actor_id) ELSE 'Alex' END AS actor_name FROM audit_log a LEFT JOIN people p ON p.id=a.person_id ${filter} ORDER BY a.created_at DESC LIMIT 150`; const q=env.DB.prepare(sql); const {results}=personId?await q.bind(personId).all():await q.all(); return json({audit:results||[]});
  }

  if (path === "/api/admin/dashboard" && req.method === "GET") {
    await ensureNotificationsTable(env);
    const [requested, confirmed, people, risk] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status='requested'").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status='confirmed'").first(),
      env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM people p
        LEFT JOIN person_programs pp ON pp.person_id=p.id
        LEFT JOIN person_data_context dc ON dc.person_id=p.id
        WHERE p.status='active'
          AND (
            COALESCE(pp.therapy_with_alex,0)=1
            OR COALESCE(dc.context_type,'private') IN ('private','mixed','other')
          )
      `).first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE type='ai_risk' AND is_read=0").first()
    ]);
    return json({
      requested: requested?.count || 0,
      confirmed: confirmed?.count || 0,
      active_people: people?.count || 0,
      risk_messages: risk?.count || 0
    });
  }

  if (path === "/api/admin/appointments" && req.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT a.*,p.full_name AS linked_person_name FROM appointments a LEFT JOIN people p ON p.id=a.person_id
      ORDER BY a.preferred_date ASC, a.preferred_time ASC
    `).all();
    return json({ appointments: results || [] });
  }

  if (path === "/api/admin/appointments/link" && req.method === "POST") {
    const b=await parseBody(req),id=safeText(b.id,120),personId=safeText(b.person_id,120);
    const person=await env.DB.prepare(`SELECT id,full_name FROM people WHERE id=?`).bind(personId).first();
    if(!person)return json({error:'Persona no encontrada.'},404);
    await env.DB.prepare(`UPDATE appointments SET person_id=?,updated_at=? WHERE id=?`).bind(personId,nowISO(),id).run();
    await logAudit(env,'admin','alex','link_appointment',personId,`Cita ${id}`);
    return json({ok:true,person_name:person.full_name});
  }

  if (path === "/api/admin/appointments/status" && req.method === "POST") {
    const b = await parseBody(req);
    const allowed = new Set(["requested","confirmed","completed","cancelled"]);
    if (!allowed.has(b.status)) return json({ error: "Estado inválido" }, 400);
    await env.DB.prepare(`UPDATE appointments SET status=?, updated_at=? WHERE id=?`)
      .bind(b.status, nowISO(), safeText(b.id, 120)).run();
    return json({ ok: true });
  }


  if (path === "/api/admin/search" && req.method === "GET") {
    await ensureCidebDirectoryTables(env);
    const q = cleanSchoolValue(url.searchParams.get("q"), 120);
    if (q.length < 2) return json({ results: [] });
    const like = `%${q.toLowerCase()}%`;
    const { results } = await env.DB.prepare(`
      SELECT
        p.id,
        p.full_name,
        p.email,
        p.phone,
        p.status,
        COALESCE(dc.context_type,'private') AS context_type,
        COALESCE(se.student_number,'') AS student_number,
        COALESCE(se.grade_level,pp.grade_level,'') AS grade_level,
        COALESCE(se.group_name,'') AS group_name,
        COALESCE(se.school_year,pp.school_year,'') AS school_year,
        COALESCE(se.institution_name,pp.school_name,dc.institution_name,'') AS institution_name,
        COALESCE(pp.school_followup,0) AS school_followup
      FROM people p
      LEFT JOIN person_programs pp ON pp.person_id=p.id
      LEFT JOIN person_data_context dc ON dc.person_id=p.id
      LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
      WHERE
        LOWER(p.full_name) LIKE ?
        OR LOWER(COALESCE(p.email,'')) LIKE ?
        OR LOWER(COALESCE(p.phone,'')) LIKE ?
        OR LOWER(COALESCE(se.student_number,'')) LIKE ?
      ORDER BY CASE WHEN p.status='active' THEN 0 ELSE 1 END, p.full_name
      LIMIT 10
    `).bind(like, like, like, like).all();
    return json({ results: results || [] });
  }

  if (path === "/api/admin/cideb/students" && req.method === "GET") {
    await ensureCidebDirectoryTables(env);

    const q = cleanSchoolValue(url.searchParams.get("q"), 120).toLowerCase();
    const year = cleanSchoolValue(url.searchParams.get("year"), 40);
    const grade = cleanSchoolValue(url.searchParams.get("grade"), 60);
    const group = cleanSchoolValue(url.searchParams.get("group"), 60);
    const teacherId = cleanSchoolValue(url.searchParams.get("teacher"), 120);
    const status = cleanSchoolValue(url.searchParams.get("status") || "active", 30);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSizeRaw = Number(url.searchParams.get("page_size") || 25);
    const pageSize = [25, 50].includes(pageSizeRaw) ? pageSizeRaw : 25;
    const offset = (page - 1) * pageSize;

    const conditions = [
      `(LOWER(COALESCE(se.institution_name,pp.school_name,dc.institution_name,'')) LIKE '%cideb%' OR COALESCE(dc.context_type,'') IN ('cideb','mixed'))`
    ];
    const params = [];

    if (q) {
      const like = `%${q}%`;
      conditions.push(`(
        LOWER(p.full_name) LIKE ? OR
        LOWER(COALESCE(se.student_number,'')) LIKE ? OR
        LOWER(COALESCE(se.grade_level,pp.grade_level,'')) LIKE ? OR
        LOWER(COALESCE(se.group_name,'')) LIKE ? OR
        LOWER(COALESCE(p.email,'')) LIKE ? OR
        LOWER(COALESCE(p.phone,'')) LIKE ?
      )`);
      params.push(like, like, like, like, like, like);
    }
    if (year) { conditions.push(`COALESCE(se.school_year,pp.school_year,'')=?`); params.push(year); }
    if (grade) { conditions.push(`COALESCE(se.grade_level,pp.grade_level,'')=?`); params.push(grade); }
    if (group) { conditions.push(`COALESCE(se.group_name,'')=?`); params.push(group); }
    if (status && status !== 'all') { conditions.push(`p.status=?`); params.push(status); }
    if (teacherId) {
      conditions.push(`EXISTS (SELECT 1 FROM teacher_assignments tax WHERE tax.person_id=p.id AND tax.teacher_id=? AND tax.active=1)`);
      params.push(teacherId);
    }

    const where = conditions.join(' AND ');

    const countRow = await env.DB.prepare(`
      SELECT COUNT(DISTINCT p.id) AS count
      FROM people p
      LEFT JOIN person_programs pp ON pp.person_id=p.id
      LEFT JOIN person_data_context dc ON dc.person_id=p.id
      LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
      WHERE ${where}
    `).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT
        p.id,
        p.full_name,
        p.age,
        p.email,
        p.phone,
        p.status,
        COALESCE(se.student_number,'') AS student_number,
        COALESCE(se.grade_level,pp.grade_level,'') AS grade_level,
        COALESCE(se.group_name,'') AS group_name,
        COALESCE(se.school_year,pp.school_year,'') AS school_year,
        COALESCE(se.needs_review,0) AS needs_review,
        COALESCE(se.institution_name,pp.school_name,'CIDEB') AS institution_name,
        COALESCE(sc.approved_at,'') AS report_published_at,
        (SELECT COUNT(*) FROM teacher_observations too WHERE too.person_id=p.id AND too.status='submitted') AS pending_observations,
        (SELECT t.full_name FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.person_id=p.id AND ta.active=1 AND t.active=1 ORDER BY ta.created_at DESC LIMIT 1) AS teacher_names,
        (SELECT ta.teacher_id FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.person_id=p.id AND ta.active=1 AND t.active=1 ORDER BY ta.created_at DESC LIMIT 1) AS current_teacher_id,
        (SELECT COUNT(*) FROM guardians g WHERE g.person_id=p.id AND g.active=1) AS family_access_count
      FROM people p
      LEFT JOIN person_programs pp ON pp.person_id=p.id
      LEFT JOIN person_data_context dc ON dc.person_id=p.id
      LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
      LEFT JOIN school_continuity sc ON sc.person_id=p.id
      WHERE ${where}
      GROUP BY p.id
      ORDER BY CASE WHEN p.status='active' THEN 0 ELSE 1 END, p.full_name
      LIMIT ? OFFSET ?
    `).bind(...params, pageSize, offset).all();

    const [{ results: years }, { results: grades }, { results: groups }, { results: teachers }] = await Promise.all([
      env.DB.prepare(`SELECT DISTINCT school_year AS value FROM school_enrollments WHERE is_current=1 AND LOWER(institution_name) LIKE '%cideb%' AND COALESCE(school_year,'')<>'' ORDER BY school_year DESC`).all(),
      env.DB.prepare(`SELECT DISTINCT grade_level AS value FROM school_enrollments WHERE is_current=1 AND LOWER(institution_name) LIKE '%cideb%' AND COALESCE(grade_level,'')<>'' ORDER BY grade_level`).all(),
      env.DB.prepare(`SELECT DISTINCT group_name AS value FROM school_enrollments WHERE is_current=1 AND LOWER(institution_name) LIKE '%cideb%' AND COALESCE(group_name,'')<>'' ORDER BY group_name`).all(),
      env.DB.prepare(`SELECT id,full_name FROM teachers WHERE active=1 AND LOWER(COALESCE(school_name,'')) LIKE '%cideb%' ORDER BY full_name`).all()
    ]);

    const total = Number(countRow?.count || 0);
    return json({
      students: results || [],
      pagination: { page, page_size: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
      filters: {
        years: (years || []).map(x => x.value),
        grades: (grades || []).map(x => x.value),
        groups: (groups || []).map(x => x.value),
        teachers: teachers || []
      }
    });
  }

  if (path === "/api/admin/cideb/export-audit" && req.method === "POST") {
    const b=await parseBody(req);
    await logAudit(env,"admin","alex","export_cideb_directory",null,`Exportación de directorio CIDEB · ${safeText(b.total,20)} registros · ${safeText(b.filter_summary,300)}`);
    return json({ok:true});
  }

  if (path === "/api/admin/cideb/summary" && req.method === "GET") {
    await ensureCidebDirectoryTables(env);
    const base = `
      FROM people p
      LEFT JOIN person_programs pp ON pp.person_id=p.id
      LEFT JOIN person_data_context dc ON dc.person_id=p.id
      LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
      WHERE p.status='active'
        AND (LOWER(COALESCE(se.institution_name,pp.school_name,dc.institution_name,'')) LIKE '%cideb%' OR COALESCE(dc.context_type,'') IN ('cideb','mixed'))
    `;
    const [students, unassigned, pendingObs, missingReport, pendingFamily, reviewCycle] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base}`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base} AND NOT EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.person_id=p.id AND ta.active=1)`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM teacher_observations o JOIN people p ON p.id=o.person_id WHERE p.status='active' AND o.status='submitted'`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT p.id) AS count ${base} AND NOT EXISTS (SELECT 1 FROM school_continuity sc WHERE sc.person_id=p.id AND sc.approved_at IS NOT NULL)`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM guardians g JOIN people p ON p.id=g.person_id WHERE p.status='active' AND g.active=1 AND g.agreement_accepted_at IS NULL`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM school_enrollments se JOIN people p ON p.id=se.person_id WHERE se.is_current=1 AND se.needs_review=1 AND p.status='active' AND LOWER(se.institution_name) LIKE '%cideb%'`).first()
    ]);
    return json({
      students: Number(students?.count || 0),
      without_teacher: Number(unassigned?.count || 0),
      pending_observations: Number(pendingObs?.count || 0),
      missing_report: Number(missingReport?.count || 0),
      pending_family_consent: Number(pendingFamily?.count || 0),
      cycle_review: Number(reviewCycle?.count || 0)
    });
  }

  if (path === "/api/admin/cideb/student" && req.method === "GET") {
    await ensureCidebDirectoryTables(env);
    const personId = cleanSchoolValue(url.searchParams.get("person_id"), 120);
    if (!personId) return json({ error: "Alumno obligatorio." }, 400);
    const person = await env.DB.prepare(`SELECT id,full_name,age,email,phone,status,updated_at FROM people WHERE id=?`).bind(personId).first();
    if (!person) return json({ error: "Alumno no encontrado." }, 404);
    const [enrollment, program, continuity, currentTeacher, counts, latestTransfer] = await Promise.all([
      currentEnrollment(env, personId),
      getPersonProgram(env, personId),
      env.DB.prepare(`SELECT * FROM school_continuity WHERE person_id=?`).bind(personId).first(),
      currentTeacherForStudent(env,personId),
      env.DB.prepare(`SELECT (SELECT COUNT(*) FROM teacher_observations WHERE person_id=?) AS observations,(SELECT COUNT(*) FROM teacher_observations WHERE person_id=? AND status='submitted') AS pending,(SELECT COUNT(*) FROM guardians WHERE person_id=? AND active=1) AS family_accesses`).bind(personId,personId,personId).first(),
      latestTeacherTransfer(env,personId)
    ]);
    return json({ person, enrollment: enrollment || {}, program, continuity: continuity || {}, current_teacher: currentTeacher || null, teachers: currentTeacher ? [{id:currentTeacher.teacher_id,full_name:currentTeacher.full_name,school_year:currentTeacher.school_year}] : [], latest_transfer:latestTransfer||null, counts: counts || {} });
  }

  if (path === "/api/admin/cideb/student/create" && req.method === "POST") {
    await ensureCidebDirectoryTables(env);
    const b = await parseBody(req);
    const name = cleanSchoolValue(b.full_name, 160);
    const studentNumber = normalizeStudentNumber(b.student_number);
    const year = cleanSchoolValue(b.school_year, 40);
    if (!name || !studentNumber || !year) return json({ error: "Nombre, matrícula/ID y ciclo escolar son obligatorios." }, 400);

    const duplicateNumber = await cidebStudentNumberExists(env, studentNumber);
    if (duplicateNumber) return json({ error: `La matrícula ${studentNumber} ya pertenece a ${duplicateNumber.full_name}.`, duplicate_student_number: true }, 409);

    const sameName = await env.DB.prepare(`
      SELECT p.id,p.full_name,COALESCE(se.student_number,'') AS student_number
      FROM people p
      LEFT JOIN school_enrollments se ON se.person_id=p.id AND se.is_current=1
      LEFT JOIN person_data_context dc ON dc.person_id=p.id
      WHERE LOWER(TRIM(p.full_name))=LOWER(TRIM(?))
        AND p.status='active'
        AND (LOWER(COALESCE(se.institution_name,'')) LIKE '%cideb%' OR COALESCE(dc.context_type,'') IN ('cideb','mixed'))
      LIMIT 3
    `).bind(name).all();
    if ((sameName.results || []).length && !b.allow_duplicate_name) {
      return json({ error: "Ya existe un alumno con el mismo nombre. Verifica antes de crear otra ficha.", duplicate_name: true, candidates: sameName.results }, 409);
    }

    const personId = makeId('person');
    const enrollmentId = makeId('enrollment');
    const now = nowISO();
    const age = b.age === '' || b.age == null ? null : Number(b.age);
    if (age !== null && (!Number.isFinite(age) || age < 0 || age > 120)) return json({ error: "Indica una edad válida." }, 400);
    const email = cleanSchoolValue(b.email,160).toLowerCase();
    if (!isReasonableEmail(email)) return json({ error: "Revisa el formato del correo electrónico." }, 400);
    const isMinor = age !== null && age < 18 ? 1 : 0;
    const grade = cleanSchoolValue(b.grade_level, 60);
    const group = cleanSchoolValue(b.group_name, 60);

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO people (id,full_name,age,email,phone,is_minor,guardian_name,guardian_email,guardian_phone,status,created_at,updated_at) VALUES (?,?,?,?,?,?, '', '', '', 'active',?,?)`).bind(personId,name,Number.isFinite(age)?age:null,email,cleanSchoolValue(b.phone,40),isMinor,now,now),
      env.DB.prepare(`INSERT INTO vocational_profiles (person_id,updated_at) VALUES (?,?)`).bind(personId,now),
      env.DB.prepare(`INSERT INTO person_programs (person_id,therapy_with_alex,school_followup,school_name,grade_level,school_year,updated_at) VALUES (?,0,1,'CIDEB',?,?,?)`).bind(personId,grade,year,now),
      env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,updated_at) VALUES (?,'cideb','CIDEB',?)`).bind(personId,now),
      env.DB.prepare(`INSERT INTO school_enrollments (id,person_id,institution_name,student_number,grade_level,group_name,school_year,status,is_current,needs_review,created_at,updated_at) VALUES (?,?,'CIDEB',?,?,?,?, 'active',1,0,?,?)`).bind(enrollmentId,personId,studentNumber,grade,group,year,now,now)
    ]);
    await logAudit(env,'admin','alex','create_cideb_student',personId,`Matrícula: ${studentNumber} · Ciclo: ${year}`);
    return json({ ok:true, person_id:personId, student_number:studentNumber });
  }

  if (path === "/api/admin/cideb/student/update" && req.method === "POST") {
    await ensureCidebDirectoryTables(env);
    const b = await parseBody(req);
    const personId = cleanSchoolValue(b.person_id,120);
    const studentNumber = normalizeStudentNumber(b.student_number);
    if (!personId || !studentNumber) return json({ error:"Alumno y matrícula son obligatorios." },400);
    const duplicate = await cidebStudentNumberExists(env, studentNumber, personId);
    if (duplicate) return json({ error:`La matrícula ${studentNumber} ya pertenece a ${duplicate.full_name}.` },409);
    const enrollment = await currentEnrollment(env, personId);
    if (!enrollment) return json({ error:"No se encontró inscripción escolar activa." },404);
    const now=nowISO(), grade=cleanSchoolValue(b.grade_level,60), group=cleanSchoolValue(b.group_name,60), year=cleanSchoolValue(b.school_year,40);
    await env.DB.batch([
      env.DB.prepare(`UPDATE school_enrollments SET student_number=?,grade_level=?,group_name=?,school_year=?,needs_review=0,updated_at=? WHERE id=?`).bind(studentNumber,grade,group,year,now,enrollment.id),
      env.DB.prepare(`UPDATE person_programs SET school_name='CIDEB',grade_level=?,school_year=?,school_followup=1,updated_at=? WHERE person_id=?`).bind(grade,year,now,personId)
    ]);
    await logAudit(env,'admin','alex','update_cideb_student',personId,`Matrícula: ${studentNumber} · ${grade} ${group} · ${year}`);
    return json({ok:true});
  }

  if (path === "/api/admin/cideb/import" && req.method === "POST") {
    await ensureCidebDirectoryTables(env);
    const b=await parseBody(req);
    const rows=Array.isArray(b.rows)?b.rows.slice(0,500):[];
    if(!rows.length)return json({error:"No hay filas para importar."},400);

    const existingRows=await env.DB.prepare(`SELECT UPPER(TRIM(COALESCE(student_number,''))) AS n FROM school_enrollments WHERE LOWER(institution_name) LIKE '%cideb%' AND COALESCE(student_number,'')<>''`).all();
    const existing=new Set((existingRows.results||[]).map(x=>x.n));
    const seen=new Set();
    const valid=[]; const skipped=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i]||{};
      const studentNumber=normalizeStudentNumber(r.student_number||r.matricula||r.id);
      const name=cleanSchoolValue(r.full_name||r.nombre,160);
      const year=cleanSchoolValue(r.school_year||r.ciclo,40);
      if(!studentNumber||!name||!year){skipped.push({row:i+2,reason:'Faltan matrícula, nombre o ciclo'});continue;}
      if(existing.has(studentNumber)||seen.has(studentNumber)){skipped.push({row:i+2,reason:`Matrícula duplicada: ${studentNumber}`});continue;}
      seen.add(studentNumber);
      const rawAge = r.age ?? r.edad ?? '';
      const age = String(rawAge).trim() === '' ? null : Number(rawAge);
      const email = cleanSchoolValue(r.email||r.correo,160).toLowerCase();
      if (age !== null && (!Number.isFinite(age) || age < 0 || age > 120)) { skipped.push({row:i+2,reason:'Edad inválida'}); continue; }
      if (!isReasonableEmail(email)) { skipped.push({row:i+2,reason:'Correo inválido'}); continue; }
      valid.push({
        studentNumber,name,year,
        grade:cleanSchoolValue(r.grade_level||r.grado,60),
        group:cleanSchoolValue(r.group_name||r.grupo,60),
        email,
        phone:cleanSchoolValue(r.phone||r.telefono,40),
        age
      });
    }

    const now=nowISO();
    let created=0;
    for(let start=0;start<valid.length;start+=20){
      const chunk=valid.slice(start,start+20); const statements=[];
      for(const r of chunk){
        const personId=makeId('person'), enrollmentId=makeId('enrollment');
        const age=Number.isFinite(r.age)?r.age:null, isMinor=age!==null&&age<18?1:0;
        statements.push(
          env.DB.prepare(`INSERT INTO people (id,full_name,age,email,phone,is_minor,guardian_name,guardian_email,guardian_phone,status,created_at,updated_at) VALUES (?,?,?,?,?,?, '', '', '', 'active',?,?)`).bind(personId,r.name,age,r.email,r.phone,isMinor,now,now),
          env.DB.prepare(`INSERT INTO vocational_profiles (person_id,updated_at) VALUES (?,?)`).bind(personId,now),
          env.DB.prepare(`INSERT INTO person_programs (person_id,therapy_with_alex,school_followup,school_name,grade_level,school_year,updated_at) VALUES (?,0,1,'CIDEB',?,?,?)`).bind(personId,r.grade,r.year,now),
          env.DB.prepare(`INSERT INTO person_data_context (person_id,context_type,institution_name,updated_at) VALUES (?,'cideb','CIDEB',?)`).bind(personId,now),
          env.DB.prepare(`INSERT INTO school_enrollments (id,person_id,institution_name,student_number,grade_level,group_name,school_year,status,is_current,needs_review,created_at,updated_at) VALUES (?,?,'CIDEB',?,?,?,?, 'active',1,0,?,?)`).bind(enrollmentId,personId,r.studentNumber,r.grade,r.group,r.year,now,now)
        );
      }
      if(statements.length)await env.DB.batch(statements);
      created+=chunk.length;
    }
    await logAudit(env,'admin','alex','import_cideb_students',null,`${created} alumnos creados · ${skipped.length} omitidos`);
    return json({ok:true,created,skipped,total:rows.length});
  }

  if (path === "/api/admin/cideb/cycle/advance" && req.method === "POST") {
    await ensureCidebDirectoryTables(env);
    const b=await parseBody(req),fromYear=cleanSchoolValue(b.from_year,40),toYear=cleanSchoolValue(b.to_year,40);
    if(!fromYear||!toYear||fromYear===toYear)return json({error:"Indica un periodo actual y uno nuevo diferentes."},400);
    const {results}=await env.DB.prepare(`SELECT * FROM school_enrollments WHERE is_current=1 AND status='active' AND school_year=? AND LOWER(institution_name) LIKE '%cideb%'`).bind(fromYear).all();
    const now=nowISO(); let advanced=0;
    for(let start=0;start<(results||[]).length;start+=30){
      const chunk=(results||[]).slice(start,start+30),statements=[];
      for(const e of chunk){statements.push(
        env.DB.prepare(`UPDATE school_enrollments SET school_year=?,needs_review=1,updated_at=? WHERE id=?`).bind(toYear,now,e.id),
        env.DB.prepare(`UPDATE person_programs SET school_year=?,school_followup=1,updated_at=? WHERE person_id=?`).bind(toYear,now,e.person_id)
      );}
      if(statements.length)await env.DB.batch(statements); advanced+=chunk.length;
    }
    await logAudit(env,'admin','alex','advance_cideb_period',null,`${fromYear} → ${toYear} · ${advanced} alumnos`);
    return json({ok:true,advanced,message:`Periodo ${toYear} aplicado a ${advanced} alumno(s). Se conserva una sola ficha por alumno; grado y grupo quedan marcados para revisión. El maestro actual se mantiene hasta que se haga una transferencia.`});
  }

  if (path === "/api/admin/cideb/student/export" && req.method === "GET") {
    await ensureCidebDirectoryTables(env);
    const personId=cleanSchoolValue(url.searchParams.get('person_id'),120);
    if(!personId)return json({error:'Alumno obligatorio.'},400);
    const person=await env.DB.prepare(`SELECT id,full_name,age,email,phone,status,created_at,updated_at FROM people WHERE id=?`).bind(personId).first();
    if(!person)return json({error:'Alumno no encontrado.'},404);
    const [program,enrollment,continuity,{results:observations},{results:assignments},{results:history}]=await Promise.all([
      getPersonProgram(env,personId),currentEnrollment(env,personId),env.DB.prepare(`SELECT * FROM school_continuity WHERE person_id=?`).bind(personId).first(),
      env.DB.prepare(`SELECT observation_date,subject,context,description,status,professional_comment,reviewed_at FROM teacher_observations WHERE person_id=? ORDER BY observation_date DESC`).bind(personId).all(),
      env.DB.prepare(`SELECT t.full_name,ta.school_year,ta.active FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id WHERE ta.person_id=? ORDER BY ta.school_year DESC,t.full_name`).bind(personId).all(),
      env.DB.prepare(`SELECT student_number,grade_level,group_name,school_year,status,is_current,created_at,updated_at FROM school_enrollments WHERE person_id=? ORDER BY created_at DESC`).bind(personId).all()
    ]);
    await logAudit(env,"admin","alex","export_school_student",personId,"Exportación individual de datos escolares");
    return json({exported_at:nowISO(),person,program,enrollment:enrollment||{},continuity:continuity||{},observations:observations||[],teacher_assignments:assignments||[],enrollment_history:history||[]});
  }

  if (path === "/api/admin/people" && req.method === "GET") {
    await ensureDataManagementTables(env);
    const q = safeText(url.searchParams.get('q'),120).toLowerCase();
    const limit = Math.min(250, Math.max(25, Number(url.searchParams.get('limit') || 150)));
    const like = `%${q}%`;
    const { results } = await env.DB.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM private_notes n WHERE n.person_id=p.id) AS note_count,
        ((SELECT COUNT(*) FROM ai_messages m WHERE m.person_id=p.id AND m.risk_flag=1 AND m.role='user') +
         (SELECT COUNT(*) FROM client_ai_messages cm WHERE cm.person_id=p.id AND cm.risk_flag=1 AND cm.role='user')) AS risk_count,
        COALESCE(pp.therapy_with_alex,0) AS therapy_with_alex,
        COALESCE(pp.school_followup,0) AS school_followup,
        COALESCE(dc.context_type,'private') AS context_type,
        COALESCE(dc.institution_name,'') AS institution_name
      FROM people p
      LEFT JOIN person_programs pp ON pp.person_id=p.id
      LEFT JOIN person_data_context dc ON dc.person_id=p.id
      WHERE COALESCE(dc.context_type,'private') <> 'cideb'
        AND (?='' OR LOWER(p.full_name) LIKE ? OR LOWER(COALESCE(p.email,'')) LIKE ? OR LOWER(COALESCE(p.phone,'')) LIKE ?)
      ORDER BY p.updated_at DESC
      LIMIT ?
    `).bind(q, like, like, like, limit).all();
    return json({ people: results || [] });
  }

  if (path === "/api/admin/people" && req.method === "POST") {
    const b = await parseBody(req);
    const name = safeText(b.full_name, 120);
    if (!name) return json({ error: "El nombre es obligatorio." }, 400);

    const age = b.age === "" || b.age == null ? null : Number(b.age);
    if (age !== null && (!Number.isFinite(age) || age < 0 || age > 120)) return json({ error: "Indica una edad válida." }, 400);
    const email = safeText(b.email,160).toLowerCase();
    const guardianEmail = safeText(b.guardian_email,160).toLowerCase();
    if (!isReasonableEmail(email) || !isReasonableEmail(guardianEmail)) return json({ error: "Revisa el formato del correo electrónico." }, 400);
    const isMinor = age !== null && age < 18 ? 1 : 0;
    const id = makeId("person");
    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO people (
        id, full_name, age, email, phone, is_minor,
        guardian_name, guardian_email, guardian_phone,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      id, name, age,
      email, safeText(b.phone, 40), isMinor,
      isMinor ? safeText(b.guardian_name, 120) : '', isMinor ? guardianEmail : '',
      isMinor ? safeText(b.guardian_phone, 40) : '', now, now
    ).run();

    await env.DB.prepare(`INSERT INTO vocational_profiles (person_id, updated_at) VALUES (?, ?)`)
      .bind(id, now).run();

    return json({ ok: true, person_id: id });
  }

  if (path.startsWith("/api/admin/person/") && req.method === "GET") {
    const personId = path.split("/").pop();
    const person = await env.DB.prepare(`SELECT * FROM people WHERE id=?`).bind(personId).first();
    if (!person) return json({ error: "Persona no encontrada" }, 404);

    const [{ results: notes }, vocational, { results: aiHistory }] = await Promise.all([
      env.DB.prepare(`SELECT * FROM private_notes WHERE person_id=? ORDER BY created_at DESC`).bind(personId).all(),
      env.DB.prepare(`SELECT * FROM vocational_profiles WHERE person_id=?`).bind(personId).first(),
      env.DB.prepare(`SELECT role, content, risk_flag, created_at FROM ai_messages WHERE person_id=? ORDER BY created_at DESC LIMIT 20`).bind(personId).all()
    ]);

    const access = await env.DB.prepare(`
      SELECT
        access_hint,
        active,
        consent_confirmed,
        consent_version,
        consent_confirmed_at,
        consent_confirmed_by,
        ai_enabled,
        created_at,
        updated_at,
        last_login_at
      FROM client_access
      WHERE person_id=?
    `).bind(personId).first();

    const { results: followups } = await env.DB.prepare(`
      SELECT *
      FROM followups
      WHERE person_id=?
      ORDER BY followup_date DESC, created_at DESC
    `).bind(personId).all();

    const { results: customFields } = await env.DB.prepare(`
      SELECT *
      FROM custom_fields
      WHERE person_id=?
      ORDER BY created_at DESC
    `).bind(personId).all();

    const { results: exercises } = await env.DB.prepare(`
      SELECT *
      FROM exercises
      WHERE person_id=?
      ORDER BY created_at DESC
    `).bind(personId).all();

    const { results: clientAIHistory } = await env.DB.prepare(`
      SELECT role, content, risk_flag, created_at
      FROM client_ai_messages
      WHERE person_id=?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(personId).all();

    const program = await getPersonProgram(env, personId);
    const dataContext = await getPersonDataContext(env, personId);
    const { results: recentAudit } = await env.DB.prepare(`SELECT actor_role,actor_id,action,detail,created_at FROM audit_log WHERE person_id=? ORDER BY created_at DESC LIMIT 20`).bind(personId).all();

    return json({
      person,
      program,
      data_context: dataContext,
      notes: notes || [],
      vocational: vocational || null,
      ai_history: aiHistory || [],
      access: access || null,
      followups: followups || [],
      custom_fields: customFields || [],
      exercises: exercises || [],
      client_ai_history: clientAIHistory || [],
      recent_audit: recentAudit || []
    });
  }

  if (path === "/api/admin/note" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const noteText = safeText(b.note_text, 8000);
    if (!personId || !noteText) return json({ error: "Faltan datos." }, 400);

    const now = nowISO();
    await env.DB.prepare(`
      INSERT INTO private_notes (id, person_id, note_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(makeId("note"), personId, noteText, now, now).run();

    await env.DB.prepare(`UPDATE people SET updated_at=? WHERE id=?`).bind(now, personId).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/vocational" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    if (!personId) return json({ error: "Selecciona una persona." }, 400);

    await env.DB.prepare(`
      INSERT INTO vocational_profiles (
        person_id, interests, strengths, values_text, favorite_subjects,
        work_style, careers_considered, open_questions, guidance_plan,
        ai_context, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(person_id) DO UPDATE SET
        interests=excluded.interests,
        strengths=excluded.strengths,
        values_text=excluded.values_text,
        favorite_subjects=excluded.favorite_subjects,
        work_style=excluded.work_style,
        careers_considered=excluded.careers_considered,
        open_questions=excluded.open_questions,
        guidance_plan=excluded.guidance_plan,
        ai_context=excluded.ai_context,
        updated_at=excluded.updated_at
    `).bind(
      personId, safeText(b.interests), safeText(b.strengths), safeText(b.values_text),
      safeText(b.favorite_subjects), safeText(b.work_style), safeText(b.careers_considered),
      safeText(b.open_questions), safeText(b.guidance_plan, 5000), safeText(b.ai_context, 5000), nowISO()
    ).run();

    return json({ ok: true });
  }


  if (path === "/api/admin/access" && req.method === "GET") {
    const personId = safeText(url.searchParams.get("person_id"), 120);

    if (!personId) {
      return json({ error: "Persona obligatoria." }, 400);
    }

    const access = await env.DB.prepare(`
      SELECT
        person_id,
        access_hint,
        active,
        consent_confirmed,
        consent_version,
        consent_confirmed_at,
        consent_confirmed_by,
        ai_enabled,
        created_at,
        updated_at,
        last_login_at
      FROM client_access
      WHERE person_id=?
    `).bind(personId).first();

    return json({ access: access || null });
  }

  if (path === "/api/admin/access/create" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);

    const person = await env.DB.prepare(`
      SELECT id, full_name
      FROM people
      WHERE id=?
    `).bind(personId).first();

    if (!person) {
      return json({ error: "Persona no encontrada." }, 404);
    }

    const code = generateAccessCode();
    const hash = await sha256(code);
    const hint = code.slice(-4);
    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO client_access (
        person_id,
        access_hash,
        access_hint,
        active,
        consent_confirmed,
        ai_enabled,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 1, 0, 0, ?, ?)
      ON CONFLICT(person_id) DO UPDATE SET
        access_hash=excluded.access_hash,
        access_hint=excluded.access_hint,
        active=1,
        ai_enabled=0,
        updated_at=excluded.updated_at
    `).bind(personId, hash, hint, now, now).run();

    return json({
      ok: true,
      person_name: person.full_name,
      access_code: code,
      access_hint: hint
    });
  }

  if (path === "/api/admin/access/settings" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);

    const person = await env.DB.prepare(`
      SELECT id, is_minor
      FROM people
      WHERE id=?
    `).bind(personId).first();

    if (!person) {
      return json({ error: "Persona no encontrada." }, 404);
    }

    const access = await env.DB.prepare(`
      SELECT person_id
      FROM client_access
      WHERE person_id=?
    `).bind(personId).first();

    if (!access) {
      return json({
        error: "Primero crea un acceso para esta persona."
      }, 400);
    }

    const active = b.active ? 1 : 0;
    const consent = b.consent_confirmed ? 1 : 0;
    const aiEnabled = b.ai_enabled ? 1 : 0;
    const program = await getPersonProgram(env, personId);

    if (aiEnabled && !program.therapy_with_alex) {
      return json({ error: "RAUDAL Reflexión solo puede habilitarse para personas con proceso terapéutico activo con Alex." }, 400);
    }

    if (aiEnabled && !consent) {
      return json({
        error: person.is_minor
          ? "Para habilitar la IA en una persona menor, primero confirma el consentimiento correspondiente."
          : "Confirma el consentimiento antes de habilitar la IA."
      }, 400);
    }

    const consentBy = consent ? safeText(b.consent_confirmed_by, 180) : "";
    if (consent && !consentBy) return json({ error: "Indica quién confirmó el consentimiento." }, 400);
    const consentAt = consent ? nowISO() : null;
    await env.DB.prepare(`
      UPDATE client_access
      SET active=?, consent_confirmed=?, consent_version=?, consent_confirmed_at=?, consent_confirmed_by=?, ai_enabled=?, updated_at=?
      WHERE person_id=?
    `).bind(active, consent, consent ? AI_CONSENT_VERSION : null, consentAt, consentBy || null, aiEnabled, nowISO(), personId).run();

    return json({ ok: true });
  }

  if (path === "/api/admin/followup" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const date = safeText(b.followup_date, 20) || nowISO().slice(0, 10);

    if (!personId) {
      return json({ error: "Persona obligatoria." }, 400);
    }

    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO followups (
        id,
        person_id,
        followup_date,
        title,
        private_notes,
        shared_summary,
        agreements,
        next_steps,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      makeId("follow"),
      personId,
      date,
      safeText(b.title, 200),
      safeText(b.private_notes, 8000),
      safeText(b.shared_summary, 5000),
      safeText(b.agreements, 4000),
      safeText(b.next_steps, 4000),
      now,
      now
    ).run();

    await env.DB.prepare(`
      UPDATE people SET updated_at=? WHERE id=?
    `).bind(now, personId).run();

    return json({ ok: true });
  }

  if (path === "/api/admin/custom-field" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const name = safeText(b.field_name, 160);
    const visibility = safeText(b.visibility, 20);

    const allowedVisibility = new Set([
      "private",
      "shared",
      "ai",
      "shared_ai"
    ]);

    if (!personId || !name) {
      return json({
        error: "Persona y nombre del campo son obligatorios."
      }, 400);
    }

    if (!allowedVisibility.has(visibility)) {
      return json({ error: "Visibilidad inválida." }, 400);
    }

    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO custom_fields (
        id,
        person_id,
        field_name,
        field_value,
        visibility,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      makeId("field"),
      personId,
      name,
      safeText(b.field_value, 8000),
      visibility,
      now,
      now
    ).run();

    return json({ ok: true });
  }

  if (path === "/api/admin/exercise" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const title = safeText(b.title, 200);

    if (!personId || !title) {
      return json({
        error: "Persona y título son obligatorios."
      }, 400);
    }

    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO exercises (
        id,
        person_id,
        title,
        description,
        due_date,
        status,
        shared,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      makeId("exercise"),
      personId,
      title,
      safeText(b.description, 5000),
      safeText(b.due_date, 20),
      b.shared === false ? 0 : 1,
      now,
      now
    ).run();

    return json({ ok: true });
  }

  if (path === "/api/admin/ai-usage" && req.method === "GET") {
    const personId=safeText(url.searchParams.get("person_id"),120);
    if(!personId) return json({error:"Persona obligatoria."},400);
    return json(await getAIUsage(env,personId));
  }

  if (path === "/api/admin/ai-usage/grant" && req.method === "POST") {
    const b=await parseBody(req), personId=safeText(b.person_id,120), amount=Math.min(50,Math.max(1,Number(b.amount||5)));
    if(!personId) return json({error:"Persona obligatoria."},400);
    const d=nortiaLocalDate(), now=nowISO();
    await env.DB.prepare(`INSERT INTO ai_daily_usage (person_id,usage_date,used_count,extra_messages,updated_at) VALUES (?,?,0,?,?) ON CONFLICT(person_id,usage_date) DO UPDATE SET extra_messages=ai_daily_usage.extra_messages+excluded.extra_messages, updated_at=excluded.updated_at`).bind(personId,d,amount,now).run();
    return json({ok:true,usage:await getAIUsage(env,personId)});
  }

  if (path === "/api/admin/ai-health" && req.method === "POST") {
    if (!env.AI || typeof env.AI.run !== "function") {
      return json({
        error: "El binding AI no está disponible. Revisa que el binding se llame exactamente AI."
      }, 500);
    }

    const model = "@cf/meta/llama-3.1-8b-instruct-fast";

    try {
      const result = await env.AI.run(model, {
        messages: [{ role: "user", content: "Responde únicamente con la palabra OK." }],
        max_tokens: 20
      });

      const text = extractAIText(result);

      if (!text) {
        return json({
          error: "Workers AI respondió, pero no devolvió texto reconocible."
        }, 502);
      }

      return json({
        ok: true,
        model,
        response: text.slice(0, 120)
      });
    } catch (error) {
      return json({
        error: `Workers AI: ${safeText(error?.message || error, 500)}`
      }, 502);
    }
  }

  if (path === "/api/admin/ai-reflection" && req.method === "POST") {
    const b = await parseBody(req);

    const personId = safeText(b.person_id, 120) || "__demo__";
    const message = safeText(b.message, 4000);

    if (!message) {
      return json({
        error: "Escribe un mensaje para probar RAUDAL Reflexión."
      }, 400);
    }

    if (!env.AI || typeof env.AI.run !== "function") {
      return json({
        error: "No encuentro el binding de Workers AI. En Cloudflare debe llamarse exactamente AI."
      }, 500);
    }

    if (highRiskLanguage(message)) {
      const safetyReply =
        "Lo que escribes puede indicar que necesitas apoyo humano inmediato. " +
        "Este espacio no es adecuado para manejar una crisis. " +
        "Si existe riesgo de hacerte daño o estás en peligro, busca de inmediato " +
        "a un adulto de confianza, a Alex u otro profesional, o contacta los servicios " +
        "de emergencia de tu localidad.";

      if (personId !== "__demo__") {
        const createdAt = nowISO();

        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO ai_messages (
              id, person_id, role, content, risk_flag, created_at
            ) VALUES (?, ?, 'user', ?, 1, ?)
          `).bind(makeId("msg"), personId, message, createdAt),

          env.DB.prepare(`
            INSERT INTO ai_messages (
              id, person_id, role, content, risk_flag, created_at
            ) VALUES (?, ?, 'assistant', ?, 1, ?)
          `).bind(makeId("msg"), personId, safetyReply, createdAt)
        ]);
      }

      return json({
        ok: true,
        risk_flag: true,
        reply: safetyReply
      });
    }

    let person = null;
    let vocational = null;

    if (personId !== "__demo__") {
      person = await env.DB.prepare(`
        SELECT * FROM people WHERE id=?
      `).bind(personId).first();

      if (!person) {
        return json({
          error: "La persona seleccionada ya no existe."
        }, 404);
      }

      vocational = await env.DB.prepare(`
        SELECT * FROM vocational_profiles WHERE person_id=?
      `).bind(personId).first();
    }

    const isDemo = personId === "__demo__";

    const system = `
Eres "RAUDAL Reflexión", una herramienta de orientación vocacional y desarrollo personal supervisada por Alex.

TU PAPEL:
Ayudar a ordenar ideas, explorar opciones, identificar preguntas útiles y convertir una inquietud difusa en próximos pasos concretos.

NO ERES:
- un terapeuta;
- un diagnóstico;
- un sustituto de atención profesional;
- una prueba vocacional definitiva.

REGLAS:
- No diagnostiques trastornos ni enfermedades.
- No recomiendes medicamentos.
- No tomes decisiones por la persona.
- No digas "tu carrera ideal es X".
- No prometas resultados.
- No fomentes dependencia emocional.
- Haz preguntas útiles sin interrogar.
- Evita respuestas genéricas del tipo "sigue tus sueños".
- Prioriza claridad, estructura y acciones pequeñas.
- Responde en español natural.
- Usa máximo 220 palabras salvo que la comparación realmente requiera más.
- Cuando compares carreras u opciones, usa:
  1. Lo que parece atraer de cada opción
  2. Diferencias que vale la pena investigar
  3. Un siguiente paso concreto
- Termina con una sola pregunta breve cuando sea útil.

MODO:
${isDemo ? "Prueba general interna, sin expediente de una persona real." : "Proceso individual supervisado por Alex."}

CONTEXTO PERMITIDO:
Nombre: ${person?.full_name || "No aplica en modo prueba"}
Edad: ${person?.age ?? "No indicada"}
Intereses: ${vocational?.interests || "No registrados"}
Fortalezas: ${vocational?.strengths || "No registradas"}
Valores: ${vocational?.values_text || "No registrados"}
Materias favoritas: ${vocational?.favorite_subjects || "No registradas"}
Estilo de trabajo: ${vocational?.work_style || "No registrado"}
Carreras consideradas: ${vocational?.careers_considered || "No registradas"}
Preguntas abiertas: ${vocational?.open_questions || "No registradas"}
Plan de orientación: ${vocational?.guidance_plan || "Sin plan registrado"}
Contexto aprobado por Alex para IA: ${vocational?.ai_context || "Ninguno"}

Las notas privadas de Alex NO forman parte del contexto.
`.trim();

    const model = "@cf/meta/llama-3.1-8b-instruct-fast";
    let reply = "";

    try {
      const result = await env.AI.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: message }
        ],
        max_tokens: 320
      });

      reply = extractAIText(result).trim();

      if (!reply) {
        return json({
          error: "Workers AI respondió sin texto. Usa “Probar conexión IA” para revisar el binding."
        }, 502);
      }
    } catch (error) {
      return json({
        error: `Workers AI: ${safeText(error?.message || error, 500)}`
      }, 502);
    }

    if (!isDemo) {
      const createdAt = nowISO();

      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO ai_messages (
            id, person_id, role, content, risk_flag, created_at
          ) VALUES (?, ?, 'user', ?, 0, ?)
        `).bind(makeId("msg"), personId, message, createdAt),

        env.DB.prepare(`
          INSERT INTO ai_messages (
            id, person_id, role, content, risk_flag, created_at
          ) VALUES (?, ?, 'assistant', ?, 0, ?)
        `).bind(makeId("msg"), personId, safeText(reply, 6000), createdAt)
      ]);
    }

    return json({
      ok: true,
      model,
      demo: isDemo,
      risk_flag: false,
      reply
    });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      if (isCrossSiteMutation(req, url)) {
        return addSecurityHeaders(
          json({ error: "Solicitud bloqueada por seguridad." }, 403),
          true
        );
      }

      try {
        return addSecurityHeaders(await api(req, env, url), true);
      } catch (error) {
        console.error("RAUDAL internal error", error);
        return addSecurityHeaders(
          json({ error: "Ocurrió un error interno. Intenta nuevamente." }, 500),
          true
        );
      }
    }

    const assetResponse = await env.ASSETS.fetch(req);
    const protectedShell = new Set(["/admin.html","/mi-espacio.html","/docente.html","/familia.html","/coordinacion.html"]).has(url.pathname);
    return addSecurityHeaders(assetResponse, protectedShell);
  }
};
