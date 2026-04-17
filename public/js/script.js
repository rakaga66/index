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

// ===== Game State =====
let board = [];
let cellLetters = [];
let selectedCell = null;
let scores = { team1: 0, team2: 0 };

// Setup choices
let teamSetup = {
    competitionName: 'هوجاس',
    team1: { name: 'الفريق الأول', color: 'purple' },
    team2: { name: 'الفريق الثاني', color: 'orange' },
    totalRounds: 3,
    currentRound: 1,
    ansTime: 3,
    otherTime: 10,
    presenter: 'ai',
    sound: 'on',
    buzzerServerUrl: 'https://7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app/'
};

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

// ===== Dark Mode =====
function applyDarkMode(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    // تحديث الزر العائم
    const btn = document.getElementById('darkModeToggleBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    
    // مزامنة الزر في الإعدادات
    const themeGroup = document.getElementById('setThemeGroup');
    if (themeGroup) {
        themeGroup.querySelectorAll('.toggle-btn').forEach(b => {
            b.classList.toggle('selected', b.dataset.value === (isDark ? 'dark' : 'light'));
        });
    }
    
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function toggleDarkMode() {
    const isDark = !document.body.classList.contains('dark-mode');
    applyDarkMode(isDark);
}

// ===== Questions System =====
let questionsBank = [];   // Array of { q: string, a: string, letterMatch: string }
let currentQIndex = -1;
let questionsLoaded = false;

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
            questionsBank = data.map(item => ({
                q: item.question || item.q || "",
                a: item.answer || item.a || "",
                letterMatch: item.letter ? item.letter.replace(/[أإآ]/g, 'ا') : 'عام'
            }));
            questionsLoaded = true;
            console.log(`✅ Bank Ready: ${questionsBank.length} questions`);
        }
        if (loadingEl) loadingEl.style.display = 'none';
    } catch (err) {
        console.error('❌ Data Load Error:', err);
    }
}

function showQuestionPanel(letter, cellEl) {
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
    let normalizedTarget = targetLetter.replace(/[أإآ]/g, 'ا');
    
    let filteredQs = questionsBank.filter(q => {
        if (!normalizedTarget) return true;
        return q.letterMatch && q.letterMatch.includes(normalizedTarget);
    });
    
    if (filteredQs.length === 0) filteredQs = questionsBank;
    
    const qChosen = filteredQs[Math.floor(Math.random() * filteredQs.length)];
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
}

function revealAnswer() {
    safeSetDisplay('sqAnswer', 'block');
    safeSetDisplay('sqRevealBtn', 'none');
}

function nextQuestion() {
    showRandomQuestion();
}

function closeQuestionPanel() {
    safeSetDisplay('sidebarQuestion', 'none');
}

