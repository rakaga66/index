const FIREBASE_WEB_API_KEY = "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A";
const DEFAULT_DATABASE_URL = "https://buzzer-game-f2983-default-rtdb.firebaseio.com";
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 6;
const rateBuckets = new Map();
// Keep the owner-provided quality rules on the server. The prompt is never
// sent to the browser; it is used only for the admin generation request.
const SYSTEM_PROMPT = require("./system-prompt");

function json(res, status, value) {
    res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
}

function getClientKey(req) {
    const headers = req?.headers || {};
    const forwarded = headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown";
    return String(forwarded).split(",")[0].trim().slice(0, 80) || "unknown";
}

function allowRequest(req) {
    const key = getClientKey(req);
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
        rateBuckets.set(key, { startedAt: now, count: 1 });
        if (rateBuckets.size > 1000) {
            for (const [oldKey, oldBucket] of rateBuckets) {
                if (now - oldBucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(oldKey);
            }
        }
        return true;
    }
    if (bucket.count >= RATE_LIMIT) return false;
    bucket.count += 1;
    return true;
}

function parseBody(req) {
    let body = req.body || {};
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    return body && typeof body === "object" ? body : {};
}

function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFKC")
        .replace(/[ًٌٍَُِّْـ]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه").replace(/[ى]/g, "ي")
        .replace(/[ؤ]/g, "و").replace(/[ئ]/g, "ي")
        .replace(/[^\u0621-\u063A\u0641-\u064A0-9a-zA-Z\s]/g, " ")
        .replace(/\s+/g, " ").trim();
}

function firstLetter(value) {
    const normalized = normalize(value).replace(/^ال(?=[\u0621-\u064A])/, "");
    return normalized.slice(0, 1);
}

function clean(value, max) {
    return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validQuestion(item) {
    if (!item || typeof item !== "object") return null;
    const question = clean(item.question || item.q, 500);
    const answer = clean(item.answer || item.a, 240);
    const letter = clean(item.letter, 2);
    const category = clean(item.category, 50) || "عام";
    const difficulty = ["سهل", "متوسط", "صعب"].includes(item.difficulty) ? item.difficulty : "متوسط";
    if (!question || !answer || !letter || firstLetter(answer) !== firstLetter(letter)) return null;
    return { question, answer, letter: firstLetter(letter) === "ه" ? "هـ" : firstLetter(letter), category, difficulty };
}

function requestToken(req) {
    const value = req?.headers?.authorization || req?.headers?.Authorization || "";
    const match = String(value).match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
}

async function verifyAdmin(req) {
    const token = requestToken(req);
    if (!token) return false;
    try {
        const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token })
        });
        if (!lookup.ok) return false;
        const account = await lookup.json();
        const uid = account?.users?.[0]?.localId;
        if (!uid) return false;
        const databaseUrl = String(process.env.ONLINE_FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).replace(/\/$/, "");
        const adminResponse = await fetch(`${databaseUrl}/admins/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(token)}`);
        if (!adminResponse.ok) return false;
        const adminRecord = await adminResponse.json();
        return adminRecord === true || adminRecord?.isAdmin === true || adminRecord?.role === "admin";
    } catch (_) {
        return false;
    }
}

function extractContent(data) {
    const content = data?.choices?.[0]?.message?.content || data?.output?.[0]?.content?.[0]?.text || "";
    if (Array.isArray(content)) return content.map(part => part?.text || part?.content || "").join("");
    return String(content || "");
}

function upstreamErrorMessage(status) {
    if (status === 401) return "ai-invalid-key";
    if (status === 402) return "ai-insufficient-balance";
    if (status === 429) return "ai-rate-limit";
    return "ai-upstream-failed";
}

