(function () {
    'use strict';

    const CONFIG = {
        apiKey: 'AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A',
        authDomain: 'buzzer-game-f2983.firebaseapp.com',
        databaseURL: 'https://buzzer-game-f2983-default-rtdb.firebaseio.com',
        projectId: 'buzzer-game-f2983',
        storageBucket: 'buzzer-game-f2983.firebasestorage.app',
        messagingSenderId: '125573747954',
        appId: '1:125573747954:web:8dac68183e6e326b8b2c6b'
    };

    const LIBRARY_PATH = 'questionLibrary';
    const OVERRIDES_PATH = 'questionOverrides';
    const SUBMISSIONS_PATH = 'questionSubmissions';
    const SUGGESTIONS_PATH = 'suggestions';
    // AI-generated questions stay in a separate review inbox until approved.
    const AI_SUBMISSIONS_PATH = 'aiQuestionSubmissions';
    const AI_REQUESTS_PATH = 'aiQuestionRequests';
    let dbPromise = null;
    let cache = null;
    let cacheAt = 0;
    let overridesCache = null;
    let overridesCacheAt = 0;

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKC')
            .replace(/[ًٌٍَُِّْـ]/g, '')
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/[ة]/g, 'ه')
            .replace(/[ى]/g, 'ي')
            .replace(/[ؤ]/g, 'و')
            .replace(/[ئ]/g, 'ي')
            .replace(/[^\u0621-\u063A\u0641-\u064A0-9a-z\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeLetter(value) {
        const normalized = normalizeText(value);
        return normalized === 'ه' || normalized === 'هـ' ? 'ه' : normalized.slice(0, 1);
    }

    function answerMatchesLetter(answer, letter) {
        const target = normalizeLetter(letter);
        const original = String(answer || '').normalize('NFKC').trim();
        const answerText = normalizeText(answer).replace(/^[إأآٱ]/.test(original) ? /^(?!)$/ : /^ال(?=\S)/, '');
        return Boolean(target && answerText && normalizeLetter(answerText) === target);
    }

    function similarityScore(first, second) {
        const a = normalizeText(first);
        const b = normalizeText(second);
        if (!a || !b) return 0;
        if (a === b) return 1;
        const left = new Set(a.split(' '));
        const right = new Set(b.split(' '));
        const overlap = [...left].filter(word => right.has(word)).length;
        return overlap / Math.max(left.size, right.size);
    }

    function mapRecord(id, value) {
        return { id, ...(value || {}) };
    }

    async function getDbTools() {
        if (!dbPromise) {
            dbPromise = Promise.all([
                import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
                import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
            ]).then(([appModule, dbModule]) => {
                const app = appModule.getApps().length
                    ? appModule.getApps()[0]
                    : appModule.initializeApp(CONFIG);
                return { db: dbModule.getDatabase(app), ...dbModule };
            });
        }
        return dbPromise;
    }

    async function readCollection(path, force = false) {
        if (path === LIBRARY_PATH && !force && cache && Date.now() - cacheAt < 30000) return cache;
        if (path === OVERRIDES_PATH && !force && overridesCache && Date.now() - overridesCacheAt < 30000) return overridesCache;
        const { db, ref, get } = await getDbTools();
        const snapshot = await get(ref(db, path));
        const records = Object.entries(snapshot.val() || {})
            .map(([id, value]) => mapRecord(id, value))
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        if (path === LIBRARY_PATH) {
            cache = records;
            cacheAt = Date.now();
        }
        if (path === OVERRIDES_PATH) {
            overridesCache = records;
            overridesCacheAt = Date.now();
        }
        return records;
    }

    async function subscribe(path, callback) {
        const { db, ref, onValue } = await getDbTools();
        return onValue(ref(db, path), snapshot => {
            const records = Object.entries(snapshot.val() || {})
                .map(([id, value]) => mapRecord(id, value))
                .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
            if (path === LIBRARY_PATH) {
                cache = records;
                cacheAt = Date.now();
            }
            if (path === OVERRIDES_PATH) {
                overridesCache = records;
                overridesCacheAt = Date.now();
            }
            callback(records);
        });
    }

    async function createRecord(path, value) {
        const { db, ref, push, set } = await getDbTools();
        const recordRef = push(ref(db, path));
        await set(recordRef, value);
        if (path === LIBRARY_PATH) cache = null;
        if (path === OVERRIDES_PATH) overridesCache = null;
        return recordRef.key;
    }

    async function updateRecord(path, id, value) {
        const { db, ref, update } = await getDbTools();
        await update(ref(db, `${path}/${id}`), value);
        if (path === LIBRARY_PATH) cache = null;
        if (path === OVERRIDES_PATH) overridesCache = null;
    }

    async function removeRecord(path, id) {
        const { db, ref, remove } = await getDbTools();
        await remove(ref(db, `${path}/${id}`));
        if (path === LIBRARY_PATH) cache = null;
        if (path === OVERRIDES_PATH) overridesCache = null;
    }

    function safeFirebaseKey(value) {
        return String(value || '').replace(/[.#$\[\]/]/g, '_');
    }

    async function updateQuestionOverride(baseId, value) {
        assertAdminSession();
        const id = safeFirebaseKey(baseId);
        if (!id) throw new Error('question-id-required');
        const { db, ref, update } = await getDbTools();
        await update(ref(db, `${OVERRIDES_PATH}/${id}`), {
            baseId: String(baseId),
            question: clean(value.question, 500),
            answer: clean(value.answer, 240),
            letter: clean(value.letter, 2),
            category: clean(value.category, 50) || 'عام',
            difficulty: clean(value.difficulty, 20) || 'متوسط',
            notes: clean(value.notes, 500),
            status: value.status === 'disabled' ? 'disabled' : 'active',
            updatedAt: Date.now()
        });
        overridesCache = null;
    }

    async function removeQuestionOverride(baseId) {
        assertAdminSession();
        await removeRecord(OVERRIDES_PATH, safeFirebaseKey(baseId));
    }

    function clean(value, max = 1000) {
        return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
    }

    function assertAdminSession() {
        if (globalThis.sessionStorage?.getItem('isAdmin') !== 'true') {
            throw new Error('admin-only');
        }
    }

    async function submitQuestion(data) {
        const letter = clean(data.letter, 2);
        const answer = clean(data.answer, 240);
        if (!answerMatchesLetter(answer, letter)) throw new Error('يجب أن تبدأ الإجابة بالحرف المحدد.');
        return createRecord(SUBMISSIONS_PATH, {
            type: 'question', status: 'pending', source: 'follower',
            question: clean(data.question, 500), answer, letter,
            category: clean(data.category, 50) || 'عام',
            difficulty: clean(data.difficulty, 20) || 'متوسط',
            name: clean(data.name, 50) || 'متابع',
            createdAt: Date.now(), updatedAt: Date.now(), readAt: null
        });
    }

    async function submitSuggestion(data) {
        return createRecord(SUGGESTIONS_PATH, {
            type: 'suggestion', status: 'pending', source: 'follower',
            title: clean(data.title, 120), text: clean(data.text, 1000),
            category: clean(data.category, 40) || 'اقتراح عام',
            name: clean(data.name, 50) || 'متابع',
            createdAt: Date.now(), updatedAt: Date.now(), readAt: null
        });
    }

    async function addAiQuestion(data) {
        assertAdminSession();
        const letter = clean(data.letter, 2);
        const answer = clean(data.answer, 240);
        if (!answerMatchesLetter(answer, letter)) throw new Error('الإجابة لا تبدأ بالحرف المحدد.');
        return createRecord(AI_SUBMISSIONS_PATH, {
            type: 'question', status: ['pending', 'rejected', 'archived'].includes(data.status) ? data.status : 'pending',
            source: 'ai', requestId: clean(data.requestId, 120),
            question: clean(data.question, 500), answer, letter,
            category: clean(data.category, 50) || 'عام',
            difficulty: clean(data.difficulty, 20) || 'متوسط',
            notes: clean(data.notes, 500), name: 'مساعد الذكاء الاصطناعي',
            createdAt: Number(data.createdAt) || Date.now(), updatedAt: Date.now(),
            readAt: data.readAt || null, reviewedAt: data.reviewedAt || null,
            libraryId: data.libraryId || null
        });
    }

    async function recordAiRequest(data) {
        assertAdminSession();
        return createRecord(AI_REQUESTS_PATH, {
            type: 'generation', status: data.status || 'completed',
            requestId: clean(data.requestId, 120), prompt: clean(data.prompt, 1200),
            count: Math.max(1, Math.min(50, Number(data.count) || 10)),
            generatedCount: Math.max(0, Math.min(50, Number(data.generatedCount) || 0)),
            model: clean(data.model, 120), provider: clean(data.provider, 60),
            createdAt: Number(data.createdAt) || Date.now(), updatedAt: Date.now()
        });
    }

    async function addQuestion(data) {
        assertAdminSession();
        const letter = clean(data.letter, 2);
        const answer = clean(data.answer, 240);
        if (!answerMatchesLetter(answer, letter)) throw new Error('الإجابة لا تبدأ بالحرف المحدد.');
        const id = await createRecord(LIBRARY_PATH, {
            type: 'question', status: data.status === 'disabled' ? 'disabled' : 'active',
            source: data.source || 'admin', question: clean(data.question, 500), answer, letter,
            category: clean(data.category, 50) || 'عام',
            difficulty: clean(data.difficulty, 20) || 'متوسط',
            notes: clean(data.notes, 500), createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Date.now(), approvedAt: data.approvedAt || null
        });
        return id;
    }

    async function approveSubmission(submission, overrides = {}) {
        assertAdminSession();
        const data = { ...submission, ...overrides };
        const libraryId = await addQuestion({ ...data, source: 'follower', status: 'active', approvedAt: Date.now() });
        await updateRecord(SUBMISSIONS_PATH, submission.id, {
            status: 'approved', libraryId, reviewedAt: Date.now(), updatedAt: Date.now(), readAt: submission.readAt || Date.now()
        });
        return libraryId;
    }

    async function approveAiQuestion(submission, overrides = {}) {
        assertAdminSession();
        const data = { ...submission, ...overrides };
        const libraryId = await addQuestion({ ...data, source: 'ai', status: 'active', approvedAt: Date.now() });
        await updateRecord(AI_SUBMISSIONS_PATH, submission.id, {
            status: 'approved', libraryId, reviewedAt: Date.now(), updatedAt: Date.now(), readAt: submission.readAt || Date.now()
        });
        return libraryId;
    }

    window.QuestionLibrary = Object.freeze({
        paths: Object.freeze({ LIBRARY_PATH, OVERRIDES_PATH, SUBMISSIONS_PATH, SUGGESTIONS_PATH, AI_SUBMISSIONS_PATH, AI_REQUESTS_PATH }),
        normalizeText, normalizeLetter, answerMatchesLetter, similarityScore,
        getAllQuestions: force => readCollection(LIBRARY_PATH, force),
        getActiveQuestions: async force => (await readCollection(LIBRARY_PATH, force)).filter(item => item.status === 'active'),
        getQuestionOverrides: force => readCollection(OVERRIDES_PATH, force),
        subscribeLibrary: callback => subscribe(LIBRARY_PATH, callback),
        subscribeOverrides: callback => subscribe(OVERRIDES_PATH, callback),
        subscribeSubmissions: callback => subscribe(SUBMISSIONS_PATH, callback),
        subscribeSuggestions: callback => subscribe(SUGGESTIONS_PATH, callback),
        subscribeAiQuestions: callback => subscribe(AI_SUBMISSIONS_PATH, callback),
        subscribeAiRequests: callback => subscribe(AI_REQUESTS_PATH, callback),
        submitQuestion, submitSuggestion, addQuestion, approveSubmission, addAiQuestion, approveAiQuestion, recordAiRequest,
        updateQuestionOverride, removeQuestionOverride,
        updateQuestion: (id, value) => { assertAdminSession(); return updateRecord(LIBRARY_PATH, id, { ...value, updatedAt: Date.now() }); },
        removeQuestion: id => { assertAdminSession(); return removeRecord(LIBRARY_PATH, id); },
        updateSubmission: (id, value) => { assertAdminSession(); return updateRecord(SUBMISSIONS_PATH, id, { ...value, updatedAt: Date.now() }); },
        removeSubmission: id => { assertAdminSession(); return removeRecord(SUBMISSIONS_PATH, id); },
        updateSuggestion: (id, value) => { assertAdminSession(); return updateRecord(SUGGESTIONS_PATH, id, { ...value, updatedAt: Date.now() }); },
        removeSuggestion: id => { assertAdminSession(); return removeRecord(SUGGESTIONS_PATH, id); },
        updateAiQuestion: (id, value) => { assertAdminSession(); return updateRecord(AI_SUBMISSIONS_PATH, id, { ...value, updatedAt: Date.now() }); },
        removeAiQuestion: id => { assertAdminSession(); return removeRecord(AI_SUBMISSIONS_PATH, id); },
        updateAiRequest: (id, value) => { assertAdminSession(); return updateRecord(AI_REQUESTS_PATH, id, { ...value, updatedAt: Date.now() }); },
        removeAiRequest: id => { assertAdminSession(); return removeRecord(AI_REQUESTS_PATH, id); },
        clearCache: () => { cache = null; cacheAt = 0; overridesCache = null; overridesCacheAt = 0; }
    });
})();
