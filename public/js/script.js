// ===== Color Map =====
const COLOR_MAP = {
    orange:    { bg: '#FF9800', bgLight: '#FFB74D', border: '#E65100', text: '#fff' },
    purple:    { bg: '#8B5FBF', bgLight: '#A07CC5', border: '#4A2570', text: '#fff' },
    red:       { bg: '#EF4444', bgLight: '#F87171', border: '#B91C1C', text: '#fff' },
    blue:      { bg: '#3B82F6', bgLight: '#60A5FA', border: '#1D4ED8', text: '#fff' },
    darkblue:  { bg: '#1E3A8A', bgLight: '#3B82F6', border: '#172554', text: '#fff' },
    green:     { bg: '#22C55E', bgLight: '#4ADE80', border: '#15803D', text: '#fff' },
    lightgreen:{ bg: '#A3E635', bgLight: '#BEF264', border: '#4D7C0F', text: '#111' },
    yellow:    { bg: '#EAB308', bgLight: '#FDE047', border: '#A16207', text: '#1a1a1a' },
    pink:      { bg: '#F472B6', bgLight: '#F9A8D4', border: '#BE185D', text: '#fff' },
    cyan:      { bg: '#2DD4BF', bgLight: '#5EEAD4', border: '#0F766E', text: '#fff' },
    charcoal:  { bg: '#334155', bgLight: '#475569', border: '#0F172A', text: '#fff' },
    lightblue: { bg: '#7DD3FC', bgLight: '#BAE6FD', border: '#0284C7', text: '#111' }
};

const ROUND_WORDS = ['الأولى','الثانية','الثالثة','الرابعة','الخامسة'];

// ===== Config =====
const BOARD_SIZE = 5;
const ARABIC_LETTERS = [
    'أ','ب','ت','ث','ج','ح','خ','د','ذ','ر',
    'ز','س','ش','ص','ض','ط','ظ','ع','غ','ف',
    'ق','ك','ل','م','ن','هـ','و','ي'
];

// Keep share links clean on the production domain while preserving the
// extension-based paths used by the local file/static-server preview.
function isLocalGameRuntime() {
    return window.location.protocol === 'file:' ||
        /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
}

function getNormalBuzzerUrl() {
    if (window.location.protocol === 'file:') {
        return new URL('buzzer-server-qaf/', window.location.href).href.replace(/\/$/, '');
    }
    return `${window.location.origin}${isLocalGameRuntime() ? '/buzzer-server-qaf' : '/7roof/buzzer'}`;
}

// ===== Game State =====
let board = [];
let cellLetters = [];
let selectedCell = null;
let scores = { team1: 0, team2: 0 };
// `scores` keeps the number of claimed cells in the current round.  The
// visible match score is the number of rounds won, so it must be tracked
// independently and must survive a cell reset/new round.
let roundWins = { team1: 0, team2: 0 };
let currentRoundWinner = '';
let gameIsActive = false;
let gameSessionId = null;
let sessionStartedAt = null;

const GAME_STATE_KEY = 'hojas_active_game_v1';
const UI_SCREEN_KEY = 'hojas_current_screen_v1';
const SETTINGS_SOURCE_KEY = 'hojas_settings_source_v1';
const SESSION_HISTORY_KEY = 'hojas_completed_sessions_v1';
const MAX_SAVED_SESSIONS = 50;

// The admin dashboard opens the game as a read-only audience view.  The
// presenter phone remains the only place allowed to change cells, shuffle the
// board, or start a new round.  `admin=1` is also supported for a direct
// preview link when sessionStorage is not shared between browser tabs.
function isAdminViewer() {
    try {
        const params = new URLSearchParams(window.location.search);
        const queryFlag = ['1', 'true', 'yes'].includes(String(params.get('admin') || '').toLowerCase());
        return queryFlag || sessionStorage.getItem('isAdmin') === 'true' || Boolean(sessionStorage.getItem('adminUid'));
    } catch (_) {
        return false;
    }
}

function isBoardEditingLocked() {
    const livePresenter = typeof _livePresenterConnected !== 'undefined' && _livePresenterConnected;
    const commandInProgress = typeof _presenterCommandInProgress !== 'undefined' && _presenterCommandInProgress;
    // A human presenter page locks the audience view only while it is actually
    // connected. If the host is testing/playing from the same phone before a
    // presenter joins, keep local cell selection and team assignment usable.
    return (isAdminViewer() || livePresenter) && !commandInProgress;
}

function showEditingLockedNotice() {
    if (typeof showGameToast === 'function') {
        showGameToast('التحكم مقفل — استخدم جوال المقدم لبدء الجولة أو تعديل اللوحة.', true);
    }
}

function applyAdminViewerMode() {
    if (!isAdminViewer()) return;
    document.body.classList.add('admin-viewer', 'presenter-locked');
    document.body.dataset.adminViewer = 'true';
    document.querySelectorAll('[data-tour="shuffle"], [data-tour="new-round"], [data-tour="settings"], .presenter-toggle-top, .score-box, .super-team-card').forEach(node => {
        node.setAttribute('aria-disabled', 'true');
        if (node.matches('button')) node.disabled = true;
        node.querySelectorAll?.('button').forEach(button => { button.disabled = true; button.setAttribute('aria-disabled', 'true'); });
    });
    closeQuestionPanel?.();
    if (typeof setGamePresenter === 'function') setGamePresenter('human', true);
}

function isValidGameMatrix(matrix) {
    return Array.isArray(matrix) &&
        matrix.length === BOARD_SIZE &&
        matrix.every(row => Array.isArray(row) && row.length === BOARD_SIZE);
}

function saveGameState() {
    if (!gameIsActive || !isValidGameMatrix(board) || !isValidGameMatrix(cellLetters)) return;

    const state = {
        version: 1,
        savedAt: Date.now(),
        board,
        cellLetters,
        scores,
        roundWins,
        currentRoundWinner,
        teamSetup,
        buzzerRoom,
        gameSessionId,
        sessionStartedAt,
        usedQuestionIds: [...usedQuestionIds],
        presentationMode: document.body.classList.contains('presentation-mode')
    };

    try {
        localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('Could not save game state', error);
    }
}

function clearSavedGameState() {
    gameIsActive = false;
    document.body.classList.remove('normal-game-active');
    localStorage.removeItem(GAME_STATE_KEY);
}

function returnToHomeWithWarning() {
    const modal = document.getElementById('returnHomeModal');
    if (!modal) return;

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.site-confirm__cancel')?.focus());
}

function closeReturnHomeWarning() {
    const modal = document.getElementById('returnHomeModal');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.querySelector('.game-home-btn')?.focus();
}

function confirmReturnHome() {
    clearSavedGameState();
    localStorage.setItem(UI_SCREEN_KEY, 'home');
    localStorage.removeItem(SETTINGS_SOURCE_KEY);
    window.location.reload();
}

let pendingSiteConfirmAction = null;
let siteConfirmReturnFocus = null;

function ensureGameConfirmModal() {
    let modal = document.getElementById('gameActionConfirm');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'gameActionConfirm';
    modal.className = 'site-confirm game-action-confirm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('aria-labelledby', 'gameActionConfirmTitle');
    modal.setAttribute('aria-describedby', 'gameActionConfirmText');
    modal.innerHTML = `
        <div class="site-confirm__card">
            <div class="site-confirm__icon" id="gameActionConfirmIcon" aria-hidden="true">؟</div>
            <h2 id="gameActionConfirmTitle"></h2>
            <p id="gameActionConfirmText"></p>
            <div class="site-confirm__actions">
                <button type="button" class="site-confirm__cancel">إلغاء</button>
                <button type="button" class="site-confirm__delete" id="gameActionConfirmAccept">تأكيد</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', event => {
        if (event.target === modal) closeGameConfirm();
    });
    modal.querySelector('.site-confirm__cancel').addEventListener('click', closeGameConfirm);
    modal.querySelector('#gameActionConfirmAccept').addEventListener('click', acceptGameConfirm);
    document.body.appendChild(modal);
    return modal;
}

function showGameConfirm({ title, message, confirmText = 'تأكيد', icon = '؟', onConfirm }) {
    const modal = ensureGameConfirmModal();
    siteConfirmReturnFocus = document.activeElement;
    pendingSiteConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;

    modal.querySelector('#gameActionConfirmTitle').textContent = title;
    modal.querySelector('#gameActionConfirmText').textContent = message;
    modal.querySelector('#gameActionConfirmIcon').textContent = icon;
    modal.querySelector('#gameActionConfirmAccept').textContent = confirmText;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.site-confirm__cancel')?.focus());
}

function closeGameConfirm() {
    const modal = document.getElementById('gameActionConfirm');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    pendingSiteConfirmAction = null;
    if (siteConfirmReturnFocus?.focus) siteConfirmReturnFocus.focus();
    siteConfirmReturnFocus = null;
}

function acceptGameConfirm() {
    const action = pendingSiteConfirmAction;
    const modal = document.getElementById('gameActionConfirm');
    if (modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }
    pendingSiteConfirmAction = null;
    siteConfirmReturnFocus = null;
    if (action) action();
}

let playerHelpReturnFocus = null;
function openPlayerHelp() {
    const modal = document.getElementById('playerHelpModal');
    if (!modal) return;
    playerHelpReturnFocus = document.activeElement;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.player-help-close')?.focus());
}

function closePlayerHelp() {
    const modal = document.getElementById('playerHelpModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (playerHelpReturnFocus?.focus) playerHelpReturnFocus.focus();
    playerHelpReturnFocus = null;
}

const HOME_UPDATE_ITEMS = [
    {
        version: '1.55',
        date: '26 أغسطس 2026',
        title: 'تحسين مظهر الجوال لجميع الأطوار',
        description: 'ضبط اللوحات والسداسيات وبطاقات النتائج والأزرار على الآيفون والجوال بالوضعين العمودي والأفقي دون قص أو تكبير مفاجئ.'
    },
    {
        version: '1.55',
        date: '26 أغسطس 2026',
        title: 'تحسين إجابات طور الأونلاين',
        description: 'التحقق يتم من السؤال الرسمي في السيرفر، مع قبول الأخطاء الإملائية الواضحة مثل تبديل حرفين دون اعتماد إجابة مختلفة.'
    },
    {
        version: '1.55',
        date: '26 أغسطس 2026',
        title: 'حماية الجلسات ووضع الأدمن',
        description: 'منع إنشاء جلسة ثانية خلال عشر دقائق، منع الدخول إلى الجلسات غير الموجودة، وقفل تعديل لوحة الأدمن لصالح جوال المقدم.'
    },
    {
        version: '1.4',
        date: '25 أغسطس 2026',
        title: 'جرس ومؤقت متزامنان',
        description: 'إظهار ترتيب ضغطات الجرس للجميع، مع تسلسل وقت الإجابة ثم فرصة الفريق الآخر ثم الفتح بالجرس.'
    },
    {
        version: '1.4',
        date: '25 أغسطس 2026',
        title: 'جولة تعريفية لأول مرة',
        description: 'شرح مختصر وتفاعلي لأزرار المباراة العادية والأونلاين وطور القوى الخارقة.'
    },
    {
        version: '1.4',
        date: '25 أغسطس 2026',
        title: 'إدارة الأسئلة والإجابات داخل الموقع',
        description: 'السؤال يبقى مخفيًا عن الجمهور حتى يختار المقدم إظهاره، والإجابة تظهر بتنبيه واضح داخل اللعبة.'
    },
    {
        version: '1.4',
        date: '25 أغسطس 2026',
        title: 'إشعارات الموقع بدل نوافذ المتصفح',
        description: 'التأكيدات والتنبيهات وإعلانات الفوز أصبحت من تصميم الموقع وتعمل على الجوال والكمبيوتر.'
    },
    {
        version: '1.4',
        date: '25 أغسطس 2026',
        title: 'تنقل واضح بين الأطوار',
        description: 'الدخول إلى القوى الخارقة يبدأ من واجهتها، مع زر يرجع للطور العادي بدون فتح جولة قديمة تلقائيًا.'
    },
    {
        version: '1.3',
        date: '24 يوليو 2026',
        title: 'تحسين وضع العرض والجوال',
        description: 'تصغير السداسيات والنتائج والأزرار، وضبط الضبابية والملء الشاشة دون قص اللوحة.'
    },
    {
        version: '1.3',
        date: '24 يوليو 2026',
        title: 'بطاقات فوز أوضح',
        description: 'إعلان الفائز ونتيجة الجولة والنتيجة النهائية بتصميم واضح ومناسب للشاشات الصغيرة.'
    },
    {
        version: '1.3',
        date: '24 يوليو 2026',
        title: 'جلسات أونلاين متزامنة',
        description: 'غرف مشتركة للاعبين والمقدم مع حالة اتصال واضحة وتحديث لحظي بين الأجهزة.'
    },
    {
        version: '1.3',
        date: '24 يوليو 2026',
        title: 'تصميم جرس الفرق',
        description: 'تحديث واجهة الجرس وترتيب الضغطات بألوان وحالات واضحة داخل الموقع.'
    },
    {
        version: '1.3',
        date: '24 يوليو 2026',
        title: 'حفظ الجولة بعد تحديث الصفحة',
        description: 'اللوحة والخلايا والنتائج تستمر بعد التحديث، مع عودة واضحة للرئيسية عند إنهاء الجولة.'
    },
    {
        version: '1.3',
        date: '24 يوليو 2026',
        title: 'إعدادات أسهل وتغيير لحظي',
        description: 'تنظيم إعدادات الفرق والجولات والمؤقتات والألوان، وتحديث اسم المسابقة مباشرة عند تغييره.'
    },
    {
        version: '1.2',
        date: '21 يوليو 2026',
        title: 'أسئلة المتابعين',
        description: 'خانة مخصصة لاقتراح سؤال وحرف وإجابة ليتم مراجعته قبل إضافته إلى بنك الأسئلة.'
    },
    {
        version: '1.2',
        date: '21 يوليو 2026',
        title: 'إحصاءات اللعبة والمتجر',
        description: 'تتبع الزيارات وبدء اللعب والاتصال بالجلسات للعبة حروف مع هوجاس والمتجر.'
    },
    {
        version: '1.2',
        date: '20 يوليو 2026',
        title: 'خريطة موقع وتجهيز للبحث',
        description: 'إضافة خريطة الموقع ووصف الصفحات الأساسية لتسهيل ظهور الألعاب عند البحث.'
    },
    {
        version: '1.2',
        date: 'الإصدار المجاني',
        title: 'النسخة الكاملة متاحة للجميع',
        description: 'إلغاء التحقق بالجوال وفتح اللعبة وميزاتها الأساسية مجانًا بدون تسجيل دخول.'
    }
];

const HOME_UPCOMING_ITEMS = [
    {
        expected: 'قريبًا',
        status: 'قيد التجهيز',
        title: 'تحسينات أمان الجلسات',
        description: 'حماية إضافية لهوية منشئ الجلسة ومراجعة حالة الغرفة قبل كل دخول أو إعادة اتصال.'
    },
    {
        expected: 'بعد الاختبار',
        status: 'قيد الاختبار',
        title: 'توسعة بنك الأسئلة والتحقق',
        description: 'أسئلة إضافية مع تحقق أدق من الحرف والإجابة ومراجعة الأخطاء الكتابية الشائعة.'
    },
    {
        expected: 'التحديث القادم',
        status: 'مخطط',
        title: 'أطوار لعب جديدة',
        description: 'أفكار أطوار إضافية مرتبطة بنظام الجلسات والمقدم بعد اكتمال اختبارات الأونلاين.'
    }
];

let homeInfoReturnFocus = null;
let previousSessionsReturnFocus = null;

function escapeHistoryText(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    })[char]);
}

function getPreviousSessions() {
    try {
        const sessions = JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY) || '[]');
        return Array.isArray(sessions) ? sessions.filter(Boolean) : [];
    } catch (error) {
        console.warn('Could not read previous sessions', error);
        return [];
    }
}

function savePreviousSessions(sessions) {
    try {
        localStorage.setItem(
            SESSION_HISTORY_KEY,
            JSON.stringify(sessions.slice(0, MAX_SAVED_SESSIONS))
        );
    } catch (error) {
        console.warn('Could not save previous sessions', error);
    }
}

function formatPreviousSessionDate(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    try {
        return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(date);
    } catch (error) {
        return date.toLocaleString('ar-SA');
    }
}

function createSessionHistoryId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function recordCompletedSession() {
    const team1Score = Number(roundWins.team1) || 0;
    const team2Score = Number(roundWins.team2) || 0;
    const isDraw = team1Score === team2Score;
    const winnerTeam = isDraw ? null : (team1Score > team2Score ? 'team1' : 'team2');
    const sessionId = gameSessionId || createSessionHistoryId();
    const completedAt = Date.now();
    const session = {
        id: sessionId,
        competitionName: teamSetup.competitionName || 'هوجاس',
        team1: {
            name: teamSetup.team1.name || 'الفريق الأول',
            score: team1Score,
            cells: Number(scores.team1) || 0,
            color: teamSetup.team1.color || 'orange'
        },
        team2: {
            name: teamSetup.team2.name || 'الفريق الثاني',
            score: team2Score,
            cells: Number(scores.team2) || 0,
            color: teamSetup.team2.color || 'purple'
        },
        winnerTeam,
        winnerName: winnerTeam ? teamSetup[winnerTeam].name : 'تعادل',
        roundsPlayed: Number(teamSetup.currentRound) || 1,
        totalRounds: Number(teamSetup.totalRounds) || 1,
        startedAt: sessionStartedAt || completedAt,
        completedAt
    };

    const sessions = getPreviousSessions();
    const existingIndex = sessions.findIndex(item => item.id === sessionId);
    if (existingIndex >= 0) sessions.splice(existingIndex, 1);
    sessions.unshift(session);
    savePreviousSessions(sessions);
    renderPreviousSessionsHome();
    return session;
}

function getSessionWinnerLabel(session) {
    if (!session.winnerTeam) return 'تعادل';
    return `الفائز: ${session.winnerName || session[session.winnerTeam]?.name || '—'}`;
}

function renderPreviousSessionsHome() {
    const sessions = getPreviousSessions();
    const preview = document.getElementById('homeHistoryPreview');
    const count = document.getElementById('homeHistoryCount');

    if (count) {
        count.textContent = sessions.length
            ? `${sessions.length} ${sessions.length === 1 ? 'جلسة محفوظة' : 'جلسات محفوظة'}`
            : 'لا توجد جلسات';
    }

    if (!preview) return;
    if (!sessions.length) {
        preview.innerHTML = '<div class="home-history-empty">ستظهر نتائج مبارياتك هنا</div>';
        return;
    }

    const latest = sessions[0];
    preview.innerHTML = `
        <div class="home-history-latest">
            <strong>${escapeHistoryText(latest.competitionName || 'هوجاس')}</strong>
            <span>${escapeHistoryText(latest.team1?.name || 'الفريق الأول')}
                <b>${Number(latest.team1?.score) || 0}</b>
                <i>—</i>
                <b>${Number(latest.team2?.score) || 0}</b>
                ${escapeHistoryText(latest.team2?.name || 'الفريق الثاني')}</span>
            <small>${escapeHistoryText(getSessionWinnerLabel(latest))}</small>
        </div>
    `;
}

function renderPreviousSessionsModal() {
    const sessions = getPreviousSessions();
    const summary = document.getElementById('previousSessionsSummary');
    const list = document.getElementById('previousSessionsList');
    const clearButton = document.getElementById('clearPreviousSessionsButton');

    if (summary) {
        const wins1 = sessions.filter(session => session.winnerTeam === 'team1').length;
        const wins2 = sessions.filter(session => session.winnerTeam === 'team2').length;
        const draws = sessions.filter(session => !session.winnerTeam).length;
        summary.innerHTML = `
            <span><b>${sessions.length}</b> جلسة</span>
            <span><b>${wins1 + wins2}</b> فوز</span>
            <span><b>${draws}</b> تعادل</span>
        `;
    }

    if (clearButton) clearButton.hidden = sessions.length === 0;
    if (!list) return;

    if (!sessions.length) {
        list.innerHTML = `
            <div class="previous-sessions-empty">
                <span aria-hidden="true">🏁</span>
                <h3>لا توجد جلسات سابقة بعد</h3>
                <p>بعد إنهاء أول مباراة ستظهر نتيجتها هنا تلقائيًا.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = sessions.map(session => {
        const team1Color = COLOR_MAP[session.team1?.color]?.bg || '#FF9800';
        const team2Color = COLOR_MAP[session.team2?.color]?.bg || '#8B5FBF';
        const team1Winner = session.winnerTeam === 'team1';
        const team2Winner = session.winnerTeam === 'team2';
        return `
            <article class="previous-session-item">
                <div class="previous-session-topline">
                    <div>
                        <h3>${escapeHistoryText(session.competitionName || 'هوجاس')}</h3>
                        <time>${escapeHistoryText(formatPreviousSessionDate(session.completedAt))}</time>
                    </div>
                    <span class="previous-session-winner">${escapeHistoryText(getSessionWinnerLabel(session))}</span>
                </div>
                <div class="previous-session-score">
                    <div class="previous-session-team ${team1Winner ? 'is-winner' : ''}"
                        style="--session-team-color:${team1Color}">
                        <span>${escapeHistoryText(session.team1?.name || 'الفريق الأول')}</span>
                        <b>${Number(session.team1?.score) || 0}</b>
                    </div>
                    <span class="previous-session-versus">VS</span>
                    <div class="previous-session-team ${team2Winner ? 'is-winner' : ''}"
                        style="--session-team-color:${team2Color}">
                        <span>${escapeHistoryText(session.team2?.name || 'الفريق الثاني')}</span>
                        <b>${Number(session.team2?.score) || 0}</b>
                    </div>
                </div>
                <div class="previous-session-footer">
                    <span>${Number(session.roundsPlayed) || 1} من ${Number(session.totalRounds) || 1} جولات</span>
                    <button type="button" onclick="deletePreviousSession('${escapeHistoryText(session.id)}')"
                        aria-label="حذف جلسة ${escapeHistoryText(session.competitionName || 'هوجاس')}">حذف</button>
                </div>
            </article>
        `;
    }).join('');
}

