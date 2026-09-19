import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getDatabase, ref, get, set, update, onValue, runTransaction, push,
    onDisconnect, serverTimestamp, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A",
    authDomain: "buzzer-game-f2983.firebaseapp.com",
    databaseURL: "https://buzzer-game-f2983-default-rtdb.firebaseio.com",
    projectId: "buzzer-game-f2983",
    storageBucket: "buzzer-game-f2983.firebasestorage.app",
    messagingSenderId: "125573747954",
    appId: "1:125573747954:web:8dac68183e6e326b8b2c6b"
};

const ROOM_ROOT = "onlineRooms";
const SESSION_KEY = "hojas_online_session_v1";
const MIN_PLAYERS = 4;
const ANSWER_SECONDS = 10;
const VOTE_SECONDS = 7;
const MAX_WAIT_MS = 5 * 60 * 1000;
const MAX_QUESTIONS = 10;
const STATES = Object.freeze({
    WAITING: "WAITING",
    QUESTION_ACTIVE: "QUESTION_ACTIVE",
    ANSWERING: "ANSWERING",
    VALIDATING: "VALIDATING",
    VOTING: "VOTING",
    ROUND_RESULT: "ROUND_RESULT",
    PAUSED: "PAUSED",
    FINISHED: "FINISHED"
});
const STATE_LABELS = {
    WAITING: "بانتظار البداية",
    QUESTION_ACTIVE: "السؤال مفتوح",
    ANSWERING: "وقت الإجابة",
    VALIDATING: "جاري التحقق",
    VOTING: "تصويت سريع",
    ROUND_RESULT: "نتيجة السؤال",
    PAUSED: "متوقفة مؤقتًا",
    FINISHED: "انتهت المباراة"
};
const FALLBACK_QUESTIONS = [
    { letter: "أ", question: "ما عاصمة المملكة العربية السعودية؟", answer: "الرياض" },
    { letter: "ب", question: "ما اسم أكبر محيط على سطح الأرض؟", answer: "المحيط الهادئ" },
    { letter: "ت", question: "ما اسم الكوكب المعروف بالكوكب الأحمر؟", answer: "المريخ" },
    { letter: "ج", question: "ما اسم الحيوان الذي يلقب بسفينة الصحراء؟", answer: "الجمل" }
];

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);
const baseQuestionBank = buildQuestionBank();
let questionBank = baseQuestionBank.slice();
let extraQuestionsLoaded = false;
let roomCode = "";
let myPlayerId = "";
let myName = "";
let currentRoom = null;
let serverOffset = 0;
let isFirebaseConnected = false;
let lastPing = null;
let roomUnsubscribe = null;
let chatUnsubscribe = null;
let connectionUnsubscribe = null;
let heartbeatTimer = null;
let clockTimer = null;
let pingTimer = null;
let toastTimer = null;
let lastValidationKey = "";
let lastRenderedQuestionId = "";
let previousPlayers = {};
let isBusy = false;

const $ = (id) => document.getElementById(id);
const roomPath = () => ROOM_ROOT + "/" + roomCode;
const roomRef = () => ref(db, roomPath());
const gameRef = () => ref(db, roomPath() + "/game");
const metaRef = () => ref(db, roomPath() + "/meta");
const playerRef = () => ref(db, roomPath() + "/players/" + myPlayerId);
const serverNow = () => Date.now() + serverOffset;

function buildQuestionBank() {
    const source = Array.isArray(window.questionsData) && window.questionsData.length ? window.questionsData : FALLBACK_QUESTIONS;
    return source.filter((item) => item && item.letter && item.question && item.answer).map((item, index) => ({
        id: String(item.id || "question-" + index),
        letter: String(item.letter).trim(),
        question: String(item.question).trim(),
        answer: String(item.answer).trim()
    }));
}

async function loadExtraQuestionBank() {
    if (extraQuestionsLoaded) return;
    extraQuestionsLoaded = true;
    try {
        if (!window.QuestionLibrary?.getActiveQuestions) return;
        const records = await window.QuestionLibrary.getActiveQuestions(true);
        const existing = new Set(baseQuestionBank.map(question => question.id));
        const extra = records.filter(item => item && item.question && item.answer)
            .map(item => ({
                id: `extra-${item.id}`,
                letter: String(item.letter || '').trim(),
                question: String(item.question).trim(),
                answer: String(item.answer).trim()
            }))
            .filter(item => item.letter && !existing.has(item.id));
        questionBank = baseQuestionBank.concat(extra);
    } catch (error) {
        extraQuestionsLoaded = false;
        console.warn('تعذر تحميل الأسئلة الإضافية للمباراة الأونلاين', error);
    }
}

function randomId() {
    // `crypto` is not guaranteed to be a lexical global in every browser
    // context (for example an embedded or non-secure preview). Reading it via
    // globalThis keeps room creation/joining from failing before Firebase is
    // even contacted.
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function randomRoomCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanName(value) {
    return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
}

function cleanCode(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
}

function showToast(message, isError = false) {
    const toast = $("onlineToast");
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.style.borderColor = isError ? "rgba(255,100,126,.52)" : "";
    toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

let onlineConfirmResolve = null;
let onlineConfirmReturnFocus = null;
function closeOnlineConfirm(accepted = false) {
    const modal = $("onlineConfirm");
    if (modal) { modal.hidden = true; modal.setAttribute("aria-hidden", "true"); }
    const resolve = onlineConfirmResolve;
    onlineConfirmResolve = null;
    if (onlineConfirmReturnFocus?.focus) onlineConfirmReturnFocus.focus();
    onlineConfirmReturnFocus = null;
    resolve?.(Boolean(accepted));
}
function showOnlineConfirm({ title, message, confirmText = "تأكيد" } = {}) {
    const modal = $("onlineConfirm");
    if (!modal) return Promise.resolve(false);
    if (onlineConfirmResolve) closeOnlineConfirm(false);
    $("onlineConfirmTitle").textContent = title || "تأكيد العملية";
    $("onlineConfirmMessage").textContent = message || "هل تريد المتابعة؟";
    $("onlineConfirmAccept").textContent = confirmText;
    onlineConfirmReturnFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
        onlineConfirmResolve = resolve;
        requestAnimationFrame(() => $("onlineConfirmCancel")?.focus());
    });
}

