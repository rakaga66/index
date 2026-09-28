import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOnlineAnswer } from '../js/online-answer-verifier.mjs';

test('online answer client posts the canonical answer context to the verifier API', async () => {
    let request = null;
    const result = await verifyOnlineAnswer({
        question: 'ماهي عاصمة الدولة السعودية الأولى؟',
        expectedAnswer: 'الدرعية',
        requiredLetter: 'د',
        playerAnswer: 'الدريعه',
        questionId: 'question-1',
        origin: 'https://game.test',
        fetcher: async (url, options) => {
            request = { url: String(url), options };
            return Response.json({ valid: true, confidence: 0.95 });
        }
    });
    assert.equal(request.url, 'https://game.test/api/online/verify-answer');
    assert.deepEqual(JSON.parse(request.options.body), {
        question: 'ماهي عاصمة الدولة السعودية الأولى؟',
        expectedAnswer: 'الدرعية',
        requiredLetter: 'د',
        playerAnswer: 'الدريعه',
        questionId: 'question-1'
    });
    assert.deepEqual(result, { valid: true, confidence: 0.95, source: 'ai' });
});

test('online answer client preserves low confidence and treats an unreachable verifier as unavailable', async () => {
    const uncertain = await verifyOnlineAnswer({
        question: 'q', expectedAnswer: 'a', requiredLetter: 'أ', playerAnswer: 'b',
        origin: 'https://game.test', fetcher: async () => Response.json({ valid: true, confidence: 0.4 })
    });
    const offline = await verifyOnlineAnswer({
        question: 'q', expectedAnswer: 'a', requiredLetter: 'أ', playerAnswer: 'b',
        origin: 'https://game.test', fetcher: async () => { throw new Error('offline'); }
    });
    assert.equal(uncertain.valid, true);
    assert.equal(uncertain.confidence, 0.4);
    assert.equal(offline.valid, null);
    assert.equal(offline.source, 'unavailable');
});