function openPreviousSessionsModal() {
    const modal = document.getElementById('previousSessionsModal');
    if (!modal) return;

    previousSessionsReturnFocus = document.activeElement;
    renderPreviousSessionsModal();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.home-info-modal__close')?.focus());
}

function closePreviousSessionsModal() {
    const modal = document.getElementById('previousSessionsModal');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (previousSessionsReturnFocus?.focus) previousSessionsReturnFocus.focus();
    previousSessionsReturnFocus = null;
}

function deletePreviousSession(sessionId) {
    const sessions = getPreviousSessions().filter(session => session.id !== sessionId);
    savePreviousSessions(sessions);
    renderPreviousSessionsHome();
    renderPreviousSessionsModal();
}

function clearPreviousSessionsHistory() {
    showGameConfirm({
        title: 'مسح سجل الجلسات؟',
        message: 'سيتم حذف جميع نتائج الجلسات السابقة المحفوظة على هذا الجهاز.',
        confirmText: 'مسح السجل',
        icon: '🗑️',
        onConfirm: () => {
            localStorage.removeItem(SESSION_HISTORY_KEY);
            renderPreviousSessionsHome();
            renderPreviousSessionsModal();
        }
    });
}

function renderHomeInfo() {
    const updatesPreview = document.getElementById('homeUpdatesPreview');
    const upcomingPreview = document.getElementById('homeUpcomingPreview');
    const updatesArchive = document.getElementById('homeUpdatesArchive');
    const upcomingArchive = document.getElementById('homeUpcomingArchive');

    if (updatesPreview) {
        updatesPreview.innerHTML = HOME_UPDATE_ITEMS.slice(0, 2).map((item, index) => `
            <div class="home-update-preview-item ${index === 0 ? 'is-latest' : ''}">
                <span>${item.version}</span>
                <strong>${item.title}</strong>
            </div>
        `).join('');
    }

    if (upcomingPreview) {
        upcomingPreview.innerHTML = HOME_UPCOMING_ITEMS.map(item => `
            <div class="home-update-preview-item home-upcoming-preview-item">
                <span>${item.expected}</span>
                <strong>${item.title}</strong>
            </div>
        `).join('');
    }

    if (updatesArchive) {
        updatesArchive.innerHTML = HOME_UPDATE_ITEMS.map((item, index) => `
            <article class="home-update-entry ${index === 0 ? 'is-latest' : ''}">
                <div class="home-update-entry__meta">
                    <span>${item.version}</span>
                    <time>${item.date}</time>
                </div>
                <div>
                    <h3>${item.title}</h3>
                    <p>${item.description}</p>
                </div>
            </article>
        `).join('');
    }

    if (upcomingArchive) {
        upcomingArchive.innerHTML = HOME_UPCOMING_ITEMS.map(item => `
            <article class="home-update-entry home-upcoming-entry">
                <div class="home-update-entry__meta">
                    <span>${item.expected}</span>
                    <small>${item.status}</small>
                </div>
                <div>
                    <h3>${item.title}</h3>
                    <p>${item.description}</p>
                </div>
            </article>
        `).join('');
    }

    renderPreviousSessionsHome();
}

function switchHomeInfoTab(tab = 'updates') {
    const showUpcoming = tab === 'upcoming';
    const updatesPanel = document.getElementById('homeUpdatesPanel');
    const upcomingPanel = document.getElementById('homeUpcomingPanel');
    const updatesButton = document.getElementById('homeUpdatesTabButton');
    const upcomingButton = document.getElementById('homeUpcomingTabButton');

    if (updatesPanel) updatesPanel.hidden = showUpcoming;
    if (upcomingPanel) upcomingPanel.hidden = !showUpcoming;
    if (updatesButton) {
        updatesButton.classList.toggle('active', !showUpcoming);
        updatesButton.setAttribute('aria-selected', String(!showUpcoming));
    }
    if (upcomingButton) {
        upcomingButton.classList.toggle('active', showUpcoming);
        upcomingButton.setAttribute('aria-selected', String(showUpcoming));
    }
}

function openHomeInfoModal(tab = 'updates') {
    const modal = document.getElementById('homeInfoModal');
    if (!modal) return;

    homeInfoReturnFocus = document.activeElement;
    renderHomeInfo();
    switchHomeInfoTab(tab);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.home-info-modal__close')?.focus());
}

function closeHomeInfoModal() {
    const modal = document.getElementById('homeInfoModal');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    if (homeInfoReturnFocus?.focus) homeInfoReturnFocus.focus();
    homeInfoReturnFocus = null;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderHomeInfo, { once: true });
} else {
    renderHomeInfo();
}

function openRulesModal() {
    const modal = document.getElementById('rulesModal');
    if (!modal) return;

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.rules-close-btn')?.focus());
}

function closeRulesModal() {
    const modal = document.getElementById('rulesModal');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.querySelector('.home-buttons .btn-pill:last-child')?.focus();
}

function openSuperpowersModal() {
    const modal = document.getElementById('superpowersModal');
    if (!modal) return;

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => modal.querySelector('.home-info-modal__close')?.focus());
}

function closeSuperpowersModal() {
    const modal = document.getElementById('superpowersModal');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.querySelector('.superpowers-link')?.focus();
}

function openOnlineModal() {
    // Keep the destination stable on the custom domain and during local file previews.
    window.location.href = window.location.protocol === 'file:'
        ? 'pages/online-board.html'
        : '/7roof/online/board';
}

function closeOnlineModal() {
    const modal = document.getElementById('onlineModal');
    if (!modal) return;

    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.querySelector('.btn-online')?.focus();
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('previousSessionsModal')?.classList.contains('show')) {
        closePreviousSessionsModal();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('homeInfoModal')?.classList.contains('show')) {
        closeHomeInfoModal();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('rulesModal')?.classList.contains('show')) {
        closeRulesModal();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('superpowersModal')?.classList.contains('show')) {
        closeSuperpowersModal();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('onlineModal')?.classList.contains('show')) {
        closeOnlineModal();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('returnHomeModal')?.classList.contains('show')) {
        closeReturnHomeWarning();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('playerHelpModal')?.classList.contains('show')) {
        closePlayerHelp();
        return;
    }

    if (event.key === 'Escape' && document.getElementById('gameActionConfirm')?.classList.contains('show')) {
        closeGameConfirm();
    }
});

function restoreSavedGameState() {
    let state;
    try {
        state = JSON.parse(localStorage.getItem(GAME_STATE_KEY) || 'null');
    } catch (error) {
        clearSavedGameState();
        return false;
    }

    if (!state || state.version !== 1 ||
        !isValidGameMatrix(state.board) || !isValidGameMatrix(state.cellLetters)) {
        return false;
    }

    teamSetup = {
        ...teamSetup,
        ...(state.teamSetup || {}),
        team1: { ...teamSetup.team1, ...(state.teamSetup?.team1 || {}) },
        team2: { ...teamSetup.team2, ...(state.teamSetup?.team2 || {}) }
    };
    // Migrate games created with the old reversed default palette.
    if ((teamSetup.team1.color === 'purple' && teamSetup.team2.color === 'orange') ||
        (teamSetup.team1.color === 'green' && teamSetup.team2.color === 'orange')) {
        teamSetup.team1.color = 'orange';
        teamSetup.team2.color = 'purple';
    }
    board = state.board.map(row => [...row]);
    cellLetters = state.cellLetters.map(row => [...row]);
    scores = {
        team1: Number(state.scores?.team1) || 0,
        team2: Number(state.scores?.team2) || 0
    };
    roundWins = {
        team1: Number(state.roundWins?.team1) || 0,
        team2: Number(state.roundWins?.team2) || 0
    };
    currentRoundWinner = state.currentRoundWinner === 'team1' || state.currentRoundWinner === 'team2'
        ? state.currentRoundWinner
        : '';
    teamSetup.team1.score = roundWins.team1;
    teamSetup.team2.score = roundWins.team2;
    buzzerRoom = state.buzzerRoom || generateBuzzerCode();
    gameSessionId = state.gameSessionId || createSessionHistoryId();
    sessionStartedAt = Number(state.sessionStartedAt) || Number(state.savedAt) || Date.now();
    usedQuestionIds.clear();
    (Array.isArray(state.usedQuestionIds) ? state.usedQuestionIds : []).forEach(id => usedQuestionIds.add(id));
    selectedCell = null;
    gameIsActive = true;
    document.body.classList.add('normal-game-active');

    const home = document.getElementById('homeScreen');
    const settings = document.getElementById('settingsScreen');
    const transition = document.getElementById('transitionScreen');
    const mainArea = document.querySelector('.main-area');
    if (home) home.style.display = 'none';
    if (settings) settings.style.display = 'none';
    if (transition) transition.style.display = 'none';
    if (mainArea) mainArea.style.display = 'flex';

    const sidebarLogo = document.querySelector('.sidebar .logo');
    if (sidebarLogo) {
        sidebarLogo.innerHTML = `
            <span class="logo-line1">حروف</span>
            <span class="logo-line2">مع</span>
            <span class="logo-line3">${teamSetup.competitionName}</span>
        `;
    }

    applyTeamColors();
    updateBgGradient(COLOR_MAP[teamSetup.team1.color].bg, COLOR_MAP[teamSetup.team2.color].bg);
    updateRoundDisplay();
    updateSidebar();
    document.body.classList.toggle('presentation-mode', Boolean(state.presentationMode));
    setGamePresenter(isAdminViewer() ? 'human' : teamSetup.presenter, true);
    applyAdminViewerMode();

    requestAnimationFrame(() => {
        renderBoard();
        if (state.presentationMode) syncGameViewUI();
        window.HojasFirstGameTour?.maybeStart({
            mode: 'normal',
            active: () => gameIsActive
        });
    });
    setupLiveGameSession().catch(error => console.error('Live session restore failed', error));
    return true;
}