function setView(name) {
    ["onlineWelcome", "onlineLobby", "onlineGame", "onlineResults"].forEach((id) => {
        const node = $(id);
        if (node) node.hidden = id !== name;
    });
}

function saveSession() {
    if (!roomCode || !myPlayerId || !myName) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        roomCode: roomCode, playerId: myPlayerId, name: myName, savedAt: Date.now()
    }));
}

function readSession() {
    try {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        return session && session.roomCode && session.playerId && session.name ? session : null;
    } catch (_) {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// Do not let a normal join inherit a presenter id left in this browser's
// per-room storage.  The saved id is reusable only from the explicit resume
// action, which passes the matching session record.
function resolveJoinPlayerId(room, code, providedPlayerId = "") {
    const savedSession = readSession();
    const explicitResume = Boolean(
        providedPlayerId && savedSession?.roomCode === code && savedSession?.playerId === providedPlayerId
    );
    const storedPlayerId = localStorage.getItem("hojas_online_player_" + code) || "";
    const candidate = providedPlayerId || storedPlayerId;
    if (!candidate) return randomId();
    if (explicitResume) return candidate;
    if (candidate === room?.meta?.hostId) return randomId();
    return room?.players?.[candidate] ? candidate : randomId();
}

function playersArray(room) {
    const source = room || currentRoom;
    return Object.values(source && source.players || {}).filter((player) => player && player.id);
}

function connectedPlayers(room) {
    return playersArray(room).filter((player) => player.connected === true);
}

function getMyPlayer() {
    return currentRoom && currentRoom.players ? currentRoom.players[myPlayerId] : null;
}

function formatClock(value) {
    const date = Number(value) > 0 ? new Date(Number(value)) : new Date();
    return new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function normalizeAnswer(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[ًٌٍَُِّْـ]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/[ى]/g, "ي")
        .replace(/[ؤ]/g, "و")
        .replace(/[ئ]/g, "ي")
        .replace(/[^\u0621-\u063A\u0641-\u064A0-9]/g, "")
        .trim();
}

function questionById(id) {
    return questionBank.find((question) => question.id === String(id));
}

function chooseQuestion(used) {
    const usedMap = used || {};
    const available = questionBank.filter((question) => !usedMap[question.id]);
    const pool = available.length ? available : questionBank;
    return pool[Math.floor(Math.random() * pool.length)] || FALLBACK_QUESTIONS[0];
}

function makeQuestionState(question, round, used) {
    const nextUsed = Object.assign({}, used || {});
    nextUsed[question.id] = true;
    return {
        state: STATES.QUESTION_ACTIVE,
        round: round || 1,
        questionId: question.id,
        question: { id: question.id, letter: question.letter, text: question.question },
        usedQuestions: nextUsed,
        buzz: null,
        answer: null,
        votes: null,
        result: null,
        deadlineAt: 0,
        excludedPlayerIds: {},
        pausedPlayerId: "",
        pausedAt: 0,
        resumeState: ""
    };
}

function playerLabel(player) {
    return player && player.name ? player.name : "لاعب";
}

function isHost() {
    return Boolean(currentRoom && currentRoom.meta && currentRoom.meta.hostId === myPlayerId);
}

function canUseGame() {
    return Boolean(currentRoom && currentRoom.meta && currentRoom.meta.status === "PLAYING");
}

function getRemaining(game) {
    if (!game || !game.deadlineAt) return 0;
    return Math.max(0, Math.ceil((Number(game.deadlineAt) - serverNow()) / 1000));
}

function setConnectionBadge(kind, text) {
    const badge = $("connectionBadge");
    const label = $("connectionText");
    if (!badge || !label) return;
    badge.classList.remove("connection-badge--online", "connection-badge--weak", "connection-badge--offline");
    badge.classList.add("connection-badge--" + kind);
    label.textContent = text;
}

function bindConnectionState() {
    if (connectionUnsubscribe) connectionUnsubscribe();
    connectionUnsubscribe = onValue(ref(db, ".info/connected"), (snapshot) => {
        isFirebaseConnected = snapshot.val() === true;
        if (!isFirebaseConnected) {
            setConnectionBadge("offline", "انقطع الاتصال");
        } else if (lastPing !== null && lastPing > 250) {
            setConnectionBadge("weak", "اتصال ضعيف " + lastPing + "ms");
        } else {
            setConnectionBadge("online", lastPing === null ? "متصل" : "متصل " + lastPing + "ms");
        }
    });
}

async function measureConnection() {
    if (!isFirebaseConnected) return;
    const started = performance.now();
    try {
        const offsetSnapshot = await get(ref(db, ".info/serverTimeOffset"));
        const offset = Number(offsetSnapshot.val());
        if (Number.isFinite(offset)) serverOffset = offset;
        lastPing = Math.round(performance.now() - started);
        setConnectionBadge(lastPing > 250 ? "weak" : "online", lastPing > 250 ? "اتصال ضعيف " + lastPing + "ms" : "متصل " + lastPing + "ms");
        if (roomCode && myPlayerId) {
            await update(playerRef(), {
                connectionQuality: lastPing > 400 ? "weak" : lastPing > 250 ? "fair" : "good",
                latency: lastPing
            });
        }
    } catch (_) {}
}

function startNetworkMonitor() {
    clearInterval(pingTimer);
    measureConnection();
    pingTimer = setInterval(measureConnection, 12000);
}

function renderResumeSession() {
    const session = readSession();
    const card = $("resumeSessionCard");
    const text = $("resumeSessionText");
    if (!session || !card || !text) return;
    text.textContent = session.name + " • غرفة " + session.roomCode;
    card.hidden = false;
}

function renderPlayers(targetId) {
    const target = $(targetId);
    if (!target) return;
    const list = playersArray().sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0));
    if (!list.length) {
        target.innerHTML = '<div class="chat-empty">لا يوجد لاعبون بعد</div>';
        return;
    }
    target.innerHTML = list.map((player) => {
        const connected = player.connected === true;
        const quality = player.connectionQuality === "weak" || Number(player.latency) > 250 ? "اتصال ضعيف" : "متصل";
        const host = player.id === (currentRoom && currentRoom.meta && currentRoom.meta.hostId);
        return '<div class="player-row ' + (connected ? "is-connected " : "") + (player.id === myPlayerId ? "is-me " : "") + (host ? "is-host" : "") + '">' +
            '<span class="player-avatar">' + escapeHtml((player.name || "؟").slice(0, 1)) + '</span>' +
            '<div class="player-row__body"><strong>' + escapeHtml(playerLabel(player)) + (host ? ' <span class="host-crown">★</span>' : "") + '</strong>' +
            '<small>' + (player.id === myPlayerId ? "أنت • " : "") + (connected ? quality : "انقطع الاتصال") + '</small></div>' +
            '<span class="player-row__state">' + (connected ? "متصل" : "منقطع") + '</span></div>';
    }).join("");
}

