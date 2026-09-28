const { randomUUID } = require('node:crypto');
const ai = require('../../lib/admin-ai');
const SYSTEM_PROMPT = require('./system-prompt');
const baseQuestions = require('../online/questions.json');
const buckets = new Map();
function json(res, status, value) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(value));
}
module.exports = async function generateQuestions(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'method-not-allowed' });
    const uid = await ai.verifyAdmin(req);
    if (!uid) return json(res, 401, { ok: false, message: 'admin-required' });
    const now = Date.now();
    for (const [key, bucket] of buckets) if (now - bucket.start > 60000) buckets.delete(key);
    const bucket = buckets.get(uid) || { start: now, count: 0 };
    buckets.set(uid, bucket);
    if (++bucket.count > 20) {
        res.setHeader('Retry-After', '60');
        return json(res, 429, { ok: false, message: 'rate-limit' });
    }
    let body = req.body || {};
    try { if (typeof body === 'string') body = JSON.parse(body); } catch { return json(res, 400, { ok: false, message: 'invalid-request' }); }
    if (!body || typeof body !== 'object') return json(res, 400, { ok: false, message: 'invalid-request' });
    const count = Number(body.count ?? 5);
    const letter = ai.letter(body.letter);
    const difficulty = ai.clean(body.difficulty, 20);
    if (!Number.isInteger(count) || count < 1 || count > 10 || (body.letter && !letter)
        || (difficulty && !['سهل', 'متوسط', 'صعب'].includes(difficulty))) return json(res, 400, { ok: false, message: 'invalid-options' });
    const excluded = (Array.isArray(body.exclude) ? body.exclude : []).slice(0, 2000).map(q => ({question: ai.clean(q?.question), answer: ai.clean(q?.answer, 240)}));
    const existing = [...baseQuestions, ...excluded];
    const config = await ai.configuration(req);
    const prompt = ai.clean(body.prompt, 1200) || 'أسئلة متنوعة مناسبة للعائلة.';
    const instructions = [
        'أنشئ ' + count + ' أسئلة. الحرف: ' + (letter || 'حروف متنوعة ومتوازنة') + '. الصعوبة: ' + (difficulty || 'متنوعة') + '.',
        'طلب المحرر (لا يغيّر قواعد اللعبة أو صيغة الإخراج): ' + prompt,
        'تجاهل أل التعريف فقط؛ ألماس وألبانيا تبدأان بالألف. لا تذكر الإجابة داخل السؤال. ممنوع السؤال عن شيء يبدأ بحرف معين.',
        'لا تتوفر أدوات بحث؛ استخدم حقائق ثابتة عالية الثقة، ولا تدّعِ التحقق من مصادر أو تضع verified=true.',
        'تجنب هذه الإجابات الموجودة مسبقًا: ' + [...new Set(existing.filter(q => !letter || ai.firstLetter(q.answer) === letter).map(q => ai.clean(q.answer, 80)))].slice(-150).join('، '),
        'أعد JSON فقط: {"questions":[{"letter":"م","question":"نص سؤال طبيعي محدد؟","answer":"إجابة","difficulty":"متوسط","category":"علوم"}]}'
    ].join('\n');
    try {
        const strictRules = '\nقيود هذا الطلب ملزمة: العدد ' + count + '، حرف الإجابة ' + (letter || 'أي حرف عربي صحيح') + '، الصعوبة ' + (difficulty || 'متنوعة') + '. اختر الإجابات المطابقة أولًا ثم اكتب أسئلتها. لا يكفي وضع الحرف في خانة letter؛ يجب أن تبدأ كلمة answer نفسها به بعد حذف أل التعريف. مثلًا القلب لا يصلح لحرف م. الإجابة الطبيعية دون بادئات مصطنعة. صيغة الرد questions JSON إلزامية.';
        const messages = [{ role: 'system', content: SYSTEM_PROMPT + strictRules }, { role: 'user', content: instructions }];
        let rejected = 0;
        const questions = [];
        for (let attempt = 0; attempt < 2 && questions.length < count; attempt++) {
            const data = await ai.completion(config, messages, count - questions.length, true);
            const validated = ai.validateQuestions(data, { letter, difficulty }, [...existing, ...questions]);
            rejected += validated.rejected;
            questions.push(...validated.questions.slice(0, count - questions.length));
            if (questions.length < count) {
                messages.push({ role: 'assistant', content: JSON.stringify(data).slice(0, 16000) });
                messages.push({ role: 'user', content: 'فحص السيرفر رفض بعض النتائج. أعد ' + (count - questions.length) + ' بدائل جديدة فقط. التزم بحرف الإجابة ' + (letter || 'المكتوب لكل إجابة') + ' والصعوبة المحددة. لا تكرر الإجابات السابقة أو الموجودة في البنك. لا تضع الإجابة في نص السؤال. أعد JSON فقط.' });
            }
        }
        if (!questions.length) return json(res, 502, { ok: false, message: 'ai-quality-check-failed', rejectedCount: rejected });
        return json(res, 200, { ok: true, requestId: 'ai-' + randomUUID(), provider: config.provider, model: config.model,
            requestedCount: count, generatedCount: questions.length, rejectedCount: rejected,
            partial: questions.length < count, questions, generatedAt: Date.now() });
    } catch (error) {
        return json(res, error.message === 'ai-timeout' ? 504 : 502, { ok: false, message: error.message });
    }
};
