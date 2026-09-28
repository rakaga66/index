const ai = require('../../lib/admin-ai');
function json(res, status, value) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(value));
}
module.exports = async function testAiConnection(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'method-not-allowed' });
    if (!(await ai.verifyAdmin(req))) return json(res, 401, { ok: false, message: 'admin-required' });
    const config = await ai.configuration(req);
    const start = Date.now();
    try {
        const data = await ai.completion(config, [{ role: 'system', content: 'أعد JSON فقط: {"ok":true}.' }, { role: 'user', content: 'اختبار اتصال. أعد ok بقيمة true.' }]);
        if (data?.ok !== true) throw new Error('ai-invalid-response');
        return json(res, 200, { ok: true, provider: config.provider, model: config.model, latencyMs: Date.now() - start });
    } catch (error) { return json(res, error.message === 'ai-timeout' ? 504 : 502, { ok: false, message: error.message }); }
};