function renderRanking(targetId) {
    const target = $(targetId);
    if (!target) return;
    const list = playersArray().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    target.innerHTML = list.length ? list.map((player, index) =>
        '<div class="ranking-row ' + (player.id === myPlayerId ? "is-me" : "") + '">' +
        '<span class="rank-number">' + (index + 1) + '</span>' +
        '<div class="ranking-row__body"><strong>' + escapeHtml(playerLabel(player)) + '</strong><small>' +
        (player.connected === true ? "متصل" : "منقطع") + (Number(player.latency) > 250 ? " • اتصال ضعيف" : "") +
        '</small></div><span class="rank-score">' + Number(player.score || 0) + '</span></div>'
    ).join("") : '<div class="chat-empty">لا يوجد ترتيب بعد</div>';
}

function renderChat(messages) {
    const containers = [$("lobbyChatMessages"), $("gameChatMessages")].filter(Boolean);
    const list = Object.values(messages || {}).filter(Boolean)
        .sort((a, b) => Number(a.createdAt || a.clientAt || 0) - Number(b.createdAt || b.clientAt || 0))
        .slice(-100);
    const html = list.length ? list.map((message) =>
        '<div class="chat-message ' + (message.playerId === myPlayerId ? "is-me" : "") + '">' +
        '<div class="chat-message__meta"><strong>' + escapeHtml(message.name || "لاعب") + '</strong><span>' +
        formatClock(message.createdAt || message.clientAt) + '</span></div><div class="chat-message__text">' +
        escapeHtml(message.text) + '</div></div>'
    ).join("") : '<div class="chat-empty">ابدأوا الحديث هنا</div>';
    containers.forEach((container) => {
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    });
}

function renderLobby() {
    const meta = currentRoom && currentRoom.meta || {};
    const list = playersArray();
    $("lobbyRoomCode").textContent = roomCode || "------";
    $("lobbyHostName").textContent = meta.hostName || "—";
    $("lobbyPlayerCount").textContent = String(list.length);
    $("lobbyStatusText").textContent = STATE_LABELS[meta.state] || STATE_LABELS.WAITING;
    $("lobbyPlayerHint").textContent = list.length < MIN_PLAYERS
        ? "نحتاج " + (MIN_PLAYERS - list.length) + " لاعبين"
        : (list.length % 2 ? "عدد فردي — يفضل إضافة لاعب" : "العدد مناسب");
    renderPlayers("lobbyPlayers");

    const hostControls = $("hostControls");
    const startButton = $("hostStartBtn");
    hostControls.hidden = !isHost();
    startButton.disabled = list.length < MIN_PLAYERS || meta.status !== "WAITING";

    const disconnected = list.filter((player) => player.connected !== true);
    const notice = $("lobbyNotice");
    if (disconnected.length) {
        notice.hidden = false;
        notice.textContent = "⚠️ " + disconnected.map(playerLabel).join("، ") + " غير متصل حاليًا.";
    } else if (list.length >= MIN_PLAYERS && list.length % 2) {
        notice.hidden = false;
        notice.textContent = "يفضل أن يكون عدد اللاعبين زوجيًا للحصول على أفضل تجربة لعب.";
    } else {
        notice.hidden = true;
    }
}

function renderDisconnectPanel() {
    const panel = $("disconnectPanel");
    const disconnected = playersArray().filter((player) => player.connected !== true);
    const game = currentRoom && currentRoom.game;
    if (!disconnected.length || !canUseGame() || !game || game.state === STATES.FINISHED) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    $("disconnectTitle").textContent = disconnected.length === 1 ? "انقطع لاعب" : "انقطع لاعبون";
    $("disconnectText").textContent = disconnected.map(playerLabel).join("، ") + " — يمكن لصاحب الغرفة الانتظار أو المتابعة.";
    $("hostDisconnectActions").hidden = !isHost() || game.state === STATES.PAUSED;
}