// Setup choices
let teamSetup = {
    competitionName: 'هوجاس',
    team1: { name: 'الفريق الأول', color: 'orange' },
    team2: { name: 'الفريق الثاني', color: 'purple' },
    totalRounds: 3,
    currentRound: 1,
    ansTime: 3,
    otherTime: 10,
    manualTime: 5,
    presenter: 'ai',
    sound: 'on',
    buzzerServerUrl: getNormalBuzzerUrl()
};

// Keep the shared match branding/settings when switching between the normal
// and super-powers modes.  Each mode still owns its board and round state.
const SHARED_SETUP_KEY = 'hojas_shared_setup_v1';
function persistSharedSetup() {
    try {
        localStorage.setItem(SHARED_SETUP_KEY, JSON.stringify({
            version: 1,
            competitionName: teamSetup.competitionName,
            team1: { name: teamSetup.team1.name, color: teamSetup.team1.color },
            team2: { name: teamSetup.team2.name, color: teamSetup.team2.color },
            totalRounds: Number(teamSetup.totalRounds) || 3,
            ansTime: Number(teamSetup.ansTime) || 3,
            otherTime: Number(teamSetup.otherTime) || 10,
            sound: teamSetup.sound === 'off' ? 'off' : 'on'
        }));
    } catch (error) {
        console.warn('Could not save shared match setup', error);
    }
}

function hydrateSharedSetup() {
    try {
        const saved = JSON.parse(localStorage.getItem(SHARED_SETUP_KEY) || 'null');
        if (!saved || typeof saved !== 'object') return;
        if (typeof saved.competitionName === 'string' && saved.competitionName.trim()) {
            teamSetup.competitionName = saved.competitionName.trim().slice(0, 40);
        }
        ['team1', 'team2'].forEach(team => {
            const source = saved[team];
            if (!source || typeof source !== 'object') return;
            if (typeof source.name === 'string' && source.name.trim()) teamSetup[team].name = source.name.trim().slice(0, 30);
            if (typeof source.color === 'string' && COLOR_MAP[source.color]) teamSetup[team].color = source.color;
        });
        if (Number.isFinite(Number(saved.totalRounds))) teamSetup.totalRounds = Math.max(1, Math.min(5, Number(saved.totalRounds)));
        if (Number.isFinite(Number(saved.ansTime))) teamSetup.ansTime = Math.max(2, Math.min(15, Number(saved.ansTime)));
        if (Number.isFinite(Number(saved.otherTime))) teamSetup.otherTime = Math.max(5, Math.min(30, Number(saved.otherTime)));
        if (saved.sound === 'on' || saved.sound === 'off') teamSetup.sound = saved.sound;
    } catch (error) {
        console.warn('Could not load shared match setup', error);
    }
}

// ===== Buzzer State =====
let buzzerSocket = null;
let buzzerRoom = null;
let isBuzzerLocked = false;
let buzzerFirstTeam = null; // 'team1' or 'team2'
let buzzerTimerInterval = null;
let buzzerTimeLeft = 0;

let timerInterval = null;
let currentTimerTeam = null;
let timeLeft = 0;

// ===== Utility Functions =====
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function safeSetDisplay(idOrElement, displayStyle) {
    const el = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
    if (el) {
        el.style.display = displayStyle;
        return el;
    }
    return null;
}

// The game uses one consistent light appearance. Remove any legacy theme
// preference so an old dark-mode setting cannot bring back the deleted toggle.
function applyDarkMode() {
    document.body.classList.remove('dark-mode');
    localStorage.removeItem('theme');
}

function toggleDarkMode() {
    applyDarkMode(false);
}

// ===== Questions System =====
let questionsBank = [];   // Array of { id, q: string, a: string, letterMatch: string }
let currentQIndex = -1;
let questionsLoaded = false;
let extraQuestionsLoaded = false;
const usedQuestionIds = new Set();

function normalizeQuestionLetter(value) {
    return (window.QuestionLibrary?.normalizeLetter?.(value) || String(value || ''))
        .replace(/[أإآٱ]/g, 'ا').trim().slice(0, 1);
}

async function loadExtraQuestionLibrary() {
    if (extraQuestionsLoaded) return;
    try {
        if (!window.QuestionLibrary?.getActiveQuestions) return;
        const extra = await window.QuestionLibrary.getActiveQuestions(true);
        const existing = new Set(questionsBank.map(item => item.id));
        const mapped = extra.filter(item => item.question && item.answer)
            .map(item => ({
                id: `extra-${item.id}`,
                q: item.question,
                a: item.answer,
                letterMatch: normalizeQuestionLetter(item.letter),
                source: item.source || 'follower'
            }))
            .filter(item => !existing.has(item.id));
        questionsBank = questionsBank.concat(mapped);
        if (mapped.length) console.log(`✅ Added ${mapped.length} approved follower questions`);
    } catch (error) {
        // The static bank remains usable when the optional Firebase library is unavailable.
        console.warn('تعذر تحميل أسئلة المتابعين، سيتم استخدام البنك الأساسي.', error);
    } finally {
        extraQuestionsLoaded = true;
    }
}

async function loadQuestionOverrides() {
    try {
        if (!window.QuestionLibrary?.getQuestionOverrides) return;
        const overrides = await window.QuestionLibrary.getQuestionOverrides(true);
        if (!Array.isArray(overrides) || !overrides.length || !questionsBank.length) return;
        const byId = new Map(overrides.map(item => [String(item.baseId || item.id), item]));
        questionsBank = questionsBank.map(item => {
            const override = byId.get(String(item.id));
            if (!override) return item;
            return {
                ...item,
                q: override.question || item.q,
                a: override.answer || item.a,
                letterMatch: normalizeQuestionLetter(override.letter || item.letterMatch),
                category: override.category || item.category,
                difficulty: override.difficulty || item.difficulty,
                status: override.status || item.status || 'active',
                source: 'static'
            };
        }).filter(item => item.status !== 'disabled');
        if (overrides.length) console.log(`✅ Applied ${overrides.length} admin question overrides`);
    } catch (error) {
        // The bundled bank remains usable if Firebase is unavailable.
        console.warn('تعذر تحميل تعديلات أسئلة الأدمن، سيتم استخدام البنك الأساسي.', error);
    }
}

async function loadQuestionsFromJSON() {
    if (questionsLoaded) return;
    try {
        const loadingEl = document.getElementById('sqLoading');
        if (loadingEl) loadingEl.style.display = 'flex';
        
        let data = [];
        if (typeof questionsData !== 'undefined' && Array.isArray(questionsData)) {
            data = questionsData;
            console.log('✅ Use global questionsData:', data.length);
        } else {
        // تحديد المسار بناءً على موقع الصفحة الحالية (داخل مجلد pages أو في الجذر)
        const inSubfolder = window.location.pathname.includes('/pages/');
        const dataPath = inSubfolder ? '../data/questions (1).json' : 'data/questions (1).json';
        
        const resp = await fetch(dataPath);
        if (resp.ok) data = await resp.json();
        }
        
        if (data && data.length > 0) {
            questionsBank = data.map((item, index) => ({
                id: item.id || `static-${index}`,
                q: item.question || item.q || "",
                a: item.answer || item.a || "",
                letterMatch: normalizeQuestionLetter(item.letter) || 'عام',
                source: 'static'
            }));
        }
        await loadQuestionOverrides();
        await loadExtraQuestionLibrary();
        questionsLoaded = true;
        console.log(`✅ Bank Ready: ${questionsBank.length} questions`);
        if (loadingEl) loadingEl.style.display = 'none';
    } catch (err) {
        console.error('❌ Data Load Error:', err);
    }
}

function showQuestionPanel(letter, cellEl) {
    if (isAdminViewer()) {
        closeQuestionPanel();
        return;
    }
    const panel = document.getElementById('sidebarQuestion');
    if (!panel) return;
    
    // Reset view
    safeSetDisplay('sqAnswer', 'none');
    panel.style.display = 'flex';
    
    // Toggle Mode
    if (teamSetup.presenter === 'ai') {
        panel.classList.add('in-main');
    } else {
        panel.classList.remove('in-main');
    }
    
    window.currentRequestedLetter = letter;
    
    if (questionsLoaded && questionsBank.length > 0) {
        showRandomQuestion(letter);
    } else {
        loadQuestionsFromJSON().then(() => {
            if (questionsBank.length > 0) showRandomQuestion(letter);
        });
    }
}

function showRandomQuestion(targetLetter) {
    if (questionsBank.length === 0) return;
    
    targetLetter = targetLetter || window.currentRequestedLetter || '';
    let normalizedTarget = normalizeQuestionLetter(targetLetter);
    
    let filteredQs = questionsBank.filter(q => {
        if (!normalizedTarget) return true;
        return q.letterMatch && normalizeQuestionLetter(q.letterMatch) === normalizedTarget;
    });
    
    if (filteredQs.length === 0) filteredQs = questionsBank;
    
    let availableQs = filteredQs.filter(item => !usedQuestionIds.has(item.id));
    if (!availableQs.length) {
        filteredQs.forEach(item => usedQuestionIds.delete(item.id));
        availableQs = filteredQs;
    }
    const qChosen = availableQs[Math.floor(Math.random() * availableQs.length)];
    if (qChosen?.id) usedQuestionIds.add(qChosen.id);
    currentQIndex = questionsBank.indexOf(qChosen);
    
    // UI Elements
    const qEl = document.getElementById('sqQuestion');
    const aEl = document.getElementById('sqAnswerText');
    const rBtn = document.getElementById('sqRevealBtn');
    const numEl = document.getElementById('sqNum');
    const ansRow = document.getElementById('sqAnswer');
    
    // Reset view
    if (ansRow) ansRow.style.display = 'none';
    if (rBtn) rBtn.style.display = 'block';
    
    // Update Content
    if (qEl) {
        qEl.textContent = qChosen.q;
        console.log('✅ Showing Q:', qChosen.q);
    }
    if (aEl) aEl.textContent = qChosen.a;
    
    if (numEl) {
        numEl.textContent = targetLetter || "عام";
    }
    // In human-presenter mode the full question belongs only to the
    // presenter phone. The public game state carries the selected letter
    // without leaking the question or answer to players.
    if (teamSetup.presenter === 'human') {
        publishPresenterQuestion().catch(() => {});
    } else {
        publishLiveGameState().catch(() => {});
    }
}

async function prepareHumanPresenterQuestion(letter) {
    if (isAdminViewer()) {
        closeQuestionPanel();
        return;
    }
    window.currentRequestedLetter = letter;
    if (!questionsLoaded || questionsBank.length === 0) {
        await loadQuestionsFromJSON();
    }
    if (questionsBank.length > 0) showRandomQuestion(letter);
    closeQuestionPanel();
}

function showAudienceAnswerOverlay(answer) {
    const overlay = document.getElementById('audienceAnswerOverlay');
    const text = document.getElementById('audienceAnswerText');
    if (!overlay || !text || !answer) return;
    text.textContent = answer;
    overlay.classList.remove('show');
    void overlay.offsetWidth;
    overlay.classList.add('show');
    clearTimeout(window.audienceAnswerOverlayTimer);
    window.audienceAnswerOverlayTimer = setTimeout(() => overlay.classList.remove('show'), 3000);
}

function revealAnswer() {
    if (isAdminViewer() && !_presenterCommandInProgress) return;
    safeSetDisplay('sqAnswer', 'block');
    safeSetDisplay('sqRevealBtn', 'none');
    showAudienceAnswerOverlay(document.getElementById('sqAnswerText')?.textContent?.trim());
    if (teamSetup.presenter === 'human') publishPresenterQuestion().catch(() => {});
    publishLiveGameState().catch(() => {});
}

function nextQuestion() {
    if (isAdminViewer() && !_presenterCommandInProgress) {
        showEditingLockedNotice();
        return;
    }
    showRandomQuestion();
}

function closeQuestionPanel() {
    safeSetDisplay('sidebarQuestion', 'none');
}

// Once a cell has been resolved, remove the question from every view.  The
// presenter and audience otherwise kept seeing the previous question while
// the next cell was being selected.
function clearActiveQuestion({ publish = true } = {}) {
    window.currentRequestedLetter = '';
    const qEl = document.getElementById('sqQuestion');
    const aEl = document.getElementById('sqAnswerText');
    const numEl = document.getElementById('sqNum');
    const answerRow = document.getElementById('sqAnswer');
    const revealBtn = document.getElementById('sqRevealBtn');
    if (qEl) qEl.textContent = '';
    if (aEl) aEl.textContent = '';
    if (numEl) numEl.textContent = '';
    if (answerRow) answerRow.style.display = 'none';
    if (revealBtn) revealBtn.style.display = 'none';
    closeQuestionPanel();
    if (teamSetup.presenter === 'human' && typeof publishPresenterQuestion === 'function') {
        publishPresenterQuestion({ letter: '', text: '', answer: '', revealed: false, selectedCell: null }).catch(() => {});
    }
    if (publish) publishLiveGameState().catch(() => {});
}

// ===== Screen Navigation =====
window.addEventListener('DOMContentLoaded', () => {
    // تطبيق الثيم المحفوظ
    const savedTheme = localStorage.getItem('theme');
    applyDarkMode(savedTheme === 'dark');
    
    hydrateSharedSetup();
    initSettingsUI();
    setGamePresenter(isAdminViewer() ? 'human' : teamSetup.presenter, true);
    applyAdminViewerMode();
    
    // Load saved buzzer URL from localStorage if it exists
    let savedBuzzerUrl = localStorage.getItem('buzzerServerUrl');
    
    // Aggressive Migration: If the saved URL is old Railway or old github.io, force local relative URL
    const isOldRailway = savedBuzzerUrl && savedBuzzerUrl.includes('railway.app');
    const isGithub = savedBuzzerUrl && savedBuzzerUrl.includes('rakaga66.github.io');
    const isLegacyProductionRoute = savedBuzzerUrl && !isLocalGameRuntime() &&
        savedBuzzerUrl.includes('/buzzer-server-qaf') || savedBuzzerUrl.includes('/حروف/الجرس');

    if (isOldRailway || isGithub || isLegacyProductionRoute) {
        console.log('🔄 Forced migration of buzzer server URL to local origin...');
        savedBuzzerUrl = getNormalBuzzerUrl();
        localStorage.setItem('buzzerServerUrl', savedBuzzerUrl);
    }

    if (savedBuzzerUrl) {
        teamSetup.buzzerServerUrl = savedBuzzerUrl;
        const input = document.getElementById('setBuzzerUrl');
        if (input) input.value = savedBuzzerUrl;
    }

    // Load saved manual time
    const savedManualTime = localStorage.getItem('manualTime');
    if (savedManualTime) {
        teamSetup.manualTime = parseInt(savedManualTime);
    }

    const savedScreen = localStorage.getItem(UI_SCREEN_KEY);
    const settingsSource = localStorage.getItem(SETTINGS_SOURCE_KEY);
    // Restore only an explicitly active match.  A home marker is authoritative
    // so a refresh after leaving a round cannot reopen the old board.
    const shouldRestoreGame = savedScreen === 'game' ||
        (savedScreen === 'settings' && settingsSource === 'game');
    const restoredGame = shouldRestoreGame ? restoreSavedGameState() : false;

    if (!restoredGame && savedScreen === 'game') {
        localStorage.setItem(UI_SCREEN_KEY, 'home');
        localStorage.removeItem(SETTINGS_SOURCE_KEY);
    }

    if (!shouldRestoreGame) {
        clearSavedGameState();
    }

    updateSoundButton();

    // Preserve the settings screen across refreshes, including when it was
    // opened over an active game.
    if (localStorage.getItem(UI_SCREEN_KEY) === 'settings') {
        const settings = document.getElementById('settingsScreen');
        const home = document.getElementById('homeScreen');
        const requestedGameSource = localStorage.getItem(SETTINGS_SOURCE_KEY) === 'game';

        settingsCalledFromGame = Boolean(restoredGame && requestedGameSource);
        if (home) home.style.display = 'none';
        if (settings) {
            settings.style.display = 'flex';
            requestAnimationFrame(() => { settings.scrollTop = 0; });
        }
        syncSettingsUI();
    }
});

