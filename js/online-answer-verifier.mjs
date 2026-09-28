export async function verifyOnlineAnswer({
    question,
    expectedAnswer,
    requiredLetter,
    playerAnswer,
    questionId,
    origin = globalThis.location?.origin || "http://localhost",
    fetcher = globalThis.fetch,
    timeoutMs = 7500
} = {}) {
    if (typeof fetcher !== "function") return { valid: null, confidence: 0, source: "unavailable" };
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const response = await fetcher(new URL("/api/online/verify-answer", origin), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, expectedAnswer, requiredLetter, playerAnswer, questionId }),
            ...(controller ? { signal: controller.signal } : {})
        });
        if (!response.ok) return { valid: null, confidence: 0, source: "unavailable" };
        const payload = await response.json();
        return {
            valid: payload.valid === true,
            confidence: Math.max(0, Math.min(1, Number(payload.confidence) || 0)),
            source: "ai"
        };
    } catch (_) {
        return { valid: null, confidence: 0, source: "unavailable" };
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}
