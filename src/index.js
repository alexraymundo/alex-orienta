
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
  return signature === expected;
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


async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(String(value))
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
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

  if (signature !== expected) return null;

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
    WHERE client_name = ?
      AND status='confirmed'
      AND preferred_date >= date('now')
    ORDER BY preferred_date ASC, preferred_time ASC
    LIMIT 1
  `).bind(person.full_name).first();

  return {
    person,
    access,
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
    "NORTIA <onboarding@resend.dev>";

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
    emailSubject || `NORTIA · ${title}`,
    emailText || message,
    emailHTML
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

async function api(req, env, url) {
  const path = url.pathname;

  if (path === "/api/admin/login" && req.method === "POST") {
    const body = await parseBody(req);
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return json({ error: "Faltan ADMIN_PASSWORD o SESSION_SECRET en Cloudflare Secrets." }, 500);
    }
    if (safeText(body.password, 200) !== env.ADMIN_PASSWORD) {
      return json({ error: "Contraseña incorrecta" }, 401);
    }
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
      WHERE ca.access_hash=?
    `).bind(hash).first();

    if (!access || !access.active) {
      return json({ error: "Código de acceso inválido o desactivado." }, 401);
    }

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
        emailSubject: "NORTIA · Actividad completada",
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
        error: "NORTIA Reflexión todavía no está habilitada porque falta confirmar el consentimiento."
      }, 403);
    }

    if (!access.ai_enabled) {
      return json({
        error: "Alex todavía no ha habilitado NORTIA Reflexión para este proceso."
      }, 403);
    }

    if (!env.AI || typeof env.AI.run !== "function") {
      return json({
        error: "NORTIA Reflexión no está disponible en este momento."
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
        title: "Alerta de seguimiento en NORTIA Reflexión",
        message:
          `${riskPerson?.full_name || "Una persona"} generó una alerta que requiere revisión humana.`,
        priority: "critical",
        emailSubject: "NORTIA · Alerta de seguimiento",
        emailText:
          `Se generó una alerta de seguimiento en NORTIA Reflexión.\n\n` +
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
Eres "NORTIA Reflexión", una herramienta complementaria dentro de NORTIA.

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
          error: "NORTIA Reflexión no pudo generar texto en este momento."
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
          title: "Límite diario de NORTIA Reflexión",
          message:
            `${limitPerson?.full_name || "Una persona"} alcanzó su límite diario de ${usage.limit} mensajes.`,
          priority: "low",
          emailSubject: "NORTIA · Límite diario de Reflexión",
          emailText:
            `${limitPerson?.full_name || "Una persona"} alcanzó el límite diario de ` +
            `${usage.limit} mensajes en NORTIA Reflexión.\n\n` +
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
        error: `NORTIA Reflexión: ${safeText(error?.message || error, 500)}`
      }, 502);
    }
  }

  if (path === "/api/appointments" && req.method === "POST") {
    const b = await parseBody(req);
    const name = safeText(b.client_name, 120);
    const date = safeText(b.preferred_date, 20);
    const time = safeText(b.preferred_time, 20);

    if (!name || !date || !time) {
      return json({ error: "Nombre, fecha y horario son obligatorios." }, 400);
    }

    const age = b.age === "" || b.age == null ? null : Number(b.age);
    const isMinor = age !== null && Number.isFinite(age) && age < 18 ? 1 : 0;

    if (isMinor && !safeText(b.guardian_name, 120)) {
      return json({ error: "Para una persona menor de edad necesitamos el nombre del padre, madre o tutor." }, 400);
    }

    const id = makeId("appt");
    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO appointments (
        id, client_name, age, client_email, client_phone,
        is_minor, guardian_name, guardian_email, guardian_phone,
        service_type, reason_summary, preferred_date, preferred_time,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)
    `).bind(
      id, name, Number.isFinite(age) ? age : null,
      safeText(b.client_email, 160), safeText(b.client_phone, 40), isMinor,
      safeText(b.guardian_name, 120), safeText(b.guardian_email, 160),
      safeText(b.guardian_phone, 40), safeText(b.service_type, 80) || "orientacion_vocacional",
      safeText(b.reason_summary, 1500), date, time, now, now
    ).run();

    await createNotification(env, {
      type: "appointment",
      title: "Nueva solicitud de cita",
      message: `${name} solicitó una sesión para ${date} a las ${time}.`,
      priority: "normal",
      emailSubject: "NORTIA · Nueva solicitud de cita",
      emailText:
        `Se recibió una nueva solicitud de cita.\n\n` +
        `Persona: ${name}\n` +
        `Fecha solicitada: ${date}\n` +
        `Hora solicitada: ${time}\n\n` +
        `Ingresa al Panel Profesional de NORTIA para revisarla.`
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
      from: safeText(env.RESEND_FROM_EMAIL, 240) || "NORTIA <onboarding@resend.dev>",
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
      "NORTIA · Correo de prueba",
      "La conexión de notificaciones de NORTIA está funcionando correctamente.",
      `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">
          <div style="font-size:12px;letter-spacing:2px;color:#0ea5e9;font-weight:700">NORTIA</div>
          <h2 style="color:#0f172a">Notificaciones activas</h2>
          <p style="color:#475569;line-height:1.6">
            La conexión de correo de NORTIA está funcionando correctamente.
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

  if (path === "/api/admin/dashboard" && req.method === "GET") {
    const [requested, confirmed, people, risk] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status='requested'").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status='confirmed'").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM people WHERE status='active'").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM ai_messages WHERE risk_flag=1").first()
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
      SELECT * FROM appointments
      ORDER BY preferred_date ASC, preferred_time ASC
    `).all();
    return json({ appointments: results || [] });
  }

  if (path === "/api/admin/appointments/status" && req.method === "POST") {
    const b = await parseBody(req);
    const allowed = new Set(["requested","confirmed","completed","cancelled"]);
    if (!allowed.has(b.status)) return json({ error: "Estado inválido" }, 400);
    await env.DB.prepare(`UPDATE appointments SET status=?, updated_at=? WHERE id=?`)
      .bind(b.status, nowISO(), safeText(b.id, 120)).run();
    return json({ ok: true });
  }

  if (path === "/api/admin/people" && req.method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM private_notes n WHERE n.person_id=p.id) AS note_count,
        (SELECT COUNT(*) FROM ai_messages m WHERE m.person_id=p.id AND m.risk_flag=1) AS risk_count
      FROM people p
      ORDER BY p.updated_at DESC
    `).all();
    return json({ people: results || [] });
  }

  if (path === "/api/admin/people" && req.method === "POST") {
    const b = await parseBody(req);
    const name = safeText(b.full_name, 120);
    if (!name) return json({ error: "El nombre es obligatorio." }, 400);

    const age = b.age === "" || b.age == null ? null : Number(b.age);
    const isMinor = age !== null && Number.isFinite(age) && age < 18 ? 1 : 0;
    const id = makeId("person");
    const now = nowISO();

    await env.DB.prepare(`
      INSERT INTO people (
        id, full_name, age, email, phone, is_minor,
        guardian_name, guardian_email, guardian_phone,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      id, name, Number.isFinite(age) ? age : null,
      safeText(b.email, 160), safeText(b.phone, 40), isMinor,
      safeText(b.guardian_name, 120), safeText(b.guardian_email, 160),
      safeText(b.guardian_phone, 40), now, now
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

    return json({
      person,
      notes: notes || [],
      vocational: vocational || null,
      ai_history: aiHistory || [],
      access: access || null,
      followups: followups || [],
      custom_fields: customFields || [],
      exercises: exercises || [],
      client_ai_history: clientAIHistory || []
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

    if (aiEnabled && !consent) {
      return json({
        error: person.is_minor
          ? "Para habilitar la IA en una persona menor, primero confirma el consentimiento correspondiente."
          : "Confirma el consentimiento antes de habilitar la IA."
      }, 400);
    }

    await env.DB.prepare(`
      UPDATE client_access
      SET active=?, consent_confirmed=?, ai_enabled=?, updated_at=?
      WHERE person_id=?
    `).bind(active, consent, aiEnabled, nowISO(), personId).run();

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
        error: "Escribe un mensaje para probar NORTIA Reflexión."
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
Eres "NORTIA Reflexión", una herramienta de orientación vocacional y desarrollo personal supervisada por Alex.

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
      try {
        return await api(req, env, url);
      } catch (error) {
        return json({
          error: `NORTIA: ${safeText(error?.message || error, 500)}`
        }, 500);
      }
    }

    return env.ASSETS.fetch(req);
  }
};
