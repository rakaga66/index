(function () {
    'use strict';
    const messages = {
        'admin-token-required': 'انتهت جلسة الدخول. سجّل الدخول بحساب الأدمن ثم أعد المحاولة.',
        'admin-required': 'تعذر التحقق من صلاحية الأدمن. أعد تسجيل الدخول.',
        'ai-not-configured': 'مفتاح خدمة الذكاء الاصطناعي غير موجود في إعدادات السيرفر.',
        'ai-disabled': 'مساعد الأدمن معطّل من إعدادات السيرفر.',
        'ai-invalid-key': 'المزوّد رفض مفتاح API. حدّث المفتاح في إعدادات السيرفر بمفتاح فعّال ثم أعد اختبار الاتصال.',
        'ai-insufficient-balance': 'رصيد مزوّد الذكاء الاصطناعي غير كافٍ. اشحن حساب الخدمة ثم أعد المحاولة.',
        'ai-rate-limit': 'وصلت الخدمة إلى حد الطلبات. انتظر دقيقة ثم أعد المحاولة.',
        'rate-limit': 'طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.',
        'ai-model-unavailable': 'اسم النموذج غير متاح لدى المزوّد. صحّح اسم النموذج في إعدادات الخدمة.',
        'ai-request-rejected': 'المزوّد رفض إعدادات الطلب. تحقق من توافق النموذج مع صيغة JSON.',
        'ai-timeout': 'تأخر المزوّد عن الرد. الأسئلة التي حُفظت باقية؛ جرّب دفعة أصغر أو أعد المحاولة.',
        'ai-response-truncated': 'رد المزوّد غير مكتمل. جرّب عددًا أقل في الطلب.',
        'ai-invalid-response': 'رد المزوّد ليس بصيغة أسئلة صالحة. أعد المحاولة بوصف أوضح.',
        'ai-quality-check-failed': 'لم تجتز الأسئلة فحص الحرف أو التكرار أو جودة الصياغة. غيّر الموضوع أو الحرف ثم جرّب.',
        'ai-unavailable': 'تعذر الوصول إلى مزوّد الذكاء الاصطناعي. افحص الاتصال وأعد المحاولة.',
        'ai-upstream-failed': 'خدمة الذكاء الاصطناعي تواجه خطأ مؤقتًا. أعد المحاولة لاحقًا.',
        'api-not-available': 'خدمة التوليد غير متاحة على هذا الرابط. افتح نسخة الموقع التي تشغّل الـ API.',
        'invalid-options': 'اختر حرفًا عربيًا صحيحًا وعددًا صحيحًا من 1 إلى 50.',
        'save-failed': 'تم التوليد، لكن تعذر الحفظ. النتائج محفوظة مؤقتًا هنا؛ اضغط إعادة الحفظ أو نزّلها قبل مغادرة الصفحة.'
    };
    function errorText(error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return messages['ai-timeout'];
        return messages[error?.message] || 'تعذر إكمال الطلب. تحقق من الاتصال ثم أعد المحاولة.';
    }
    async function request(auth, path, body) {
        const user = auth.currentUser;
        if (!user) throw new Error('admin-token-required');
        const token = await user.getIdToken();
        const response = await fetch(path, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify(body || {}), signal: AbortSignal.timeout(110000)
        });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('api-not-available');
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || 'ai-unavailable');
        return data;
    }
    function create({ auth, library, getExisting }) {
        const el = id => document.getElementById(id);
        let busy = false, stop = false, pending = null;
        function status(text, type = '') {
            el('aiGenerateResult').className = 'result-box ' + type;
            el('aiGenerateResult').textContent = text;
            el('aiGenerateResult').style.display = 'block';
        }
        function controls(active) {
            busy = active;
            el('aiQuestionSection').setAttribute('aria-busy', String(active));
            document.querySelectorAll('.ai-generator-grid input, .ai-generator-grid select, .ai-generator-grid textarea, #aiPromptPreset').forEach(node => { node.disabled = active; });
            el('aiGenerateBtn').disabled = active || Boolean(pending);
            el('aiGenerateBtn').textContent = active ? 'جارٍ إعداد الأسئلة…' : 'توليد أسئلة للمراجعة';
            el('aiStopBtn').hidden = !active;
            el('aiRetrySaveBtn').hidden = !pending;
            el('aiDownloadBtn').hidden = !pending;
            el('aiRetrySaveBtn').disabled = active;
            el('aiAssistantTestBtn').disabled = active;
        }
        el('aiStopBtn').addEventListener('click', () => { stop = true; status('سيتم التوقف بعد حفظ الدفعة الحالية.'); });
        el('aiRetrySaveBtn').addEventListener('click', async () => {
            if (!pending || busy) return;
            controls(true);
            try {
                const saved = await library.saveAiBatch(pending);
                pending = null;
                status('تم حفظ ' + saved + ' أسئلة في صندوق المراجعة.', 'success');
            } catch { status(messages['save-failed'], 'error'); }
            finally { controls(false); }
        });
        el('aiDownloadBtn').addEventListener('click', () => {
            if (!pending) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(pending, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = pending.requestId + '.json'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        el('aiPromptPreset').addEventListener('change', () => {
            const value = el('aiPromptPreset').value;
            if (!value) return;
            el('aiGeneratePrompt').value = value;
            el('aiPromptPreset').value = '';
            el('aiGeneratePrompt').focus();
        });
        el('aiAssistantTestBtn').addEventListener('click', async () => {
            if (busy) return;
            controls(true); status('جارٍ اختبار رد حقيقي من مزوّد الذكاء الاصطناعي…');
            try {
                const data = await request(auth, '/api/online/test-connection');
                status('وصل رد صالح من ' + data.provider + ' / ' + data.model + ' خلال ' + (data.latencyMs / 1000).toFixed(1) + ' ثانية.', 'success');
            } catch (error) { status(errorText(error), 'error'); }
            finally { controls(false); }
        });
        return { async generate() {
            if (busy || pending) return;
            const count = Number(el('aiGenerateCount').value);
            if (!Number.isInteger(count) || count < 1 || count > 50) { status(messages['invalid-options'], 'error'); el('aiGenerateCount').focus(); return; }
            const prompt = el('aiGeneratePrompt').value.trim() || 'أنشئ أسئلة متنوعة مناسبة للعائلة.';
            const letter = el('aiGenerateLetter').value;
            const difficulty = el('aiGenerateDifficulty').value;
            let saved = 0, rejected = 0, attempts = 0;
            const accepted = [];
            stop = false; el('aiGenerateProgress').max = count; el('aiGenerateProgress').value = 0; controls(true);
            try {
                while (saved < count && !stop && attempts < Math.ceil(count / 5) + 2) {
                    attempts++;
                    status('توليد وتدقيق الدفعة ' + attempts + ' — حُفظ ' + saved + ' من ' + count + ' سؤالًا. قد تستغرق الدفعة نصف دقيقة.');
                    const exclude = [...getExisting(), ...accepted].slice(-2000).map(q => ({ question: q.question, answer: q.answer }));
                    const data = await request(auth, '/api/admin/generate-questions', { count: Math.min(5, count - saved), prompt, letter, difficulty, exclude });
                    if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('ai-invalid-response');
                    pending = { ...data, prompt };
                    status('جارٍ حفظ الدفعة في صندوق المراجعة…');
                    try { saved += await library.saveAiBatch(pending); } catch { throw new Error('save-failed'); }
                    accepted.push(...data.questions); rejected += Number(data.rejectedCount) || 0; pending = null;
                    el('aiGenerateProgress').max = count; el('aiGenerateProgress').value = saved;
                }
                status((stop ? 'تم الإيقاف. ' : '') + 'حُفظ ' + saved + ' من ' + count + ' سؤالًا للمراجعة.' + (rejected ? ' استُبعدت ' + rejected + ' نتائج مخالفة أو مكررة.' : '') + ' راجع صحة المعلومات قبل الاعتماد.', saved ? 'success' : '');
            } catch (error) { status(errorText(error) + (saved ? ' حُفظت الدفعات السابقة: ' + saved + ' سؤالًا.' : ''), 'error'); }
            finally { controls(false); }
        } };
    }
    window.AdminAiAssistant = Object.freeze({ create, request, errorText });
})();