function renderGame() {
    const game = currentRoom && currentRoom.game || {};
    const meta = currentRoom && currentRoom.meta || {};
    const question = game.question || {};
    const state = game.state || STATES.QUESTION_ACTIVE;
    const isWinner = Boolean(game.buzz && game.buzz.playerId === myPlayerId);
    const remaining = getRemaining(game);
    const buzzPlayer = game.buzz && currentRoom.players && currentRoom.players[game.buzz.playerId];

    $("gameStateLabel").textContent = STATE_LABELS[state] || state;
    $("gameRoundLabel").textContent = "السؤال " + Number(game.round || 1) + " / " + Number(meta.maxQuestions || MAX_QUESTIONS);
    $("gameCountdown").textContent = game.deadlineAt ? remaining + "s" : "—";
    $("gameLetter").textContent = question.letter || "؟";
    $("gameQuestion").textContent = question.text || "بانتظار السؤال...";
    $("questionLiveState").textContent = state === STATES.QUESTION_ACTIVE
        ? "الجرس مفتوح"
        : (buzzPlayer ? "ضغط " + playerLabel(buzzPlayer) : (STATE_LABELS[state] || state));

    const bellOpen = state === STATES.QUESTION_ACTIVE && !game.buzz && !(game.excludedPlayerIds && game.excludedPlayerIds[myPlayerId]);
    const bell = $("onlineBellBtn");
    bell.disabled = !bellOpen;
    bell.innerHTML = bellOpen ? "🔔 <span>اضغط الجرس</span>" : "🔒 <span>الجرس مقفل</span>";
    $("gameBellStatus").textContent = state === STATES.QUESTION_ACTIVE
        ? "أول ضغطة تصل للسيرفر تفوز بالفرصة."
        : (buzzPlayer ? "🔔 " + escapeHtml(playerLabel(buzzPlayer)) + " ضغط الجرس أولًا" : (STATE_LABELS[state] || state));

    const answerForm = $("answerForm");
    answerForm.hidden = !(state === STATES.ANSWERING && isWinner);
    $("answerInput").disabled = state !== STATES.ANSWERING || !isWinner;
    $("answerForm").querySelector("button").disabled = state !== STATES.ANSWERING || !isWinner;
    if (state !== STATES.ANSWERING || !isWinner) $("answerInput").value = "";
    if (state === STATES.ANSWERING && isWinner && lastRenderedQuestionId !== game.questionId) {
        setTimeout(() => $("answerInput") && $("answerInput").focus(), 40);
    }

    const voteBox = $("voteBox");
    const canVote = state === STATES.VOTING && game.answer && game.answer.playerId !== myPlayerId;
    voteBox.hidden = state !== STATES.VOTING;
    if (state === STATES.VOTING) {
        $("voteAnswerPreview").textContent = "الإجابة: " + (game.answer && game.answer.text || "");
        $("voteHint").textContent = game.answer && game.answer.playerId === myPlayerId
            ? "صاحب الإجابة لا يصوت." : "التصويت يحسم الإجابة بالأغلبية.";
        $("voteYesBtn").disabled = !canVote || Boolean(game.votes && game.votes[myPlayerId]);
        $("voteNoBtn").disabled = !canVote || Boolean(game.votes && game.votes[myPlayerId]);
    }

    const resultBox = $("resultBox");
    resultBox.hidden = state !== STATES.ROUND_RESULT;
    if (state === STATES.ROUND_RESULT && game.result) {
        resultBox.className = "result-box " + (game.result.valid ? "is-correct" : "is-wrong");
        const resultPlayer = currentRoom.players && currentRoom.players[game.result.playerId];
        const name = resultPlayer ? playerLabel(resultPlayer) : game.result.playerName;
        resultBox.innerHTML = game.result.valid
            ? "✅ إجابة صحيحة<br><strong>" + escapeHtml(name) + " +1</strong><br><small>" + escapeHtml(game.result.reason || "تم اعتماد الإجابة") + "</small>"
            : "❌ إجابة غير صحيحة<br><strong>" + escapeHtml(name) + " لم يحصل على نقطة</strong><br><small>" + escapeHtml(game.result.reason || "حاولوا في السؤال التالي") + "</small>";
    }

    $("gameHostControls").hidden = !isHost();
    $("nextQuestionBtn").disabled = state !== STATES.ROUND_RESULT;
    renderRanking("gameRanking");
    renderDisconnectPanel();
    lastRenderedQuestionId = game.questionId || "";
}

function renderResults() {
    const list = playersArray().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const winner = list[0];
    $("resultsWinner").textContent = winner ? "الفائز 🏆 " + playerLabel(winner) : "انتهت المباراة";
    $("resultsSummary").textContent = winner ? "حصل على " + Number(winner.score || 0) + " نقطة" : "شكرًا لمشاركتكم";
    $("resultsRanking").innerHTML = list.map((player, index) =>
        '<div class="ranking-row ' + (index === 0 ? "is-me" : "") + '"><span class="rank-number">' + (index + 1) +
        '</span><div class="ranking-row__body"><strong>' + escapeHtml(playerLabel(player)) + '</strong><small>' +
        (player.connected === true ? "متصل" : "انقطع الاتصال") + '</small></div><span class="rank-score">' +
        Number(player.score || 0) + '</span></div>'
    ).join("");
    $("playAgainBtn").hidden = !isHost();
}

function renderRoom(room) {
    currentRoom = room;
    if (!room || !room.meta) return;
    const status = room.meta.status || "WAITING";
    if (status === "FINISHED" || room.game && room.game.state === STATES.FINISHED) {
        setView("onlineResults");
        renderResults();
    } else if (status === "PLAYING") {
        setView("onlineGame");
        renderGame();
        window.HojasFirstGameTour?.maybeStart({
            mode: "online",
            active: () => Boolean(currentRoom && currentRoom.meta && currentRoom.meta.status === "PLAYING")
        });
    } else {
        setView("onlineLobby");
        renderLobby();
    }

    if (previousPlayers && room.players) {
        Object.values(room.players).forEach((player) => {
            const before = previousPlayers[player.id];
            if (before && before.connected === true && player.connected === false) {
                showToast("⚠️ انقطع اتصال " + playerLabel(player), true);
            }
            if (before && before.connected === false && player.connected === true && player.id !== myPlayerId) {
                showToast("✅ عاد " + playerLabel(player) + " إلى الغرفة");
            }
        });
    }
    previousPlayers = room.players || {};
    maybePromoteHost(connectedPlayers(room));
    maybeAdvanceGameByTime();
    // Keep validation and scoring authoritative through Firebase transactions.
    // These calls are idempotent: the validation key and scoreAwarded/awards
    // transaction guards prevent duplicate decisions when every client renders
    // the same realtime snapshot.
    if (room.game && room.game.state === STATES.VALIDATING) {
        resolveAnswer(room.game).catch((error) => showToast("تعذر اعتماد الإجابة: " + error.message, true));
    }
    if (room.game && room.game.state === STATES.VOTING) {
        resolveVotingIfReady(room.game).catch(() => {});
    }
    if (room.game && room.game.state === STATES.ROUND_RESULT) {
        awardScoreIfNeeded(room.game).catch((error) => showToast("تعذر تحديث النقاط: " + error.message, true));
    }
}

