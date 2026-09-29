(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const el = (tag, className, text) => {
        const node = document.createElement(tag); if (className) node.className = className;
        if (text !== undefined) node.textContent = text; return node;
    };
    const SOURCES = { base: 'أساسي في اللعبة', admin: 'إضافة إدارية', ai: 'ذكاء اصطناعي', follower: 'متابع' };
    const STATES = { active: 'فعّال', disabled: 'موقوف', pending: 'للمراجعة', rejected: 'مرفوض', archived: 'مؤرشف', in_review: 'قيد المراجعة' };
    const SECTIONS = {
        library: ['مكتبة الأسئلة', 'كل محتوى اللعبة، تحت يدك.', 'أسئلة اللعبة'],
        ai: ['مراجعة الذكاء', 'لمستك الأخيرة قبل أن يصبح السؤال جزءًا من اللعب.', 'أسئلة الذكاء الاصطناعي'],
        follower: ['أسئلة المتابعين', 'أفكار مجتمع حروف، بانتظار اختيارك.', 'مشاركات المتابعين']
    };
    const PAGE_SIZE = 14;
    function mount({ store, email, logout }) {
        const library = window.QuestionLibrary;
        const aborter = new AbortController();
        let records = [], tab = 'library', page = 1, selected = null, editing = false,
            baseline = '', busy = false, connected = false, loaded = false, disposed = false, unsubscribe, toastTimer;
        const fields = { question: 'questionText', answer: 'answerText', letter: 'questionLetter', category: 'category', difficulty: 'difficulty', notes: 'notes' };
        const on = (target, event, handler) => target.addEventListener(event, handler, { signal: aborter.signal });
        const values = () => Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, $(id).value]));
        const dirty = () => editing && JSON.stringify(values()) !== baseline;
        const isInbox = item => item && ['ai','follower'].includes(item.kind);
        const number = value => Number(value).toLocaleString('ar-SA');
        function toast(message, error = false) {
            clearTimeout(toastTimer); $('toast').textContent = message; $('toast').dataset.error = String(error); $('toast').hidden = false;
            toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
        }
        function confirm(message, label = 'تجاهل التعديلات', title = 'لديك تعديلات غير محفوظة') {
            if ($('confirmDialog').open) return Promise.resolve(false);
            $('confirmTitle').textContent = title; $('confirmMessage').textContent = message;
            $('confirmOk').textContent = label; $('confirmCancel').textContent = 'رجوع';
            const dialog = $('confirmDialog'); dialog.returnValue = ''; dialog.showModal();
            return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true }));
        }
        async function mayLeave() {
            if (busy) return false;
            return !dirty() || confirm('إذا تابعت، ستفقد التعديلات غير المحفوظة لهذا السؤال.');
        }
        on($('confirmOk'), 'click', () => $('confirmDialog').close('yes'));
        on($('confirmCancel'), 'click', () => $('confirmDialog').close('no'));
        $('accountName').textContent = email;
        $('letterFilter').replaceChildren(new Option('كل الحروف', ''), ...window.ContentStudioStore.LETTERS.map(letter => new Option(letter, letter)));
        $('questionLetter').replaceChildren(...window.ContentStudioStore.LETTERS.map(letter => new Option(letter, letter)));
        function setStatusOptions() {
            const options = tab === 'library' ? ['active','disabled'] : ['pending','archived','rejected','in_review'];
            $('statusFilter').replaceChildren(new Option('كل الحالات', ''), ...options.map(status => new Option(STATES[status], status)));
        }
        function tabRecords() { return records.filter(item => tab === 'library' ? ['base','library'].includes(item.kind) : item.kind === tab); }
        function filtered() {
            const query = library.normalizeText($('search').value);
            const letter = library.normalizeLetter($('letterFilter').value), status = $('statusFilter').value;
            return tabRecords().filter(item => (!query || library.normalizeText(`${item.question} ${item.answer} ${item.category || ''}`).includes(query))
                && (!letter || library.normalizeLetter(item.letter) === letter) && (!status || item.status === status))
                .sort((a,b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
        }
        function render() {
            const allLibrary = records.filter(item => ['base','library'].includes(item.kind));
            $('totalCount').textContent = number(allLibrary.length);
            $('activeCount').textContent = number(allLibrary.filter(item => item.status === 'active').length);
            const pending = kind => records.filter(item => item.kind === kind && ['pending','in_review'].includes(item.status)).length;
            $('pendingCount').textContent = number(pending('ai') + pending('follower'));
            $('navLibrary').textContent = number(allLibrary.length); $('navAi').textContent = number(pending('ai')); $('navFollower').textContent = number(pending('follower'));
            const list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
            page = Math.min(page, pages);
            $('clearFilters').hidden = !$('search').value && !$('letterFilter').value && !$('statusFilter').value;
            $('resultCount').textContent = `${number(list.length)} سؤال${list.length !== tabRecords().length ? ` من ${number(tabRecords().length)}` : ''}`;
            $('pageIndicator').textContent = `${number(page)} / ${number(pages)}`;
            $('previousPage').disabled = page <= 1; $('nextPage').disabled = page >= pages;
            const fragment = document.createDocumentFragment();
            for (const item of list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)) {
                const row = el('button', 'question-row'); row.type = 'button'; row.dataset.key = item.key;
                row.setAttribute('aria-pressed', String(selected?.key === item.key));
                const letter = el('span', 'row-letter', item.letter || '؟'); letter.setAttribute('aria-hidden','true');
                const copy = el('span', 'row-copy'); copy.append(el('span','row-question', item.question), el('span','row-answer', `الإجابة: ${item.answer}`));
                const meta = el('span','row-meta'); meta.append(el('span',`badge ${item.status}`, STATES[item.status] || 'للمراجعة'), el('span','', item.category || 'عام'), el('span','', '·'), el('span','', SOURCES[item.source] || SOURCES[item.kind] || 'المكتبة'));
                copy.append(meta); const chevron = el('span','row-chevron','‹'); chevron.setAttribute('aria-hidden','true'); row.append(letter, copy, chevron); fragment.append(row);
            }
            if (!list.length) {
                const empty = el('div','list-empty'); empty.append(el('strong','', tab === 'library' ? 'لا توجد نتائج مطابقة' : 'الصندوق مرتب، لا أسئلة هنا'), el('p','',tab === 'library' ? 'جرّب كلمة أخرى أو امسح الفلاتر.' : 'تظهر الأسئلة هنا عندما تصل للمراجعة.')); fragment.append(empty);
            }
            $('questionList').replaceChildren(fragment); $('questionList').setAttribute('aria-busy','false');
            $('exportButton').disabled = !loaded || !list.length;
        }
        function preview() {
            const data = values();
            $('previewQuestion').textContent = data.question || 'اكتب السؤال لتظهر معاينته هنا.';
            $('previewAnswer').textContent = data.answer ? `الإجابة: ${data.answer}` : 'الإجابة تظهر للمقدم';
            $('previewLetter').textContent = data.letter || 'ح';
            const valid = !data.answer || library.answerMatchesLetter(data.answer, data.letter);
            $('letterHint').classList.toggle('invalid', !valid);
            $('letterHint').textContent = valid ? 'تبدأ الإجابة بالحرف المختار، مع تجاهل «الـ» التعريف.' : 'الإجابة لا تبدأ بهذا الحرف. راجع اختيارك.';
            $('answerText').setAttribute('aria-invalid', String(!valid));
            $('draftStatus').textContent = busy ? 'جارٍ الحفظ…' : dirty() ? 'تعديلات غير محفوظة' : 'جاهز للتحرير';
        }
        function showEditor(item = null, copy = false) {
            selected = copy ? null : item ? { ...item } : null; editing = true;
            $('editorEmpty').hidden = true; $('editorForm').hidden = false; $('editorPanel').classList.add('is-editing');
            for (const [key,id] of Object.entries(fields)) {
                let value = item?.[key] || (key === 'letter' ? $('letterFilter').value || 'أ' : key === 'difficulty' ? 'متوسط' : '');
                if (key === 'letter') value = window.ContentStudioStore.LETTERS.find(l => library.normalizeLetter(l) === library.normalizeLetter(value)) || 'أ';
                $(id).value = value;
            }
            $('editorTitle').textContent = selected ? 'تعديل السؤال' : copy ? 'نسخة جديدة' : 'سؤال جديد';
            $('recordSource').textContent = selected ? SOURCES[selected.source] || SOURCES[selected.kind] || 'المكتبة' : 'إضافة إدارية';
            $('editorError').textContent = ''; $('duplicateButton').hidden = !selected;
            $('approveButton').hidden = !isInbox(selected); $('toggleStatus').hidden = !selected;
            $('toggleStatus').textContent = isInbox(selected) ? (selected.status === 'archived' ? 'إعادة للمراجعة' : 'أرشفة') : selected?.status === 'disabled' ? 'تفعيل السؤال' : 'إيقاف السؤال';
            $('saveButton').firstChild.textContent = isInbox(selected) ? 'حفظ التعديلات ' : 'حفظ السؤال ';
            $('saveHint').textContent = isInbox(selected) ? 'الحفظ يبقي السؤال للمراجعة. الاعتماد ينقله إلى مكتبة اللعبة.' : 'يُحفظ في مكتبة اللعبة ويظهر عند تحميل الأسئلة.';
            baseline = JSON.stringify(values()); preview(); render();
            if (matchMedia('(max-width:680px)').matches) $('editorPanel').scrollIntoView({ block:'start', behavior:'instant' });
            $('questionText').focus({ preventScroll: !matchMedia('(max-width:680px)').matches });
        }
        function closeEditor() {
            selected = null; editing = false; baseline = '';
            $('editorForm').hidden = true; $('editorEmpty').hidden = false; $('editorPanel').classList.remove('is-editing');
            $('editorForm').reset(); $('editorError').textContent = ''; render();
        }
        function setBusy(value) {
            busy = value;
            $('editorForm').querySelectorAll('button,input,textarea,select').forEach(node => { node.disabled = value; });
            $('newQuestion').disabled = value || !loaded; preview();
        }
        function ensureUnique(data) {
            const text = library.normalizeText(data.question);
            if (records.some(item => ['base','library'].includes(item.kind) && item.key !== selected?.key && library.normalizeText(item.question) === text)) {
                throw new Error('هذا السؤال موجود في المكتبة. عدّل السؤال الحالي أو اكتب سؤالًا مختلفًا.');
            }
        }
        async function perform(action) {
            if (!editing || busy) return;
            $('editorError').textContent = '';
            if (!connected || !navigator.onLine) { $('editorError').textContent = 'الاتصال بالمكتبة غير متاح. بقيت تعديلاتك هنا؛ حاول بعد عودة الاتصال.'; return; }
            try {
                const data = values();
                if (action !== 'status') { if (!$('editorForm').reportValidity()) return; store.validate(data); ensureUnique(data); }
                if (action === 'status' && !(await mayLeave())) return;
                let nextStatus;
                if (action === 'status') {
                    nextStatus = isInbox(selected) ? (selected.status === 'archived' ? 'pending' : 'archived') : selected.status === 'disabled' ? 'active' : 'disabled';
                    if (nextStatus === 'disabled' && !(await confirm('سيُستبعد السؤال من الجولات الجديدة. يمكنك تفعيله مرة أخرى في أي وقت.', 'إيقاف السؤال', 'إيقاف هذا السؤال؟'))) return;
                }
                setBusy(true);
                if (action === 'approve') await store.approve(selected, data);
                else if (action === 'status') await store.changeStatus(selected, nextStatus);
                else await store.save(selected, data);
                if (disposed) return;
                closeEditor(); $('search').focus({preventScroll:true});
                toast(action === 'approve' ? 'اعتُمد السؤال ونُقل إلى مكتبة اللعبة.' : action === 'status' ? 'تم تحديث حالة السؤال.' : 'تم حفظ السؤال في المحتوى.');
            } catch (error) {
                if (disposed) return;
                const message = error.message || '';
                $('editorError').textContent = /[\u0600-\u06ff]/.test(message) ? message : 'تعذر الحفظ. تحقق من اتصالك وصلاحية حسابك ثم أعد المحاولة. تعديلاتك محفوظة في المحرر.';
            } finally { if (!disposed) setBusy(false); }
        }
        async function switchTab(next) {
            if (!SECTIONS[next] || next === tab || !(await mayLeave())) return;
            tab = next; page = 1; closeEditor(); $('search').value = ''; $('letterFilter').value = ''; setStatusOptions();
            $('pageTitle').replaceChildren(document.createTextNode(SECTIONS[tab][0]), el('span','heading-dot','.'));
            $('pageSubtitle').textContent = SECTIONS[tab][1]; $('listHeading').textContent = SECTIONS[tab][2];
            document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.tab === tab)));
            render();
        }
        function connect() {
            unsubscribe?.(); loaded = false; connected = false; $('newQuestion').disabled = true; $('exportButton').disabled = true; $('emptyNew').disabled = true;
            $('loadError').hidden = true; $('questionList').setAttribute('aria-busy','true');
            $('connectionStatus').textContent = 'جارٍ الاتصال…'; $('connectionStatus').dataset.state = '';
            unsubscribe = store.subscribe(items => {
                if (disposed) return;
                records = items; loaded = true; $('loadError').hidden = true; $('newQuestion').disabled = busy; $('emptyNew').disabled = false; render();
            }, () => {
                if (disposed) return;
                connected = false; $('loadError').hidden = false;
                $('loadErrorText').textContent = 'تعذر تحميل جزء من المحتوى. تحقق من الاتصال وصلاحية حساب الأدمن.';
                $('questionList').setAttribute('aria-busy','false'); $('connectionStatus').textContent = 'تعذر الاتصال'; $('connectionStatus').dataset.state = 'error';
                $('resultCount').textContent = loaded ? 'البيانات قد لا تكون محدثة' : 'المحتوى غير متاح الآن';
            }, value => {
                if (disposed) return;
                connected = value;
                $('connectionStatus').textContent = value ? 'متصل بالمكتبة' : loaded ? 'الاتصال منقطع' : 'جارٍ الاتصال…';
                $('connectionStatus').dataset.state = value ? 'connected' : 'error';
            });
        }
        on($('questionList'),'click',async event => {
            const row = event.target.closest('[data-key]'); if (!row || !(await mayLeave())) return;
            const item = records.find(record => record.key === row.dataset.key); if (item) showEditor(item);
        });
        for (const id of ['newQuestion','emptyNew']) on($(id),'click',async () => { if (loaded && await mayLeave()) showEditor(); });
        on($('duplicateButton'),'click',async () => { if (selected && await mayLeave()) showEditor(selected, true); });
        on($('closeEditor'),'click',async () => { if (await mayLeave()) { closeEditor(); $('search').focus(); } });
        on($('editorForm'),'input',preview); on($('editorForm'),'change',preview);
        on($('editorForm'),'submit',event => { event.preventDefault(); perform('save'); });
        on($('approveButton'),'click',() => perform('approve'));
        on($('toggleStatus'),'click',() => perform('status'));
        for (const id of ['search','letterFilter','statusFilter']) on($(id),'input',() => { page = 1; render(); });
        on($('clearFilters'),'click',() => { $('search').value = ''; $('letterFilter').value = ''; $('statusFilter').value = ''; page = 1; render(); });
        on($('previousPage'),'click',() => { page--; render(); }); on($('nextPage'),'click',() => { page++; render(); });
        document.querySelectorAll('[data-tab]').forEach(button => on(button,'click',() => switchTab(button.dataset.tab)));
        on($('reloadData'),'click', connect);
        on($('logoutButton'),'click',async () => {
            if (!(await mayLeave())) return;
            try { await logout(); } catch (_) { toast('تعذر تسجيل الخروج. أعد المحاولة.', true); }
        });
        on($('exportButton'),'click',() => {
            const rows = filtered().map(({kind,key,...item}) => item);
            const url = URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json;charset=utf-8'}));
            const a = el('a'); a.href = url; a.download = `huroof-${tab}-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
            toast(`تم تصدير ${number(rows.length)} سؤال.`);
        });
        on(document,'keydown',event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && editing) { event.preventDefault(); perform('save'); }
            if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { event.preventDefault(); $('search').focus(); }
        });
        on(window,'beforeunload',event => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; } });
        setStatusOptions(); connect();
        return { destroy() { disposed = true; unsubscribe?.(); aborter.abort(); clearTimeout(toastTimer); $('toast').hidden = true; if ($('confirmDialog').open) $('confirmDialog').close('no'); $('editorForm').reset(); $('editorForm').hidden = true; $('editorEmpty').hidden = false; $('editorPanel').classList.remove('is-editing'); $('questionList').replaceChildren(); } };
    }
    window.ContentStudio = Object.freeze({ mount });
})();