function parseQuestions(value) {
    try {
        const cleanValue = String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleanValue);
        const list = Array.isArray(parsed) ? parsed : parsed?.questions;
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        return list.map(validQuestion).filter(Boolean).filter(item => {
            const key = normalize(item.question);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    } catch (_) {
        return [];
    }
}

module.exports = async function generateQuestions(req, res) {
    if (req.method !== "POST") return json(res, 405, { ok: false, message: "method-not-allowed" });
    if (!allowRequest(req)) {
        res.setHeader("Retry-After", "60");
        return json(res, 429, { ok: false, message: "rate-limit" });
    }
    if (!(await verifyAdmin(req))) return json(res, 401, { ok: false, message: "admin-required" });

    const body = parseBody(req);
    const count = Math.max(1, Math.min(50, Number(body.count) || 10));
    const prompt = clean(body.prompt, 1200) || "أنشئ أسئلة متنوعة مناسبة للعائلة.";
    const requestedLetter = clean(body.letter, 2);
    const category = clean(body.category, 50);
    const difficulty = ["سهل", "متوسط", "صعب"].includes(body.difficulty) ? body.difficulty : "";
    const apiKey = String(process.env.ONLINE_AI_API_KEY || "").trim();
    if (!apiKey) return json(res, 503, { ok: false, message: "ai-not-configured" });

    const databaseUrl = String(process.env.ONLINE_FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).replace(/\/$/, "");
    let stored = {};
    try {
        const settingsResponse = await fetch(`${databaseUrl}/onlineAiSettings.json`);
        if (settingsResponse.ok) stored = await settingsResponse.json() || {};
    } catch (_) { /* defaults below */ }
    const enabled = stored.enabled === undefined ? String(process.env.ONLINE_AI_ENABLED || "false").toLowerCase() === "true" : stored.enabled === true;
    if (!enabled) return json(res, 503, { ok: false, message: "ai-disabled" });
    const endpoint = String(process.env.ONLINE_AI_ENDPOINT || "https://api.deepseek.com/chat/completions");
    const model = String(stored.model || process.env.ONLINE_AI_MODEL || "deepseek-v4-flash");
    const provider = String(stored.provider || process.env.ONLINE_AI_PROVIDER || "deepseek");
    const userPrompt = [
        `المطلوب إنشاء ${count} سؤالًا جديدًا.`,
        requestedLetter ? `اجعل الإجابات تبدأ بحرف ${requestedLetter}.` : "وزّع الإجابات على حروف عربية متنوعة.",
        category ? `التصنيف المفضل: ${category}.` : "التصنيفات متنوعة.",
        difficulty ? `مستوى الصعوبة: ${difficulty}.` : "مستويات الصعوبة متنوعة.",
        `تعليمات الأدمن: ${prompt}`,
        "لا تعِد أسئلة مكررة، وأعد JSON فقط.",
        'صيغة JSON الإلزامية: {"questions":[{"letter":"م","question":"نص السؤال؟","answer":"الإجابة","difficulty":"متوسط","category":"عام"}]}'
    ].join("\n");
    try {
        const isDeepSeek = /deepseek\.com/i.test(endpoint) || provider.toLowerCase() === "deepseek";
        const upstream = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
            body: JSON.stringify({
                model, temperature: 0.35, max_tokens: Math.min(6000, 180 * count),
                ...(isDeepSeek ? { thinking: { type: "disabled" } } : {}),
                response_format: { type: "json_object" },
                messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userPrompt }]
            })
        });
        if (!upstream.ok) {
            // Never include the provider response body: it can contain request
            // details or accidentally echoed secrets. Keep the UI actionable.
            console.error("[admin-ai] provider request failed", upstream.status, provider, model);
            return json(res, 502, { ok: false, message: upstreamErrorMessage(upstream.status) });
        }
        const data = await upstream.json();
        const questions = parseQuestions(extractContent(data)).slice(0, count);
        if (!questions.length) {
            console.error("[admin-ai] provider returned no valid questions", provider, model, data?.choices?.[0]?.finish_reason || "unknown");
            return json(res, 502, { ok: false, message: "ai-invalid-response" });
        }
        return json(res, 200, {
            ok: true, requestId: `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            provider, model, requestedCount: count, generatedCount: questions.length,
            questions, generatedAt: Date.now()
        });
    } catch (_) {
        return json(res, 502, { ok: false, message: "ai-unavailable" });
    }
};
