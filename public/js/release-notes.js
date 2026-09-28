/* Static-host mirror of ../../js/release-notes.js; keep its release entries in sync. */
(function publishQaafReleaseNotes(global) {
    const versions = Object.freeze({ 'qaaf-site': '1.65', huroof: '1.7' });
    const items = Object.freeze([
        ['qaaf-site', 'موقع قاف للألعاب', '1.65', '29 سبتمبر 2026', 'تحديث موقع قاف للألعاب', 'إضافة سجل موحّد في المتجر يعرض تحديثات موقع قاف وإصدارات الألعاب وما تغيّر في كل إصدار.'],
        ['huroof', 'حروف مع هوجاس', '1.7', '29 سبتمبر 2026', 'تحسين الأونلاين وحماية الجلسات', 'تحسين التحقق من إجابات الأونلاين وقبول الزلة الإملائية الواضحة بحرف واحد بمراجعة الذكاء الاصطناعي، ومنع الدخول إلى الجلسات المنتهية أو القديمة.'],
        ['huroof', 'حروف مع هوجاس', '1.6', '19 سبتمبر 2026', 'تنقل وهوية موحّدان للأطوار', 'العودة من الأونلاين ترجع إلى لعبة حروف مباشرة، وواجهة القوى الخارقة أصبحت بهوية داكنة واضحة مع زر الطور العادي ضمن الأزرار الرئيسية.'],
        ['huroof', 'حروف مع هوجاس', '1.55', '26 أغسطس 2026', 'تحسين مظهر الجوال لجميع الأطوار', 'ضبط اللوحات والسداسيات وبطاقات النتائج والأزرار على الآيفون والجوال بالوضعين العمودي والأفقي دون قص أو تكبير مفاجئ.'],
        ['huroof', 'حروف مع هوجاس', '1.55', '26 أغسطس 2026', 'تحسين إجابات طور الأونلاين', 'التحقق يتم من السؤال الرسمي في السيرفر، مع قبول الأخطاء الإملائية الواضحة مثل تبديل حرفين دون اعتماد إجابة مختلفة.'],
        ['huroof', 'حروف مع هوجاس', '1.55', '26 أغسطس 2026', 'حماية الجلسات ووضع الأدمن', 'منع إنشاء جلسة ثانية خلال عشر دقائق، منع الدخول إلى الجلسات غير الموجودة، وقفل تعديل لوحة الأدمن لصالح جوال المقدم.'],
        ['huroof', 'حروف مع هوجاس', '1.4', '25 أغسطس 2026', 'جرس ومؤقت متزامنان', 'إظهار ترتيب ضغطات الجرس للجميع، مع تسلسل وقت الإجابة ثم فرصة الفريق الآخر ثم الفتح بالجرس.'],
        ['huroof', 'حروف مع هوجاس', '1.4', '25 أغسطس 2026', 'جولة تعريفية لأول مرة', 'شرح مختصر وتفاعلي لأزرار المباراة العادية والأونلاين وطور القوى الخارقة.'],
        ['huroof', 'حروف مع هوجاس', '1.4', '25 أغسطس 2026', 'إدارة الأسئلة والإجابات داخل الموقع', 'السؤال يبقى مخفيًا عن الجمهور حتى يختار المقدم إظهاره، والإجابة تظهر بتنبيه واضح داخل اللعبة.'],
        ['huroof', 'حروف مع هوجاس', '1.4', '25 أغسطس 2026', 'إشعارات الموقع بدل نوافذ المتصفح', 'التأكيدات والتنبيهات وإعلانات الفوز أصبحت من تصميم الموقع وتعمل على الجوال والكمبيوتر.'],
        ['huroof', 'حروف مع هوجاس', '1.4', '25 أغسطس 2026', 'تنقل واضح بين الأطوار', 'الدخول إلى القوى الخارقة يبدأ من واجهتها، مع زر يرجع للطور العادي بدون فتح جولة قديمة تلقائيًا.'],
        ['huroof', 'حروف مع هوجاس', '1.3', '24 يوليو 2026', 'تحسين وضع العرض والجوال', 'تصغير السداسيات والنتائج والأزرار، وضبط الضبابية والملء الشاشة دون قص اللوحة.'],
        ['huroof', 'حروف مع هوجاس', '1.3', '24 يوليو 2026', 'بطاقات فوز أوضح', 'إعلان الفائز ونتيجة الجولة والنتيجة النهائية بتصميم واضح ومناسب للشاشات الصغيرة.'],
        ['huroof', 'حروف مع هوجاس', '1.3', '24 يوليو 2026', 'جلسات أونلاين متزامنة', 'غرف مشتركة للاعبين والمقدم مع حالة اتصال واضحة وتحديث لحظي بين الأجهزة.'],
        ['huroof', 'حروف مع هوجاس', '1.3', '24 يوليو 2026', 'تصميم جرس الفرق', 'تحديث واجهة الجرس وترتيب الضغطات بألوان وحالات واضحة داخل الموقع.'],
        ['huroof', 'حروف مع هوجاس', '1.3', '24 يوليو 2026', 'حفظ الجولة بعد تحديث الصفحة', 'اللوحة والخلايا والنتائج تستمر بعد التحديث، مع عودة واضحة للرئيسية عند إنهاء الجولة.'],
        ['huroof', 'حروف مع هوجاس', '1.3', '24 يوليو 2026', 'إعدادات أسهل وتغيير لحظي', 'تنظيم إعدادات الفرق والجولات والمؤقتات والألوان، وتحديث اسم المسابقة مباشرة عند تغييره.'],
        ['huroof', 'حروف مع هوجاس', '1.2', '21 يوليو 2026', 'أسئلة المتابعين', 'خانة مخصصة لاقتراح سؤال وحرف وإجابة ليتم مراجعته قبل إضافته إلى بنك الأسئلة.'],
        ['huroof', 'حروف مع هوجاس', '1.2', '21 يوليو 2026', 'إحصاءات اللعبة والمتجر', 'تتبع الزيارات وبدء اللعب والاتصال بالجلسات للعبة حروف مع هوجاس والمتجر.'],
        ['huroof', 'حروف مع هوجاس', '1.2', '20 يوليو 2026', 'خريطة موقع وتجهيز للبحث', 'إضافة خريطة الموقع ووصف الصفحات الأساسية لتسهيل ظهور الألعاب عند البحث.'],
        ['huroof', 'حروف مع هوجاس', '1.2', 'الإصدار المجاني', 'النسخة الكاملة متاحة للجميع', 'إلغاء التحقق بالجوال وفتح اللعبة وميزاتها الأساسية مجانًا بدون تسجيل دخول.']
    ].map(([productId, productName, version, date, title, description]) => Object.freeze({ productId, productName, version, date, title, description })));

    global.QAAF_RELEASES = Object.freeze({ versions, items });
    document.querySelectorAll('[data-product-version]').forEach((element) => {
        const version = versions[element.getAttribute('data-product-version')];
        if (version) element.textContent = (element.getAttribute('data-version-prefix') || '') + version;
    });

    const latestContainer = document.getElementById('releaseHighlights');
    const archiveContainer = document.getElementById('releaseArchiveItems');
    if (!latestContainer || !archiveContainer) return;

    function appendRelease(container, item) {
        const article = document.createElement('article');
        article.className = 'release-entry';
        const meta = document.createElement('div');
        meta.className = 'release-entry__meta';
        [[item.productName, 'release-entry__product'], ['إصدار ' + item.version, 'release-entry__version'], [item.date, 'release-entry__date']]
            .forEach(([text, className]) => {
                const label = document.createElement('span');
                label.className = className;
                label.textContent = text;
                meta.append(label);
            });
        const title = document.createElement('h3');
        title.textContent = item.title;
        const description = document.createElement('p');
        description.textContent = item.description;
        article.append(meta, title, description);
        container.append(article);
    }

    items.slice(0, 2).forEach((item) => appendRelease(latestContainer, item));
    items.slice(2).forEach((item) => appendRelease(archiveContainer, item));
})(window);
