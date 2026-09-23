
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

    return json({ ok: true, appointment_id: id });
  }

  if (path.startsWith("/api/admin/")) {
    const denied = await requireAdmin(req, env);
    if (denied) return denied;
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

    return json({
      person,
      notes: notes || [],
      vocational: vocational || null,
      ai_history: aiHistory || []
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

  if (path === "/api/admin/ai-reflection" && req.method === "POST") {
    const b = await parseBody(req);
    const personId = safeText(b.person_id, 120);
    const message = safeText(b.message, 4000);

    if (!personId || !message) {
      return json({ error: "Selecciona una persona y escribe un mensaje." }, 400);
    }

    if (highRiskLanguage(message)) {
      const safetyReply =
        "Lo que escribes puede indicar que necesitas apoyo humano inmediato. Este espacio no es adecuado para manejar una crisis. Si existe riesgo de hacerte daño o estás en peligro, busca de inmediato a un adulto de confianza, a Alex u otro profesional, o contacta los servicios de emergencia de tu localidad.";

      const createdAt = nowISO();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO ai_messages (id, person_id, role, content, risk_flag, created_at) VALUES (?, ?, 'user', ?, 1, ?)`)
          .bind(makeId("msg"), personId, message, createdAt),
        env.DB.prepare(`INSERT INTO ai_messages (id, person_id, role, content, risk_flag, created_at) VALUES (?, ?, 'assistant', ?, 1, ?)`)
          .bind(makeId("msg"), personId, safetyReply, createdAt)
      ]);

      return json({ ok: true, risk_flag: true, reply: safetyReply });
    }

    const person = await env.DB.prepare(`SELECT * FROM people WHERE id=?`).bind(personId).first();
    const vocational = await env.DB.prepare(`SELECT * FROM vocational_profiles WHERE person_id=?`).bind(personId).first();

    const system = `
Eres "Reflexión AI", una herramienta de orientación vocacional y desarrollo personal supervisada por Alex.

OBJETIVO:
Ayudar con preguntas, claridad, organización de ideas, comparación de opciones, exploración de intereses, fortalezas y valores.

REGLAS:
- No te presentes como terapeuta.
- No diagnostiques.
- No recomiendes medicamentos.
- No tomes decisiones por la persona.
- No digas una carrera definitiva como conclusión final.
- No sustituyas atención profesional.
- Sé claro, cálido, breve y útil.
- Cuando sea útil, organiza la respuesta en bullets.
- Si ayudas a comparar opciones, muestra pros, dudas y siguiente paso.
- Termina con una sola pregunta breve si ayuda a continuar la reflexión.

CONTEXTO PERMITIDO:
Nombre: ${person?.full_name || "Persona"}
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

IMPORTANTE:
Las notas privadas de Alex NO forman parte del contexto.
`.trim();

    let reply = "";
    try {
      const result = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
        messages: [
          { role: "system", content: system },
          { role: "user", content: message }
        ]
      });
      reply = extractAIText(result);
    } catch (e) {
      reply = "";
    }

    if (!reply) {
      reply =
        "No pude responder bien en este momento. Intenta reformular la pregunta en una sola situación concreta, por ejemplo: “Ayúdame a comparar medicina e ingeniería según mis intereses”.";
    }

    const createdAt = nowISO();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ai_messages (id, person_id, role, content, risk_flag, created_at) VALUES (?, ?, 'user', ?, 0, ?)`)
        .bind(makeId("msg"), personId, message, createdAt),
      env.DB.prepare(`INSERT INTO ai_messages (id, person_id, role, content, risk_flag, created_at) VALUES (?, ?, 'assistant', ?, 0, ?)`)
        .bind(makeId("msg"), personId, safeText(reply, 6000), createdAt)
    ]);

    return json({ ok: true, risk_flag: false, reply });
  }

  return json({ error: "Ruta no encontrada" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return api(req, env, url);
    return env.ASSETS.fetch(req);
  }
};
