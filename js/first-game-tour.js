(function () {
    'use strict';

    var CONFIGS = {
        normal: {
            key: 'hojas_first_game_tour_normal_v1',
            steps: [
                {
                    selector: '.presenter-toggle-top',
                    title: 'اختر نوع المقدم',
                    text: 'المقدم الآلي يعرض الأسئلة داخل اللعبة، والمقدم البشري يديرها من صفحة المقدم على الجوال.'
                },
                {
                    selector: '#roundLabel',
                    title: 'رقم الجولة',
                    text: 'هنا تعرف الجولة الحالية وعدد الجولات المتبقية في المنافسة.'
                },
                {
                    selector: '#scoreBox1',
                    title: 'الفريق الأول',
                    text: 'اضغط بطاقة الفريق لمنحه الحرف والنقطة، أو شغّل مؤقته اليدوي من زر مؤقت.'
                },
                {
                    selector: '#scoreBox2',
                    title: 'الفريق الثاني',
                    text: 'تعمل مثل بطاقة الفريق الأول، وتعرض اسم الفريق ونقاطه طوال الجولة.'
                },
                {
                    selector: '#boardContainer .hex-cell',
                    title: 'لوحة الحروف',
                    text: 'اختر أي سداسي لعرض سؤال يبدأ بهذا الحرف، ثم امنح الخلية للفريق الذي أجاب بشكل صحيح.'
                },
                {
                    selector: '[data-tour="presenter"]',
                    title: 'دخول المقدم',
                    text: 'يفتح صفحة المقدم السرية لإدارة الأسئلة والنقاط من الجوال.'
                },
                {
                    selector: '[data-tour="buzzer"]',
                    title: 'الجرس',
                    text: 'يعرض كود وباركود الجلسة ليدخل اللاعبون ويحدد أسرع ضغط.'
                },
                {
                    selector: '[data-tour="sound"]',
                    title: 'الصوت',
                    text: 'تشغيل أو كتم أصوات اللعبة والتنبيهات بضغطة واحدة.'
                },
                {
                    selector: '[data-tour="presentation"]',
                    title: 'وضع العرض',
                    text: 'يحوّل الشاشة إلى منظر مناسب للتلفزيون أو البروجكتر.'
                },
                {
                    selector: '[data-tour="settings"]',
                    title: 'الإعدادات',
                    text: 'عدّل أسماء الفرق والألوان والجولات وأوقات الإجابة ونوع المقدم.'
                },
                {
                    selector: '[data-tour="shuffle"]',
                    title: 'خلط الحروف',
                    text: 'يعيد توزيع الحروف على السداسيات مع إبقاء الجولة والنتيجة كما هي.'
                },
                {
                    selector: '[data-tour="new-round"]',
                    title: 'جولة جديدة',
                    text: 'يجهز لوحة الجولة التالية مع الاحتفاظ بنتيجة الفريقين.'
                },
                {
                    selector: '[data-tour="home"]',
                    title: 'العودة للرئيسية',
                    text: 'يرجع للشاشة الرئيسية بعد تأكيد حذف الجولة الحالية.'
                }
            ]
        },
        online: {
            key: 'hojas_first_game_tour_online_v1',
            steps: [
                {
                    selector: '.online-section-heading--game',
                    title: 'شاشة المباراة',
                    text: 'هذه شاشة اللعب الجماعي؛ كل ما يظهر هنا يتزامن مع بقية اللاعبين لحظيًا.'
                },
                {
                    selector: '#gameRoundLabel',
                    title: 'الجولة والسؤال',
                    text: 'يعرض رقم السؤال والجولة الحالية والعد التنازلي من المصدر المشترك.'
                },
                {
                    selector: '#questionCard',
                    title: 'بطاقة السؤال',
                    text: 'اقرأ الحرف والسؤال هنا، ثم اضغط الجرس عندما تعرف الإجابة.'
                },
                {
                    selector: '#onlineBellBtn',
                    title: 'الجرس',
                    text: 'أول ضغطة تصل للخادم تمنح صاحبها فرصة الإجابة.'
                },
                {
                    selector: '#gameRanking',
                    title: 'الترتيب',
                    text: 'تابع نقاط جميع اللاعبين وترتيبهم مباشرة أثناء المباراة.'
                },
                {
                    selector: '#gameChatMessages',
                    title: 'شات الغرفة',
                    text: 'تواصل مع الموجودين في الجلسة من داخل اللعبة.'
                }
            ]
        },
        'online-board': {
            key: 'hojas_first_game_tour_online_board_v1',
            steps: [
                {
                    selector: '.ob-game-head',
                    title: 'شاشة المباراة',
                    text: 'هذه شاشة اللعب الجماعي؛ كل ما يظهر هنا يتزامن مع بقية اللاعبين لحظيًا.'
                },
                {
                    selector: '.ob-direction-bar',
                    title: 'اتجاه الفوز',
                    text: 'يوضح الشريطان مسار الفوز الخاص بكل فريق على لوحة السداسيات.'
                },
                {
                    selector: '.ob-question-strip',
                    title: 'السؤال والمؤقت',
                    text: 'يعرض الحرف والسؤال ورقم الجولة والعد التنازلي من المصدر المشترك.'
                },
                {
                    selector: '#onlineBoardContainer',
                    title: 'لوحة الحروف',
                    text: 'يختار صاحب الجلسة خلية، ثم يجيب اللاعبون ويملكونها عند الإجابة الصحيحة.'
                },
                {
                    selector: '.ob-live-teams',
                    title: 'الفرق والنتيجة',
                    text: 'تابع أسماء الفرق والنتائج واللاعبين الموجودين في الجلسة.'
                },
                {
                    selector: '#onlineBoardChatMessages',
                    title: 'شات الجلسة',
                    text: 'تواصلوا مع الموجودين في الجلسة من داخل المباراة.'
                }
            ]
        }
    };

    var active = false;
    var index = 0;
    var scheduled = false;
    var current = null;

    function completed(config) {
        try {
            return localStorage.getItem(config.key) === 'done';
        } catch (_) {
            return false;
        }
    }

    function visible(node) {
        if (!node) return false;
        var rect = node.getBoundingClientRect();
        var style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden';
    }

    function createRoot() {
        var root = document.getElementById('gameTourRoot');
        if (root) return root;

        root = document.createElement('div');
        root.id = 'gameTourRoot';
        root.className = 'game-tour-root';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'شرح واجهة اللعبة');
        root.innerHTML =
            '<div class="game-tour-blur game-tour-blur-top"></div>' +
            '<div class="game-tour-blur game-tour-blur-bottom"></div>' +
            '<div class="game-tour-blur game-tour-blur-left"></div>' +
            '<div class="game-tour-blur game-tour-blur-right"></div>' +
            '<button class="game-tour-focus" type="button" aria-label="التالي"></button>' +
            '<section class="game-tour-card" aria-live="polite">' +
                '<div class="game-tour-card-top">' +
                    '<span class="game-tour-progress"></span>' +
                    '<button class="game-tour-skip" type="button">تخطي الشرح</button>' +
                '</div>' +
                '<h2 class="game-tour-title"></h2>' +
                '<p class="game-tour-text"></p>' +
                '<div class="game-tour-actions">' +
                    '<button class="game-tour-prev" type="button">السابق</button>' +
                    '<button class="game-tour-next" type="button">التالي</button>' +
                '</div>' +
            '</section>';
        document.body.appendChild(root);
        root.querySelector('.game-tour-focus').addEventListener('click', next);
        root.querySelector('.game-tour-skip').addEventListener('click', finish);
        root.querySelector('.game-tour-prev').addEventListener('click', previous);
        root.querySelector('.game-tour-next').addEventListener('click', next);
        return root;
    }

    function setPanelRect(panel, top, left, width, height) {
        if (!panel) return;
        panel.style.top = Math.max(0, top) + 'px';
        panel.style.left = Math.max(0, left) + 'px';
        panel.style.width = Math.max(0, width) + 'px';
        panel.style.height = Math.max(0, height) + 'px';
    }

    function position(target) {
        var root = document.getElementById('gameTourRoot');
        var card = root && root.querySelector('.game-tour-card');
        var focus = root && root.querySelector('.game-tour-focus');
        if (!root || !card || !focus || !target) return;

        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;
        var raw = target.getBoundingClientRect();
        var padding = 7;
        var left = Math.max(5, raw.left - padding);
        var top = Math.max(5, raw.top - padding);
        var right = Math.min(viewportWidth - 5, raw.right + padding);
        var bottom = Math.min(viewportHeight - 5, raw.bottom + padding);
        var width = Math.max(1, right - left);
        var height = Math.max(1, bottom - top);

        setPanelRect(root.querySelector('.game-tour-blur-top'), 0, 0, viewportWidth, top);
        setPanelRect(root.querySelector('.game-tour-blur-bottom'), bottom, 0, viewportWidth, viewportHeight - bottom);
        setPanelRect(root.querySelector('.game-tour-blur-left'), top, 0, left, height);
        setPanelRect(root.querySelector('.game-tour-blur-right'), top, right, viewportWidth - right, height);

        focus.style.top = top + 'px';
        focus.style.left = left + 'px';
        focus.style.width = width + 'px';
        focus.style.height = height + 'px';

        card.classList.remove('is-above', 'is-below', 'is-left', 'is-right');
        card.style.visibility = 'hidden';
        card.style.left = '12px';
        card.style.top = '12px';

        window.requestAnimationFrame(function () {
            var cardWidth = card.offsetWidth;
            var cardHeight = card.offsetHeight;
            var gap = 20;
            var spaces = {
                below: viewportHeight - bottom,
                above: top,
                right: viewportWidth - right,
                left: left
            };
            var placement;
            if (spaces.below >= cardHeight + gap) placement = 'below';
            else if (spaces.above >= cardHeight + gap) placement = 'above';
            else if (spaces.right >= cardWidth + gap) placement = 'right';
            else if (spaces.left >= cardWidth + gap) placement = 'left';
            else placement = Object.keys(spaces).sort(function (a, b) {
                return spaces[b] - spaces[a];
            })[0];

            var cardLeft;
            var cardTop;
            if (placement === 'below' || placement === 'above') {
                cardLeft = left + (width - cardWidth) / 2;
                cardTop = placement === 'below' ? bottom + gap : top - cardHeight - gap;
            } else {
                cardLeft = placement === 'right' ? right + gap : left - cardWidth - gap;
                cardTop = top + (height - cardHeight) / 2;
            }
            cardLeft = Math.min(Math.max(10, cardLeft), viewportWidth - cardWidth - 10);
            cardTop = Math.min(Math.max(10, cardTop), viewportHeight - cardHeight - 10);
            card.style.left = cardLeft + 'px';
            card.style.top = cardTop + 'px';
            card.style.visibility = 'visible';
            card.classList.add('is-' + placement);
            card.style.setProperty('--tour-arrow-x',
                Math.min(Math.max(22, left + width / 2 - cardLeft), cardWidth - 22) + 'px');
            card.style.setProperty('--tour-arrow-y',
                Math.min(Math.max(22, top + height / 2 - cardTop), cardHeight - 22) + 'px');
        });
    }

    function render() {
        if (!active || !current) return;
        var steps = current.steps;
        var step = steps[index];
        if (!step) {
            finish();
            return;
        }
        var target = document.querySelector(step.selector);
        if (!visible(target)) {
            index += 1;
            render();
            return;
        }
        target.scrollIntoView && target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        var root = createRoot();
        root.style.display = 'block';
        root.querySelector('.game-tour-title').textContent = step.title;
        root.querySelector('.game-tour-text').textContent = step.text;
        root.querySelector('.game-tour-progress').textContent =
            (index + 1) + ' من ' + steps.length;
        root.querySelector('.game-tour-prev').disabled = index === 0;
        root.querySelector('.game-tour-next').textContent =
            index === steps.length - 1 ? 'ابدأ اللعب' : 'التالي';
        window.requestAnimationFrame(function () {
            position(target);
            root.querySelector('.game-tour-next').focus({ preventScroll: true });
        });
    }

    function open(mode, force) {
        var config = CONFIGS[mode] || CONFIGS.normal;
        if (active || (!force && completed(config))) return;
        current = config;
        index = 0;
        active = true;
        document.body.classList.add('game-tour-open');
        render();
    }

    function maybeStart(options) {
        options = options || {};
        var mode = options.mode || 'normal';
        var config = CONFIGS[mode] || CONFIGS.normal;
        if (active || scheduled || (!options.force && completed(config))) return;
        scheduled = true;
        window.setTimeout(function () {
            scheduled = false;
            var isActive = typeof options.active === 'function' ? options.active() : options.active !== false;
            if (!isActive) return;
            var hasTarget = config.steps.some(function (step) {
                return visible(document.querySelector(step.selector));
            });
            if (hasTarget) open(mode, Boolean(options.force));
        }, Number(options.delay || 350));
    }

    function next() {
        if (!active) return;
        if (index >= current.steps.length - 1) {
            finish();
            return;
        }
        index += 1;
        render();
    }

    function previous() {
        if (!active || index === 0) return;
        index -= 1;
        render();
    }

    function finish() {
        var config = current;
        active = false;
        scheduled = false;
        document.body.classList.remove('game-tour-open');
        document.getElementById('gameTourRoot') && document.getElementById('gameTourRoot').remove();
        if (config) {
            try {
                localStorage.setItem(config.key, 'done');
            } catch (_) {}
        }
    }

    window.HojasFirstGameTour = {
        maybeStart: maybeStart,
        start: function (mode) { open(mode || 'normal', true); },
        next: next,
        previous: previous,
        finish: finish
    };
    window.addEventListener('resize', function () {
        if (active) render();
    });
    document.addEventListener('keydown', function (event) {
        if (!active) return;
        if (event.key === 'Escape') finish();
        if (event.key === 'ArrowRight') previous();
        if (event.key === 'ArrowLeft') next();
    });
}());