window.addEventListener('beforeunload', saveGameState);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGameState();
});


// Browsers restrict audio before interaction. 
// Play it on the very first click anywhere if sound is enabled.
let userHasInteracted = false;
document.addEventListener('click', (e) => {
    if (!userHasInteracted) {
        userHasInteracted = true;
    }
    
    // 2. Play general click sound if sound is on
    if (teamSetup.sound === 'on') {
        const isTeamAssignBtn = e.target.closest('.pick-btn') || e.target.closest('.score-box');
        
        if (!isTeamAssignBtn) {
            const clickAudio = document.getElementById('clickSound');
            if (clickAudio) {
                clickAudio.currentTime = 0;
                clickAudio.play().catch(err => console.log('Click sound prevented', err));
            }
        }
    }
});

// تتبع من أين فُتحت صفحة الإعدادات
let settingsCalledFromGame = false;

function showSettings() {
    if (isAdminViewer()) {
        showEditingLockedNotice();
        return;
    }
    const homeScreen = document.getElementById('homeScreen');
    const isInGame = homeScreen && homeScreen.style.display === 'none';
    settingsCalledFromGame = isInGame;
    localStorage.setItem(UI_SCREEN_KEY, 'settings');
    localStorage.setItem(SETTINGS_SOURCE_KEY, isInGame ? 'game' : 'home');

    syncSettingsUI();

    if (!isInGame) {
        homeScreen.style.display = 'none';
    }
    const settingsScreen = document.getElementById('settingsScreen');
    settingsScreen.style.display = 'flex';
    requestAnimationFrame(() => { settingsScreen.scrollTop = 0; });
}

function updateRoundDisplay() {
    const el = document.getElementById('roundText');
    if (el) {
        const idx = (teamSetup.currentRound - 1) % ROUND_WORDS.length;
        el.textContent = ROUND_WORDS[idx] || 'الأولى';
    }
    
    const totalEl = document.getElementById('roundTotal');
    if (totalEl) {
        totalEl.textContent = ` (${teamSetup.currentRound}/${teamSetup.totalRounds})`;
    }
}

function syncSettingsUI() {
    const compInput = document.getElementById('setCompName');
    if (compInput) compInput.value = teamSetup.competitionName;

    const settingsLiveName = document.getElementById('settingsLiveCompName');
    if (settingsLiveName) settingsLiveName.textContent = teamSetup.competitionName || 'هوجاس';

    const t1Input = document.getElementById('setTeam1Name');
    if (t1Input) t1Input.value = teamSetup.team1.name;

    const t2Input = document.getElementById('setTeam2Name');
    if (t2Input) t2Input.value = teamSetup.team2.name;

    const bUrlInput = document.getElementById('setBuzzerUrl');
    if (bUrlInput) bUrlInput.value = teamSetup.buzzerServerUrl || '';

    // مزامنة أزرار الاختيار (الجولات، المقدم، الصوت، الثيم)
    const groups = {
        'setRoundsGroup': teamSetup.totalRounds,
        'setPresenterGroup': teamSetup.presenter,
        'setSoundGroup': teamSetup.sound,
        'setThemeGroup': document.body.classList.contains('dark-mode') ? 'dark' : 'light'
    };

    for (let gid in groups) {
        const group = document.getElementById(gid);
        if (group) {
            group.querySelectorAll('.toggle-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.value == groups[gid]);
            });
        }
    }

    // مزامنة جميع مدد المؤقت
    ['manualTime', 'ansTime', 'otherTime'].forEach(key => {
        const valueEl = document.getElementById(key + 'Val');
        if (valueEl) valueEl.textContent = teamSetup[key];
    });

    // مزامنة الألوان
    const colorsGrid = document.getElementById('setColorsGroup');
    if (colorsGrid) {
        colorsGrid.querySelectorAll('.color-pair').forEach(btn => {
            const isSelected = btn.dataset.c1 === teamSetup.team1.color && btn.dataset.c2 === teamSetup.team2.color;
            btn.classList.toggle('selected', isSelected);
        });
    }
}

function showHome() {
    document.getElementById('settingsScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'flex';
    document.body.classList.remove('normal-game-active');
    localStorage.setItem(UI_SCREEN_KEY, 'home');
    localStorage.removeItem(SETTINGS_SOURCE_KEY);
}

function saveSettings() {
    if (isAdminViewer()) {
        showEditingLockedNotice();
        return;
    }
    const cName = document.getElementById('setCompName').value.trim();
    if(cName) teamSetup.competitionName = cName;
    
    const t1Name = document.getElementById('setTeam1Name').value.trim();
    if(t1Name) teamSetup.team1.name = t1Name;
    
    const t2Name = document.getElementById('setTeam2Name').value.trim();
    if(t2Name) teamSetup.team2.name = t2Name;

    const bUrl = document.getElementById('setBuzzerUrl').value.trim();
    teamSetup.buzzerServerUrl = bUrl;
    localStorage.setItem('buzzerServerUrl', bUrl);

    // حفظ الوقت اليدوي
    localStorage.setItem('manualTime', teamSetup.manualTime);
    persistSharedSetup();
    syncLiveSetupNames().catch(() => {});

    // تطبيق التغييرات فوراً إذا كانت اللعبة شغالة
    if (settingsCalledFromGame) {
        if (typeof updateSidebar === 'function') updateSidebar();
        if (typeof applyTeamColors === 'function') applyTeamColors();
        saveGameState();
        // إغلاق الإعدادات والرجوع للعبة مباشرة
        document.getElementById('settingsScreen').style.display = 'none';
        localStorage.setItem(UI_SCREEN_KEY, 'game');
        localStorage.removeItem(SETTINGS_SOURCE_KEY);
    } else {
        showHome();
    }
}

function startGame() {
    if (isAdminViewer() && !_presenterCommandInProgress) {
        showEditingLockedNotice();
        return;
    }
    usedQuestionIds.clear();
    window.qafTrackGameStart?.();
    document.getElementById('homeScreen').style.display = 'none';
    localStorage.setItem(UI_SCREEN_KEY, 'game');
    localStorage.removeItem(SETTINGS_SOURCE_KEY);
    gameIsActive = true;
    document.body.classList.add('normal-game-active');
    
    // Generate unique session code for this game
    if (buzzerSocket) { buzzerSocket.disconnect(); buzzerSocket = null; }
    buzzerRoom = generateBuzzerCode();
    gameSessionId = createSessionHistoryId();
    sessionStartedAt = Date.now();
    teamSetup.currentRound = 1;
    scores = { team1: 0, team2: 0 };
    roundWins = { team1: 0, team2: 0 };
    currentRoundWinner = '';
    teamSetup.team1.score = 0;
    teamSetup.team2.score = 0;
    
    document.getElementById('name1').textContent = teamSetup.team1.name;
    document.getElementById('name2').textContent = teamSetup.team2.name;
    
    const compName = teamSetup.competitionName;
    document.querySelector('.sidebar .logo').innerHTML = `
        <span class="logo-line1">حروف</span>
        <span class="logo-line2">مع</span>
        <span class="logo-line3">${compName}</span>
    `;

    applyTeamColors();
    updateBgGradient(COLOR_MAP[teamSetup.team1.color].bg, COLOR_MAP[teamSetup.team2.color].bg);

    initBoard();
    renderBoard();
    updateRoundDisplay();
    updateSidebar();
    setGamePresenter(isAdminViewer() ? 'human' : teamSetup.presenter, true);
    saveGameState();
    setupLiveGameSession().catch(error => console.error('Live session setup failed', error));
    
    showTransitionScreen(compName, getRoundWord(teamSetup.currentRound));
}

function getRoundWord(round) {
    const idx = (round - 1) % ROUND_WORDS.length;
    return ROUND_WORDS[idx];
}

function showTransitionScreen(compName, roundWord) {
    const ts = document.getElementById('transitionScreen');
    const tsc = document.getElementById('tsContent');
    const mainArea = document.querySelector('.main-area');
    
    if (mainArea) mainArea.style.display = 'none';
    ts.style.display = 'flex';
    
    // Phase 1: Game Title
    tsc.innerHTML = `
        <div class="ts-logo">
            <span class="logo-line1">حروف</span>
            <span class="logo-line2">مع</span>
            <span class="logo-line3">${compName}</span>
        </div>
    `;
    tsc.className = 'ts-content animate-pop-in';
    
    // After 1 second, switch to Phase 2: Round Word
    setTimeout(() => {
        tsc.classList.remove('animate-pop-in');
        void tsc.offsetWidth; 
        
        tsc.innerHTML = `
            <div class="ts-round">
                <span class="ts-round-txt1">الجولة</span>
                <span class="ts-round-txt2">${roundWord}</span>
            </div>
        `;
        tsc.classList.add('animate-pop-in');
        
        // After 1 more second, hide transition and show main area
        setTimeout(() => {
            hideTransitionNow(ts, mainArea);
        }, 1000);
    }, 1000);

    // Safety timeout
    setTimeout(() => {
        if (ts && ts.style.display !== 'none') {
            console.warn('Transition Safety Timeout triggered');
            hideTransitionNow(ts, mainArea);
        }
    }, 4000);
}

function hideTransitionNow(ts, mainArea) {
    if (ts) ts.style.display = 'none';
    if (mainArea) {
        mainArea.style.display = 'flex';
        // The board was first rendered while the game area was hidden, so its
        // measured size was zero. Re-render after the visible layout is ready.
        requestAnimationFrame(() => {
            renderBoard();
            window.HojasFirstGameTour?.maybeStart({
                mode: 'normal',
                active: () => gameIsActive
            });
        });
        if (teamSetup.sound === 'on') {
            const enterAudio = document.getElementById('enterSound');
            if (enterAudio) {
                enterAudio.currentTime = 0;
                enterAudio.play().catch(e => console.log('Enter sound prevented', e));
            }
        }
    }
}

// ===== Game Menu (Dropdown) =====
function toggleGameMenu() {
    const menu = document.getElementById('gameDropdown');
    menu.style.display = (menu.style.display === 'none') ? 'flex' : 'none';
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    const container = document.querySelector('.game-menu-container');
    const menu = document.getElementById('gameDropdown');
    if (container && menu && !container.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function setGamePresenter(type, force = false) {
    if (isAdminViewer() && !force) type = 'human';
    teamSetup.presenter = type;
    
    // Update sidebar buttons
    const btnAi = document.getElementById('ptBtnAi');
    const btnHuman = document.getElementById('ptBtnHuman');
    if (btnAi) btnAi.classList.toggle('active', type === 'ai');
    if (btnHuman) btnHuman.classList.toggle('active', type === 'human');
    
    // Update dropdown buttons if they exist
    const gdAi = document.getElementById('gdToggleAi');
    const gdHuman = document.getElementById('gdToggleHuman');
    if (gdAi) gdAi.classList.toggle('active', type === 'ai');
    if (gdHuman) gdHuman.classList.toggle('active', type === 'human');
    
    // Sync with main settings screen
    const mainSettingsGroups = document.querySelectorAll('#setPresenterGroup .toggle-btn');
    mainSettingsGroups.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === type);
    });

    // Human presenter mode never shows the automatic question panel.
    const panel = document.getElementById('sidebarQuestion');
    if (type === 'human') {
        closeQuestionPanel();
    } else if (panel && panel.style.display !== 'none') {
        const letter = window.currentRequestedLetter;
        showQuestionPanel(letter);
    }

    saveGameState();
}

function resetGameGrid() {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return;
    }
    showGameConfirm({
        title: 'بدء لعبة جديدة؟',
        message: 'سيتم مسح الجولة الحالية وبدء لوحة جديدة.',
        confirmText: 'ابدأ من جديد',
        icon: '↻',
        onConfirm: () => {
            startGame();
            const dropdown = document.getElementById('gameDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
    });
}

function playBell() {
    if (teamSetup.sound === 'off') return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch(e) {
        console.log("Audio not supported");
    }
    document.getElementById('gameDropdown').style.display = 'none';
}

function playBuzzerSound() {
    if (teamSetup.sound === 'off') return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const oscillator2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // Create a harsh, buzzer-like sound using two detuned square/sawtooth waves
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);

        oscillator2.type = 'square';
        oscillator2.frequency.setValueAtTime(155, audioCtx.currentTime);

        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

        oscillator.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator2.start();
        oscillator.stop(audioCtx.currentTime + 0.8);
        oscillator2.stop(audioCtx.currentTime + 0.8);
    } catch(e) {
        console.log("Audio not supported");
    }
}

function updateSoundButton() {
    const muted = teamSetup.sound === 'off';
    document.querySelectorAll('#bibMuteBtn, #gdMuteBtn').forEach(button => {
        const icon = button.querySelector('.bib-icon-sound');
        const label = button.querySelector('.bib-label');
        if (icon) icon.textContent = muted ? '🔇' : '🔊';
        if (label) label.textContent = muted ? 'مكتوم' : 'الصوت';
        if (!icon && !label) button.innerHTML = `<span>${muted ? 'تشغيل الصوت' : 'إيقاف الصوت'}</span> ${muted ? '🔇' : '🔊'}`;
        button.classList.toggle('is-muted', muted);
        button.setAttribute('aria-label', muted ? 'الصوت مكتوم' : 'كتم الصوت');
        button.setAttribute('aria-pressed', String(muted));
    });
    document.querySelectorAll('#setSoundGroup .toggle-btn').forEach(button => {
        button.classList.toggle('selected', button.dataset.value === teamSetup.sound);
    });
}

function toggleGameSound() {
    teamSetup.sound = teamSetup.sound === 'off' ? 'on' : 'off';
    updateSoundButton();
    saveGameState();
}

// ===== Settings Init =====
function initSettingsUI() {
    // Live update competition name in all logos
    const compNameInput = document.getElementById('setCompName');
    if (compNameInput) {
        compNameInput.addEventListener('input', (e) => {
            const newName = e.target.value.trim() || 'هوجاس';
            teamSetup.competitionName = newName;
            document.querySelectorAll('.logo-line3, #settingsLiveCompName').forEach(el => {
                el.textContent = newName;
            });
        });
    }

    const setupGroups = ['setRoundsGroup', 'setPresenterGroup', 'setSoundGroup', 'setThemeGroup'];
    setupGroups.forEach(gid => {
        const group = document.getElementById(gid);
        if (!group) return;
        group.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                
                if (gid === 'setRoundsGroup') teamSetup.totalRounds = parseInt(btn.dataset.value);
                if (gid === 'setPresenterGroup') teamSetup.presenter = btn.dataset.value;
                if (gid === 'setSoundGroup') {
                    teamSetup.sound = btn.dataset.value;
                    updateSoundButton();
                }
                if (gid === 'setThemeGroup') {
                    applyDarkMode(btn.dataset.value === 'dark');
                }
            });
        });
    });

    const colorsGrid = document.getElementById('setColorsGroup');
    if (colorsGrid) {
        colorsGrid.querySelectorAll('.color-pair').forEach(btn => {
            btn.addEventListener('click', () => {
                colorsGrid.querySelectorAll('.color-pair').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                teamSetup.team1.color = btn.dataset.c1;
                teamSetup.team2.color = btn.dataset.c2;
            });
        });
    }
}

