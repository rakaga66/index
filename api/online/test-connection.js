const FIREBASE_WEB_API_KEY = "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A";
const DEFAULT_DATABASE_URL = "https://buzzer-game-f2983-default-rtdb.firebaseio.com";

function json(res, status, value) {
    res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
}

function requestToken(req) {
    const value = req?.headers?.authorization || req?.headers?.Authorization || "";
    const match = String(value).match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : "";
}

async function verifyAdmin(token) {
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
        const record = await adminResponse.json();
        return record === true || record?.isAdmin === true || record?.role === "admin";
    } catch (_) {
        return false;
    }
}

async function readStoredSettings() {
    const databaseUrl = String(process.env.ONLINE_FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).replace(/\/$/, "");
    try {
        const response = await fetch(databaseUrl + "/onlineAiSettings.json");
        if (!response.ok) return {};
        const value = await response.json();
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

function errorMessage(status) {
    if (status === 401) return "ai-invalid-key";
    if (status === 402) return "ai-insufficient-balance";
    if (status === 429) return "ai-rate-limit";
    return "ai-upstream-failed";
}

module.exports = async function testAiConnection(req, res) {
    if (req.method !== "POST") return json(res, 405, { ok: false, message: "method-not-allowed" });
    const token = requestToken(req);
    if (!(await verifyAdmin(token))) return json(res, 401, { ok: false, message: "admin-required" });

    const apiKey = String(process.env.ONLINE_AI_API_KEY || "").trim();
    if (!apiKey) return json(res, 503, { ok: false, message: "ai-not-configured" });
    const stored = await readStoredSettings();
    const enabled = stored.enabled === undefined ? String(process.env.ONLINE_AI_ENABLED || "false").toLowerCase() === "true" : stored.enabled === true;
    if (!enabled) return json(res, 503, { ok: false, message: "ai-disabled" });

    const endpoint = String(process.env.ONLINE_AI_ENDPOINT || "https://api.deepseek.com/chat/completions");
    const model = String(stored.model || process.env.ONLINE_AI_MODEL || "deepseek-v4-flash");
    const provider = String(stored.provider || process.env.ONLINE_AI_PROVIDER || "deepseek");
    const startedAt = Date.now();
    try {
        const upstream = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
            body: JSON.stringify({
                model,
                temperature: 0,
                max_tokens: 30,
                ...(provider.toLowerCase() === "deepseek" ? { thinking: { type: "disabled" } } : {}),
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: 'أعد JSON فقط بالشكل {"ok":true}.' },
                    { role: "user", content: 'اختبار اتصال قصير. أعد {"ok":true}.' }
                ]
            })
        });
        if (!upstream.ok) {
            console.error("[admin-ai-test] provider request failed", upstream.status, provider, model);
            return json(res, 502, { ok: false, message: errorMessage(upstream.status) });
        }
        const data = await upstream.json();
        if (!data?.choices?.[0]?.message?.content) return json(res, 502, { ok: false, message: "ai-invalid-response" });
        return json(res, 200, { ok: true, provider, model, latencyMs: Date.now() - startedAt });
    } catch (_) {
        return json(res, 502, { ok: false, message: "ai-unavailable" });
    }
};