// ===== Screen Navigation =====
window.addEventListener('DOMContentLoaded', () => {
    // تطبيق الثيم المحفوظ
    const savedTheme = localStorage.getItem('theme');
    applyDarkMode(savedTheme === 'dark');
    
    initSettingsUI();
    setGamePresenter(teamSetup.presenter);
    
    // Load saved buzzer URL from localStorage if it exists
    let savedBuzzerUrl = localStorage.getItem('buzzerServerUrl');
    
    // Aggressive Migration: If the saved URL is empty, old Railway, or a different Vercel link, force the new specific link
    const isOldRailway = savedBuzzerUrl && savedBuzzerUrl.includes('railway.app');
    const isDifferentBuzzer = savedBuzzerUrl && (savedBuzzerUrl.includes('vercel.app') || savedBuzzerUrl.includes('7roof-buzzer')) && !savedBuzzerUrl.includes('7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app');
    
    if (isOldRailway || isDifferentBuzzer) {
        console.log('🔄 Forced migration of buzzer server URL to the specific Vercel link...');
        savedBuzzerUrl = 'https://7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app/';
        localStorage.setItem('buzzerServerUrl', savedBuzzerUrl);
    }

    if (savedBuzzerUrl) {
        teamSetup.buzzerServerUrl = savedBuzzerUrl;
        const input = document.getElementById('setBuzzerUrl');
        if (input) input.value = savedBuzzerUrl;
    }
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
    const homeScreen = document.getElementById('homeScreen');
    const isInGame = homeScreen && homeScreen.style.display === 'none';
    settingsCalledFromGame = isInGame;

    syncSettingsUI();

    if (!isInGame) {
        homeScreen.style.display = 'none';
    }
    document.getElementById('settingsScreen').style.display = 'flex';
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
}

function saveSettings() {
    const cName = document.getElementById('setCompName').value.trim();
    if(cName) teamSetup.competitionName = cName;
    
    const t1Name = document.getElementById('setTeam1Name').value.trim();
    if(t1Name) teamSetup.team1.name = t1Name;
    
    const t2Name = document.getElementById('setTeam2Name').value.trim();
    if(t2Name) teamSetup.team2.name = t2Name;

    const bUrl = document.getElementById('setBuzzerUrl').value.trim();
    teamSetup.buzzerServerUrl = bUrl;
    localStorage.setItem('buzzerServerUrl', bUrl);

    // تطبيق التغييرات فوراً إذا كانت اللعبة شغالة
    if (settingsCalledFromGame) {
        if (typeof updateSidebar === 'function') updateSidebar();
        if (typeof applyTeamColors === 'function') applyTeamColors();
        // إغلاق الإعدادات والرجوع للعبة مباشرة
        document.getElementById('settingsScreen').style.display = 'none';
    } else {
        showHome();
    }
}

function startGame() {
    document.getElementById('homeScreen').style.display = 'none';
    
    // Reset buzzer session for a unique code per game
    buzzerRoom = null;
    if (buzzerSocket) {
        buzzerSocket.disconnect();
        buzzerSocket = null;
    }
    
    
    teamSetup.currentRound = 1;
    scores = { team1: 0, team2: 0 };
    
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
    setGamePresenter(teamSetup.presenter);
    
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

function setGamePresenter(type) {
    teamSetup.presenter = type;
    
    // Update sidebar buttons
    const btnAi = document.getElementById('ptBtnAi');
    const btnHuman = document.getElementById('ptBtnHuman');
    if (btnAi) btnAi.classList.toggle('active', type === 'ai');
    if (btnHuman) btnHuman.classList.toggle('active', type === 'human');
    
    // إظهار/إخفاء منطقة بوابة الأسئلة للمقدم البشري
    const portalArea = document.getElementById('humanPortalArea');
    if (portalArea) portalArea.style.display = (type === 'human') ? 'block' : 'none';
    
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

    // If panel is already open, refresh its position/style
    const panel = document.getElementById('sidebarQuestion');
    if (panel && panel.style.display !== 'none') {
        const letter = window.currentRequestedLetter;
        showQuestionPanel(letter);
    }
}

function resetGameGrid() {
    if (confirm('هل أنت متأكد من بدء لعبة جديدة؟')) {
        startGame();
        document.getElementById('gameDropdown').style.display = 'none';
    }
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

function toggleGameSound() {
    const isMuted = (teamSetup.sound === 'off');
    teamSetup.sound = isMuted ? 'on' : 'off';
    
    const btn = document.getElementById('gdMuteBtn');
    if (teamSetup.sound === 'on') {
        btn.innerHTML = '<span>إيقاف الصوت</span> 🔊';
    } else {
        btn.innerHTML = '<span>تشغيل الصوت</span> 🔇';
    }
    
    // Sync with main settings screen
    const mainSettingsGroups = document.querySelectorAll('#setSoundGroup .toggle-btn');
    mainSettingsGroups.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === teamSetup.sound);
    });
}

