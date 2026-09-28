const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const verifyAnswer = require('../api/online/verify-answer');
const questions = require('../api/online/questions.json');

const originalFetch = global.fetch;
const envKeys = ['ONLINE_AI_API_KEY', 'ONLINE_AI_ENABLED', 'ONLINE_AI_ENDPOINT', 'ONLINE_AI_MODEL', 'ONLINE_FIREBASE_DATABASE_URL'];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    }
});

function fixture() {
    const record = questions.find((item) => item.answer === 'الدرعية');
    assert.ok(record, 'official Arabic answer fixture exists');
    return record;
}

function setTestAI(valid, confidence = 0.96) {
    process.env.ONLINE_AI_API_KEY = 'test-only-key';
    process.env.ONLINE_AI_ENABLED = 'true';
    process.env.ONLINE_AI_ENDPOINT = 'https://mock-ai.test/chat/completions';
    process.env.ONLINE_AI_MODEL = 'mock-model';
    process.env.ONLINE_FIREBASE_DATABASE_URL = 'https://mock-db.test';
    let aiCalls = 0;
    let sentPrompt = '';
    global.fetch = async (url, options = {}) => {
        const target = String(url);
        if (target.endsWith('/onlineAiSettings.json')) return Response.json({ enabled: true, model: 'mock-model' });
        if (target.endsWith('/questionLibrary.json')) return Response.json({});
        if (target === process.env.ONLINE_AI_ENDPOINT) {
            aiCalls += 1;
            const body = JSON.parse(options.body);
            sentPrompt = body.messages[1].content;
            return Response.json({ choices: [{ message: { content: JSON.stringify({ valid, confidence }) } }] });
        }
        throw new Error('Unexpected fetch URL in test: ' + target);
    };
    return { calls: () => aiCalls, prompt: () => sentPrompt };
}

async function requestAnswer(record, playerAnswer) {
    let status = 0;
    let payload = '';
    await verifyAnswer({
        method: 'POST',
        headers: { 'x-forwarded-for': '127.0.0.1' },
        body: {
            question: record.question,
            expectedAnswer: record.answer,
            requiredLetter: record.letter,
            playerAnswer
        }
    }, {
        status(code) { status = code; return this; },
        setHeader() { return this; },
        end(value) { payload = value; }
    });
    return { status, ...JSON.parse(payload) };
}

test('orthographic normalization matches without invoking the AI', async () => {
    const ai = setTestAI(false);
    const result = await requestAnswer(fixture(), 'درعية');
    assert.equal(result.status, 200);
    assert.equal(result.valid, true);
    assert.equal(result.confidence, 0.99);
    assert.equal(ai.calls(), 0);
});

test('a one-letter typo is sent to the AI judge and can be accepted', async () => {
    const ai = setTestAI(true, 0.97);
    const result = await requestAnswer(fixture(), 'الدريعه');
    assert.equal(result.status, 200);
    assert.equal(result.valid, true);
    assert.equal(ai.calls(), 1);
    assert.match(ai.prompt(), /الدريعه/);
    assert.match(ai.prompt(), /الدرعية/);
});

test('a similar but different answer is not accepted by the deterministic matcher', async () => {
    const ai = setTestAI(false, 0.99);
    assert.equal(verifyAnswer.sameAnswerIgnoringFormatting('جمل', 'جبل'), false);
    const result = await requestAnswer(fixture(), 'جدة');
    assert.equal(result.status, 200);
    assert.equal(result.valid, false);
    assert.equal(ai.calls(), 1);
});

test('two independent spelling errors are not automatically treated as a one-typo match', () => {
    assert.equal(verifyAnswer.answerMatches('الدرعية', 'الدرييا'), false);
    assert.equal(verifyAnswer.answerMatches('الدرعية', 'الدريعه'), true);
});