async function subscribeToRoom() {
    if (roomUnsubscribe) roomUnsubscribe();
    if (chatUnsubscribe) chatUnsubscribe();
    roomUnsubscribe = onValue(roomRef(), (snapshot) => {
        if (!snapshot.exists()) {
            showToast("الغرفة غير موجودة أو انتهت.", true);
            leaveRoom(false);
            return;
        }
        renderRoom(snapshot.val());
    }, (error) => showToast("تعذر قراءة الغرفة: " + error.message, true));
    chatUnsubscribe = onValue(query(ref(db, roomPath() + "/chat"), limitToLast(100)), (snapshot) => {
        renderChat(snapshot.val() || {});
    });
}

async function setPresence() {
    if (!roomCode || !myPlayerId) return;
    const current = currentRoom && currentRoom.players && currentRoom.players[myPlayerId] || {};
    const presence = playerRef();
    await update(presence, {
        id: myPlayerId, name: myName, host: myPlayerId === currentRoom?.meta?.hostId, connected: true,
        joinedAt: current.joinedAt || serverNow(), lastSeen: serverTimestamp()
    });
    await onDisconnect(presence).update({
        connected: false, lastSeen: serverTimestamp(), disconnectedAt: serverTimestamp()
    });
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        update(presence, { connected: true, lastSeen: serverTimestamp() }).catch(() => {});
    }, 15000);
}

async function connectToRoom(code, playerId, name) {
    roomCode = cleanCode(code);
    myPlayerId = playerId;
    myName = cleanName(name);
    saveSession();
    bindConnectionState();
    startNetworkMonitor();
    await setPresence();
    await subscribeToRoom();
}

async function createRoom(name) {
    if (isBusy) return;
    isBusy = true;
    const button = $("createRoomForm") && $("createRoomForm").querySelector("button");
    if (button) button.disabled = true;
    try {
        const playerId = randomId();
        let created = false;
        let selectedCode = "";
        for (let attempt = 0; attempt < 8 && !created; attempt += 1) {
            const candidate = randomRoomCode();
            const root = ref(db, ROOM_ROOT + "/" + candidate);
            const result = await runTransaction(root, (current) => {
                if (current !== null) return;
                return {
                    meta: {
                        code: candidate, hostId: playerId, hostName: name, status: "WAITING",
                        state: STATES.WAITING, createdAt: serverNow(), updatedAt: serverNow(),
                        minPlayers: MIN_PLAYERS, answerSeconds: ANSWER_SECONDS,
                        voteSeconds: VOTE_SECONDS, maxQuestions: MAX_QUESTIONS
                    },
                    players: {
                        [playerId]: {
                            id: playerId, name: name, host: true, score: 0,
                            connected: true, joinedAt: serverNow(), lastSeen: serverNow()
                        }
                    },
                    game: {
                        state: STATES.WAITING, round: 0, questionId: "", question: null,
                        usedQuestions: {}, buzz: null, answer: null, votes: null,
                        result: null, deadlineAt: 0, excludedPlayerIds: {},
                        pausedPlayerId: "", pausedAt: 0, resumeState: ""
                    }
                };
            });
            if (result.committed) {
                created = true;
                selectedCode = candidate;
            }
        }
        if (!created) throw new Error("تعذر إنشاء كود فريد، حاول مرة أخرى.");
        await connectToRoom(selectedCode, playerId, name);
        showToast("تم إنشاء الغرفة " + selectedCode);
    } catch (error) {
        console.error(error);
        showToast(error.message || "تعذر إنشاء الغرفة.", true);
    } finally {
        isBusy = false;
        if (button) button.disabled = false;
    }
}

async function joinRoom(code, name, playerId) {
    if (isBusy) return;
    isBusy = true;
    const button = $("joinRoomForm") && $("joinRoomForm").querySelector("button");
    if (button) button.disabled = true;
    try {
        const cleanRoom = cleanCode(code);
        if (!/^\d{6}$/.test(cleanRoom)) throw new Error("اكتب كود الغرفة المكوّن من 6 أرقام.");
        const snapshot = await get(ref(db, ROOM_ROOT + "/" + cleanRoom));
        if (!snapshot.exists()) throw new Error("لم نجد غرفة بهذا الكود.");
        const room = snapshot.val();
        const savedId = resolveJoinPlayerId(room, cleanRoom, playerId);
        if (room.meta && room.meta.status === "FINISHED" && !room.players?.[savedId]) {
            throw new Error("هذه المباراة انتهت.");
        }
        localStorage.setItem("hojas_online_player_" + cleanRoom, savedId);
        const existing = room.players && room.players[savedId] || {};
        await update(ref(db, ROOM_ROOT + "/" + cleanRoom + "/players/" + savedId), {
            id: savedId, name: name, host: savedId === room.meta?.hostId, score: Number(existing.score || 0), connected: true,
            joinedAt: existing.joinedAt || serverNow(), lastSeen: serverTimestamp()
        });
        await connectToRoom(cleanRoom, savedId, name);
        showToast("دخلت غرفة " + cleanRoom);
    } catch (error) {
        console.error(error);
        showToast(error.message || "تعذر دخول الغرفة.", true);
    } finally {
        isBusy = false;
        if (button) button.disabled = false;
    }
}

