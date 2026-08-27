function json(res, status, value) {
    res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
}

async function readStoredSettings() {
    const databaseUrl = String(process.env.ONLINE_FIREBASE_DATABASE_URL || "https://buzzer-game-f2983-default-rtdb.firebaseio.com").replace(/\/$/, "");
    try {
        const response = await fetch(databaseUrl + "/onlineAiSettings.json");
        if (!response.ok) return {};
        const value = await response.json();
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

module.exports = async function onlineSettings(req, res) {
    if (req.method !== "GET") return json(res, 405, { ok: false });
    const stored = await readStoredSettings();
    const enabled = stored.enabled === undefined ? String(process.env.ONLINE_AI_ENABLED || "false").toLowerCase() === "true" : stored.enabled === true;
    const configured = Boolean(String(process.env.ONLINE_AI_API_KEY || "").trim());
    return json(res, 200, {
        ok: true,
        provider: stored.provider || process.env.ONLINE_AI_PROVIDER || "deepseek",
        model: stored.model || process.env.ONLINE_AI_MODEL || "deepseek-v4-flash",
        enabled,
        configured
    });
};
