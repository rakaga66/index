const DATABASE_URL = 'https://buzzer-game-f2983-default-rtdb.firebaseio.com';
const FIREBASE_KEY = 'AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A';
const LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const clean = (value, max = 500) => String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const normalize = value => clean(value).normalize('NFKC').toLowerCase().replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\u0621-\u063A\u0641-\u064Aa-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
function letter(value) {
    const normalized = normalize(value);
    return normalized.length === 1 && LETTERS.includes(normalized) ? normalized : '';
}
function firstLetter(value) {
    const original = String(value || '').normalize('NFKC').trim();
    const text = normalize(value);
    // Do not mistake the alif in ألماس / ألبانيا for the definite article.
    return (/^[أإآٱ]/.test(original) ? text : text.replace(/^ال(?=\S)/, '')).slice(0, 1);
}
function tokenFrom(req) {
    return String(req.headers?.authorization || req.headers?.Authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}
async function fetchTimed(url, options = {}, timeout = 8000) {
    return fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
}
async function verifyAdmin(req) {
    const token = tokenFrom(req);
    if (!token) return false;
    try {
        const response = await fetchTimed(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
        });
        if (!response.ok) return false;
        const uid = (await response.json())?.users?.[0]?.localId;
        if (!uid) return false;
        const db = String(process.env.ONLINE_FIREBASE_DATABASE_URL || DATABASE_URL).replace(/\/$/, '');
        const record = await fetchTimed(`${db}/admins/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(token)}`);
        if (!record.ok) return false;
        const admin = await record.json();
        return admin === true || admin?.isAdmin === true || admin?.role === 'admin' ? uid : false;
    } catch { return false; }
}
async function configuration(req) {
    let stored = {};
    try {
        const db = String(process.env.ONLINE_FIREBASE_DATABASE_URL || DATABASE_URL).replace(/\/$/, '');
        const result = await fetchTimed(`${db}/onlineAiSettings.json?auth=${encodeURIComponent(tokenFrom(req))}`);
        if (result.ok) stored = await result.json() || {};
    } catch { /* Server configuration remains the fallback. */ }
    const endpoint = String(process.env.ADMIN_AI_ENDPOINT || process.env.ONLINE_AI_ENDPOINT || 'https://api.deepseek.com/chat/completions').trim();
    let model = clean(process.env.ADMIN_AI_MODEL || stored.model || process.env.ONLINE_AI_MODEL || 'deepseek-flash', 120);
    // Legacy UI labels are not model IDs returned by DeepSeek's /models API.
    if (/^https:\/\/api\.deepseek\.com\//.test(endpoint) && /^deepseek-v4(?:\.1)?-flash$/.test(model)) model = 'deepseek-flash';
    return {
        key: String(process.env.ADMIN_AI_API_KEY || process.env.ONLINE_AI_API_KEY || '').trim(),
        endpoint, model,
        provider: clean(process.env.ADMIN_AI_PROVIDER || stored.provider || process.env.ONLINE_AI_PROVIDER || 'deepseek', 60),
        enabled: process.env.ADMIN_AI_ENABLED !== 'false'
    };
}
function providerError(status, data) {
    if (status === 401 || status === 403) return 'ai-invalid-key';
    if (status === 402) return 'ai-insufficient-balance';
    if (status === 429) return 'ai-rate-limit';
    const reason = String(data?.error?.code || '') + ' ' + String(data?.error?.message || '');
    if ((status === 400 || status === 404) && /model.*(not|invalid|exist|available)|model_not_found/i.test(reason)) return 'ai-model-unavailable';
    return status === 400 ? 'ai-request-rejected' : 'ai-upstream-failed';
}
async function completion(config, messages, count = 1, reasoning = false) {
    if (!config.key) throw new Error('ai-not-configured');
    if (!config.enabled) throw new Error('ai-disabled');
    try {
        const response = await fetchTimed(config.endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.key },
            body: JSON.stringify({ model: config.model, temperature: .35, max_tokens: reasoning ? Math.max(8000, 800 * count + 4000) : Math.max(1500, 500 * count + 600),
                ...(/(^|\.)deepseek\.com$/.test(new URL(config.endpoint).hostname) ? { thinking: { type: reasoning ? 'enabled' : 'disabled' } } : {}),
                response_format: { type: 'json_object' }, messages })
        }, 35000);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(providerError(response.status, data));
        if (data?.choices?.[0]?.finish_reason === 'length') throw new Error('ai-response-truncated');
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('ai-invalid-response');
        try { return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
        catch { throw new Error('ai-invalid-response'); }
    } catch (error) {
        if (/^(TimeoutError|AbortError)$/.test(error.name)) throw new Error('ai-timeout');
        if (error.message.startsWith('ai-')) throw error;
        throw new Error('ai-unavailable');
    }
}
function similar(a, b) {
    const left = new Set(normalize(a).split(' '));
    const right = new Set(normalize(b).split(' '));
    return [...left].filter(word => right.has(word)).length / Math.max(left.size, right.size) >= .8;
}
function validateQuestions(data, options = {}, existing = []) {
    const list = Array.isArray(data) ? data : data?.questions;
    if (!Array.isArray(list)) return { questions: [], rejected: 0 };
    const questions = [];
    let rejected = 0;
    for (const item of list.slice(0, 50)) {
        const question = clean(item?.question || item?.q);
        const answer = clean(item?.answer || item?.a, 240);
        const initial = letter(item?.letter);
        const q = normalize(question), a = normalize(answer);
        const difficulty = clean(item?.difficulty, 20);
        const duplicate = [...existing, ...questions].some(previous => normalize(previous.answer) === a || similar(previous.question, question));
        const invalid = !initial || firstLetter(answer) !== initial || (options.letter && initial !== options.letter)
            || question.length < 12 || !answer || !['سهل', 'متوسط', 'صعب'].includes(difficulty)
            || (options.difficulty && difficulty !== options.difficulty)
            || /(?:يبدا|تبدا|اولها|اوله)\s+(?:ب?حرف|الحرف)/.test(q)
            || (' ' + q + ' ').includes(' ' + a + ' ') || duplicate;
        if (invalid) { rejected++; continue; }
        questions.push({ question, answer, letter: initial === 'ه' ? 'هـ' : initial,
            difficulty, category: clean(item.category, 50) || 'عام' });
    }
    return { questions, rejected };
}
module.exports = { clean, normalize, letter, firstLetter, verifyAdmin, configuration, completion, validateQuestions };
