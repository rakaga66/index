(function () {
    'use strict';
    const LETTERS = ['أ','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

    // These IDs deliberately match the game loader (including the original index).
    function baseRecords(items) {
        return (items || []).map((item, index) => ({
            ...item, id: String(item.id || `static-${index}`), kind: 'base',
            source: 'base', status: 'active', question: item.question || item.q || '',
            answer: item.answer || item.a || '', category: item.category || 'عام',
            difficulty: item.difficulty || 'متوسط', updatedAt: 0
        })).filter(item => item.question && item.answer);
    }
    function mergeRecords(base, collections) {
        const overrides = new Map((collections.overrides || []).map(item => [String(item.baseId || item.id), item]));
        const records = base.map(item => ({ ...item, ...overrides.get(item.id), id: item.id, kind: 'base', source: 'base' }));
        for (const kind of ['library', 'ai', 'follower']) {
            for (const item of collections[kind] || []) {
                if ((kind === 'ai' || kind === 'follower') && item.status === 'approved') continue;
                records.push({ ...item, kind });
            }
        }
        return records.map(item => ({ ...item, key: `${item.kind}:${item.id}` }));
    }
    function create({ firebase, db, library, base, authorize }) {
        const originals = baseRecords(base);
        const paths = { library: library.paths.LIBRARY_PATH, overrides: library.paths.OVERRIDES_PATH,
            ai: library.paths.AI_SUBMISSIONS_PATH, follower: library.paths.SUBMISSIONS_PATH };
        function subscribe(onRecords, onError, onConnection) {
            const collections = {}, ready = new Set(), failures = new Set();
            let connected = false;
            const updateConnection = () => onConnection?.(connected && ready.size === 4 && !failures.size);
            const unsubs = Object.entries(paths).map(([kind, path]) => firebase.onValue(firebase.ref(db, path), snapshot => {
                collections[kind] = Object.entries(snapshot.val() || {}).map(([id, item]) => ({ ...item, id }));
                ready.add(kind); failures.delete(kind);
                if (ready.size === 4) onRecords(mergeRecords(originals, collections));
                updateConnection();
            }, error => { failures.add(kind); updateConnection(); onError(error); }));
            unsubs.push(firebase.onValue(firebase.ref(db, '.info/connected'), snapshot => {
                connected = snapshot.val() === true; updateConnection();
            }, onError));
            return () => unsubs.forEach(unsub => unsub());
        }
        function validate(data) {
            const clean = value => String(value || '').replace(/[<>]/g, '').trim();
            const result = {
                question: clean(data.question).slice(0, 500), answer: clean(data.answer).slice(0, 240),
                letter: clean(data.letter).slice(0, 2), category: clean(data.category).slice(0, 50) || 'عام',
                difficulty: ['سهل', 'متوسط', 'صعب'].includes(data.difficulty) ? data.difficulty : 'متوسط',
                notes: clean(data.notes).slice(0, 500)
            };
            if (result.question.length < 5) throw new Error('اكتب سؤالًا واضحًا من خمسة أحرف على الأقل.');
            if (!result.answer) throw new Error('أضف الإجابة الصحيحة أولًا.');
            if (!LETTERS.includes(result.letter) || !library.answerMatchesLetter(result.answer, result.letter)) {
                throw new Error('الإجابة لا تبدأ بالحرف المحدد. راجع الإجابة أو اختر حرفها الصحيح.');
            }
            return result;
        }
        async function guard(record) {
            // Recheck the Firebase identity and admin record for every write.
            await authorize();
            if (!record) return;
            const path = record.kind === 'base' ? paths.overrides : paths[record.kind];
            if (!path || !record.id || /[.#$\[\]/]/.test(record.id)) throw new Error('تعذر تحديد السؤال. حدّث القائمة وحاول مجددًا.');
            const snapshot = await firebase.get(firebase.ref(db, `${path}/${record.id}`));
            const current = snapshot.val();
            if (!current && record.kind !== 'base') throw new Error('السؤال نُقل أو أُزيل. حدّث القائمة.');
            if (Number(current?.updatedAt || 0) !== Number(record.updatedAt || 0)) {
                throw new Error('عُدّل هذا السؤال من مكان آخر. أغلق المحرر وافتحه مجددًا قبل الحفظ.');
            }
        }
        async function save(record, data) {
            const value = validate(data);
            await guard(record);
            if (!record) return library.addQuestion({ ...value, status: 'active' });
            if (record.kind === 'base') await library.updateQuestionOverride(record.id, { ...value, status: record.status });
            else if (record.kind === 'library') await library.updateQuestion(record.id, value);
            else if (record.kind === 'ai') await library.updateAiQuestion(record.id, value);
            else if (record.kind === 'follower') await library.updateSubmission(record.id, value);
            return record.id;
        }
        async function changeStatus(record, status) {
            const allowed = ['base','library'].includes(record?.kind) ? ['active','disabled'] : ['pending','archived'];
            if (!record || !allowed.includes(status)) throw new Error('حالة السؤال غير صحيحة.');
            await guard(record);
            if (record.kind === 'base') return library.updateQuestionOverride(record.id, { ...record, status });
            if (record.kind === 'library') return library.updateQuestion(record.id, { status });
            if (record.kind === 'ai') return library.updateAiQuestion(record.id, { status });
            return library.updateSubmission(record.id, { status });
        }
        async function approve(record, data) {
            if (!record || !['ai','follower'].includes(record.kind)) throw new Error('هذا السؤال موجود في المكتبة بالفعل.');
            const value = validate(data);
            await guard(record);
            return record.kind === 'ai' ? library.approveAiQuestion(record, value) : library.approveSubmission(record, value);
        }
        return { subscribe, save, changeStatus, approve, validate };
    }
    window.ContentStudioStore = Object.freeze({ create, baseRecords, mergeRecords, LETTERS });
})();