function adjTime(key, delta) {
    let val = teamSetup[key] + delta;
    if (key === 'ansTime' && val < 2) val = 2;
    if (key === 'ansTime' && val > 15) val = 15;
    if (key === 'otherTime' && val < 5) val = 5;
    if (key === 'otherTime' && val > 30) val = 30;
    if (key === 'manualTime' && val < 2) val = 2;
    if (key === 'manualTime' && val > 30) val = 30;
    
    teamSetup[key] = val;
    const valEl = document.getElementById(key + 'Val');
    if (valEl) valEl.textContent = val;
}

function startManualTimer(team) {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return;
    }
    // Stop any existing timer first
    stopTimer();
    // Start timer for the team using manualTime
    // The user said "gives 5 seconds and then moves to the other team"
    // So we use startTimer with isSecondChance = false so it can transition
    startTimer(team, teamSetup.manualTime, false);
}

// ===== Timer Logic =====
function startTimer(team, seconds, isSecondChance = false) {
    clearInterval(timerInterval);
    
    timeLeft = seconds;
    currentTimerTeam = team;
    
    const display = document.getElementById('timerDisplay');
    const teamSpan = document.getElementById('timerTeam');
    const secSpan = document.getElementById('timerSeconds');
    
    display.style.display = 'flex';
    display.classList.remove('danger');
    teamSpan.textContent = 'وقت ' + teamSetup[team].name + ':';
    secSpan.textContent = timeLeft;
    
    timerInterval = setInterval(() => {
        timeLeft--;
        secSpan.textContent = timeLeft;
        
        if (timeLeft <= 3) {
            display.classList.add('danger');
        }
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            display.style.display = 'none';
            display.classList.remove('danger');
            
            if (!isSecondChance) {
                // Time's up for first team, give it to the other team
                const otherTeam = (team === 'team1') ? 'team2' : 'team1';
                startTimer(otherTeam, teamSetup.otherTime, true);
            } else {
                // Time's up for both teams -> cancel selection entirely
                showGameToast('مفتوح للجميع الاجابه لكن بالضغط');
                cancelSelect();
            }
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    const display = document.getElementById('timerDisplay');
    display.style.display = 'none';
    display.classList.remove('danger');
    currentTimerTeam = null;
}

// ===== Custom Toast Notification =====
function showGameToast(msg, silent = false) {
    let toast = document.getElementById('gameToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gameToast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    
    // Play the alert sound if sound is on and not silent
    if (teamSetup.sound === 'on' && !silent) {
        const delAudio = document.getElementById('deleteSound');
        if (delAudio) {
            delAudio.currentTime = 0;
            delAudio.play().catch(e => console.log('Toast sound prevented', e));
        }
    }
    
    // Custom clear timeout to avoid overlap
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Live update team box accent colors + background in setup screen
function updateSetupPreview() {
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];
    const box1 = document.getElementById('setupTeam1');
    const box2 = document.getElementById('setupTeam2');
    if (box1) box1.style.borderColor = c1.bg;
    if (box2) box2.style.borderColor = c2.bg;

    // Update setup overlay background
    const overlay = document.getElementById('setupOverlay');
    if (overlay) {
        overlay.style.background = `linear-gradient(135deg, ${c1.border} 0%, #1e0a3c 40%, #1e0a3c 60%, ${c2.border} 100%)`;
    }

    // Update background for the game screen too (so it looks right on start)
    updateBgGradient(c1.bg, c2.bg);
}

function updateBgGradient(color1, color2) {
    const main = document.querySelector('.main-area');
    if (main) {
        main.style.background = `conic-gradient(
            from 0deg at 50% 50%,
            ${color2}  0deg  45deg,
            ${color1}  45deg 135deg,
            ${color2}  135deg 225deg,
            ${color1}  225deg 315deg,
            ${color2}  315deg 360deg
        )`;
    }
}

// ===== Start Game from Setup =====
function startGameFromSetup() {
    if (isAdminViewer() && !_presenterCommandInProgress) {
        showEditingLockedNotice();
        return;
    }
    const n1 = document.getElementById('setupName1').value.trim();
    const n2 = document.getElementById('setupName2').value.trim();
    const err = document.getElementById('setupError');

    if (!n1 || !n2) {
        err.textContent = '⚠️ يرجى إدخال اسم كلا الفريقين';
        return;
    }
    if (teamSetup.team1.color === teamSetup.team2.color) {
        err.textContent = '⚠️ لا يمكن اختيار نفس اللون لكلا الفريقين';
        return;
    }
    err.textContent = '';

    teamSetup.team1.name = n1;
    teamSetup.team2.name = n2;
    persistSharedSetup();
    teamSetup.currentRound = 1;
    scores = { team1: 0, team2: 0 };
    roundWins = { team1: 0, team2: 0 };
    currentRoundWinner = '';
    teamSetup.team1.score = 0;
    teamSetup.team2.score = 0;
    gameIsActive = true;
    document.body.classList.add('normal-game-active');
    window.qafTrackGameStart?.();

    // Apply team colors to CSS variables
    applyTeamColors();
    updateBgGradient(COLOR_MAP[teamSetup.team1.color].bg, COLOR_MAP[teamSetup.team2.color].bg);

    // Hide setup overlay
    const overlay = document.getElementById('setupOverlay');
    overlay.classList.add('fade-out');
    setTimeout(() => { overlay.style.display = 'none'; }, 400);

    // Init game
    initBoard();
    renderBoard();
    updateRoundDisplay();
    updateSidebar();
    saveGameState();
    requestAnimationFrame(() => {
        window.HojasFirstGameTour?.maybeStart({
            mode: 'normal',
            active: () => gameIsActive
        });
    });
}

// ===== Apply Dynamic Team Colors =====
function applyTeamColors() {
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];
    const root = document.documentElement;

    root.style.setProperty('--team1-bg',     c1.bg);
    root.style.setProperty('--team1-light',  c1.bgLight);
    root.style.setProperty('--team1-border', c1.border);
    root.style.setProperty('--team1-text',   c1.text);
    root.style.setProperty('--team2-bg',     c2.bg);
    root.style.setProperty('--team2-light',  c2.bgLight);
    root.style.setProperty('--team2-border', c2.border);
    root.style.setProperty('--team2-text',   c2.text);

    // Score boxes
    const sb1 = document.getElementById('scoreBox1');
    const sb2 = document.getElementById('scoreBox2');
    if (sb1) sb1.style.background = c1.bg;
    if (sb2) sb2.style.background = c2.bg;
}

// ===== Update Sidebar =====
function updateSidebar() {
    document.getElementById('name1').textContent = teamSetup.team1.name;
    document.getElementById('name2').textContent = teamSetup.team2.name;
    document.getElementById('score1').textContent = roundWins.team1;
    document.getElementById('score2').textContent = roundWins.team2;
}

// ===== Round Display =====

// ===== Shuffle Board (only unclaimed) =====
function shuffleBoard() {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return;
    }
    const hasClaimedCells = board.some(row => row.some(cell => cell === 'team1' || cell === 'team2'));
    if (hasClaimedCells || currentRoundWinner === 'team1' || currentRoundWinner === 'team2') {
        showGameToast('لا يمكن خلط الخلايا بعد منح أول خلية.', true);
        return;
    }
    const unclaimed = [];
    const letters = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (!board[r][c]) {
                unclaimed.push([r, c]);
                letters.push(cellLetters[r][c]);
            }
        }
    }
    shuffleArray(letters);
    unclaimed.forEach(([r, c], i) => {
        cellLetters[r][c] = letters[i];
    });
    renderBoard();
    cancelSelect();
    saveGameState();
}

// ===== Init Board =====
function initBoard() {
    board = [];
    cellLetters = [];
    const letters = [...ARABIC_LETTERS];
    shuffleArray(letters);
    let idx = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        board[r] = [];
        cellLetters[r] = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            board[r][c] = 0;
            cellLetters[r][c] = letters[idx % letters.length];
            idx++;
        }
    }
}

// ===== Render Board =====
function renderBoard() {
    const container = document.getElementById('boardContainer');
    container.innerHTML = '';

    const hexW = getHexSize();
    const hexH = hexW * 1.1547;
    const horizStep = hexW;
    const vertStep  = hexH * 0.75;
    const rowOffsetX = hexW / 2;

    const totalW = (BOARD_SIZE - 1) * horizStep + hexW + rowOffsetX;
    const totalH = (BOARD_SIZE - 1) * vertStep  + hexH;

    container.style.width  = totalW + 'px';
    container.style.height = totalH + 'px';
    container.style.setProperty('--hex-size', hexW + 'px');

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const x = c * horizStep + (r % 2 === 1 ? rowOffsetX : 0);
            const y = r * vertStep;

            const cell = document.createElement('div');
            cell.className = 'hex-cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.style.left = x + 'px';
            cell.style.top  = y + 'px';
            cell.style.width  = hexW + 'px';
            cell.style.height = hexH + 'px';

            const border = document.createElement('div');
            border.className = 'hex-border';

            const shape = document.createElement('div');
            shape.className = 'hex-shape';
            // Keep every hexagon at its assigned size while hovering.
            cell.style.setProperty('transform', 'none', 'important');
            cell.style.setProperty('transition', 'none', 'important');
            shape.style.setProperty('transform', 'none', 'important');
            shape.style.setProperty('transition', 'none', 'important');
            shape.style.setProperty('animation', 'none', 'important');

            const letter = document.createElement('span');
            letter.className = 'hex-letter';
            letter.textContent = cellLetters[r][c];

            shape.appendChild(letter);
            cell.appendChild(border);
            cell.appendChild(shape);

            if (board[r][c]) {
                cell.classList.add('team-' + board[r][c]);
            }

            cell.addEventListener('click', () => onHexClick(r, c, cell));
            container.appendChild(cell);
        }
    }
}

// ===== Hex Click =====
function onHexClick(row, col, cellEl) {
    if (isBoardEditingLocked()) {
        showGameToast('اختيار الخلايا من جوال المقدم فقط', true);
        return;
    }

    // If clicking an already claimed cell -> Unclaim it immediately
    if (board[row][col] !== 0) {
        selectedCell = { row, col, el: cellEl };
        unclaimCell();
        return;
    }

    // Toggle Selection for empty cells
    if (selectedCell && selectedCell.el === cellEl) {
        cancelSelect();
        return;
    }

    if (selectedCell) {
        selectedCell.el.classList.remove('selected');
    }

    cellEl.classList.add('selected');
    selectedCell = { row, col, el: cellEl };
    
    // Pulse the sidebar to show it's ready for assignment
    updateSidebarReady(true);
    
    // Unlock buzzers for everyone silently when a new unclaimed letter is chosen
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock(false);
    if (typeof setSharedTimer === 'function') setSharedTimer('idle').catch(() => {});
    
    // Show question panel in AI presenter mode
    if (teamSetup.presenter === 'ai') {
        const targetedLetter = cellLetters[row][col];
        showQuestionPanel(targetedLetter, cellEl);
    } else {
        closeQuestionPanel();
        prepareHumanPresenterQuestion(cellLetters[row][col]).catch(console.error);
    }
    publishLiveGameState().catch(() => {});
}

// ===== Unclaim Cell =====
function unclaimCell() {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return;
    }
    if (!selectedCell) return;
    
    const { row, col, el } = selectedCell;
    const currentTeam = board[row][col];
    
    // Only play delete sound and adjust score if it was actually claimed
    if (currentTeam !== 0) {
        if (teamSetup.sound === 'on') {
            const delAudio = document.getElementById('deleteSound');
            if (delAudio) {
                delAudio.currentTime = 0;
                delAudio.play().catch(err => console.log('Delete sound prevented', err));
            }
        }
        
        // Remove from current team
        el.classList.remove('team-' + currentTeam, 'claimed');
        if (scores[currentTeam] > 0) scores[currentTeam]--;
        
        board[row][col] = 0;
        updateScoreBoard();
        saveGameState();
        publishLiveGameState().catch(() => {});
    }
    
    stopTimer();
    el.classList.remove('selected');
    selectedCell = null;
    updateSidebarReady(false);
    clearActiveQuestion();
    
    // Unlock buzzers if we are connected
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock();
}

// ===== Assign Team =====
function assignTeam(team) {
    if (isBoardEditingLocked()) {
        showGameToast('منح النقاط من جوال المقدم فقط', true);
        return;
    }
    if (!selectedCell) return;
    
    // Play correct answer sound
    if (teamSetup.sound === 'on') {
        const corrAudio = document.getElementById('correctSound');
        if (corrAudio) {
            corrAudio.currentTime = 0;
            corrAudio.play().catch(err => console.log('Correct sound prevented', err));
        }
    }
    
    stopTimer();
    
    const { row, col, el } = selectedCell;
    const awardedAnswer = document.getElementById('sqAnswerText')?.textContent?.trim() || '';

    el.classList.remove('selected');
    el.classList.add('team-' + team);
    board[row][col] = team;
    scores[team] = Number(scores[team] || 0) + 1;
    teamSetup[team].score = roundWins[team];
    updateScoreBoard();
    saveGameState();

    // Unlock buzzers when a team is officially assigned
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock();

    selectedCell = null;
    updateSidebarReady(false);
    clearActiveQuestion();
    if (awardedAnswer) showAudienceAnswerOverlay(awardedAnswer);

    // Check win for this team
    if (checkWin(team)) {
        highlightWinPath(team);
        setTimeout(() => showRoundWin(team), 600);
        return;
    }

    // A full board without a connected path has no winner.  Keep the round in
    // place and let the presenter reset the cells instead of auto-advancing.
    if (isBoardFull()) {
        setTimeout(handleRoundEnd, 500);
    }
    publishLiveGameState().catch(() => {});
}

// ===== Cancel =====
function cancelSelect() {
    stopTimer();
    if (selectedCell) {
        selectedCell.el.classList.remove('selected');
        selectedCell = null;
    }
    updateSidebarReady(false);
    publishLiveGameState().catch(() => {});
}

// تحديث حالة الاستعداد في القائمة الجانبية (الوميض)
function updateSidebarReady(isReady) {
    document.querySelectorAll('.score-box, .gv-score-card').forEach(box => {
        box.classList.toggle('ready', isReady);
    });
}

// ===== Hex Neighbors (pointy-top, row-offset grid) =====
// Even rows: normal x,  odd rows: shifted right by half hex
function getNeighbors(r, c) {
    const odd = (r % 2 === 1);
    return [
        [r,     c - 1],
        [r,     c + 1],
        [r - 1, odd ? c     : c - 1],
        [r - 1, odd ? c + 1 : c    ],
        [r + 1, odd ? c     : c - 1],
        [r + 1, odd ? c + 1 : c    ],
    ].filter(([nr, nc]) =>
        nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE
    );
}

// ===== BFS Win Check =====
// team1 wins: col 0 → col BOARD_SIZE-1  (left edge to right edge)
// team2 wins: row 0 → row BOARD_SIZE-1  (top edge to bottom edge)
function checkWin(team) {
    const visited = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(false));
    const queue = [];

    if (team === 'team1') {
        // Start from left column (col 0)
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (board[r][0] === team) {
                queue.push([r, 0]);
                visited[r][0] = true;
            }
        }
        while (queue.length > 0) {
            const [r, c] = queue.shift();
            if (c === BOARD_SIZE - 1) return true; // reached right column
            for (const [nr, nc] of getNeighbors(r, c)) {
                if (!visited[nr][nc] && board[nr][nc] === team) {
                    visited[nr][nc] = true;
                    queue.push([nr, nc]);
                }
            }
        }
    } else {
        // Start from top row (row 0)
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[0][c] === team) {
                queue.push([0, c]);
                visited[0][c] = true;
            }
        }
        while (queue.length > 0) {
            const [r, c] = queue.shift();
            if (r === BOARD_SIZE - 1) return true; // reached bottom row
            for (const [nr, nc] of getNeighbors(r, c)) {
                if (!visited[nr][nc] && board[nr][nc] === team) {
                    visited[nr][nc] = true;
                    queue.push([nr, nc]);
                }
            }
        }
    }
    return false;
}

