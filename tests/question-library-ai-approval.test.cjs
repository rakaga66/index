const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createLibrary({isAdmin = true} = {}) {
    const writes = [];
    const db = {};
    const modules = {
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js': {
            getApps: () => [], initializeApp: () => ({})
        },
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js': {
            getDatabase: () => db,
            ref: (_db, path = '') => ({path}),
            update: async (target, changes) => { writes.push({target, changes}); },
            get: async () => ({val: () => ({})}),
            push: () => ({key: 'generated-library-id'}),
            set: async () => {}, remove: async () => {}, onValue: () => () => {}
        }
    };
    const window = {
        __testFirebaseApp: modules['https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'],
        __testFirebaseDatabase: modules['https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js']
    };
    const context = vm.createContext({
        window,
        sessionStorage: {getItem: key => key === 'isAdmin' && isAdmin ? 'true' : null}
    });
    const source = fs.readFileSync(require.resolve('../js/question-library.js'), 'utf8')
        .replace("import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js')", 'Promise.resolve(window.__testFirebaseApp)')
        .replace("import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')", 'Promise.resolve(window.__testFirebaseDatabase)');
    vm.runInContext(source, context);
    return {library: context.window.QuestionLibrary, writes};
}

test('AI approval atomically moves the question to the library and removes its inbox copy', async () => {
    const {library, writes} = createLibrary();
    const id = 'ai-request-0';
    const libraryId = await library.approveAiQuestion({
        id, question: 'ما اسم وسيلة النقل التي تسير على سكة؟', answer: 'قطار', letter: 'ق',
        category: 'عام', difficulty: 'متوسط', createdAt: 10
    });
    assert.equal(libraryId, `ai-${id}`);
    assert.equal(writes.length, 1, 'the move must be one atomic Firebase update');
    assert.equal(writes[0].target.path, '', 'the update must cover both database branches');
    assert.equal(writes[0].changes[`questionLibrary/${libraryId}`].answer, 'قطار');
    assert.equal(writes[0].changes[`questionLibrary/${libraryId}`].source, 'ai');
    assert.equal(writes[0].changes[`aiQuestionSubmissions/${id}`], null);
});

test('AI approval rejects a mismatched first letter without changing Firebase', async () => {
    const {library, writes} = createLibrary();
    await assert.rejects(() => library.approveAiQuestion({
        id: 'ai-request-1', question: 'سؤال', answer: 'جمل', letter: 'ق'
    }));
    assert.equal(writes.length, 0);
});

test('AI approval still requires the admin session', async () => {
    const {library, writes} = createLibrary({isAdmin: false});
    await assert.rejects(() => library.approveAiQuestion({
        id: 'ai-request-2', question: 'سؤال', answer: 'قطار', letter: 'ق'
    }), /admin-only/);
    assert.equal(writes.length, 0);
});