async function startMatch() {
    if (!isHost() || !currentRoom) return;
    const list = playersArray();
    if (list.length < MIN_PLAYERS) {
        showToast("تحتاج إلى " + MIN_PLAYERS + " لاعبين على الأقل.", true);
        return;
    }
    await loadExtraQuestionBank();
    const question = chooseQuestion({});
    const game = makeQuestionState(question, 1, {});
    const updates = {};
    updates[roomPath() + "/meta/status"] = "PLAYING";
    updates[roomPath() + "/meta/state"] = STATES.QUESTION_ACTIVE;
    updates[roomPath() + "/meta/updatedAt"] = serverTimestamp();
    updates[roomPath() + "/game"] = game;
    await update(ref(db), updates);
    showToast(list.length % 2 ? "بدأت المباراة — العدد فردي، لكن يمكنكم اللعب." : "بدأت المباراة!");
}

async function pressBell() {
    const game = currentRoom && currentRoom.game;
    if (!game || game.state !== STATES.QUESTION_ACTIVE || game.buzz || game.excludedPlayerIds?.[myPlayerId]) return;
    const seconds = Number(currentRoom.meta && currentRoom.meta.answerSeconds || ANSWER_SECONDS);
    const result = await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.QUESTION_ACTIVE || current.buzz || current.excludedPlayerIds?.[myPlayerId]) return;
        return {
            ...current,
            state: STATES.ANSWERING,
            buzz: {
                playerId: myPlayerId, name: myName,
                questionId: current.questionId, pressedAt: serverTimestamp()
            },
            answer: null, result: null, votes: null,
            deadlineAt: serverNow() + seconds * 1000
        };
    });
    if (!result.committed) showToast("سبقك لاعب آخر بالجرس.", true);
}

async function submitAnswer(event) {
    event.preventDefault();
    const input = $("answerInput");
    const answerText = String(input && input.value || "").trim().slice(0, 120);
    const game = currentRoom && currentRoom.game;
    if (!answerText || !game || game.state !== STATES.ANSWERING || !game.buzz || game.buzz.playerId !== myPlayerId) return;
    if (getRemaining(game) <= 0) {
        showToast("انتهى وقت الإجابة.", true);
        return;
    }
    const result = await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.ANSWERING || !current.buzz ||
            current.buzz.playerId !== myPlayerId || Number(current.deadlineAt) <= serverNow()) return;
        return {
            ...current,
            state: STATES.VALIDATING,
            answer: { playerId: myPlayerId, playerName: myName, text: answerText, submittedAt: serverTimestamp() },
            deadlineAt: 0
        };
    });
    if (!result.committed) showToast("لم تعد الإجابة متاحة.", true);
}

async function validateAnswerWithAI(question, letter, answer) {
    if (typeof window.onlineAIAnswerValidator === "function") {
        try {
            const result = await window.onlineAIAnswerValidator(question, letter, answer);
            if (result && typeof result.valid === "boolean") return result;
        } catch (_) {}
    }
    return { valid: null, confidence: 0, reason: "لم يتم ربط خدمة الذكاء الاصطناعي بعد." };
}

window.validateAnswerWithAI = validateAnswerWithAI;

async function resolveAnswer(game) {
    if (!game || !game.answer || game.state !== STATES.VALIDATING) return;
    const key = game.questionId + "|" + game.answer.playerId + "|" + game.answer.text;
    if (lastValidationKey === key) return;
    lastValidationKey = key;
    const question = questionById(game.questionId);
    const expected = question && question.answer || "";
    const exact = Boolean(expected && normalizeAnswer(expected) === normalizeAnswer(game.answer.text));
    const decision = exact
        ? { valid: true, confidence: 1, reason: "مطابقة للإجابة المعروفة." }
        : await validateAnswerWithAI(game.question && game.question.text || "", game.question && game.question.letter || "", game.answer.text);

    if (decision && decision.valid === true && Number(decision.confidence ?? 1) >= 0.82) {
        await commitAnswerResult(game, true, decision.reason || "تم اعتماد الإجابة.");
    } else if (decision && decision.valid === false && Number(decision.confidence ?? 1) >= 0.82) {
        await commitAnswerResult(game, false, decision.reason || "الإجابة لا تطابق الإجابة المعروفة.");
    } else {
        await runTransaction(gameRef(), (current) => {
            if (!current || current.state !== STATES.VALIDATING || !current.answer ||
                current.answer.playerId !== game.answer.playerId) return;
            return {
                ...current,
                state: STATES.VOTING,
                votes: {},
                deadlineAt: serverNow() + Number(currentRoom.meta && currentRoom.meta.voteSeconds || VOTE_SECONDS) * 1000,
                result: { pending: true }
            };
        });
    }
}

async function commitAnswerResult(game, valid, reason) {
    await runTransaction(gameRef(), (current) => {
        if (!current || (current.state !== STATES.VALIDATING && current.state !== STATES.VOTING) ||
            !current.answer || current.answer.playerId !== (game.answer && game.answer.playerId)) return;
        return {
            ...current,
            state: STATES.ROUND_RESULT,
            deadlineAt: 0,
            result: {
                valid: Boolean(valid),
                playerId: current.answer.playerId,
                playerName: current.answer.playerName,
                reason: String(reason || ""),
                scoreAwarded: false,
                resolvedAt: serverNow()
            }
        };
    });
}

async function voteAnswer(value) {
    const game = currentRoom && currentRoom.game;
    if (!game || game.state !== STATES.VOTING || !game.answer ||
        game.answer.playerId === myPlayerId || game.votes?.[myPlayerId]) return;
    await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.VOTING || !current.answer ||
            current.answer.playerId === myPlayerId || current.votes?.[myPlayerId]) return;
        return { ...current, votes: { ...(current.votes || {}), [myPlayerId]: Boolean(value) } };
    });
    setTimeout(() => resolveVotingIfReady(currentRoom && currentRoom.game), 100);
}