// ===== Highlight Winning Path =====
function highlightWinPath(team) {
    const visited = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(false));
    const parent  = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(null));
    const queue = [];

    if (team === 'team1') {
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (board[r][0] === team) { queue.push([r, 0]); visited[r][0] = true; }
        }
    } else {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[0][c] === team) { queue.push([0, c]); visited[0][c] = true; }
        }
    }

    let goal = null;
    while (queue.length > 0) {
        const [r, c] = queue.shift();
        if ((team === 'team1' && c === BOARD_SIZE - 1) ||
            (team === 'team2' && r === BOARD_SIZE - 1)) {
            goal = [r, c]; break;
        }
        for (const [nr, nc] of getNeighbors(r, c)) {
            if (!visited[nr][nc] && board[nr][nc] === team) {
                visited[nr][nc] = true;
                parent[nr][nc] = [r, c];
                queue.push([nr, nc]);
            }
        }
    }

    if (goal) {
        let [r, c] = goal;
        while (r !== null && c !== null) {
            const el = document.querySelector(`.hex-cell[data-row="${r}"][data-col="${c}"]`);
            if (el) el.classList.add('win-path');
            const p = parent[r][c];
            if (!p) break;
            [r, c] = p;
        }
    }
}

// ===== Show Round Win (one team connected!) =====
function showRoundWin(team) {
    if (team !== 'team1' && team !== 'team2') return;
    if (currentRoundWinner === team) return;
    currentRoundWinner = team;
    roundWins[team] = Number(roundWins[team] || 0) + 1;
    teamSetup[team].score = roundWins[team];
    updateScoreBoard();
    saveGameState();
    const roundLeader = getBestConnectedPlayer();
    publishLiveGameState({
        status: 'roundEnd',
        roundWinner: team,
        roundLeader: roundLeader ? {
            name: roundLeader.name,
            team: roundLeader.team,
            correctAnswers: Number(roundLeader.correctAnswers || 0)
        } : null
    }).catch(() => {});

    const t = team === 'team1' ? teamSetup.team1 : teamSetup.team2;
    const c = COLOR_MAP[t.color];
    
    const isLastRound = teamSetup.currentRound >= teamSetup.totalRounds;
    const btnText = isLastRound ? '🏆 النتيجة النهائية' : '➡️ الجولة التالية';
    const btnAction = isLastRound ? 'showFinalFromRound()' : 'nextRound()';
    const safeTeamName = String(t.name).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
    const safeLeaderName = roundLeader ? String(roundLeader.name).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]) : '';

    const html = `
        <div id="roundWinOverlay" class="transition-screen round-win-overlay">
            <div class="hex-bg-pattern"></div>
            <section class="round-win-card animate-pop-in" style="--winner-color:${c.bg};">
                <div class="round-win-trophy" aria-hidden="true">🏆</div>
                <div class="round-win-kicker">الفائز بالجولة</div>
                <h2 class="round-win-name">${safeTeamName}</h2>
                <p class="round-win-note">اكتمل مسار الفريق في هذه الجولة</p>
                ${roundLeader ? `<p class="round-win-note">⭐ الأكثر إجابات صحيحة: ${safeLeaderName} (${Number(roundLeader.correctAnswers || 0)})</p>` : ''}
                <button class="round-win-next" onclick="${btnAction}">${btnText}</button>
            </section>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function nextRound() {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return;
    }
    if (currentRoundWinner !== 'team1' && currentRoundWinner !== 'team2') {
        showGameToast('لا يمكن بدء جولة جديدة قبل إعلان فائز بالجولة الحالية.', true);
        return;
    }
    if (teamSetup.currentRound >= teamSetup.totalRounds) {
        showFinalFromRound();
        return;
    }
    const overlay = document.getElementById('roundWinOverlay');
    if (overlay) overlay.remove();
    teamSetup.currentRound++;
    scores = { team1: 0, team2: 0 };
    currentRoundWinner = '';
    teamSetup.team1.score = roundWins.team1;
    teamSetup.team2.score = roundWins.team2;
    updateRoundDisplay();
    initBoard();
    renderBoard();
    cancelSelect();
    clearActiveQuestion();
    saveGameState();
    publishLiveGameState({ status: 'playing' }).catch(() => {});
}

function showFinalFromRound() {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return;
    }
    const overlay = document.getElementById('roundWinOverlay');
    if (overlay) overlay.remove();
    showFinalResult();
}

// ===== Board Full Check =====
function isBoardFull() {
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (!board[r][c]) return false;
    return true;
}

// ===== Handle Round End =====
function handleRoundEnd() {
    if (currentRoundWinner) return;
    showGameToast('اكتملت الخلايا — لا يوجد فائز بعد. استخدم «تصفير الخلايا» من جوال المقدم.', true);
    publishLiveGameState({ status: 'playing', boardFull: true }).catch(() => {});
}

// Clear only the ownership of the cells.  Round wins, team names, settings,
// and the current round remain untouched so the presenter can continue the
// same match after a board with no connected winner.
function resetCells() {
    if (isBoardEditingLocked()) {
        showEditingLockedNotice();
        return false;
    }
    stopTimer();
    clearBuzzerLock(false);
    board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    selectedCell = null;
    scores = { team1: 0, team2: 0 };
    currentRoundWinner = '';
    teamSetup.team1.score = roundWins.team1;
    teamSetup.team2.score = roundWins.team2;
    renderBoard();
    updateSidebarReady(false);
    updateScoreBoard();
    clearActiveQuestion({ publish: false });
    saveGameState();
    publishLiveGameState({ status: 'playing', roundWinner: null, boardFull: false, cellsResetAt: Date.now() }).catch(() => {});
    showGameToast('تم تصفير الخلايا — نتيجة الجولات لم تتغير.', true);
    return true;
}

// ===== Final Result =====
function showFinalResult() {
    const s1 = Number(roundWins.team1) || 0;
    const s2 = Number(roundWins.team2) || 0;
    const n1 = teamSetup.team1.name;
    const n2 = teamSetup.team2.name;
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];

    const safeName = value => String(value).replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
    const safeN1 = safeName(n1);
    const safeN2 = safeName(n2);
    const isDraw = s1 === s2;
    const winnerName = s1 > s2 ? safeN1 : safeN2;
    const title = isDraw ? 'تعادل جميل!' : `مبروك ${winnerName}!`;
    const subtitle = isDraw ? 'تعادل في عدد الجولات' : 'الفائز بعدد الجولات';
    recordCompletedSession();
    const bestPlayer = getBestConnectedPlayer();
    publishLiveGameState({
        status: 'finished',
        bestPlayer: bestPlayer ? {
            name: bestPlayer.name,
            team: bestPlayer.team,
            correctAnswers: Number(bestPlayer.correctAnswers || 0)
        } : null
    }).catch(() => {});
    const safeBestPlayerName = bestPlayer ? safeName(bestPlayer.name) : '';

    const html = `
        <div id="gameOverOverlay" class="game-over-overlay" role="dialog" aria-modal="true" aria-label="النتيجة النهائية">
        <div class="game-over-card">
            <div class="game-over-icon" aria-hidden="true">🏆</div>
            <div class="game-over-kicker">النتيجة النهائية</div>
            <div class="game-over-title">${title}</div>
            <div class="game-over-subtitle">${subtitle}</div>
            ${bestPlayer ? `<div class="game-over-subtitle">⭐ أفضل لاعب: ${safeBestPlayerName} — ${Number(bestPlayer.correctAnswers || 0)} إجابات صحيحة</div>` : ''}

            <div class="game-over-scores">
                <div class="game-over-team ${s1 > s2 ? 'is-winner' : ''}" style="--team-color:${c1.bg};--team-text:${c1.text};">
                    <div class="game-over-team-name">${safeN1}</div>
                    <div class="game-over-team-score">${s1}</div>
                </div>
                <div class="game-over-team ${s2 > s1 ? 'is-winner' : ''}" style="--team-color:${c2.bg};--team-text:${c2.text};">
                    <div class="game-over-team-name">${safeN2}</div>
                    <div class="game-over-team-score">${s2}</div>
                </div>
            </div>

            <button class="game-over-new-btn" onclick="clearSavedGameState(); location.reload()">
                <span aria-hidden="true">↻</span>
                لعبة جديدة
            </button>
        </div></div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

// ===== Hex Size =====
function getHexSize() {
    const boardHost = document.querySelector('.board-wrap');
    const mainArea = document.querySelector('.main-area');
    const host = boardHost || mainArea;
    const rect = host ? host.getBoundingClientRect() : {
        width: window.innerWidth,
        height: window.innerHeight
    };
    const hostStyle = host ? window.getComputedStyle(host) : null;
    const padX = hostStyle
        ? parseFloat(hostStyle.paddingLeft) + parseFloat(hostStyle.paddingRight)
        : 0;
    const padY = hostStyle
        ? parseFloat(hostStyle.paddingTop) + parseFloat(hostStyle.paddingBottom)
        : 0;

    // Extra room keeps the 8px hex borders and hover scale fully visible.
    const edgeSafety = 20;
    const availW = Math.max(0, rect.width - padX - edgeSafety);
    const availH = Math.max(0, rect.height - padY - edgeSafety);

    // Five columns plus the half-cell offset used by alternating rows.
    const wFactor = BOARD_SIZE + 0.5;
    const hFactor = ((BOARD_SIZE - 1) * 0.75 + 1) * 1.1547;
    const maxByW = availW / wFactor;
    const maxByH = availH / hFactor;
    let size = Math.max(32, Math.min(maxByW, maxByH, 190)) * 0.95;
    
    // The base calculation already fits all five rows and columns inside the
    // available viewport. Presentation mode applies only a tiny CSS emphasis;
    // adding another fixed multiplier here caused clipping in fullscreen.
    return size;
}

let boardResizeFrame = null;
window.addEventListener('resize', () => {
    if (!board || board.length === 0) return;
    if (boardResizeFrame) cancelAnimationFrame(boardResizeFrame);
    boardResizeFrame = requestAnimationFrame(() => {
        boardResizeFrame = null;
        renderBoard();
    });
});

function generateBuzzerCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// ── Firebase Buzzer (بدون Railway - 100% Vercel) ─────────────────────────────
let _fbApp   = null;
let _fbDb    = null;
let _fbUnsubscribe = null;
let _liveCommandUnsubscribe = null;
let _liveTimerUnsubscribe = null;
let _livePlayersUnsubscribe = null;
let _livePresenterUnsubscribe = null;
let _liveServerOffsetUnsubscribe = null;
let _liveServerOffset = 0;
let _liveTimerRenderInterval = null;
let _liveTimerAdvanceKey = '';
let _lastPresenterCommandId = '';
let _lastDisplayedBuzzKey = '';
let _presenterAccessUrl = '';
let _livePlayers = {};
let _livePresenterConnected = false;
let _presenterCommandInProgress = false;
const PRESENTER_LINK_TTL_MS = 15 * 60 * 1000;

async function ensureFirebase() {
    if (_fbDb) return _fbDb;
    const { initializeApp, getApps }  = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getDatabase }    = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const FB_CONFIG = {
        apiKey: "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A",
        authDomain: "buzzer-game-f2983.firebaseapp.com",
        databaseURL: "https://buzzer-game-f2983-default-rtdb.firebaseio.com",
        projectId: "buzzer-game-f2983",
        storageBucket: "buzzer-game-f2983.firebasestorage.app",
        messagingSenderId: "125573747954",
        appId: "1:125573747954:web:8dac68183e6e326b8b2c6b"
    };
    _fbApp = getApps().length === 0 ? initializeApp(FB_CONFIG) : getApps()[0];
    _fbDb  = getDatabase(_fbApp);
    return _fbDb;
}

function createSecureToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashSecureToken(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function getPresenterToken(forceNew = false) {
    if (!buzzerRoom) return '';
    const key = `hojas_presenter_token_${buzzerRoom}`;
    let token = forceNew ? '' : sessionStorage.getItem(key);
    if (!token) {
        token = createSecureToken();
        sessionStorage.setItem(key, token);
    }
    return token;
}

function getCurrentQuestionState() {
    const isPrivatePresenterMode = teamSetup.presenter === 'human';
    return {
        letter: window.currentRequestedLetter || '',
        text: isPrivatePresenterMode ? '' : (document.getElementById('sqQuestion')?.textContent || ''),
        answer: isPrivatePresenterMode ? '' : (document.getElementById('sqAnswerText')?.textContent || ''),
        revealed: isPrivatePresenterMode ? false : document.getElementById('sqAnswer')?.style.display !== 'none'
    };
}

// Keep the complete question in a presenter-only Firebase node. Players
// receive the public game state above, which intentionally omits question
// text and answers while a human presenter is active.
async function publishPresenterQuestion(overrides = null) {
    if (!buzzerRoom || !gameIsActive || teamSetup.presenter !== 'human') return;
    try {
        const db = await ensureFirebase();
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        const current = overrides || {
            letter: window.currentRequestedLetter || '',
            text: document.getElementById('sqQuestion')?.textContent || '',
            answer: document.getElementById('sqAnswerText')?.textContent || '',
            revealed: document.getElementById('sqAnswer')?.style.display !== 'none',
            selectedCell: selectedCell ? { row: selectedCell.row, col: selectedCell.col } : null
        };
        await update(ref(db, `rooms/${buzzerRoom}/presenterQuestion`), {
            letter: current.letter || '',
            text: current.text || '',
            answer: current.answer || '',
            revealed: Boolean(current.revealed),
            selectedCell: current.selectedCell || null,
            updatedAt: Date.now()
        });
    } catch (error) {
        console.warn('تعذر مزامنة سؤال المقدم الخاص', error);
    }
}

function buildLiveGameState(extra = {}) {
    return {
        board,
        cellLetters,
        selectedCell: selectedCell ? { row: selectedCell.row, col: selectedCell.col } : null,
        question: getCurrentQuestionState(),
        scores: { ...scores },
        roundWins: { ...roundWins },
        roundWinner: currentRoundWinner || null,
        round: teamSetup.currentRound,
        totalRounds: teamSetup.totalRounds,
        competitionName: teamSetup.competitionName,
        team1: { ...teamSetup.team1 },
        team2: { ...teamSetup.team2 },
        settings: { answerSeconds: teamSetup.ansTime, otherTeamSeconds: teamSetup.otherTime },
        status: 'playing',
        updatedAt: Date.now(),
        ...extra
    };
}

async function publishLiveGameState(extra = {}) {
    if (!buzzerRoom || !gameIsActive) return;
    try {
        const db = await ensureFirebase();
        const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        await update(ref(db, `rooms/${buzzerRoom}/game`), buildLiveGameState(extra));
    } catch (error) {
        console.warn('تعذر مزامنة شاشة الجمهور', error);
    }
}

async function syncLiveSetupNames() {
    if (!buzzerRoom || !gameIsActive) return;
    const db = await ensureFirebase();
    const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    await update(ref(db, 'rooms/' + buzzerRoom), {
        competitionName: teamSetup.competitionName,
        team1Name: teamSetup.team1.name,
        team2Name: teamSetup.team2.name,
        team1Color: teamSetup.team1.color,
        team2Color: teamSetup.team2.color
    });
    await publishLiveGameState();
}

async function renderPresenterAccess(forceNew = false) {
    if (!buzzerRoom) return;
    const token = getPresenterToken(forceNew);
    const tokenHash = await hashSecureToken(token);
    const db = await ensureFirebase();
    const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const basePath = isLocalGameRuntime()
        ? (location.pathname.includes('/public/') ? '../pages/presenter.html' : 'pages/presenter.html')
        : '/7roof/presenter';
    _presenterAccessUrl = new URL(basePath, location.href).href +
        `?room=${encodeURIComponent(buzzerRoom)}&token=${encodeURIComponent(token)}`;

    await update(ref(db, `rooms/${buzzerRoom}`), {
        presenterTokenHash: tokenHash,
        presenterAccessCreatedAt: Date.now(),
        presenterTokenExpiresAt: Date.now() + PRESENTER_LINK_TTL_MS,
        team1Name: teamSetup.team1.name,
        team2Name: teamSetup.team2.name
    });

    const qrBox = document.getElementById('modalPresenterQrcodeBox');
    if (qrBox) {
        qrBox.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrBox, {
                text: _presenterAccessUrl,
                width: 156,
                height: 156,
                colorDark: '#16052d',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
            const generatedImage = qrBox.querySelector('img');
            if (generatedImage) generatedImage.alt = 'باركود دخول المقدم';
        } else {
            const img = document.createElement('img');
            img.alt = 'باركود دخول المقدم';
            img.src = `https://quickchart.io/qr?text=${encodeURIComponent(_presenterAccessUrl)}&size=160&margin=1`;
            qrBox.appendChild(img);
        }
    }
}

async function openPresenterAccessModal() {
    if (!buzzerRoom) {
        showGameToast('ابدأ الجلسة أولًا لإنشاء باركود المقدم', true);
        return;
    }
    const modal = document.getElementById('presenterShareModal');
    const roomCode = document.getElementById('presenterModalRoomCode');
    if (roomCode) roomCode.textContent = buzzerRoom;
    if (modal) modal.style.display = 'flex';
    try {
        await renderPresenterAccess(true);
    } catch (error) {
        console.error(error);
        showGameToast('تعذر إنشاء باركود المقدم', true);
    }
}

function closePresenterAccessModal() {
    safeSetDisplay('presenterShareModal', 'none');
}

let questionSuggestionMode = 'choice';

function selectSuggestionMode(mode = 'choice') {
    questionSuggestionMode = ['question', 'suggestion'].includes(mode) ? mode : 'choice';
    const choices = document.getElementById('questionSuggestionChoices');
    const questionPanel = document.getElementById('suggestionQuestionPanel');
    const proposalPanel = document.getElementById('suggestionProposalPanel');
    const back = document.getElementById('questionSuggestionBack');
    const submit = document.getElementById('questionSuggestionSubmit');
    const title = document.getElementById('questionSuggestionTitle');
    const intro = document.getElementById('questionSuggestionIntro');
    if (choices) choices.hidden = questionSuggestionMode !== 'choice';
    if (questionPanel) questionPanel.hidden = questionSuggestionMode !== 'question';
    if (proposalPanel) proposalPanel.hidden = questionSuggestionMode !== 'suggestion';
    if (back) back.hidden = questionSuggestionMode === 'choice';
    if (submit) {
        submit.hidden = questionSuggestionMode === 'choice';
        submit.textContent = questionSuggestionMode === 'suggestion' ? 'إرسال الاقتراح للمراجعة' : 'إرسال السؤال للمراجعة';
    }
    if (title) title.textContent = questionSuggestionMode === 'question' ? 'أرسل سؤالًا جديدًا' : questionSuggestionMode === 'suggestion' ? 'أرسل اقتراحًا' : 'أسئلة المتابعين';
    if (intro) intro.textContent = questionSuggestionMode === 'question'
        ? 'أضف سؤالًا وإجابته والحرف، وسيراجعه المشرف قبل دخوله بنك اللعبة.'
        : questionSuggestionMode === 'suggestion'
            ? 'شارك فكرة أو بلّغ عن مشكلة، وسيتابعها المشرف.'
            : 'اختر ما تريد إرساله، وستصل مشاركتك إلى الأدمن للمراجعة.';
    const questionFields = ['suggestionLetter', 'suggestionQuestion', 'suggestionAnswer'];
    questionFields.forEach(id => { const field = document.getElementById(id); if (field) field.required = questionSuggestionMode === 'question'; });
    const proposalText = document.getElementById('proposalText');
    if (proposalText) proposalText.required = questionSuggestionMode === 'suggestion';
    const status = document.getElementById('questionSuggestionStatus');
    if (status) status.textContent = '';
}

function openQuestionSuggestionModal() {
    const modal = document.getElementById('questionSuggestionModal');
    if (!modal) return;
    document.getElementById('questionSuggestionForm')?.reset();
    selectSuggestionMode('choice');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
}

function closeQuestionSuggestionModal() {
    const modal = document.getElementById('questionSuggestionModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

async function submitQuestionSuggestion(event) {
    event.preventDefault();
    const form = document.getElementById('questionSuggestionForm');
    const submit = document.getElementById('questionSuggestionSubmit');
    const status = document.getElementById('questionSuggestionStatus');
    if (questionSuggestionMode === 'choice') return;
    submit.disabled = true;
    if (status) status.textContent = 'جاري الإرسال للمراجعة...';
    try {
        if (!window.QuestionLibrary) throw new Error('question-library-unavailable');
        if (questionSuggestionMode === 'question') {
            const name = document.getElementById('suggestionName')?.value.trim() || 'متابع';
            const letter = document.getElementById('suggestionLetter')?.value.trim().slice(0, 2) || '';
            const question = document.getElementById('suggestionQuestion')?.value.trim() || '';
            const answer = document.getElementById('suggestionAnswer')?.value.trim() || '';
            if (!letter || question.length < 8 || !answer || !window.QuestionLibrary.answerMatchesLetter(answer, letter)) {
                throw new Error('letter-mismatch');
            }
            await window.QuestionLibrary.submitQuestion({
                name, letter, question, answer,
                category: document.getElementById('suggestionCategory')?.value.trim(),
                difficulty: document.getElementById('suggestionDifficulty')?.value
            });
        } else {
            const text = document.getElementById('proposalText')?.value.trim() || '';
            if (text.length < 5) throw new Error('proposal-too-short');
            await window.QuestionLibrary.submitSuggestion({
                name: document.getElementById('proposalName')?.value.trim(),
                category: document.getElementById('proposalType')?.value,
                title: document.getElementById('proposalTitle')?.value.trim(),
                text
            });
        }
        form.reset();
        if (status) status.textContent = questionSuggestionMode === 'question' ? 'تم إرسال السؤال للمراجعة، شكرًا لك!' : 'تم إرسال اقتراحك للمراجعة، شكرًا لك!';
        setTimeout(() => closeQuestionSuggestionModal(), 1400);
    } catch (error) {
        console.error(error);
        if (status) status.textContent = error.message === 'letter-mismatch' ? 'تأكد أن الإجابة تبدأ بالحرف المحدد.' : error.message === 'proposal-too-short' ? 'اكتب الاقتراح بتفاصيل أكثر.' : 'تعذر الإرسال الآن، حاول مرة أخرى.';
    } finally {
        submit.disabled = false;
    }
}

function openPresenterDirectly() {
    if (_presenterAccessUrl) window.open(_presenterAccessUrl, '_blank', 'noopener');
}

async function setSharedTimer(phase, team = '', durationSeconds = 0) {
    if (!buzzerRoom) return;
    const db = await ensureFirebase();
    const { ref, update, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    await update(ref(db, `rooms/${buzzerRoom}/timer`), {
        phase,
        team,
        durationMs: Math.max(0, Number(durationSeconds) || 0) * 1000,
        startedAt: serverTimestamp(),
        questionId: `${teamSetup.currentRound}-${window.currentRequestedLetter || ''}-${Date.now()}`
    });
}

function displaySharedTimer(timer) {
    clearInterval(_liveTimerRenderInterval);
    const display = document.getElementById('timerDisplay');
    const teamSpan = document.getElementById('timerTeam');
    const secSpan = document.getElementById('timerSeconds');
    if (!display || !timer || timer.phase === 'idle') {
        if (display) display.style.display = 'none';
        document.getElementById('buzzerLockOverlay')?.remove();
        return;
    }
    display.style.display = 'flex';
    if (timer.phase === 'open') {
        teamSpan.textContent = 'مفتوح للجميع بالجرس';
        secSpan.textContent = '🔔';
        display.classList.remove('danger');
        document.getElementById('buzzerLockOverlay')?.remove();
        return;
    }
    const render = () => {
        const elapsed = Date.now() + _liveServerOffset - Number(timer.startedAt || Date.now());
        const remaining = Math.max(0, Math.ceil((Number(timer.durationMs || 0) - elapsed) / 1000));
        teamSpan.textContent = `وقت ${teamSetup[timer.team]?.name || ''}:`;
        secSpan.textContent = remaining;
        display.classList.toggle('danger', remaining <= 3);
        syncBuzzerOverlayWithSharedTimer(timer, remaining);
        if (remaining <= 0) {
            clearInterval(_liveTimerRenderInterval);
            advanceSharedTimer(timer);
        }
    };
    render();
    _liveTimerRenderInterval = setInterval(render, 250);
}

function syncBuzzerOverlayWithSharedTimer(timer, remaining) {
    if (!timer || (timer.phase !== 'first' && timer.phase !== 'second')) return;

    const teamObj = timer.team === 'team2' ? teamSetup.team2 : teamSetup.team1;
    let overlay = document.getElementById('buzzerLockOverlay');
    const needsSecondChanceView = timer.phase === 'second' && overlay?.dataset.timerPhase !== 'second';

    if (!overlay || needsSecondChanceView) {
        showBuzzerOverlay(
            timer.phase === 'second' ? (teamObj?.name || '') : 'الفريق الأسرع',
            timer.team,
            timer.phase,
            remaining
        );
        overlay = document.getElementById('buzzerLockOverlay');
    }

    if (overlay) overlay.dataset.timerPhase = timer.phase;
    updateBuzzerOverlayTimer(teamObj?.name || '', remaining, timer.phase);
}

async function advanceSharedTimer(timer) {
    if (!buzzerRoom || !timer) return;
    const timerKey = `${timer.phase}|${timer.team || ''}|${timer.startedAt || ''}|${timer.questionId || ''}`;
    if (_liveTimerAdvanceKey === timerKey) return;
    _liveTimerAdvanceKey = timerKey;
    try {
        const db = await ensureFirebase();
        const { ref, get, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        const fresh = (await get(ref(db, `rooms/${buzzerRoom}/timer`))).val();
        const freshKey = fresh ? `${fresh.phase}|${fresh.team || ''}|${fresh.startedAt || ''}|${fresh.questionId || ''}` : '';
        if (!fresh || freshKey !== timerKey) return;
        if (fresh.phase === 'first') {
            const otherTeam = fresh.team === 'team1' ? 'team2' : 'team1';
            await setSharedTimer('second', otherTeam, teamSetup.otherTime);
            return;
        }
        if (fresh.phase === 'second') {
            isBuzzerLocked = false;
            document.getElementById('buzzerLockOverlay')?.remove();
            await update(ref(db, `rooms/${buzzerRoom}`), { locked: false, buzzer: null });
            await setSharedTimer('open', '', 0);
        }
    } catch (error) {
        _liveTimerAdvanceKey = '';
        throw error;
    }
}

function getBestConnectedPlayer() {
    const players = Object.values(_livePlayers || {});
    if (!players.length) return null;
    return players.sort((a, b) => Number(b.correctAnswers || 0) - Number(a.correctAnswers || 0))[0] || null;
}

async function executePresenterCommand(command) {
    if (!command || command.id === _lastPresenterCommandId) return;
    _lastPresenterCommandId = command.id;
    const payload = command.payload || {};
    _presenterCommandInProgress = true;
    try {
    if (command.type === 'setPresenterMode') {
        // Opening the presenter page is the authoritative switch to human
        // presentation for this room. Audience clicks stay read-only.
        setGamePresenter('human');
        saveGameState();
        await publishPresenterQuestion({ letter: '', text: '', answer: '', revealed: false, selectedCell: null });
        await publishLiveGameState();
    } else if (command.type === 'selectCell') {
        const row = Number(payload.row);
        const col = Number(payload.col);
        const cell = document.querySelector(`.hex-cell[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            onHexClick(row, col, cell);
        }
    } else if (command.type === 'nextRound') {
        if (currentRoundWinner !== 'team1' && currentRoundWinner !== 'team2') {
            showGameToast('لا يمكن بدء جولة جديدة قبل إعلان فائز بالجولة الحالية.', true);
        } else if (teamSetup.currentRound < teamSetup.totalRounds) nextRound();
        else showFinalFromRound();
    } else if (command.type === 'newQuestion') {
        showRandomQuestion(payload.letter || window.currentRequestedLetter);
        await clearBuzzerLock(false);
        await setSharedTimer('idle');
    } else if (command.type === 'revealAnswer') {
        revealAnswer();
    } else if (command.type === 'awardPoint') {
        if (selectedCell && (payload.team === 'team1' || payload.team === 'team2')) {
            assignTeam(payload.team);
            if (payload.playerId) {
                const db = await ensureFirebase();
                const { ref, runTransaction } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
                await runTransaction(ref(db, `rooms/${buzzerRoom}/players/${payload.playerId}/correctAnswers`),
                    current => Number(current || 0) + 1);
            }
            await setSharedTimer('idle');
        }
    } else if (command.type === 'awardTeam1' || command.type === 'awardTeam2') {
        const team = command.type === 'awardTeam1' ? 'team1' : 'team2';
        if (selectedCell) {
            assignTeam(team);
            await setSharedTimer('idle');
        }
    } else if (command.type === 'resetCells') {
        resetCells();
    } else if (command.type === 'wrongAnswer') {
        const db = await ensureFirebase();
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        const timer = (await get(ref(db, `rooms/${buzzerRoom}/timer`))).val();
        if (timer?.phase === 'open') {
            await clearBuzzerLock(false);
            await setSharedTimer('open');
        } else {
            await advanceSharedTimer(timer || { phase: 'first', team: payload.team || 'team1' });
        }
    } else if (command.type === 'skipQuestion') {
        cancelSelect();
        closeQuestionPanel();
        await clearBuzzerLock(false);
        await setSharedTimer('idle');
    } else if (command.type === 'reopenBuzzer') {
        await clearBuzzerLock(false);
        await setSharedTimer('open');
    } else if (command.type === 'shuffleBoard') {
        shuffleBoard();
        await clearBuzzerLock(false);
        await setSharedTimer('idle');
    } else if (command.type === 'timerExpired') {
        const db = await ensureFirebase();
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        const timer = (await get(ref(db, `rooms/${buzzerRoom}/timer`))).val();
        if (timer?.phase === 'first' || timer?.phase === 'second') await advanceSharedTimer(timer);
    } else if (command.type === 'updateSettings') {
        teamSetup.ansTime = Math.max(2, Math.min(30, Number(payload.answerSeconds) || 3));
        teamSetup.otherTime = Math.max(5, Math.min(60, Number(payload.otherTeamSeconds) || 10));
        saveGameState();
    }
    } finally {
        _presenterCommandInProgress = false;
    }
    await publishLiveGameState();
}

async function setupLiveGameSession() {
    if (!buzzerRoom || !gameIsActive) return;
    const db = await ensureFirebase();
    const { ref, update, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    await update(ref(db, `rooms/${buzzerRoom}`), {
        openedAt: Date.now(),
        competitionName: teamSetup.competitionName,
        team1Name: teamSetup.team1.name,
        team2Name: teamSetup.team2.name,
        team1Color: teamSetup.team1.color,
        team2Color: teamSetup.team2.color,
        locked: false,
        game: buildLiveGameState()
    });
    if (_liveCommandUnsubscribe) _liveCommandUnsubscribe();
    if (_liveTimerUnsubscribe) _liveTimerUnsubscribe();
    if (_livePlayersUnsubscribe) _livePlayersUnsubscribe();
    if (_livePresenterUnsubscribe) _livePresenterUnsubscribe();
    if (_liveServerOffsetUnsubscribe) _liveServerOffsetUnsubscribe();
    _liveCommandUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/presenterCommand`), snap => {
        executePresenterCommand(snap.val()).catch(console.error);
    });
    _liveTimerUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/timer`), snap => displaySharedTimer(snap.val()));
    if (_fbUnsubscribe) _fbUnsubscribe();
    _fbUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/buzzer`), snap => {
        handleLiveBuzzer(snap.val()).catch(console.error);
    });
    _livePlayersUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/players`), snap => {
        _livePlayers = snap.val() || {};
    });
    _livePresenterUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/presenter`), snap => {
        const presenter = snap.val();
        _livePresenterConnected = Boolean(
            presenter?.connected &&
            Date.now() - Number(presenter.lastSeen || 0) < 45000
        );
    });
    _liveServerOffsetUnsubscribe = onValue(ref(db, '.info/serverTimeOffset'), snap => {
        _liveServerOffset = Number(snap.val() || 0);
    });
    await renderPresenterAccess();
}

function openBuzzerModal() {
    safeSetDisplay('buzzerShareModal', 'flex');
    try {
        const menu = document.getElementById('gameDropdown');
        if (menu) menu.style.display = 'none';
        if (!buzzerRoom) buzzerRoom = generateBuzzerCode();
        const t1 = encodeURIComponent(teamSetup.team1.name);
        const t2 = encodeURIComponent(teamSetup.team2.name);
        // Runtime safety: Force local origin if Railway or Github is still present
        if (!teamSetup.buzzerServerUrl || teamSetup.buzzerServerUrl.includes('railway.app') ||
            teamSetup.buzzerServerUrl.includes('rakaga66.github.io') ||
            (!isLocalGameRuntime() && teamSetup.buzzerServerUrl.includes('/buzzer-server-qaf'))) {
            console.warn('⚠️ Correcting buzzer URL at runtime to local origin:', teamSetup.buzzerServerUrl);
            teamSetup.buzzerServerUrl = getNormalBuzzerUrl();
        }
        
        const url = `${teamSetup.buzzerServerUrl}/?room=${buzzerRoom}&team1=${t1}&team2=${t2}`;
        console.log('🔔 Generating QR for URL:', url);

        const codeTxt = document.getElementById('modalBuzzerCodeTxt');
        if (codeTxt) {
            codeTxt.textContent = buzzerRoom;
            codeTxt.onclick = () => {
                showGameConfirm({
                    title: 'إنشاء كود جديد؟',
                    message: 'سيتم استبدال كود الجرس الحالي بكود جديد.',
                    confirmText: 'إنشاء كود',
                    icon: '#',
                    onConfirm: () => {
                        buzzerRoom = generateBuzzerCode();
                        openBuzzerModal();
                    }
                });
            };
        }

        // Update direct link button
        const directBtn = document.getElementById('modalDirectLinkBtn');
        if (directBtn) {
            directBtn.onclick = () => window.open(url, '_blank');
        }

        const qrBox = document.getElementById('modalQrcodeBox');
        if (qrBox) {
            qrBox.innerHTML = '';
            const encoded = encodeURIComponent(url);
            const img = document.createElement('img');
            img.alt = 'QR Code';
            img.style.cssText = 'width:136px;height:136px;border-radius:8px;display:block;';
            // Primary: quickchart.io (fast & reliable)
            img.src = `https://quickchart.io/qr?text=${encoded}&size=140&margin=1`;
            // Fallback: api.qrserver.com
            img.onerror = function() {
                this.onerror = null;
                this.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=4&data=${encoded}`;
            };
            qrBox.appendChild(img);
        }

        // Initialize Firebase and listen for buzzes
        ensureFirebase().then(async (db) => {
            const { ref, update, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

            // Create/reset room in Firebase with team names
            await update(ref(db, `rooms/${buzzerRoom}`), {
                locked: false, buzzer: null, openedAt: Date.now(),
                team1Name: (teamSetup.team1 && teamSetup.team1.name) ? teamSetup.team1.name : 'الفريق الأول',
                team2Name: (teamSetup.team2 && teamSetup.team2.name) ? teamSetup.team2.name : 'الفريق الثاني'
            });
            await renderPresenterAccess();

            // Stop old listener if any
            if (_fbUnsubscribe) { _fbUnsubscribe(); _fbUnsubscribe = null; }

            // Listen for first buzz
            _fbUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/buzzer`), (snap) => {
                handleLiveBuzzer(snap.val()).catch(console.error);
            });
        }).catch(err => console.error('Firebase host error:', err));
    } catch(e) { console.error('Buzzer Modal error', e); }
}

