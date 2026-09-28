const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../lib/admin-ai');
const handler = require('../api/admin/generate-questions');
const check = require('../api/online/test-connection');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
const sample = { letter: 'م', question: 'جهاز يحول طاقة الرياح إلى حركة دورانية لضخ المياه؟', answer: 'مضخة رياح', difficulty: 'متوسط', category: 'تقنية' };
const config = { key: 'test-secret', endpoint: 'https://api.deepseek.com/chat/completions', model: 'test-model', enabled: true };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function invoke(fn, body = {}, authorized = true) {
    let status, data;
    const res = { status(n) { status = n; return this; }, setHeader() { return this; }, end(s) { data = JSON.parse(s); } };
    await fn({ method: 'POST', headers: authorized ? { authorization: 'Bearer test-token' } : {}, body }, res);
    return { status, data };
}
function mockService(content, status = 200) {
    global.fetch = async url => {
        if (String(url).includes('accounts:lookup')) return response({ users: [{ localId: 'test-admin' }] });
        if (String(url).includes('/admins/')) return response(true);
        if (String(url).includes('/onlineAiSettings')) return response({ enabled: false, model: 'test-model' });
        return response(status === 200 ? { choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }] } : content, status);
    };
}
test('Arabic letters align with game rules including alif and definite articles', () => {
    for (const [answer, expected] of [['ألماس','ا'], ['ألبانيا','ا'], ['القمر','ق'], ['إبرة','ا'], ['هدهد','ه'], ['الـمِريخ','م']]) assert.equal(ai.firstLetter(answer), expected);
    assert.equal(ai.letter('هـ'), 'ه');
    for (const value of ['ء', 'ab', 'مب', '1']) assert.equal(ai.letter(value), '');
});
test('valid natural question accepted', () => assert.equal(ai.validateQuestions([sample], { letter:'م' }).questions.length, 1));
test('reject wrong requested letter even when answer matches returned letter', () => assert.equal(ai.validateQuestions([sample], { letter:'ق' }).questions.length, 0));
test('reject duplicate answer and paraphrased question', () => {
    assert.equal(ai.validateQuestions([sample], {}, [{ question:'سؤال مختلف', answer:sample.answer }]).questions.length, 0);
    assert.equal(ai.validateQuestions([sample, sample]).questions.length, 1);
});
test('reject explicit letter riddles, leaked answers and difficulty mismatch', () => {
    const bad = [{...sample, question:'ما اسم شيء يبدأ بحرف الميم؟'}, {...sample, question:'ما وظيفة مضخة رياح في الحقول؟'}, {...sample, letter:'س'}];
    assert.equal(ai.validateQuestions(bad).questions.length, 0);
    assert.equal(ai.validateQuestions([sample], {difficulty:'سهل'}).questions.length, 0);
});
test('unauthenticated generation never calls provider', async () => {
    global.fetch = () => { throw new Error('unexpected network'); };
    assert.equal((await invoke(handler, {}, false)).status, 401);
});
test('valid authenticated generation works independently of online answer toggle', async () => {
    process.env.ONLINE_AI_API_KEY = 'test-secret';
    mockService({questions:[sample]});
    const result = await invoke(handler, {count:1,letter:'م',difficulty:'متوسط'});
    assert.equal(result.status, 200); assert.equal(result.data.generatedCount, 1);
    assert.match(result.data.requestId, /^ai-/);
    assert.ok(!JSON.stringify(result.data).includes('test-secret'));
});
test('server rejects invalid count and letter', async () => {
    mockService({questions:[sample]});
    for (const body of [{count:1.5},{count:11},{count:1,letter:'x'}]) assert.equal((await invoke(handler,body)).status,400);
});
test('client exclusions are enforced on server', async () => {
    mockService({questions:[sample]});
    const result = await invoke(handler, {count:1,exclude:[sample]});
    assert.equal(result.data.message,'ai-quality-check-failed');
});
test('provider errors are actionable and never echo keys', async () => {
    for (const [status, message] of [[401,'ai-invalid-key'],[402,'ai-insufficient-balance'],[429,'ai-rate-limit'],[500,'ai-upstream-failed']]) {
        global.fetch = async () => response({error:{message:'test-secret'}},status);
        await assert.rejects(ai.completion(config,[]), {message});
    }
});
test('invalid model reported explicitly', async () => {
    global.fetch = async () => response({error:{code:'model_not_found'}},404);
    await assert.rejects(ai.completion(config,[]),{message:'ai-model-unavailable'});
});
test('timeouts are bounded and exposed as retryable errors', async () => {
    global.fetch = async (url, opts) => { assert.ok(opts.signal); throw new DOMException('timeout','TimeoutError'); };
    await assert.rejects(ai.completion(config,[]),{message:'ai-timeout'});
});
test('truncation and malformed JSON cannot masquerade as success', async () => {
    for (const [content, finish_reason, message] of [['{}','length','ai-response-truncated'],['oops','stop','ai-invalid-response'],['','stop','ai-invalid-response']]) {
        global.fetch = async () => response({choices:[{message:{content},finish_reason}]});
        await assert.rejects(ai.completion(config,[]),{message});
    }
});
test('connection check requires actual ok=true JSON not arbitrary text', async () => {
    mockService({ok:false}); assert.equal((await invoke(check)).data.message,'ai-invalid-response');
    mockService({ok:true}); assert.equal((await invoke(check)).status,200);
});