async function resolveVotingIfReady(game) {
    if (!game || game.state !== STATES.VOTING) return;
    const eligible = connectedPlayers().filter((player) => !game.answer || player.id !== game.answer.playerId);
    const votes = Object.values(game.votes || {});
    if (votes.length < Math.max(1, eligible.length)) return;
    const yes = votes.filter(Boolean).length;
    await commitAnswerResult(game, yes > votes.length / 2, "نتيجة تصويت " + yes + " من " + votes.length + ".");
}

async function awardScoreIfNeeded(game) {
    if (!game || !game.result || !game.result.valid || game.result.scoreAwarded || !game.result.playerId) return;
    const awardPath = ref(db, roomPath() + "/awards/" + game.questionId);
    const award = await runTransaction(awardPath, (current) => {
        // Returning undefined aborts the transaction when another client has
        // already claimed this question's point. Firebase then reports
        // committed=false, preventing duplicate score increments on renders.
        if (current !== null) return;
        return { playerId: game.result.playerId, points: 1, createdAt: serverNow() };
    });
    if (award.committed) {
        await runTransaction(ref(db, roomPath() + "/players/" + game.result.playerId + "/score"), (score) => Number(score || 0) + 1);
    }
    await runTransaction(gameRef(), (current) => {
        if (!current || !current.result || current.questionId !== game.questionId || current.result.scoreAwarded) return;
        return { ...current, result: { ...current.result, scoreAwarded: true } };
    });
}

async function nextQuestion() {
    if (!isHost() || !currentRoom || !currentRoom.game || currentRoom.game.state !== STATES.ROUND_RESULT) return;
    const current = currentRoom.game;
    const nextRound = Number(current.round || 1) + 1;
    if (nextRound > Number(currentRoom.meta && currentRoom.meta.maxQuestions || MAX_QUESTIONS)) {
        await finishMatch();
        return;
    }
    const question = chooseQuestion(current.usedQuestions || {});
    await set(gameRef(), makeQuestionState(question, nextRound, current.usedQuestions || {}));
}

async function finishMatch() {
    if (!isHost()) return;
    const updates = {};
    updates[roomPath() + "/meta/status"] = "FINISHED";
    updates[roomPath() + "/meta/state"] = STATES.FINISHED;
    updates[roomPath() + "/meta/updatedAt"] = serverTimestamp();
    updates[roomPath() + "/game/state"] = STATES.FINISHED;
    updates[roomPath() + "/game/deadlineAt"] = 0;
    await update(ref(db), updates);
}

async function playAgain() {
    if (!isHost()) return;
    const updates = {};
    playersArray().forEach((player) => {
        updates[roomPath() + "/players/" + player.id + "/score"] = 0;
    });
    updates[roomPath() + "/meta/status"] = "WAITING";
    updates[roomPath() + "/meta/state"] = STATES.WAITING;
    updates[roomPath() + "/meta/updatedAt"] = serverTimestamp();
    updates[roomPath() + "/game"] = {
        state: STATES.WAITING, round: 0, questionId: "", question: null,
        usedQuestions: {}, buzz: null, answer: null, votes: null, result: null,
        deadlineAt: 0, excludedPlayerIds: {}, pausedPlayerId: "", pausedAt: 0, resumeState: ""
    };
    await update(ref(db), updates);
}

async function waitForPlayer() {
    if (!isHost() || !currentRoom || !currentRoom.game) return;
    const disconnected = playersArray().find((player) => player.connected !== true);
    if (!disconnected) {
        showToast("كل اللاعبين متصلون الآن.");
        return;
    }
    await update(gameRef(), {
        state: STATES.PAUSED,
        pausedPlayerId: disconnected.id,
        pausedAt: serverNow(),
        resumeState: currentRoom.game.state,
        deadlineAt: 0
    });
}

async function continueWithoutPlayer() {
    if (!isHost() || !currentRoom || !currentRoom.game || currentRoom.game.state !== STATES.PAUSED) return;
    const game = currentRoom.game;
    const excluded = Object.assign({}, game.excludedPlayerIds || {});
    if (game.pausedPlayerId) excluded[game.pausedPlayerId] = true;
    await update(gameRef(), {
        state: STATES.QUESTION_ACTIVE, pausedPlayerId: "", pausedAt: 0, resumeState: "",
        buzz: null, answer: null, votes: null, result: null, deadlineAt: 0,
        excludedPlayerIds: excluded
    });
}

async function maybeAdvanceGameByTime() {
    if (!isHost() || !currentRoom || !currentRoom.game) return;
    const game = currentRoom.game;
    if (game.state === STATES.ANSWERING && getRemaining(game) <= 0) {
        const excluded = Object.assign({}, game.excludedPlayerIds || {});
        if (game.buzz && game.buzz.playerId) excluded[game.buzz.playerId] = true;
        await runTransaction(gameRef(), (current) => {
            if (!current || current.state !== STATES.ANSWERING || Number(current.deadlineAt) > serverNow()) return;
            return {
                ...current, state: STATES.QUESTION_ACTIVE, buzz: null, answer: null,
                votes: null, result: null, deadlineAt: 0, excludedPlayerIds: excluded
            };
        });
    } else if (game.state === STATES.VOTING) {
        if (getRemaining(game) <= 0) await commitAnswerResult(game, false, "انتهى وقت التصويت.");
        else await resolveVotingIfReady(game);
    } else if (game.state === STATES.PAUSED && serverNow() - Number(game.pausedAt || 0) >= MAX_WAIT_MS) {
        showToast("انتهت مهلة انتظار اللاعب، استمرت المباراة.", true);
        await continueWithoutPlayer();
    }
}