// ===== Settings Init =====
function initSettingsUI() {
    // Live update competition name in all logos
    const compNameInput = document.getElementById('setCompName');
    if (compNameInput) {
        compNameInput.addEventListener('input', (e) => {
            const newName = e.target.value.trim() || 'هوجاس';
            teamSetup.competitionName = newName;
            document.querySelectorAll('.logo-line3').forEach(el => {
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
    
    teamSetup[key] = val;
    document.getElementById(key + 'Val').textContent = val;
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
    teamSetup.currentRound = 1;
    scores = { team1: 0, team2: 0 };

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
    document.getElementById('score1').textContent = scores.team1;
    document.getElementById('score2').textContent = scores.team2;
}

// ===== Round Display =====

// ===== Shuffle Board (only unclaimed) =====
function shuffleBoard() {
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
    
    cellEl.classList.add('selected');
    selectedCell = { row, col, el: cellEl };
    
    // Pulse the sidebar to show it's ready for assignment
    updateSidebarReady(true);
    
    // Unlock buzzers for everyone silently when a new unclaimed letter is chosen
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock(false);
    
    // Show question panel in AI presenter mode
    if (teamSetup.presenter === 'ai') {
        const targetedLetter = cellLetters[row][col];
        showQuestionPanel(targetedLetter, cellEl);
    }
}

// ===== Unclaim Cell =====
function unclaimCell() {
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
    }
    
    stopTimer();
    el.classList.remove('selected');
    selectedCell = null;
    updateSidebarReady(false);
    
    // Unlock buzzers if we are connected
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock();
}

// ===== Assign Team =====
function assignTeam(team) {
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

    el.classList.remove('selected');
    el.classList.add('team-' + team);
    board[row][col] = team;

    // Unlock buzzers when a team is officially assigned
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock();

    // Score incremented only on round win (not per cell)

    selectedCell = null;
    updateSidebarReady(false);

    // Check win for this team
    if (checkWin(team)) {
        highlightWinPath(team);
        setTimeout(() => showRoundWin(team), 600);
        return;
    }

    // Check if all cells claimed → next round
    if (isBoardFull()) {
        setTimeout(handleRoundEnd, 500);
    }
}

// ===== Cancel =====
function cancelSelect() {
    stopTimer();
    if (selectedCell) {
        selectedCell.el.classList.remove('selected');
        selectedCell = null;
    }
    updateSidebarReady(false);
}

// تحديث حالة الاستعداد في القائمة الجانبية (الوميض)
function updateSidebarReady(isReady) {
    document.querySelectorAll('.score-box').forEach(box => {
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
    // +1 point for winning this round
    if (teamSetup[team]) teamSetup[team].score = (teamSetup[team].score || 0) + 1;
    if (team === 'team1') document.getElementById('score1').textContent = teamSetup.team1.score || 0;
    else document.getElementById('score2').textContent = teamSetup.team2.score || 0;

    const t = team === 'team1' ? teamSetup.team1 : teamSetup.team2;
    const c = COLOR_MAP[t.color];
    
    const isLastRound = teamSetup.currentRound >= teamSetup.totalRounds;
    const btnText = isLastRound ? '🏆 النتيجة النهائية' : '➡️ الجولة التالية';
    const btnAction = isLastRound ? 'showFinalFromRound()' : 'nextRound()';

    const html = `
        <div id="roundWinOverlay" class="transition-screen" style="background: rgba(107, 63, 160, 0.85); z-index: 9998;">
            <div class="hex-bg-pattern"></div>
            <div class="ts-content animate-pop-in">
                <div class="ts-round">
                    <span class="ts-round-txt1" style="color: #EF4444; margin-bottom: 5px;">الفائز</span>
                    <span class="ts-round-txt2" style="color: #FFD600; margin-bottom: 10px;">بالجولة</span>
                    <span style="
                        font-family: 'Lalezar', sans-serif;
                        font-size: 9.5rem;
                        color: ${c.bg};
                        -webkit-text-stroke: 4px #000;
                        paint-order: stroke fill;
                        text-shadow: 3px 3px 0 #000, 6px 6px 0 #000, 9px 9px 0 #000, 12px 12px 0 rgba(0,0,0,0.3);
                        margin-bottom: 40px;
                        line-height: 1;
                    ">${t.name}</span>
                    
                    <button onclick="${btnAction}" style="
                        font-family: 'Cairo', sans-serif;
                        font-size: 1.6rem;
                        padding: 16px 32px;
                        border: none;
                        border-radius: 50px;
                        background: #fff;
                        color: #4A2570;
                        cursor: pointer;
                        font-weight: bold;
                        box-shadow: 0 8px 16px rgba(0,0,0,0.25);
                        transition: transform 0.2s;
                    " onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.3)';" 
                       onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.25)';">
                    ${btnText}
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function nextRound() {
    const overlay = document.getElementById('roundWinOverlay');
    if (overlay) overlay.remove();
    teamSetup.currentRound++;
    updateRoundDisplay();
    initBoard();
    renderBoard();
    cancelSelect();
}

function showFinalFromRound() {
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
    if (teamSetup.currentRound >= teamSetup.totalRounds) {
        // Game over
        showFinalResult();
    } else {
        teamSetup.currentRound++;
        updateRoundDisplay();
        initBoard();
        renderBoard();
        cancelSelect();
    }
}

// ===== Final Result =====
function showFinalResult() {
    const s1 = scores.team1;
    const s2 = scores.team2;
    const n1 = teamSetup.team1.name;
    const n2 = teamSetup.team2.name;
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];

    let msg = '';
    if (s1 > s2) msg = `🏆 مبروك ${n1}!`;
    else if (s2 > s1) msg = `🏆 مبروك ${n2}!`;
    else msg = '🤝 تعادل!';

    const html = `
        <div id="gameOverOverlay" style="
            position:fixed;inset:0;background:rgba(0,0,0,0.87);
            display:flex;align-items:center;justify-content:center;
            z-index:90000;direction:rtl;
        ">
        <div style="
            background:#1e0a3c;border:3px solid #FFD600;border-radius:28px;
            padding:48px 40px;text-align:center;max-width:420px;width:90%;
            box-shadow:0 0 60px rgba(255,214,0,0.3);
            animation:popIn 0.5s cubic-bezier(0.34,1.56,0.64,1);
        ">
            <div style="font-size:4rem;margin-bottom:12px;">🏅</div>
            <div style="font-family:'Lalezar',sans-serif;font-size:2rem;color:#FFD600;
                        -webkit-text-stroke:2px #000;margin-bottom:20px;">${msg}</div>
            
            <div style="display:flex;gap:20px;justify-content:center;margin-bottom:28px;">
                <div style="background:${c1.bg};border-radius:14px;padding:14px 22px;min-width:110px;">
                    <div style="font-size:0.9rem;color:${c1.text};font-weight:700;">${n1}</div>
                    <div style="font-family:'Lalezar',sans-serif;font-size:2.5rem;color:#FFD600;
                                -webkit-text-stroke:2px #000;">${s1}</div>
                </div>
                <div style="background:${c2.bg};border-radius:14px;padding:14px 22px;min-width:110px;">
                    <div style="font-size:0.9rem;color:${c2.text};font-weight:700;">${n2}</div>
                    <div style="font-family:'Lalezar',sans-serif;font-size:2.5rem;color:#FFD600;
                                -webkit-text-stroke:2px #000;">${s2}</div>
                </div>
            </div>
            
            <button onclick="location.reload()" style="
                font-family:'Lalezar',sans-serif;font-size:1.3rem;
                padding:14px 36px;border:none;border-radius:50px;
                background:#FFD600;color:#1a1a1a;cursor:pointer;
                box-shadow:0 6px 24px rgba(255,214,0,0.4);
                transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">🔄 لعبة جديدة</button>
        </div></div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

// ===== Hex Size =====
function getHexSize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sidebar = 300;
    const padH = 80;
    const availW = vw - sidebar;
    const availH = vh - padH;
    const wFactor = BOARD_SIZE - 0.5;
    const hFactor = ((BOARD_SIZE - 1) * 0.75 + 1) * 1.1547;
    const maxByW = availW / wFactor;
    const maxByH = availH / hFactor;
    let size = Math.max(60, Math.min(maxByW, maxByH, 180));
    
    // Enlarge by 25% if in presentation mode
    if (document.body.classList.contains('presentation-mode')) {
        return size * 1.25;
    }
    return size;
}

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

function openBuzzerModal() {
    safeSetDisplay('buzzerShareModal', 'flex');
    try {
        const menu = document.getElementById('gameDropdown');
        if (menu) menu.style.display = 'none';
        if (!buzzerRoom) buzzerRoom = generateBuzzerCode();
        const t1 = encodeURIComponent(teamSetup.team1.name);
        const t2 = encodeURIComponent(teamSetup.team2.name);
        // Runtime safety: Force specific Vercel if Railway or wrong URL is still present
        if (!teamSetup.buzzerServerUrl || teamSetup.buzzerServerUrl.includes('railway.app') || (teamSetup.buzzerServerUrl.includes('vercel.app') && !teamSetup.buzzerServerUrl.includes('7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app'))) {
            console.warn('⚠️ Correcting buzzer URL at runtime:', teamSetup.buzzerServerUrl);
            teamSetup.buzzerServerUrl = 'https://7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app/';
        }
        
        const url = `${teamSetup.buzzerServerUrl}/?room=${buzzerRoom}&team1=${t1}&team2=${t2}`;
        console.log('🔔 Generating QR for URL:', url);

        const codeTxt = document.getElementById('modalBuzzerCodeTxt');
        if (codeTxt) {
            codeTxt.textContent = buzzerRoom;
            codeTxt.onclick = () => { if (confirm('كود جديد؟')) { buzzerRoom = generateBuzzerCode(); openBuzzerModal(); } };
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
            const { ref, set, update, onValue } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');

            // Create/reset room in Firebase
            await set(ref(db, `rooms/${buzzerRoom}`), { locked: false, buzzer: null, openedAt: Date.now() });

            // Stop old listener if any
            if (_fbUnsubscribe) { _fbUnsubscribe(); _fbUnsubscribe = null; }

            // Listen for first buzz
            _fbUnsubscribe = onValue(ref(db, `rooms/${buzzerRoom}/buzzer`), (snap) => {
                const data = snap.val();
                if (!data || isBuzzerLocked) return;
                isBuzzerLocked = true;
                showGameToast(`⚡ ${data.name} ضغط أولاً!`);
                showBuzzerOverlay(data.name, data.team);
                startBuzzerCountdown(data.team, 3);
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
    if (!teamSetup.buzzerServerUrl || teamSetup.buzzerServerUrl.includes('railway.app') || (teamSetup.buzzerServerUrl.includes('vercel.app') && !teamSetup.buzzerServerUrl.includes('7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app'))) {
        teamSetup.buzzerServerUrl = 'https://7roof-buzzer-720tvp878-rakaga66s-projects.vercel.app/';
    }
    window.open(`${teamSetup.buzzerServerUrl}/?room=${buzzerRoom}&team1=${t1}&team2=${t2}`, '_blank');
}



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
                startBuzzerCountdown(nextTeam, 10, true);
            }
        }
    }, 1000);
}

function updateBuzzerOverlayTimer(teamName, timeLeft) {
    const el = document.getElementById('buzzerOverlayTimer');
    if (el) {
        el.textContent = `⏱ ${teamName}: ${timeLeft} ثانية`;
        el.style.color = timeLeft <= 3 ? '#FF4444' : '#FFD600';
    }
}

function showBuzzerOverlay(name, teamId) {
    clearInterval(buzzerTimerInterval);
    const teamObj = teamId === 'team1' ? teamSetup.team1 : teamSetup.team2;
    const color = (teamObj && COLOR_MAP[teamObj.color]) ? COLOR_MAP[teamObj.color] : { bg: '#6B3FA0' };

    const old = document.getElementById('buzzerLockOverlay');
    if (old) old.remove();

    const html = `
        <div id="buzzerLockOverlay" style="
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%); z-index: 999999;
            background: linear-gradient(135deg, ${color.bg}, #1a0b2e); 
            padding: 30px 60px; border-radius: 40px;
            text-align: center; border: 3px solid #FFD600;
            box-shadow: 0 30px 70px rgba(0,0,0,0.8), 0 0 40px rgba(255, 214, 0, 0.2);
            display: flex; flex-direction: column; align-items: center; gap: 10px;
            animation: buzzerPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            min-width: 320px;
        ">
            <style>
                @keyframes buzzerPop {
                    0% { transform: translate(-50%, -50px) scale(0.8); opacity: 0; }
                    100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
                }
            </style>
            <div style="font-size:1.1rem; color:#FFD600; font-weight:900; text-transform:uppercase; letter-spacing:2px;">⚡ أسرع ضغطة ⚡</div>
            <div style="font-family:'Lalezar', cursive; font-size:4rem; color:#fff; line-height:1; text-shadow:0 5px 15px rgba(0,0,0,0.5);">${name}</div>
            <div style="font-size:1.4rem; color:rgba(255,255,255,0.9); font-weight:700; margin-bottom:10px;">${teamObj ? teamObj.name : ''}</div>
            
            <div id="buzzerOverlayTimer" style="font-family:'Lalezar', cursive; font-size:2.5rem; color:#FFD600; background:rgba(0,0,0,0.3); padding:5px 25px; border-radius:20px; border:1px solid rgba(255,214,0,0.2);"></div>
            
            <button onclick="clearBuzzerLock()" style="
                margin-top:20px; padding:15px 40px; border:none; border-radius:50px;
                background:#fff; color:#1a1a1a; font-weight:900; font-size:1.2rem;
                cursor:pointer; box-shadow:0 8px 20px rgba(0,0,0,0.3);
                transition: all 0.2s;
            " onmouseover="this.style.transform='translateY(-3px)'; this.style.background='#FFD600'"
               onmouseout="this.style.transform='translateY(0)'; this.style.background='#fff'">
               ✅ فتح الجرس مجدداً
            </button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
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
            const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
            update(ref(db, `rooms/${buzzerRoom}`), { locked: false, buzzer: null });
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
        showGameToast('📟 تم تفعيل وضع العرض المباشر');
    } else {
        document.body.classList.remove('presentation-mode');
        showGameToast('📟 تم إيقاف وضع العرض المباشر');
    }
    
    // Refresh board layout logic if needed (enlarging hexes)
    renderBoard();
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
    if (s1) s1.textContent = scores.team1;
    if (n2) n2.textContent = teamSetup.team2.name;
    if (s2) s2.textContent = scores.team2;
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
    if (s1) s1.textContent = scores.team1;
    if (s2) s2.textContent = scores.team2;
    
    // Sync to Presentation Mode UI
    syncGameViewUI();
}

// Add CSS update for Hex Size calculation in Presentation Mode
const originalGetHexSize = getHexSize;
getHexSize = function() {
    let size = originalGetHexSize();
    if (document.body.classList.contains('presentation-mode')) {
        // Enlarge by 25% if in presentation mode
        return size * 1.25;
    }
    return size;
};



