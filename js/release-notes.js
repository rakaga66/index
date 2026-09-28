/*
 * Central QAAF release log. Add each website or game release here once; the
 * QAAF store renders the complete feed and each game can filter its own notes.
 * Keep items newest-first and include productId, productName, version, date,
 * title, and description for every release.
 */
(function publishQaafReleaseNotes(global) {
    const versions = Object.freeze({
        'qaaf-site': '1.65',
        huroof: '1.7'
    });

    const items = Object.freeze([
        {
            productId: 'qaaf-site',
            productName: 'موقع قاف للألعاب',
            version: '1.65',
            date: '29 سبتمبر 2026',
            title: 'تحديث موقع قاف للألعاب',
            description: 'إضافة سجل موحّد في المتجر يعرض تحديثات موقع قاف وإصدارات الألعاب وما تغيّر في كل إصدار.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.7',
            date: '29 سبتمبر 2026',
            title: 'تحسين الأونلاين وحماية الجلسات',
            description: 'تحسين التحقق من إجابات الأونلاين وقبول الزلة الإملائية الواضحة بحرف واحد بمراجعة الذكاء الاصطناعي، ومنع الدخول إلى الجلسات المنتهية أو القديمة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.6',
            date: '19 سبتمبر 2026',
            title: 'تنقل وهوية موحّدان للأطوار',
            description: 'العودة من الأونلاين ترجع إلى لعبة حروف مباشرة، وواجهة القوى الخارقة أصبحت بهوية داكنة واضحة مع زر الطور العادي ضمن الأزرار الرئيسية.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.55',
            date: '26 أغسطس 2026',
            title: 'تحسين مظهر الجوال لجميع الأطوار',
            description: 'ضبط اللوحات والسداسيات وبطاقات النتائج والأزرار على الآيفون والجوال بالوضعين العمودي والأفقي دون قص أو تكبير مفاجئ.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.55',
            date: '26 أغسطس 2026',
            title: 'تحسين إجابات طور الأونلاين',
            description: 'التحقق يتم من السؤال الرسمي في السيرفر، مع قبول الأخطاء الإملائية الواضحة مثل تبديل حرفين دون اعتماد إجابة مختلفة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.55',
            date: '26 أغسطس 2026',
            title: 'حماية الجلسات ووضع الأدمن',
            description: 'منع إنشاء جلسة ثانية خلال عشر دقائق، منع الدخول إلى الجلسات غير الموجودة، وقفل تعديل لوحة الأدمن لصالح جوال المقدم.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.4',
            date: '25 أغسطس 2026',
            title: 'جرس ومؤقت متزامنان',
            description: 'إظهار ترتيب ضغطات الجرس للجميع، مع تسلسل وقت الإجابة ثم فرصة الفريق الآخر ثم الفتح بالجرس.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.4',
            date: '25 أغسطس 2026',
            title: 'جولة تعريفية لأول مرة',
            description: 'شرح مختصر وتفاعلي لأزرار المباراة العادية والأونلاين وطور القوى الخارقة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.4',
            date: '25 أغسطس 2026',
            title: 'إدارة الأسئلة والإجابات داخل الموقع',
            description: 'السؤال يبقى مخفيًا عن الجمهور حتى يختار المقدم إظهاره، والإجابة تظهر بتنبيه واضح داخل اللعبة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.4',
            date: '25 أغسطس 2026',
            title: 'إشعارات الموقع بدل نوافذ المتصفح',
            description: 'التأكيدات والتنبيهات وإعلانات الفوز أصبحت من تصميم الموقع وتعمل على الجوال والكمبيوتر.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.4',
            date: '25 أغسطس 2026',
            title: 'تنقل واضح بين الأطوار',
            description: 'الدخول إلى القوى الخارقة يبدأ من واجهتها، مع زر يرجع للطور العادي بدون فتح جولة قديمة تلقائيًا.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.3',
            date: '24 يوليو 2026',
            title: 'تحسين وضع العرض والجوال',
            description: 'تصغير السداسيات والنتائج والأزرار، وضبط الضبابية والملء الشاشة دون قص اللوحة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.3',
            date: '24 يوليو 2026',
            title: 'بطاقات فوز أوضح',
            description: 'إعلان الفائز ونتيجة الجولة والنتيجة النهائية بتصميم واضح ومناسب للشاشات الصغيرة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.3',
            date: '24 يوليو 2026',
            title: 'جلسات أونلاين متزامنة',
            description: 'غرف مشتركة للاعبين والمقدم مع حالة اتصال واضحة وتحديث لحظي بين الأجهزة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.3',
            date: '24 يوليو 2026',
            title: 'تصميم جرس الفرق',
            description: 'تحديث واجهة الجرس وترتيب الضغطات بألوان وحالات واضحة داخل الموقع.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.3',
            date: '24 يوليو 2026',
            title: 'حفظ الجولة بعد تحديث الصفحة',
            description: 'اللوحة والخلايا والنتائج تستمر بعد التحديث، مع عودة واضحة للرئيسية عند إنهاء الجولة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.3',
            date: '24 يوليو 2026',
            title: 'إعدادات أسهل وتغيير لحظي',
            description: 'تنظيم إعدادات الفرق والجولات والمؤقتات والألوان، وتحديث اسم المسابقة مباشرة عند تغييره.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.2',
            date: '21 يوليو 2026',
            title: 'أسئلة المتابعين',
            description: 'خانة مخصصة لاقتراح سؤال وحرف وإجابة ليتم مراجعته قبل إضافته إلى بنك الأسئلة.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.2',
            date: '21 يوليو 2026',
            title: 'إحصاءات اللعبة والمتجر',
            description: 'تتبع الزيارات وبدء اللعب والاتصال بالجلسات للعبة حروف مع هوجاس والمتجر.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.2',
            date: '20 يوليو 2026',
            title: 'خريطة موقع وتجهيز للبحث',
            description: 'إضافة خريطة الموقع ووصف الصفحات الأساسية لتسهيل ظهور الألعاب عند البحث.'
        },
        {
            productId: 'huroof',
            productName: 'حروف مع هوجاس',
            version: '1.2',
            date: 'الإصدار المجاني',
            title: 'النسخة الكاملة متاحة للجميع',
            description: 'إلغاء التحقق بالجوال وفتح اللعبة وميزاتها الأساسية مجانًا بدون تسجيل دخول.'
        }
    ].map((item) => Object.freeze(item)));

    global.QAAF_RELEASES = Object.freeze({ versions, items });

    document.querySelectorAll('[data-product-version]').forEach((element) => {
        const productId = element.getAttribute('data-product-version');
        const version = versions[productId];
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

        const product = document.createElement('span');
        product.className = 'release-entry__product';
        product.textContent = item.productName;

        const version = document.createElement('span');
        version.className = 'release-entry__version';
        version.textContent = 'إصدار ' + item.version;

        const date = document.createElement('span');
        date.className = 'release-entry__date';
        date.textContent = item.date;

        meta.append(product, version, date);

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