async function maybePromoteHost(connected) {
    const meta = currentRoom && currentRoom.meta;
    if (!meta || !meta.hostId || meta.hostId === myPlayerId) return;
    const currentHost = currentRoom.players && currentRoom.players[meta.hostId];
    if (currentHost && currentHost.connected === true) return;
    const nextHost = connected.slice().sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0))[0];
    if (!nextHost) return;
    await runTransaction(metaRef(), (current) => {
        if (!current || current.hostId !== meta.hostId) return;
        const hostPlayer = currentRoom.players && currentRoom.players[current.hostId];
        if (hostPlayer && hostPlayer.connected === true) return;
        return Object.assign({}, current, {
            hostId: nextHost.id, hostName: nextHost.name, hostChangedAt: serverNow()
        });
    }).catch(() => {});
}

async function sendChat(text) {
    const cleanText = String(text || "").trim().slice(0, 240);
    if (!cleanText || !roomCode) return;
    await set(push(ref(db, roomPath() + "/chat")), {
        playerId: myPlayerId, name: myName, text: cleanText,
        createdAt: serverTimestamp(), clientAt: serverNow()
    });
}

async function copyRoomCode() {
    if (!roomCode) return;
    try {
        await navigator.clipboard.writeText(roomCode);
        showToast("تم نسخ كود الغرفة.");
    } catch (_) {
        showToast("كود الغرفة: " + roomCode);
    }
}

async function leaveRoom(showMessage) {
    const notify = showMessage !== false;
    if (!roomCode || !myPlayerId) {
        setView("onlineWelcome");
        return;
    }
    const oldRoom = roomCode;
    try {
        await update(ref(db, ROOM_ROOT + "/" + oldRoom + "/players/" + myPlayerId), {
            connected: false, lastSeen: serverTimestamp()
        });
    } catch (_) {}
    if (roomUnsubscribe) roomUnsubscribe();
    if (chatUnsubscribe) chatUnsubscribe();
    clearInterval(heartbeatTimer);
    clearInterval(clockTimer);
    roomUnsubscribe = null;
    chatUnsubscribe = null;
    roomCode = "";
    currentRoom = null;
    previousPlayers = {};
    setView("onlineWelcome");
    renderResumeSession();
    if (notify) showToast("غادرت الغرفة.");
}

function renderClock() {
    if (!currentRoom || !currentRoom.meta || currentRoom.meta.status !== "PLAYING") return;
    const game = currentRoom.game || {};
    const remaining = getRemaining(game);
    $("gameCountdown").textContent = game.deadlineAt ? remaining + "s" : "—";
    maybeAdvanceGameByTime();
}

function startClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClock, 250);
}

function bindUI() {
    $("createRoomForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = cleanName($("createName").value);
        if (!name) return showToast("اكتب اسمك أولًا.", true);
        createRoom(name);
    });
    $("joinRoomForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = cleanName($("joinName").value);
        const code = cleanCode($("joinCode").value);
        if (!name) return showToast("اكتب اسمك أولًا.", true);
        joinRoom(code, name);
    });
    $("joinCode")?.addEventListener("input", (event) => {
        event.target.value = cleanCode(event.target.value);
    });
    $("resumeSessionBtn")?.addEventListener("click", () => {
        const session = readSession();
        if (session) joinRoom(session.roomCode, session.name, session.playerId);
    });
    $("hostStartBtn")?.addEventListener("click", startMatch);
    $("copyRoomBtn")?.addEventListener("click", copyRoomCode);
    $("onlineBellBtn")?.addEventListener("click", pressBell);
    $("answerForm")?.addEventListener("submit", submitAnswer);
    $("voteYesBtn")?.addEventListener("click", () => voteAnswer(true));
    $("voteNoBtn")?.addEventListener("click", () => voteAnswer(false));
    $("nextQuestionBtn")?.addEventListener("click", nextQuestion);
    $("finishGameBtn")?.addEventListener("click", () => {
        showOnlineConfirm({
            title: "إنهاء المباراة؟",
            message: "سيتم إنهاء المباراة وعرض النتيجة لجميع اللاعبين.",
            confirmText: "إنهاء المباراة"
        }).then((accepted) => { if (accepted) finishMatch(); });
    });
    $("onlineConfirmCancel")?.addEventListener("click", () => closeOnlineConfirm(false));
    $("onlineConfirmAccept")?.addEventListener("click", () => closeOnlineConfirm(true));
    $("onlineConfirm")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeOnlineConfirm(false); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("onlineConfirm")?.hidden) closeOnlineConfirm(false); });
    $("waitPlayerBtn")?.addEventListener("click", waitForPlayer);
    $("continueGameBtn")?.addEventListener("click", continueWithoutPlayer);
    $("playAgainBtn")?.addEventListener("click", playAgain);
    $("resultsLobbyBtn")?.addEventListener("click", () => setView("onlineLobby"));
    $("lobbyLeaveBtn")?.addEventListener("click", () => leaveRoom(true));
    $("resultsLeaveBtn")?.addEventListener("click", () => {
        clearSession();
        leaveRoom(true);
    });
    [$("lobbyChatForm"), $("gameChatForm")].forEach((form) => form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector("input");
        const text = input.value;
        input.value = "";
        try {
            await sendChat(text);
        } catch (_) {
            showToast("تعذر إرسال الرسالة.", true);
        }
    }));
}

async function initializeOnlinePage() {
    bindUI();
    bindConnectionState();
    startClock();
    renderResumeSession();
    const session = readSession();
    if (session && session.roomCode && session.playerId && session.name) {
        const snapshot = await get(ref(db, ROOM_ROOT + "/" + cleanCode(session.roomCode))).catch(() => null);
        if (!snapshot || !snapshot.exists()) clearSession();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeOnlinePage, { once: true });
} else {
    initializeOnlinePage();
}