// فتح رابط الجرس مباشرة
function openBuzzerDirectly() {
    if (!buzzerRoom) buzzerRoom = generateBuzzerCode();
    const t1 = (teamSetup.team1 && teamSetup.team1.name) ? encodeURIComponent(teamSetup.team1.name) : '';
    const t2 = (teamSetup.team2 && teamSetup.team2.name) ? encodeURIComponent(teamSetup.team2.name) : '';
    // Runtime safety
    if (!teamSetup.buzzerServerUrl || teamSetup.buzzerServerUrl.includes('railway.app') ||
        teamSetup.buzzerServerUrl.includes('rakaga66.github.io') ||
        (!isLocalGameRuntime() && teamSetup.buzzerServerUrl.includes('/buzzer-server-qaf'))) {
        teamSetup.buzzerServerUrl = getNormalBuzzerUrl();
    }
    window.open(`${teamSetup.buzzerServerUrl}/?room=${buzzerRoom}&team1=${t1}&team2=${t2}`, '_blank');
}

async function handleLiveBuzzer(data) {
    if (!data) {
        _lastDisplayedBuzzKey = '';
        return;
    }
    const buzzKey = `${data.questionId || ''}|${data.id || ''}|${data.time || ''}`;
    if (_lastDisplayedBuzzKey === buzzKey) return;
    _lastDisplayedBuzzKey = buzzKey;
    isBuzzerLocked = true;
    playBuzzerSound();
    showGameToast(`⚡ ${data.name} ضغط أولاً!`);
    showBuzzerOverlay(data.name, data.team, 'first', teamSetup.ansTime);
    const db = await ensureFirebase();
    const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    const timer = (await get(ref(db, `rooms/${buzzerRoom}/timer`))).val();
    if (!timer || timer.phase === 'idle' || timer.phase === 'open') {
        await setSharedTimer('first', data.team, teamSetup.ansTime);
    }
}

// The question portal was removed; questions are controlled from the presenter page.
// عداد تنازلي مرئي مرتبط بفريق معين
function startBuzzerCountdown(team, seconds, isSecondChance = false) {
    clearInterval(buzzerTimerInterval);
    buzzerTimeLeft = seconds;

    const teamObj = team === 'team1' ? teamSetup.team1 : teamSetup.team2;
    updateBuzzerOverlayTimer(teamObj ? teamObj.name : '', buzzerTimeLeft);

    buzzerTimerInterval = setInterval(async () => {
        buzzerTimeLeft--;
        if (teamObj) updateBuzzerOverlayTimer(teamObj.name, buzzerTimeLeft);

        if (buzzerTimeLeft <= 0) {
            clearInterval(buzzerTimerInterval);
            if (isSecondChance) {
                // Final → فتح الجرس
                clearBuzzerLock();
            } else {
                // فرصة الفريق الثاني
                const nextTeam = team === 'team1' ? 'team2' : 'team1';
                const nextTeamObj = nextTeam === 'team1' ? teamSetup.team1 : teamSetup.team2;
                showBuzzerOverlay(nextTeamObj ? nextTeamObj.name : '', nextTeam);
                startBuzzerCountdown(nextTeam, teamSetup.otherTime, true);
            }
        }
    }, 1000);
}

function updateBuzzerOverlayTimer(teamName, timeLeft, phase = 'first') {
    const secondsEl = document.getElementById('buzzerOverlaySeconds');
    const labelEl = document.getElementById('buzzerOverlayTimerLabel');
    const teamEl = document.getElementById('buzzerOverlayTeam');
    if (secondsEl) {
        secondsEl.textContent = Math.max(0, Number(timeLeft) || 0);
        secondsEl.style.color = timeLeft <= 3 ? '#ff5a5a' : '#ffd600';
    }
    if (labelEl) {
        labelEl.textContent = phase === 'second'
            ? `وقت إجابة ${teamName}`
            : 'الوقت المتبقي للإجابة';
    }
    if (teamEl && phase === 'second') {
        teamEl.textContent = 'انتقلت فرصة الإجابة إلى الفريق الآخر';
    }
}

function showBuzzerOverlay(name, teamId, phase = 'first', initialSeconds = 0) {
    clearInterval(buzzerTimerInterval);
    const teamObj = teamId === 'team1' ? teamSetup.team1 : teamSetup.team2;
    const color = (teamObj && COLOR_MAP[teamObj.color]) ? COLOR_MAP[teamObj.color] : { bg: '#FF9800' };
    const isSecondChance = phase === 'second';
    const kicker = isSecondChance ? '⏱ فرصة الفريق الآخر' : '⚡ أسرع ضغطة ⚡';
    const displayName = isSecondChance ? (teamObj ? teamObj.name : name) : name;
    const teamLine = isSecondChance
        ? 'انتقلت فرصة الإجابة إلى الفريق الآخر'
        : (teamObj ? teamObj.name : '');

    const old = document.getElementById('buzzerLockOverlay');
    if (old) old.remove();

    const html = `
        <div id="buzzerLockOverlay" style="
            position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 999999;
            background: linear-gradient(145deg, ${color.bg} 0%, #1a0b2e 100%);
            padding: 22px 36px; border-radius: 16px;
            text-align: center;
            border: 2px solid rgba(255,214,0,0.55);
            border-bottom: 5px solid rgba(255,214,0,0.55);
            box-shadow: 0 16px 40px rgba(0,0,0,0.7), 0 0 30px rgba(255,214,0,0.12);
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            animation: buzzerPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
            width: max-content; max-width: min(400px, 90vw); min-width: 260px;
        ">
            <style>
                @keyframes buzzerPop {
                    0%   { transform: translate(-50%, -40px) scale(0.85); opacity: 0; }
                    100% { transform: translate(-50%, 0)     scale(1);    opacity: 1; }
                }
            </style>
            <div style="font-size:0.82rem; color:rgba(255,214,0,0.8); font-weight:900; letter-spacing:2px; text-transform:uppercase;">${kicker}</div>
            <div style="font-family:'HrofFont','Cairo',sans-serif; font-size:clamp(2.6rem,7vw,3.8rem); color:#fff; line-height:1.05; text-shadow:0 4px 12px rgba(0,0,0,0.5);">${displayName}</div>
            <div id="buzzerOverlayTeam" style="font-size:1rem; color:rgba(255,255,255,0.75); font-weight:700;">${teamLine}</div>
            <div id="buzzerOverlayTimer" style="
                min-width:170px; background:rgba(0,0,0,0.35); padding:8px 20px 6px;
                border-radius:8px; border:1px solid rgba(255,214,0,0.25);
                margin: 6px 0;
            ">
                <div id="buzzerOverlayTimerLabel" style="font-size:.72rem; color:rgba(255,255,255,.7); margin-bottom:2px;">الوقت المتبقي للإجابة</div>
                <div style="display:flex; align-items:baseline; justify-content:center; gap:5px;">
                    <span id="buzzerOverlaySeconds" style="font-family:'HrofFont','Cairo',sans-serif; font-size:2.35rem; line-height:1; color:#FFD600;">${initialSeconds}</span>
                    <small style="font-size:.72rem; color:rgba(255,255,255,.68);">ثانية</small>
                </div>
            </div>
            <button onclick="clearBuzzerLock()" style="
                margin-top:8px; padding:12px 30px; border:none; border-radius:10px;
                background:#FFD600; color:#1a1a1a; font-weight:900; font-size:1rem;
                cursor:pointer; font-family:'HrofFont','Cairo',sans-serif;
                box-shadow: 0 5px 0 rgba(150,85,0,0.55), 0 8px 18px rgba(0,0,0,0.3);
                transition: transform 0.1s, box-shadow 0.1s;
            "
            onmousedown="this.style.transform='translateY(4px)';this.style.boxShadow='0 1px 0 rgba(150,85,0,0.55),0 3px 8px rgba(0,0,0,0.2)'"
            onmouseup="this.style.transform='';this.style.boxShadow='0 5px 0 rgba(150,85,0,0.55),0 8px 18px rgba(0,0,0,0.3)'"
            onmouseleave="this.style.transform='';this.style.boxShadow='0 5px 0 rgba(150,85,0,0.55),0 8px 18px rgba(0,0,0,0.3)'">
               ✅ فتح الجرس مجدداً
            </button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('buzzerLockOverlay');
    if (overlay) overlay.dataset.timerPhase = phase;
    updateBuzzerOverlayTimer(teamObj ? teamObj.name : '', initialSeconds, phase);
}

function clearBuzzerLock(showToast = true) {
    isBuzzerLocked = false;
    buzzerFirstTeam = null;
    clearInterval(buzzerTimerInterval);
    const old = document.getElementById('buzzerLockOverlay');
    if (old) old.remove();

    // Reset Firebase room (فتح الجرس لجميع اللاعبين)
    if (buzzerRoom) {
        ensureFirebase().then(async (db) => {
            const { ref, update, remove } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
            update(ref(db, `rooms/${buzzerRoom}`), {
                locked: false,
                buzzer: null,
                timer: { phase: 'open', team: '', durationMs: 0, startedAt: Date.now() }
            });
            remove(ref(db, `rooms/${buzzerRoom}/buzzQueue`));
        });
    }
    if (showToast) showGameToast('الجرس متاح للجميع! 🔔', true);
}

// ==========================================
// ===== GAME PRESENTATION MODE =============
// ==========================================
function togglePresentationMode(forceState) {
    const isModeActive = typeof forceState === 'boolean' ? forceState : !document.body.classList.contains('presentation-mode');
    
    if (isModeActive) {
        document.body.classList.add('presentation-mode');
        syncGameViewUI();
    } else {
        document.body.classList.remove('presentation-mode');
    }
    
    // Refresh board layout logic if needed (enlarging hexes)
    renderBoard();
    saveGameState();
}

function syncGameViewUI() {
    // Sync Competition Title (Stacked 3D Logo)
    const logoCont = document.getElementById('gvCompLogo');
    if (logoCont) {
        let compName = teamSetup.competitionName || 'هوجاس';
        // Remove "حروف مع" if user already included it to avoid duplication in the 3D logo
        let cleanName = compName.replace(/حروف\s*مع\s*/g, '').trim();
        
        logoCont.innerHTML = `
            <div class="gv-logo-line gv-logo-line1">حروف</div>
            <div class="gv-logo-line gv-logo-line2">مـع</div>
            <div class="gv-logo-line gv-logo-line3">${cleanName}</div>
        `;
    }
    
    // Sync Round Text (Multicolor Split)
    const roundTxt = document.getElementById('gvRoundText');
    if (roundTxt) {
        const roundWord = ROUND_WORDS[teamSetup.currentRound - 1] || 'الأولى';
        roundTxt.innerHTML = `
            <span class="gv-word-1">الجولة</span>
            <span class="gv-word-2">${roundWord}</span>
        `;
    }
    
    // Sync Scores & Team Names
    const n1 = document.getElementById('gvTeam1Name');
    const s1 = document.getElementById('gvTeam1Score');
    const n2 = document.getElementById('gvTeam2Name');
    const s2 = document.getElementById('gvTeam2Score');
    
    if (n1) n1.textContent = teamSetup.team1.name;
    if (s1) s1.textContent = roundWins.team1;
    if (n2) n2.textContent = teamSetup.team2.name;
    if (s2) s2.textContent = roundWins.team2;
}

// Add Keyboard Shortcut (Escape to exit)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('presentation-mode')) {
        togglePresentationMode(false);
    }
});

// Update score sync when score changes
function updateScoreBoard() {
    // Original sideboard scores
    const s1 = document.getElementById('score1');
    const s2 = document.getElementById('score2');
    if (s1) s1.textContent = roundWins.team1;
    if (s2) s2.textContent = roundWins.team2;
    
    // Sync to Presentation Mode UI
    syncGameViewUI();
}
