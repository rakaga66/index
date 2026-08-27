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

module.exports = async function testOnlineConnection(req, res) {
    // Do not proxy a paid provider from an unauthenticated public endpoint.
    // The admin UI checks the non-sensitive server configuration via /settings.
    if (req.method !== "POST") return json(res, 405, { ok: false });
    return json(res, 403, { ok: false, message: "admin-auth-required" });
};
