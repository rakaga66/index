import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getDatabase, ref, get, set, update, onValue, runTransaction, push,
    onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { trackOnlineSession } from "./qaf-analytics.js?v=2";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A",
    authDomain: "buzzer-game-f2983.firebaseapp.com",
    databaseURL: "https://buzzer-game-f2983-default-rtdb.firebaseio.com",
    projectId: "buzzer-game-f2983",
    storageBucket: "buzzer-game-f2983.firebasestorage.app",
    messagingSenderId: "125573747954",
    appId: "1:125573747954:web:8dac68183e6e326b8b2c6b"
};

const ROOM_ROOT = "onlineBoardRooms";
const SESSION_LOCK_ROOT = "onlineBoardSessionLocks";
const SESSION_KEY = "hojas_online_board_session_v1";
const CREATOR_ID_KEY = "hojas_online_board_creator_id_v1";
const SESSION_COOLDOWN_MS = 10 * 60 * 1000;
const BOARD_SIZE = 5;
const INITIAL_COUNTDOWN_SECONDS = 3;
const FIRST_PREVIEW_SECONDS = 10;
const FIRST_ANSWER_SECONDS = 7;
const OTHER_ANSWER_SECONDS = 10;
const REVEAL_MILLISECONDS = 2300;
const VALIDATION_CLAIM_MILLISECONDS = 9000;
const MAX_QUESTIONS = 25;
const MAX_TOTAL_ATTEMPTS = 4;
const ARABIC_LETTERS = [
    "أ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش",
    "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "هـ", "و", "ي"
];
const STATES = Object.freeze({
    WAITING: "WAITING",
    READY_CHECK: "READY_CHECK",
    SELECTING_CELL: "SELECTING_CELL",
    CELL_CONFIRMED: "CELL_CONFIRMED",
    COUNTDOWN_TO_QUESTION: "COUNTDOWN_TO_QUESTION",
    BUZZER_OPEN: "BUZZER_OPEN",
    TEAM_ONE_ANSWERING: "TEAM_ONE_ANSWERING",
    TEAM_TWO_ANSWERING: "TEAM_TWO_ANSWERING",
    VALIDATING: "VALIDATING",
    ANSWER_REVEAL: "ANSWER_REVEAL",
    CELL_AWARDED: "CELL_AWARDED",
    CHECKING_WIN: "CHECKING_WIN",
    GAME_FINISHED: "GAME_FINISHED",
    // Compatibility aliases for rooms created by the previous online build.
    QUESTION_ACTIVE: "BUZZER_OPEN",
    OPEN_BUZZER: "BUZZER_OPEN",
    ANSWERING: "TEAM_ONE_ANSWERING",
    NEXT_CELL_SELECTION: "SELECTING_CELL",
    ROUND_RESULT: "SELECTING_CELL",
    FINISHED: "GAME_FINISHED"
});
const ROUND_WORDS = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"];

const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);
let onlineAuth = null;
try { onlineAuth = getAuth(app); } catch (error) { console.warn("تعذر تهيئة هوية منشئ الجلسة.", error); }
let questionBank = buildQuestionBank();
let extraQuestionBank = [];
let extraQuestionBankLoaded = false;
let questionOverridesLoaded = false;

let roomCode = "";
let myPlayerId = "";
let myName = "";
let currentRoom = null;
let roomUnsubscribe = null;
let chatUnsubscribe = null;
let connectionUnsubscribe = null;
let heartbeatTimer = null;
let clockTimer = null;
let toastTimer = null;
let serverOffset = 0;
let lastValidationKey = "";
let busy = false;

const $ = (id) => document.getElementById(id);
const teamKeys = ["team1", "team2"];
const roomPath = () => ROOM_ROOT + "/" + roomCode;
const roomRef = () => ref(db, roomPath());
const gameRef = () => ref(db, roomPath() + "/game");
const playerRef = () => ref(db, roomPath() + "/players/" + myPlayerId);
const serverNow = () => Date.now() + serverOffset;

function buildQuestionBank() {
    const source = Array.isArray(window.questionsData) && window.questionsData.length
        ? window.questionsData
        : [{ letter: "أ", question: "ما عاصمة المملكة العربية السعودية؟", answer: "الرياض" }];
    return source.filter((item) => item && item.letter && item.question && item.answer).map((item, index) => ({
        id: String(item.id || "static-" + index),
        legacyId: String(item.id || "q-" + index),
        letter: String(item.letter).trim(),
        question: String(item.question).trim(),
        answer: String(item.answer).trim(),
        status: "active"
    }));
}

async function loadQuestionOverrides() {
    if (questionOverridesLoaded) return;
    try {
        if (!window.QuestionLibrary?.getQuestionOverrides) return;
        const overrides = await window.QuestionLibrary.getQuestionOverrides(true);
        const byId = new Map((overrides || []).map(item => [String(item.baseId || item.id), item]));
        questionBank = questionBank.map(item => {
            const override = byId.get(String(item.id));
            if (!override) return item;
            return {
                ...item,
                letter: String(override.letter || item.letter).trim(),
                question: String(override.question || item.question).trim(),
                answer: String(override.answer || item.answer).trim(),
                status: override.status || item.status || "active"
            };
        }).filter(item => item.status !== "disabled");
    } catch (error) {
        console.warn("تعذر تحميل تعديلات أسئلة الأدمن للأونلاين.", error);
    } finally {
        questionOverridesLoaded = true;
    }
}

async function loadExtraQuestionBank() {
    if (extraQuestionBankLoaded) return;
    try {
        await loadQuestionOverrides();
        if (!window.QuestionLibrary?.getActiveQuestions) return;
        const records = await window.QuestionLibrary.getActiveQuestions(true);
        const existing = new Set(questionBank.map(question => question.id));
        extraQuestionBank = records.filter(item => item.question && item.answer).map(item => ({
            id: "extra-" + item.id,
            letter: String(item.letter || "").trim(),
            question: String(item.question).trim(),
            answer: String(item.answer).trim()
        })).filter(item => !existing.has(item.id));
        if (extraQuestionBank.length) console.log("✅ Approved follower questions loaded:", extraQuestionBank.length);
    } catch (error) {
        console.warn("تعذر تحميل أسئلة المتابعين للعبة الأونلاين.", error);
    } finally {
        extraQuestionBankLoaded = true;
    }
}

function allQuestions() { return questionBank.concat(extraQuestionBank); }

function normalizeAnswer(value) {
    return String(value || "").toLowerCase().normalize("NFKC")
        .replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه").replace(/[ى]/g, "ي").replace(/[ؤ]/g, "و").replace(/[ئ]/g, "ي")
        .replace(/[^\u0621-\u063A\u0641-\u064A0-9a-zA-Z]/g, "").trim();
}
function editDistance(left, right) {
    const a = String(left || ""); const b = String(right || "");
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
    for (let col = 0; col <= b.length; col += 1) matrix[0][col] = col;
    for (let row = 1; row <= a.length; row += 1) {
        for (let col = 1; col <= b.length; col += 1) {
            matrix[row][col] = Math.min(
                matrix[row - 1][col] + 1,
                matrix[row][col - 1] + 1,
                matrix[row - 1][col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1)
            );
            if (row > 1 && col > 1 && a[row - 1] === b[col - 2] && a[row - 2] === b[col - 1]) {
                matrix[row][col] = Math.min(matrix[row][col], matrix[row - 2][col - 2] + 1);
            }
        }
    }
    return matrix[a.length][b.length];
}
function answerLooksLikeExpected(expected, submitted) {
    const cleanExpected = normalizeAnswer(expected); const cleanSubmitted = normalizeAnswer(submitted);
    if (!cleanExpected || !cleanSubmitted) return false;
    if (cleanExpected === cleanSubmitted) return true;
    const withoutArticle = (value) => value.replace(/^ال(?=[\u0621-\u064A])/, "");
    if (withoutArticle(cleanExpected) === withoutArticle(cleanSubmitted)) return true;
    const maxLength = Math.max(cleanExpected.length, cleanSubmitted.length);
    const maxDistance = maxLength <= 4 ? 1 : Math.min(2, Math.max(1, Math.floor(maxLength * .2)));
    return editDistance(cleanExpected, cleanSubmitted) <= maxDistance || editDistance(withoutArticle(cleanExpected), withoutArticle(cleanSubmitted)) <= maxDistance;
}
function normalizeLetter(value) { return normalizeAnswer(value).slice(0, 1); }
// Answers in the shared Arabic bank may include the definite article ("ال").
// Ignore that grammatical prefix only for the cell-letter guard; keep the
// original stored answer unchanged for display and validation.
function firstNormalizedAnswerLetter(value) {
    const original = String(value || "").normalize("NFKC").trim();
    const normalized = normalizeAnswer(value);
    const answerWithoutArticle = /^[إأآٱ]/.test(original)
        ? normalized
        : normalized.replace(/^ال(?=[\u0621-\u064A])/, "");
    return answerWithoutArticle.slice(0, 1);
}
function cleanName(value) { return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 24); }
function cleanCode(value) { return String(value || "").replace(/\D/g, "").slice(0, 6); }
function randomId() { return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36); }
function randomRoomCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function escapeHtml(value) { return String(value == null ? "" : value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function teamName(team, room = currentRoom) { return room?.meta?.[team + "Name"] || (team === "team1" ? "الفريق الأول" : "الفريق الثاني"); }
function playersArray(room = currentRoom) { return Object.values(room?.players || {}).filter((player) => player && player.id); }
function teamPlayers(team, room = currentRoom) { return playersArray(room).filter((player) => player.team === team); }
function connectedPlayers(room = currentRoom) { return playersArray(room).filter((player) => player.connected !== false); }
function getMyPlayer() { return currentRoom?.players?.[myPlayerId] || null; }
function isHost() { return Boolean(currentRoom?.meta?.hostId === myPlayerId); }
function getRemaining(game) { return game?.deadlineAt ? Math.max(0, Math.ceil((Number(game.deadlineAt) - serverNow()) / 1000)) : 0; }

function showToast(message, isError = false) {
    const node = $("onlineBoardToast");
    if (!node) return;
    clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.toggle("is-error", isError);
    node.classList.add("is-visible");
    toastTimer = setTimeout(() => node.classList.remove("is-visible"), 3600);
}

let onlineConfirmResolve = null;
let onlineConfirmReturnFocus = null;
function closeOnlineConfirm(accepted = false) {
    const modal = $("onlineBoardConfirm");
    if (modal) {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
    }
    const resolve = onlineConfirmResolve;
    onlineConfirmResolve = null;
    if (onlineConfirmReturnFocus?.focus) onlineConfirmReturnFocus.focus();
    onlineConfirmReturnFocus = null;
    resolve?.(Boolean(accepted));
}
function showOnlineConfirm({ title, message, confirmText = "تأكيد", danger = true } = {}) {
    const modal = $("onlineBoardConfirm");
    if (!modal) return Promise.resolve(false);
    if (onlineConfirmResolve) closeOnlineConfirm(false);
    $("onlineBoardConfirmTitle").textContent = title || "تأكيد العملية";
    $("onlineBoardConfirmMessage").textContent = message || "هل تريد المتابعة؟";
    const accept = $("onlineBoardConfirmAccept");
    accept.textContent = confirmText;
    accept.className = danger ? "ob-danger-btn" : "ob-primary-btn";
    onlineConfirmReturnFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => {
        onlineConfirmResolve = resolve;
        requestAnimationFrame(() => $("onlineBoardConfirmCancel")?.focus());
    });
}

let onlineHelpReturnFocus = null;
function closeOnlineHelp() {
    const modal = $("onlineBoardHelpModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    if (onlineHelpReturnFocus?.focus) onlineHelpReturnFocus.focus();
    onlineHelpReturnFocus = null;
}
function openOnlineHelp() {
    const modal = $("onlineBoardHelpModal");
    if (!modal) return;
    onlineHelpReturnFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => $("onlineBoardHelpClose")?.focus());
}

let loadingTimer = null;
function setLoadingOverlay(active, message = "جاري تجهيز الجلسة…") {
    let overlay = $("onlineBoardLoadingOverlay");
    if (active && !overlay) {
        overlay = document.createElement("div");
        overlay.id = "onlineBoardLoadingOverlay";
        overlay.className = "ob-loading-overlay";
        overlay.innerHTML = '<div class="ob-loading-card" role="status" aria-live="polite"><strong>لحظة من فضلك</strong><p id="onlineBoardLoadingText"></p><div class="ob-loading-track"><span id="onlineBoardLoadingBar"></span></div><b class="ob-loading-percent" id="onlineBoardLoadingPercent">0%</b></div>';
        document.body.appendChild(overlay);
    }
    if (!overlay) return;
    clearInterval(loadingTimer);
    if (!active) { overlay.remove(); return; }
    overlay.hidden = false;
    $("onlineBoardLoadingText").textContent = message;
    const bar = $("onlineBoardLoadingBar"); const percent = $("onlineBoardLoadingPercent");
    let value = 0;
    const paint = () => { value = Math.min(92, value + Math.max(2, Math.round((92 - value) * .16))); bar.style.width = value + "%"; percent.textContent = value + "%"; };
    paint(); loadingTimer = setInterval(paint, 140);
}
function finishLoadingOverlay() {
    const bar = $("onlineBoardLoadingBar"); const percent = $("onlineBoardLoadingPercent");
    if (bar) bar.style.width = "100%"; if (percent) percent.textContent = "100%";
    clearInterval(loadingTimer);
    setTimeout(() => setLoadingOverlay(false), 180);
}

function setView(name) {
    ["onlineBoardWelcome", "onlineBoardLobby", "onlineBoardGame", "onlineBoardResults"].forEach((id) => {
        const node = $(id);
        if (node) node.hidden = id !== name;
    });
    const helpButton = $("onlineBoardHelpBtn");
    if (helpButton) helpButton.hidden = name !== "onlineBoardGame";
}

function saveSessionRecord(code, playerId, name) {
    const cleanRoomCode = cleanCode(code);
    const cleanPlayerId = String(playerId || "").trim();
    const cleanPlayerName = cleanName(name);
    if (cleanRoomCode && cleanPlayerId && cleanPlayerName) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: cleanRoomCode, playerId: cleanPlayerId, name: cleanPlayerName, savedAt: Date.now() }));
    }
}
function saveSession() {
    saveSessionRecord(roomCode, myPlayerId, myName);
}
function readSession() {
    try { const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); return value?.roomCode && value?.playerId && value?.name ? value : null; } catch (_) { return null; }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }

async function hasResumableSession() {
    const session = readSession();
    if (!session) return false;
    const code = cleanCode(session.roomCode);
    if (!/^\d{6}$/.test(code)) { clearSession(); return false; }
    try {
        const snapshot = await get(ref(db, ROOM_ROOT + "/" + code));
        const valid = snapshot.exists() && isValidRoomForJoin(snapshot.val(), code, session.playerId);
        if (!valid) clearSession();
        return valid;
    } catch (_) {
        // A failed read is not proof that the room still exists. Returning
        // null lets the shared creator lock make the final decision instead
        // of stranding the player behind a false cooldown message.
        return null;
    }
}

function safePathSegment(value) {
    return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}
function getLocalCreatorId() {
    let value = localStorage.getItem(CREATOR_ID_KEY);
    if (!value || value.length < 16) {
        value = randomId();
        localStorage.setItem(CREATOR_ID_KEY, value);
    }
    return value;
}
function cooldownError(createdAt) {
    const remaining = Math.max(1, Math.ceil((SESSION_COOLDOWN_MS - (serverNow() - Number(createdAt || 0))) / 60000));
    return new Error("أنشأت جلسة مؤخرًا. يمكنك إنشاء جلسة أخرى بعد " + remaining + " دقائق.");
}
async function getCreatorIdentity() {
    if (onlineAuth) {
        try {
            const user = onlineAuth.currentUser || (await signInAnonymously(onlineAuth)).user;
            if (user?.uid) return "uid:" + user.uid;
        } catch (error) {
            console.warn("سيتم استخدام هوية الجهاز لقفل إنشاء الجلسات.", error);
        }
    }
    return "device:" + getLocalCreatorId();
}
function sessionLockRef(identity) {
    return ref(db, SESSION_LOCK_ROOT + "/" + safePathSegment(identity));
}
async function recoverSessionFromLock(lockValue) {
    const session = readSession();
    if (session || !lockValue?.roomCode) return false;
    const code = cleanCode(lockValue.roomCode);
    if (!/^\d{6}$/.test(code)) return false;
    try {
        const snapshot = await get(ref(db, ROOM_ROOT + "/" + code));
        const room = snapshot.exists() ? snapshot.val() : null;
        const hostId = room?.meta?.hostId;
        const host = hostId ? room.players?.[hostId] : null;
        if (!room || !hostId || !host || !isValidRoomForJoin(room, code, hostId)) return false;
        const hostName = cleanName(host.name || room.meta.hostName || "المقدم");
        localStorage.setItem("hojas_online_board_player_" + code, hostId);
        saveSessionRecord(code, hostId, hostName);
        return true;
    } catch (_) {
        return false;
    }
}
async function attachSessionCreationLock(lock, code, name) {
    if (!lock?.identity || !lock?.createdAt) return;
    try {
        await update(sessionLockRef(lock.identity), {
            roomCode: cleanCode(code),
            hostName: cleanName(name),
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        // The room and local resume record are already durable; lock metadata
        // must never turn a successful create into an error.
        console.warn("تعذر ربط قفل الجلسة بالغرفة.", error);
    }
}
async function acquireSessionCreationLock() {
    const localLockKey = CREATOR_ID_KEY + "_last_created_at";
    const localCreatedAt = Number(localStorage.getItem(localLockKey) || 0);
    if (localCreatedAt && serverNow() - localCreatedAt < SESSION_COOLDOWN_MS) {
        const resumable = await hasResumableSession();
        if (resumable === true) throw cooldownError(localCreatedAt);
        // A previous attempt may have reserved the device and then failed
        // before a room was written. Do not strand the player behind a ghost
        // cooldown in that case. The shared Firebase lock below remains the
        // source of truth if another tab/device still owns a real room.
        localStorage.removeItem(localLockKey);
    } else if (localCreatedAt) {
        localStorage.removeItem(localLockKey);
    }

    const identity = await getCreatorIdentity();
    const lockRef = sessionLockRef(identity);
    // Older builds stored only a timestamp and could not be resumed. If there
    // is no valid local session, clear that legacy reservation before trying to
    // create a new room.
    try {
        const existingSnapshot = await get(lockRef);
        const existing = existingSnapshot.exists() ? existingSnapshot.val() : null;
        const existingCreatedAt = Number(existing?.createdAt || 0);
        if (existing?.version === 1 && existingCreatedAt && serverNow() - existingCreatedAt < SESSION_COOLDOWN_MS) {
            await recoverSessionFromLock(existing);
            const resumable = await hasResumableSession();
            // Remove only a lock that explicitly points to a deleted/invalid
            // room. Losing localStorage alone must not disable the cooldown
            // for a real room.
            if (existing.roomCode && resumable === false) {
                await runTransaction(lockRef, (current) => {
                    if (!current || Number(current.createdAt || 0) !== existingCreatedAt) return;
                    return null;
                });
            }
        }
    } catch (error) {
        console.warn("تعذر تنظيف حجز جلسة قديم، ستستمر محاولة الإنشاء.", error);
    }
    let transaction = null;
    try {
        transaction = await runTransaction(lockRef, (current) => {
            const createdAt = Number(current?.createdAt || 0);
            if (createdAt && serverNow() - createdAt < SESSION_COOLDOWN_MS) return;
            const now = serverNow();
            return { createdAt: now, expiresAt: now + SESSION_COOLDOWN_MS, version: 1 };
        });
    } catch (error) {
        if (String(error?.code || "").toUpperCase().includes("PERMISSION_DENIED")) {
            throw new Error("تعذر تفعيل حماية إنشاء الجلسات. راجع صلاحيات Firebase ثم حاول مرة أخرى.");
        }
        // A temporary auth/network error should not make the local game
        // unusable; the device lock below still prevents accidental repeats.
        console.warn("تعذر مزامنة قفل إنشاء الجلسة، سيتم استخدام قفل الجهاز.", error);
    }
    if (transaction && !transaction.committed) throw cooldownError(transaction.snapshot.val()?.createdAt);
    const createdAt = Number(transaction?.snapshot.val()?.createdAt || serverNow());
    localStorage.setItem(localLockKey, String(createdAt));
    return { identity, createdAt };
}
async function releaseSessionCreationLock(lock) {
    if (!lock?.identity || !lock?.createdAt) return;
    const lockRef = ref(db, SESSION_LOCK_ROOT + "/" + safePathSegment(lock.identity));
    try {
        await runTransaction(lockRef, (current) => {
            if (!current || Number(current.createdAt || 0) !== Number(lock.createdAt)) return;
            return null;
        });
    } catch (error) {
        console.warn("تعذر تحرير حجز إنشاء الجلسة.", error);
    }
    const localLockKey = CREATOR_ID_KEY + "_last_created_at";
    if (Number(localStorage.getItem(localLockKey) || 0) === Number(lock.createdAt)) localStorage.removeItem(localLockKey);
}
function isValidRoomForJoin(room, code, playerId) {
    const meta = room?.meta;
    if (!meta || String(meta.code || "") !== String(code)) return false;
    if (!["WAITING", "PLAYING", "FINISHED"].includes(meta.status)) return false;
    if (meta.status === "FINISHED" && !room.players?.[playerId]) return false;
    return true;
}
function assertRoomCanBeJoined(room, code, playerId) {
    if (!room || !room.meta || String(room.meta.code || "") !== String(code)) throw new Error("لم نجد جلسة بهذا الكود.");
    if (!["WAITING", "PLAYING", "FINISHED"].includes(room.meta.status)) throw new Error("هذه الجلسة غير متاحة للدخول.");
    if (room.meta.status === "FINISHED" && !room.players?.[playerId]) throw new Error("هذه الجلسة انتهت.");
}

function setConnection(online) {
    const badge = $("onlineBoardConnection");
    if (!badge) return;
    badge.classList.toggle("is-online", online);
    badge.classList.toggle("is-offline", !online);
    $("onlineBoardConnectionText").textContent = online ? "متصل" : "انقطع الاتصال";
}
function bindConnection() {
    connectionUnsubscribe?.();
    connectionUnsubscribe = onValue(ref(db, ".info/connected"), (snapshot) => setConnection(snapshot.val() === true));
    get(ref(db, ".info/serverTimeOffset")).then((snapshot) => { serverOffset = Number(snapshot.val()) || 0; }).catch(() => {});
}

function createBoardLetters() {
    const letters = [...ARABIC_LETTERS];
    for (let i = letters.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    return Array.from({ length: BOARD_SIZE }, (_, row) => Array.from({ length: BOARD_SIZE }, (_, col) => letters[(row * BOARD_SIZE + col) % letters.length]));
}
function createEmptyBoard() {
    // RTDB drops null children when serializing arrays. Empty strings keep the
    // full 5x5 shape persisted while remaining falsy for ownership checks.
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(""));
}
function normalizeBoardMatrix(value) {
    return Array.from({ length: BOARD_SIZE }, (_, row) => Array.from({ length: BOARD_SIZE }, (_, col) => {
        const owner = value?.[row]?.[col];
        return owner === "team1" || owner === "team2" ? owner : "";
    }));
}
function getCenterCell(matrix) {
    const rows = Array.isArray(matrix) && matrix.length ? matrix.length : BOARD_SIZE;
    const cols = Array.isArray(matrix?.[0]) && matrix[0].length ? matrix[0].length : BOARD_SIZE;
    return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
}
function questionForLetter(letter, used = {}) {
    const target = normalizeLetter(letter);
    const candidates = allQuestions().filter((question) =>
        normalizeLetter(question.letter) === target &&
        firstNormalizedAnswerLetter(question.answer) === target &&
        !used[question.id] && !used[question.legacyId]
    );
    // Never fall back to a different letter. A cell without a fresh matching
    // question remains unavailable until the team chooses another open cell.
    if (!candidates.length) return null;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const nextUsed = { ...used, [chosen.id]: true, ...(chosen.legacyId ? { [chosen.legacyId]: true } : {}) };
    return { question: { id: chosen.id, letter, text: chosen.question }, usedQuestions: nextUsed };
}
function questionById(id) {
    const key = String(id);
    return allQuestions().find((question) => question.id === key || question.legacyId === key);
}

function neighbors(row, col) {
    const odd = row % 2 === 1;
    return [[row, col - 1], [row, col + 1], [row - 1, odd ? col : col - 1], [row - 1, odd ? col + 1 : col], [row + 1, odd ? col : col - 1], [row + 1, odd ? col + 1 : col]]
        .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);
}
function findWinPath(board, team) {
    const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const parents = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const queue = [];
    if (team === "team1") {
        for (let row = 0; row < BOARD_SIZE; row += 1) if (board[row]?.[0] === team) { visited[row][0] = true; queue.push([row, 0]); }
    } else {
        for (let col = 0; col < BOARD_SIZE; col += 1) if (board[0]?.[col] === team) { visited[0][col] = true; queue.push([0, col]); }
    }
    while (queue.length) {
        const [row, col] = queue.shift();
        const reached = team === "team1" ? col === BOARD_SIZE - 1 : row === BOARD_SIZE - 1;
        if (reached) {
            const path = []; let cursor = [row, col];
            while (cursor) { path.unshift(cursor); cursor = parents[cursor[0]][cursor[1]]; }
            return path;
        }
        for (const [nextRow, nextCol] of neighbors(row, col)) {
            if (!visited[nextRow][nextCol] && board[nextRow]?.[nextCol] === team) {
                visited[nextRow][nextCol] = true;
                parents[nextRow][nextCol] = [row, col];
                queue.push([nextRow, nextCol]);
            }
        }
    }
    return null;
}

function activeSelectionPlayerIds(game) {
    const stored = Array.isArray(game?.selectionPlayerIds) ? game.selectionPlayerIds : [];
    const liveStored = stored.filter((id) => {
        const player = currentRoom?.players?.[id];
        return player && player.team === game?.choiceTeam && player.connected !== false;
    });
    if (liveStored.length) return liveStored;
    return teamPlayers(game?.choiceTeam).filter((player) => player.connected !== false).map((player) => player.id);
}

function choiceKey(choice) { return choice ? Number(choice.row) + ":" + Number(choice.col) : ""; }

function ensureDynamicGameNodes() {
    const boardWrap = $("onlineBoardContainer")?.parentElement;
    const gameMain = boardWrap?.parentElement;
    if (gameMain && !$("onlineBoardSelectionHint")) {
        const hint = document.createElement("div");
        hint.id = "onlineBoardSelectionHint";
        hint.className = "ob-selection-hint";
        hint.hidden = true;
        gameMain.insertBefore(hint, boardWrap);
    }
    if (!$("onlineBoardRevealOverlay")) {
        const overlay = document.createElement("div");
        overlay.id = "onlineBoardRevealOverlay";
        overlay.className = "ob-reveal-overlay";
        overlay.hidden = true;
        overlay.innerHTML = '<div class="ob-reveal-card" role="status" aria-live="assertive"><span class="ob-reveal-icon"></span><strong class="ob-reveal-title"></strong><b class="ob-reveal-answer"></b><small class="ob-reveal-detail"></small></div>';
        document.body.appendChild(overlay);
    }
}

function renderSelectionHint(game) {
    const hint = $("onlineBoardSelectionHint");
    if (!hint) return;
    const state = game?.state;
    if (state === STATES.SELECTING_CELL) {
        const team = game.choiceTeam;
        const choices = game.choices || {};
        const chooserId = String(game.choicePlayerId || "");
        if (chooserId) {
            const chooser = currentRoom?.players?.[chooserId];
            const choice = choices[chooserId];
            const chosenLetter = choice ? (game.cellLetters?.[Number(choice.row)]?.[Number(choice.col)] || "—") : "لم يختر بعد";
            const isMine = chooserId === myPlayerId;
            hint.hidden = false;
            hint.className = "ob-selection-hint" + (choice ? " is-agreed" : "");
            hint.innerHTML = '<strong>اختيار الخلية لـ ' + escapeHtml(chooser?.name || "الفائز بالسؤال") + '</strong><span>' + (isMine ? (choice ? "تم اختيار الخلية — جارٍ تجهيز السؤال." : "أنت الفائز بالسؤال، اختر الخلية التالية من اللوحة.") : "ينتظر الفريق اختيار الفائز بالسؤال للخلية التالية.") + '</span><div class="ob-choice-chips"><span class="ob-choice-chip"><b>' + escapeHtml(chooser?.name || "الفائز بالسؤال") + '</b><small>حرف ' + escapeHtml(chosenLetter) + '</small></span></div>';
            return;
        }
        const ids = activeSelectionPlayerIds(game);
        const labels = ids.map((id) => {
            const player = currentRoom?.players?.[id];
            const choice = choices[id];
            const agreedLetter = choice ? (game.cellLetters?.[Number(choice.row)]?.[Number(choice.col)] || ((Number(choice.row) + 1) + '،' + (Number(choice.col) + 1))) : 'لم يختر بعد';
            return '<span class="ob-choice-chip"><b>' + escapeHtml(player?.name || "لاعب") + '</b><small>حرف ' + escapeHtml(agreedLetter) + '</small></span>';
        }).join("");
        const agreed = ids.length > 0 && ids.every((id) => choices[id] && choiceKey(choices[id]) === choiceKey(choices[ids[0]]));
        hint.hidden = false;
        hint.className = "ob-selection-hint" + (agreed ? " is-agreed" : "");
        hint.innerHTML = '<strong>حق الاختيار لـ ' + escapeHtml(teamName(team)) + '</strong><span>' + (agreed ? 'تم الاتفاق — اعتماد الخلية جارٍ.' : 'فريقكم لم يتفق على الخلية بعد. اختاروا الخلية نفسها للتأكيد.') + '</span><div class="ob-choice-chips">' + (labels || '<small>بانتظار أعضاء الفريق.</small>') + '</div>';
        return;
    }
    if (state === STATES.COUNTDOWN_TO_QUESTION || state === STATES.CELL_CONFIRMED) {
        hint.hidden = false;
        hint.className = "ob-selection-hint is-countdown";
        const agreedChoices = Object.entries(game.choices || {}).map(([id, choice]) => {
            const player = currentRoom?.players?.[id];
            const letter = game.cellLetters?.[Number(choice?.row)]?.[Number(choice?.col)] || "—";
            return '<span class="ob-choice-chip"><b>' + escapeHtml(player?.name || "لاعب") + '</b><small>حرف ' + escapeHtml(letter) + '</small></span>';
        }).join("");
        hint.innerHTML = '<strong>تم اعتماد الخلية ' + escapeHtml(game.selectedCell?.letter || game.question?.letter || "") + '</strong><span>معاينة السؤال والخلايا — يفتح الجرس بعد انتهاء المؤقت.</span>' + (agreedChoices ? '<div class="ob-choice-chips">' + agreedChoices + '</div>' : '');
        return;
    }
    if (state === STATES.BUZZER_OPEN) {
        hint.hidden = false;
        hint.className = "ob-selection-hint is-bell-open";
        hint.innerHTML = '<strong>الجرس مفتوح للفريقين</strong><span>أول ضغط صالح يصل للسيرفر يحصل على فرصة الإجابة.</span>';
        return;
    }
    hint.hidden = true;
}

function renderRevealOverlay(game) {
    const overlay = $("onlineBoardRevealOverlay");
    if (!overlay) return;
    if (game?.state !== STATES.ANSWER_REVEAL) {
        overlay.hidden = true;
        overlay.classList.remove("is-visible", "is-correct", "is-wrong");
        return;
    }
    const correct = Boolean(game.result?.valid && game.pendingOwner);
    overlay.hidden = false;
    overlay.classList.toggle("is-visible", true);
    overlay.classList.toggle("is-correct", correct);
    overlay.classList.toggle("is-wrong", !correct);
    overlay.querySelector(".ob-reveal-icon").textContent = correct ? "✅" : "❌";
    overlay.querySelector(".ob-reveal-title").textContent = correct ? "إجابة صحيحة" : "لم تُقبل الإجابة";
    overlay.querySelector(".ob-reveal-answer").textContent = game.revealedAnswer || "—";
    overlay.querySelector(".ob-reveal-detail").textContent = correct ? ((game.result?.playerName || game.answer?.playerName || "لاعب") + " أجاب — فريق " + teamName(game.pendingOwner) + " يحصل على الخلية") : "بعد المحاولات المحددة تبقى الخلية بدون مالك.";
}

function renderBoard(game = currentRoom?.game || {}) {
    const container = $("onlineBoardContainer");
    const wrap = container?.parentElement;
    if (!container || !wrap || !Array.isArray(game.cellLetters)) return;
    const width = wrap.clientWidth || 700;
    const height = wrap.clientHeight || 475;
    const hexW = Math.max(42, Math.min(145, (width - 18) / 5.5, (height - 20) / 4.62));
    const hexH = hexW * 1.1547;
    const stepY = hexH * .75;
    const offset = hexW / 2;
    container.style.width = ((BOARD_SIZE - 1) * hexW + hexW + offset) + "px";
    container.style.height = ((BOARD_SIZE - 1) * stepY + hexH) + "px";
    container.style.setProperty("--ob-hex-size", hexW + "px");
    const board = normalizeBoardMatrix(game.board);
    const path = new Set((game.winPath || []).map(([row, col]) => row + ":" + col));
    const mine = getMyPlayer();
    const canSelect = game.state === STATES.SELECTING_CELL && (game.choicePlayerId ? mine?.id === game.choicePlayerId : mine?.team === game.choiceTeam);
    const choices = game.choices || {};
    const choiceCounts = {};
    const choiceOwners = {};
    Object.entries(choices).forEach(([playerId, choice]) => {
        if (!choice || choice.team !== game.choiceTeam) return;
        const key = choiceKey(choice);
        choiceCounts[key] = (choiceCounts[key] || 0) + 1;
        (choiceOwners[key] ||= []).push(currentRoom?.players?.[playerId]?.name || "لاعب");
    });
    container.innerHTML = "";
    for (let row = 0; row < BOARD_SIZE; row += 1) for (let col = 0; col < BOARD_SIZE; col += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "ob-cell";
        cell.dataset.row = row; cell.dataset.col = col;
        cell.style.left = (col * hexW + (row % 2 ? offset : 0)) + "px";
        cell.style.top = (row * stepY) + "px";
        cell.style.width = hexW + "px"; cell.style.height = hexH + "px";
        const owner = board[row]?.[col];
        if (owner) cell.classList.add(owner, "is-claimed");
        if (path.has(row + ":" + col)) cell.classList.add("win-path");
        if (game.selectedCell?.row === row && game.selectedCell?.col === col && !owner) cell.classList.add("is-selected");
        const key = row + ":" + col;
        const cellLetter = game.cellLetters[row]?.[col] || "";
        const hasQuestion = Boolean(questionForLetter(cellLetter, game.usedQuestions || {}));
        if (!owner && game.state === STATES.SELECTING_CELL && !hasQuestion) cell.classList.add("is-unavailable");
        if (!canSelect || owner || !hasQuestion) cell.classList.add("is-locked");
        if (choiceKey(choices[myPlayerId]) === key) cell.classList.add("is-my-choice");
        if (choiceCounts[key]) cell.classList.add("has-choice");
        const count = choiceCounts[key] ? '<span class="ob-cell-votes" title="' + escapeHtml(choiceOwners[key].join("، ")) + '">' + choiceCounts[key] + '</span>' : "";
        cell.innerHTML = '<span class="ob-cell-border"></span><span class="ob-cell-shape"><span class="ob-cell-letter">' + escapeHtml(cellLetter) + '</span>' + count + '</span>';
        cell.disabled = Boolean(owner || !canSelect || !hasQuestion);
        cell.setAttribute("aria-label", owner ? "خلية مملوكة" : "الخلية " + cellLetter + (canSelect ? " — اخترها" : " — مقفلة"));
        // Keep the board geometry fixed; pointer movement must never scale a cell.
        cell.style.setProperty("transform", "none", "important");
        cell.style.setProperty("transition", "none", "important");
        const cellShape = cell.querySelector(".ob-cell-shape");
        if (cellShape) {
            cellShape.style.setProperty("transform", "none", "important");
            cellShape.style.setProperty("transition", "none", "important");
            cellShape.style.setProperty("animation", "none", "important");
        }
        cell.addEventListener("click", () => selectCell(row, col));
        container.appendChild(cell);
    }
}

function renderTeamNameInputs() {
    const host = isHost();
    ["onlineBoardTeam1Name", "onlineBoardTeam2Name"].forEach((id, index) => { const input = $(id); if (input) { input.value = teamName(teamKeys[index]); input.disabled = !host || currentRoom?.meta?.status !== "WAITING"; } });
}
function renderPlayerRow(player, allowChoices = true) {
    const choice = allowChoices && (player.id === myPlayerId || isHost()) ? '<div class="ob-choice-buttons"><button type="button" class="' + (player.team === "team1" ? "is-one" : "") + '" data-player="' + escapeHtml(player.id) + '" data-team="team1">1</button><button type="button" class="' + (player.team === "team2" ? "is-two" : "") + '" data-player="' + escapeHtml(player.id) + '" data-team="team2">2</button></div>' : '<small>' + (player.connected === false ? "منقطع" : "متصل") + '</small>';
    return '<div class="ob-player-row"><strong>' + escapeHtml(player.name || "لاعب") + (player.id === currentRoom?.meta?.hostId ? " ★" : "") + '</strong>' + choice + '</div>';
}
function bindChoiceButtons() { document.querySelectorAll(".ob-choice-buttons button").forEach((button) => button.addEventListener("click", () => setPlayerTeam(button.dataset.player, button.dataset.team))); }
function renderLobby() {
    if (!currentRoom) return;
    const list = playersArray();
    const one = teamPlayers("team1"); const two = teamPlayers("team2"); const unassigned = list.filter((player) => !player.team);
    $("onlineBoardRoomCode").textContent = roomCode || "------";
    $("onlineBoardTeam1Label").textContent = teamName("team1"); $("onlineBoardTeam2Label").textContent = teamName("team2");
    $("onlineBoardTeam1Count").textContent = one.length; $("onlineBoardTeam2Count").textContent = two.length; $("onlineBoardUnassignedCount").textContent = unassigned.length;
    $("onlineBoardTeam1Players").innerHTML = one.length ? one.map((player) => renderPlayerRow(player)).join("") : '<span class="ob-player-row"><small>لم يختر أحد هذا الفريق</small></span>';
    $("onlineBoardTeam2Players").innerHTML = two.length ? two.map((player) => renderPlayerRow(player)).join("") : '<span class="ob-player-row"><small>لم يختر أحد هذا الفريق</small></span>';
    $("onlineBoardUnassignedPlayers").innerHTML = unassigned.length ? unassigned.map((player) => renderPlayerRow(player)).join("") : '<span>لا يوجد لاعبون بانتظار الاختيار.</span>';
    $("onlineBoardUnassignedCard").hidden = !unassigned.length;
    $("onlineBoardLobbyPlayerCount").textContent = list.length;
    const notice = $("onlineBoardLobbyNotice");
    if (!one.length || !two.length) { notice.textContent = "لا يمكن البدء حتى يوجد لاعب في كلا الفريقين."; notice.className = "ob-balance-note is-warning"; }
    else if (Math.abs(one.length - two.length) > 1) { notice.textContent = "اقتراح: التوزيع غير متوازن؛ يمكن تبديل الفريق قبل البداية."; notice.className = "ob-balance-note is-warning"; }
    else { notice.textContent = "التوزيع جاهز — الاختيار يقفل عند بدء المباراة."; notice.className = "ob-balance-note is-ready"; }
    $("onlineBoardHostActions").hidden = !isHost();
    $("onlineBoardStartBtn").disabled = !isHost() || !one.length || !two.length || currentRoom.meta.status !== "WAITING";
    renderTeamNameInputs(); bindChoiceButtons();
}

function renderLiveTeams(game) {
    const one = teamPlayers("team1"); const two = teamPlayers("team2");
    ["onlineBoardGameTeam1", "onlineBoardLiveTeam1", "onlineBoardBellName1"].forEach((id) => { if ($(id)) $(id).textContent = teamName("team1"); });
    ["onlineBoardGameTeam2", "onlineBoardLiveTeam2", "onlineBoardBellName2"].forEach((id) => { if ($(id)) $(id).textContent = teamName("team2"); });
    $("onlineBoardLiveScore1").textContent = Number(game?.scores?.team1 || 0); $("onlineBoardLiveScore2").textContent = Number(game?.scores?.team2 || 0);
    $("onlineBoardLivePlayers1").textContent = one.map((player) => player.name).join("، ") || "—";
    $("onlineBoardLivePlayers2").textContent = two.map((player) => player.name).join("، ") || "—";
    $("onlineBoardLiveRoomCode").textContent = roomCode;
}

function renderReadyPanel(game) {
    const panel = $("onlineBoardReadyPanel");
    if (!panel) return;
    const readyPhase = game?.state === STATES.READY_CHECK;
    panel.hidden = !readyPhase;
    if (!readyPhase) return;
    const list = connectedPlayers();
    const readyBy = game.readyBy || {};
    const readyCount = list.filter((player) => readyBy[player.id]).length;
    $("onlineBoardReadyStatus").textContent = readyCount === list.length && list.length
        ? "اكتملت الجاهزية — يبدأ السؤال الآن."
        : "جاهزية " + readyCount + " من " + list.length + " لاعبين متصلين.";
    const button = $("onlineBoardReadyBtn");
    button.disabled = Boolean(readyBy[myPlayerId]);
    button.textContent = readyBy[myPlayerId] ? "تم — أنا جاهز" : "أنا جاهز";
    $("onlineBoardReadyPlayers").innerHTML = list.length ? list.map((player) => '<span class="ob-ready-player ' + (readyBy[player.id] ? "is-ready" : "") + '"><i></i>' + escapeHtml(player.name || "لاعب") + (readyBy[player.id] ? " ✓" : " — ينتظر") + '</span>').join("") : '<small>بانتظار اللاعبين…</small>';
}

function renderAnswerLog(game) {
    const node = $("onlineBoardAnswerLogItems");
    if (!node) return;
    const entries = [];
    (game?.bellPresses || []).slice(-20).forEach((item) => entries.push({ ...item, kind: "bell" }));
    (game?.answerLog || []).slice(-30).forEach((item) => entries.push({ ...item, kind: "answer" }));
    entries.sort((a, b) => Number(a.at || a.pressedAt || 0) - Number(b.at || b.pressedAt || 0));
    $("onlineBoardAnswerLogCount").textContent = String(entries.length);
    node.innerHTML = entries.length ? entries.slice(-35).map((item) => {
        if (item.kind === "bell") return '<div class="ob-answer-log-item is-bell"><i>🔔</i><strong>' + escapeHtml(item.name || "لاعب") + '</strong><small>ضغط الجرس أولًا</small></div>';
        return '<div class="ob-answer-log-item ' + (item.valid ? "is-good" : "is-bad") + '"><i>' + (item.valid ? "✅" : "❌") + '</i><strong>' + escapeHtml(item.playerName || "لاعب") + ': ' + escapeHtml(item.text || "") + '</strong><small>' + (item.valid ? "صحيحة" : "خاطئة") + '</small></div>';
    }).join("") : '<small style="color:rgba(255,255,255,.45)">لم تُسجّل إجابات بعد.</small>';
}

function renderGame() {
    ensureDynamicGameNodes();
    const game = currentRoom?.game || {};
    const state = game.state || STATES.BUZZER_OPEN;
    const mine = getMyPlayer();
    const myTeam = mine?.team;
    const stateLabels = {
        [STATES.READY_CHECK]: "بانتظار الجاهزية",
        [STATES.SELECTING_CELL]: "اختيار الخلية",
        [STATES.CELL_CONFIRMED]: "تم اعتماد الخلية",
        [STATES.COUNTDOWN_TO_QUESTION]: "يبدأ السؤال قريبًا",
        [STATES.BUZZER_OPEN]: "الجرس مفتوح",
        [STATES.TEAM_ONE_ANSWERING]: "الفريق الأول يجيب",
        [STATES.TEAM_TWO_ANSWERING]: "الفريق الثاني يجيب",
        [STATES.VALIDATING]: "جاري التحقق",
        [STATES.ANSWER_REVEAL]: "النتيجة",
        [STATES.GAME_FINISHED]: "انتهت المباراة"
    };
    $("onlineBoardGameState").textContent = stateLabels[state] || "جاري التحديث";
    $("onlineBoardRound").textContent = "السؤال " + Number(game.round || 1) + " / " + MAX_QUESTIONS;
    $("onlineBoardCountdown").textContent = game.deadlineAt ? getRemaining(game) + "ث" : "—";
    $("onlineBoardLetter").textContent = game.selectedCell?.letter || game.question?.letter || "—";
    $("onlineBoardQuestionRound").textContent = "الجولة " + (ROUND_WORDS[(Number(game.round || 1) - 1) % ROUND_WORDS.length] || "الأولى");
    const questionVisible = [STATES.COUNTDOWN_TO_QUESTION, STATES.BUZZER_OPEN, STATES.TEAM_ONE_ANSWERING, STATES.TEAM_TWO_ANSWERING, STATES.VALIDATING, STATES.ANSWER_REVEAL].includes(state);
    $("onlineBoardQuestion").textContent = questionVisible ? (game.question?.text || "بانتظار السؤال") : state === STATES.GAME_FINISHED ? "اكتمل مسار الفريق الفائز" : state === STATES.SELECTING_CELL ? "اختاروا خلية واتفقوا عليها" : state === STATES.READY_CHECK ? "سيظهر السؤال بعد جاهزية الجميع" : "سيظهر السؤال بعد العد التنازلي";
    $("onlineBoardQuestion").closest(".ob-question-strip")?.classList.toggle("is-buzzed", Boolean(game.buzz));
    $("onlineBoardTimer").textContent = game.deadlineAt ? getRemaining(game) + "ث" : state === STATES.BUZZER_OPEN ? "جرس" : "—";
    renderLiveTeams(game); renderBoard(game); renderReadyPanel(game); renderAnswerLog(game);
    renderSelectionHint(game);
    renderRevealOverlay(game);

    const questionOpen = state === STATES.BUZZER_OPEN && Boolean(game.question) && !game.pendingOwner;
    $("onlineBoardBellBar").hidden = !questionOpen;
    ["team1", "team2"].forEach((team, index) => { const button = $("onlineBoardBell" + (index + 1)); if (!button) return; const can = questionOpen && myTeam === team; button.disabled = !can; button.classList.toggle("is-winner", game.buzz?.team === team); });
    const answerTeam = state === STATES.TEAM_ONE_ANSWERING ? "team1" : state === STATES.TEAM_TWO_ANSWERING ? "team2" : "";
    const answeringMine = Boolean(answerTeam && myTeam === answerTeam && game.answerTeam === answerTeam);
    $("onlineBoardAnswerPanel").hidden = !answeringMine;
    $("onlineBoardAnswerStatus").textContent = answerTeam ? ("فرصة الإجابة لـ " + teamName(answerTeam)) : "الفريق صاحب الجرس يجيب الآن";
    $("onlineBoardAnswerCountdown").textContent = answerTeam ? getRemaining(game) + "ث" : "—";
    $("onlineBoardAnswerInput").disabled = !answeringMine;
    if (!answeringMine) $("onlineBoardAnswerInput").value = "";
    $("onlineBoardFeedback").textContent = game.feedback || (questionOpen ? "الجرسان مفتوحان — أول ضغط يصل للسيرفر يحصل على فرصة الإجابة." : "");
    $("onlineBoardFeedback").className = "ob-feedback" + (game.feedbackTone ? " is-" + game.feedbackTone : "");
    $("onlineBoardHostGameActions").hidden = !isHost() || state === STATES.GAME_FINISHED;
    $("onlineBoardNextRound").hidden = true;
    const changeButton = $("onlineBoardChangeQuestion");
    const changeVotes = connectedPlayers().filter((player) => game.questionChangeVotes?.[player.id]).length;
    const changeRequired = Math.max(1, Math.ceil(connectedPlayers().length / 2));
    if (changeButton) { changeButton.hidden = !(questionOpen && !game.buzz); changeButton.parentElement.hidden = changeButton.hidden; changeButton.disabled = Boolean(game.questionChangeVotes?.[myPlayerId]); $("onlineBoardChangeQuestionVotes").textContent = changeVotes + "/" + changeRequired; }
    $("onlineBoardFinish").disabled = state === STATES.GAME_FINISHED;
}

function renderResults() {
    const game = currentRoom?.game || {}; const winner = game.winnerTeam;
    $("onlineBoardResultTitle").textContent = winner ? "فوز " + teamName(winner) : "انتهت المباراة";
    $("onlineBoardResultText").textContent = winner === "team1" ? "اكتمل مسار اليسار ↔ اليمين." : winner === "team2" ? "اكتمل مسار الأعلى ↕ الأسفل." : "يمكنكم بدء مباراة جديدة من نفس الجلسة.";
    $("onlineBoardResultScores").innerHTML = '<div class="ob-result-score ob-result-score--one"><span>' + escapeHtml(teamName("team1")) + '</span><strong>' + Number(game.scores?.team1 || 0) + '</strong></div><div class="ob-result-score ob-result-score--two"><span>' + escapeHtml(teamName("team2")) + '</span><strong>' + Number(game.scores?.team2 || 0) + '</strong></div>';
    const participants = connectedPlayers();
    const readyBy = game.rematchReadyBy || {};
    const readyCount = participants.filter((player) => readyBy[player.id]).length;
    const rematchButton = $("onlineBoardPlayAgain");
    rematchButton.hidden = false;
    rematchButton.disabled = Boolean(readyBy[myPlayerId]);
    rematchButton.textContent = readyBy[myPlayerId] ? "تم — بانتظار الجميع" : "جاهز لمباراة جديدة";
    $("onlineBoardRematchStatus").textContent = participants.length
        ? "جاهزية إعادة المباراة: " + readyCount + " من " + participants.length + " — عند اكتمالهم تبدأ الجولة التمهيدية."
        : "لا يوجد لاعبون متصلون حاليًا.";
    $("onlineBoardRematchPlayers").innerHTML = participants.length
        ? participants.map((player) => '<span class="ob-rematch-player ' + (readyBy[player.id] ? "is-ready" : "") + '">' + escapeHtml(player.name || "لاعب") + (readyBy[player.id] ? " ✓" : " — ينتظر") + '</span>').join("")
        : '<small>يمكنك المغادرة والعودة لاحقًا.</small>';
}

function renderRoom(room) {
    currentRoom = room;
    if (room?.meta?.status === "PLAYING" && !extraQuestionBankLoaded) loadExtraQuestionBank().then(() => { if (currentRoom === room) renderGame(); }).catch(() => {});
    if (!room?.meta) return;
    if (room.meta.status === "FINISHED" || room.game?.state === STATES.GAME_FINISHED || room.game?.state === STATES.FINISHED) { setView("onlineBoardResults"); renderResults(); }
    else if (room.meta.status === "PLAYING") {
        setView("onlineBoardGame");
        renderGame();
        maybeAdvanceReadyPhase(room).catch(() => {});
        window.HojasFirstGameTour?.maybeStart({
            mode: "online-board",
            active: () => Boolean(currentRoom && currentRoom.meta && currentRoom.meta.status === "PLAYING")
        });
    }
    else { setView("onlineBoardLobby"); renderLobby(); }
    if (room.game?.state === STATES.VALIDATING) resolveAnswer(room.game).catch(() => {});
    if ([STATES.COUNTDOWN_TO_QUESTION, STATES.CELL_CONFIRMED, STATES.TEAM_ONE_ANSWERING, STATES.TEAM_TWO_ANSWERING, STATES.ANSWER_REVEAL].includes(room.game?.state) && getRemaining(room.game) <= 0) advanceTimedPhase(room.game).catch((error) => console.error("online phase transition failed", error));
}

async function subscribeToRoom() {
    roomUnsubscribe?.(); chatUnsubscribe?.();
    roomUnsubscribe = onValue(roomRef(), (snapshot) => { if (!snapshot.exists()) { showToast("الجلسة غير موجودة أو انتهت.", true); leaveRoom(false); return; } renderRoom(snapshot.val()); });
    chatUnsubscribe = onValue(ref(db, roomPath() + "/chat"), (snapshot) => renderChat(snapshot.val() || {}));
}
async function setPresence() {
    if (!roomCode || !myPlayerId) throw new Error("تعذر تحديد بيانات الدخول.");
    // Read and validate the room first. Updating only the player child avoids a
    // race where a room-level transaction starts from an empty local cache and
    // is incorrectly aborted even though the room exists on Firebase.
    const snapshot = await get(roomRef());
    if (!snapshot.exists()) throw new Error("لم نجد جلسة بهذا الكود.");
    const room = snapshot.val();
    assertRoomCanBeJoined(room, roomCode, myPlayerId);
    const current = room.players?.[myPlayerId] || {};
    await update(playerRef(), {
        id: myPlayerId,
        name: myName,
        connected: true,
        joinedAt: current.joinedAt || serverNow(),
        lastSeen: serverTimestamp()
    });
    const playerSnapshot = await get(playerRef());
    if (!playerSnapshot.exists()) throw new Error("تعذر حفظ دخولك في الجلسة. حاول مرة أخرى.");
    currentRoom = { ...room, players: { ...(room.players || {}), [myPlayerId]: playerSnapshot.val() } };
    // Removing the player on disconnect cannot recreate a deleted room, unlike
    // an onDisconnect update on a child path.
    await onDisconnect(playerRef()).update({ connected: false, lastSeen: serverTimestamp(), disconnectedAt: serverTimestamp() });
    clearInterval(heartbeatTimer); heartbeatTimer = setInterval(() => setPresenceHeartbeat().catch(() => {}), 15000);
}
async function setPresenceHeartbeat() {
    if (!roomCode || !myPlayerId) return;
    try {
        const snapshot = await get(roomRef());
        if (!snapshot.exists() || !isValidRoomForJoin(snapshot.val(), roomCode, myPlayerId)) return;
        await update(playerRef(), { connected: true, lastSeen: serverTimestamp() });
    } catch (error) {
        console.warn("تعذر تحديث حضور اللاعب.", error);
    }
}
async function connectToRoom(code, playerId, name) {
    roomCode = cleanCode(code); myPlayerId = playerId; myName = cleanName(name);
    const snapshot = await get(ref(db, ROOM_ROOT + "/" + roomCode));
    if (!snapshot.exists()) throw new Error("لم نجد جلسة بهذا الكود.");
    assertRoomCanBeJoined(snapshot.val(), roomCode, myPlayerId);
    currentRoom = snapshot.val();
    await setPresence();
    saveSession(); bindConnection(); await subscribeToRoom();
}

async function createRoom(name) {
    if (busy) return; busy = true; const cleanNameValue = cleanName(name); setLoadingOverlay(true, "جاري إنشاء جلسة آمنة ومزامنتها…");
    let lock = null;
    let roomCreated = false;
    let playerId = "";
    let selected = "";
    try {
        lock = await acquireSessionCreationLock();
        playerId = randomId();
        for (let attempt = 0; attempt < 8 && !selected; attempt += 1) {
            const candidate = randomRoomCode(); const root = ref(db, ROOM_ROOT + "/" + candidate);
            const result = await runTransaction(root, (current) => current !== null ? undefined : {
                meta: { code: candidate, hostId: playerId, hostName: cleanNameValue, status: "WAITING", createdAt: serverNow(), updatedAt: serverNow(), team1Name: "الفريق الأول", team2Name: "الفريق الثاني" },
                players: { [playerId]: { id: playerId, name: cleanNameValue, host: true, team: null, connected: true, joinedAt: serverNow() } },
                game: { state: STATES.WAITING, round: 0, board: [], cellLetters: [], selectedCell: null, question: null, usedQuestions: {}, choiceTeam: "", choicePlayerId: "", selectionPlayerIds: [], choices: {}, readyBy: {}, rematchReadyBy: {}, questionChangeVotes: {}, bellPresses: [], answerLog: [], pendingSelectionPlayerIds: [], pendingOwner: "", countdownDeadlineAt: 0, answerTeam: "", answerPhase: "", validationClaim: "", validationClaimAt: 0, buzz: null, answer: null, attemptsUsed: 0, result: null, revealedAnswer: "", feedback: "", feedbackTone: "", deadlineAt: 0, scores: { team1: 0, team2: 0 }, winnerTeam: "", winPath: [] }
            });
            if (result.committed) selected = candidate;
        }
        if (!selected) throw new Error("تعذر إنشاء كود للجلسة.");
        roomCreated = true;
        trackOnlineSession(selected).catch(() => {});
        // Persist as soon as the room exists. If presence/subscription briefly
        // fails, the player can still see and resume this room instead of being
        // blocked by the ten-minute creator lock with no visible session.
        localStorage.setItem("hojas_online_board_player_" + selected, playerId);
        saveSessionRecord(selected, playerId, cleanNameValue);
        await attachSessionCreationLock(lock, selected, cleanNameValue);
        await connectToRoom(selected, playerId, cleanNameValue); showToast("تم إنشاء الجلسة " + selected);
    } catch (error) {
        if (lock && !roomCreated) await releaseSessionCreationLock(lock);
        console.error(error);
        if (roomCreated && selected) {
            showToast("تم إنشاء الجلسة " + selected + " لكن تعذر فتحها. اضغط «العودة للجلسة» للمحاولة مرة أخرى.", true);
        } else {
            showToast(error.message || "تعذر إنشاء الجلسة.", true);
        }
        showResume();
    }
    finally { finishLoadingOverlay(); busy = false; }
}

async function joinRoom(code, name, savedPlayerId = "") {
    if (busy) return; busy = true; setLoadingOverlay(true, "جاري الدخول وانتظار بيانات الجلسة…");
    try {
        const cleanRoom = cleanCode(code); const cleanNameValue = cleanName(name);
        if (!/^\d{6}$/.test(cleanRoom)) throw new Error("اكتب كود الجلسة المكوّن من 6 أرقام.");
        const playerId = savedPlayerId || localStorage.getItem("hojas_online_board_player_" + cleanRoom) || randomId();
        const snapshot = await get(ref(db, ROOM_ROOT + "/" + cleanRoom));
        if (!snapshot.exists()) throw new Error("لم نجد جلسة بهذا الكود.");
        assertRoomCanBeJoined(snapshot.val(), cleanRoom, playerId);
        localStorage.setItem("hojas_online_board_player_" + cleanRoom, playerId);
        await connectToRoom(cleanRoom, playerId, cleanNameValue); showToast("دخلت الجلسة " + cleanRoom);
    } catch (error) { console.error(error); showToast(error.message || "تعذر دخول الجلسة.", true); }
    finally { finishLoadingOverlay(); busy = false; }
}

async function setPlayerTeam(playerId, team) {
    if (!teamKeys.includes(team) || currentRoom?.meta?.status !== "WAITING" || (playerId !== myPlayerId && !isHost())) return;
    await update(ref(db, roomPath() + "/players/" + playerId), { team });
}
let nameUpdateTimer = null;
function updateTeamName(team, value) {
    if (!isHost() || currentRoom?.meta?.status !== "WAITING") return;
    clearTimeout(nameUpdateTimer); nameUpdateTimer = setTimeout(() => update(ref(db, roomPath() + "/meta"), { [team + "Name"]: cleanName(value), updatedAt: serverTimestamp() }), 160);
}
async function startMatch() {
    await loadExtraQuestionBank();
    if (!isHost() || !currentRoom || currentRoom.meta.status !== "WAITING") return;
    const one = teamPlayers("team1"); const two = teamPlayers("team2");
    if (!one.length || !two.length) { showToast("يجب وجود لاعب واحد على الأقل في كل فريق.", true); return; }
    const board = createBoardLetters();
    const game = {
        state: STATES.READY_CHECK,
        round: 1,
        board: createEmptyBoard(),
        cellLetters: board,
        selectedCell: null,
        question: null,
        usedQuestions: {},
        choiceTeam: "",
        choicePlayerId: "",
        selectionPlayerIds: [],
        choices: {},
        pendingSelectionPlayerIds: [],
        pendingOwner: "",
        countdownDeadlineAt: 0,
        deadlineAt: 0,
        answerTeam: "",
        answerPhase: "",
        buzz: null,
        answer: null,
        validationClaim: "",
        validationClaimAt: 0,
        attemptsUsed: 0,
        result: null,
        revealedAnswer: "",
        readyBy: {},
        rematchReadyBy: {},
        questionChangeVotes: {},
        bellPresses: [],
        answerLog: [],
        feedback: "بانتظار ضغط جميع اللاعبين على «أنا جاهز».",
        feedbackTone: "countdown",
        scores: { team1: 0, team2: 0 },
        winnerTeam: "",
        winPath: []
    };
    const result = await runTransaction(roomRef(), (room) => {
        if (!room?.meta || room.meta.status !== "WAITING") return;
        return { ...room, meta: { ...room.meta, status: "PLAYING", updatedAt: serverTimestamp() }, game };
    });
    if (!result.committed) showToast("بدأت المباراة من جهاز آخر.", true);
}

function prepareReadyCountdown(game) {
    const letters = game?.cellLetters || [];
    const center = getCenterCell(letters);
    const row = center.row;
    const col = center.col;
    if (game.board?.[row]?.[col]) return null;
    const picked = questionForLetter(letters?.[row]?.[col], game.usedQuestions || {});
    if (!picked) return null;
    const selected = { row, col, letter: letters[row][col] };
    const countdownAt = serverNow() + FIRST_PREVIEW_SECONDS * 1000;
    return { ...game, state: STATES.COUNTDOWN_TO_QUESTION, selectedCell: selected, question: picked.question, usedQuestions: picked.usedQuestions, countdownDeadlineAt: countdownAt, deadlineAt: countdownAt, questionChangeVotes: {}, buzz: null, answer: null, answerTeam: "", answerPhase: "", attemptsUsed: 0, result: null, pendingOwner: "", feedback: "اكتملت الجاهزية — يظهر السؤال بعد معاينة 10 ثوانٍ.", feedbackTone: "countdown" };
}

async function setReady() {
    if (!currentRoom || currentRoom.meta?.status !== "PLAYING" || currentRoom.game?.state !== STATES.READY_CHECK) return;
    const result = await runTransaction(roomRef(), (room) => {
        if (!room?.game || room.game.state !== STATES.READY_CHECK) return;
        const participants = Object.values(room.players || {}).filter((player) => player && player.id && player.connected !== false);
        const readyBy = { ...(room.game.readyBy || {}), [myPlayerId]: true };
        const allReady = participants.length > 0 && participants.every((player) => readyBy[player.id]);
        if (!allReady) return { ...room, game: { ...room.game, readyBy, feedback: "تم تسجيل جاهزيتك — ننتظر بقية اللاعبين.", feedbackTone: "countdown" } };
        const nextGame = prepareReadyCountdown({ ...room.game, readyBy });
        if (!nextGame) return { ...room, game: { ...room.game, readyBy, feedback: "لا يوجد سؤال مناسب للحروف المتاحة.", feedbackTone: "bad" } };
        return { ...room, game: nextGame };
    });
    if (!result.committed) showToast("بدأت الجاهزية من لاعب آخر.", true);
}

async function maybeAdvanceReadyPhase(room) {
    if (!room?.game || room.game.state !== STATES.READY_CHECK) return;
    await runTransaction(roomRef(), (currentRoomValue) => {
        if (!currentRoomValue?.game || currentRoomValue.game.state !== STATES.READY_CHECK) return;
        const participants = Object.values(currentRoomValue.players || {}).filter((player) => player && player.id && player.connected !== false);
        const readyBy = currentRoomValue.game.readyBy || {};
        if (!participants.length || !participants.every((player) => readyBy[player.id])) return;
        const nextGame = prepareReadyCountdown(currentRoomValue.game);
        return nextGame ? { ...currentRoomValue, game: nextGame } : undefined;
    }).catch(() => {});
}

async function selectCell(row, col) {
    const game = currentRoom?.game || {};
    const mine = getMyPlayer();
    const canChoose = game.choicePlayerId ? mine?.id === game.choicePlayerId : mine?.team === game.choiceTeam;
    if (currentRoom?.meta?.status !== "PLAYING" || game.state !== STATES.SELECTING_CELL || !canChoose) return;
    if (game.board?.[row]?.[col]) { showToast("هذه الخلية مملوكة ولا يمكن اختيارها.", true); return; }
    const letter = game.cellLetters?.[row]?.[col];
    if (!letter || !questionForLetter(letter, game.usedQuestions || {})) { showToast("لا يوجد سؤال جديد مطابق لهذا الحرف.", true); return; }
    const fallbackIds = activeSelectionPlayerIds({ ...game, choiceTeam: mine.team });
    const result = await runTransaction(gameRef(), (current) => {
        const currentCanChoose = current?.choicePlayerId ? current.choicePlayerId === mine.id : current?.choiceTeam === mine.team;
        if (!current || current.state !== STATES.SELECTING_CELL || !currentCanChoose || current.board?.[row]?.[col]) return;
        const storedSelectionIds = Array.isArray(current.selectionPlayerIds) ? current.selectionPlayerIds : [];
        const selectionPlayerIds = current.choicePlayerId ? [current.choicePlayerId] : (fallbackIds.length ? fallbackIds : (storedSelectionIds.length ? storedSelectionIds : [myPlayerId]));
        const choices = { ...(current.choices || {}), [myPlayerId]: { row, col, team: mine.team, at: serverTimestamp() } };
        const firstChoice = choices[selectionPlayerIds[0]];
        const agreed = current.choicePlayerId ? Boolean(choices[current.choicePlayerId]) : selectionPlayerIds.every((id) => choices[id] && choiceKey(choices[id]) === choiceKey(firstChoice));
        if (!agreed) return { ...current, choices, selectionPlayerIds, feedback: "فريقكم لم يتفق على الخلية بعد.", feedbackTone: "countdown" };
        const picked = questionForLetter(current.cellLetters?.[row]?.[col], current.usedQuestions || {});
        if (!picked) return { ...current, choices, selectionPlayerIds, feedback: "هذه الخلية لا تملك سؤالًا جديدًا مطابقًا — اختاروا خلية أخرى.", feedbackTone: "bad" };
        const countdownAt = serverNow() + INITIAL_COUNTDOWN_SECONDS * 1000;
        return {
            ...current,
            state: STATES.COUNTDOWN_TO_QUESTION,
            selectedCell: { row, col, letter: current.cellLetters[row][col] },
            question: picked.question,
            usedQuestions: picked.usedQuestions,
            choices,
            selectionPlayerIds,
            questionChangeVotes: {},
            countdownDeadlineAt: countdownAt,
            deadlineAt: countdownAt,
            answerTeam: "",
            buzz: null,
            answer: null,
            validationClaim: "",
            validationClaimAt: 0,
            attemptsUsed: 0,
            result: null,
            pendingOwner: "",
            feedback: "تم اختيار الخلية — يبدأ السؤال بعد 3 ثوانٍ.",
            feedbackTone: "countdown"
        };
    });
    if (!result.committed) showToast("تم تحديث اختيار الفريق من لاعب آخر.", true);
}

function stateForTeam(team) { return team === "team1" ? STATES.TEAM_ONE_ANSWERING : STATES.TEAM_TWO_ANSWERING; }
function otherTeam(team) { return team === "team1" ? "team2" : "team1"; }

function transitionAfterFailedAttempt(current, message) {
    const attempts = Number(current.attemptsUsed || 0);
    const attemptedTeam = current.answerTeam || current.buzz?.team || "";
    const opponent = otherTeam(attemptedTeam);
    if (attempts === 1 && current.answerPhase !== "opponent" && opponent) {
        return {
            ...current,
            state: stateForTeam(opponent),
            answerTeam: opponent,
            answerPhase: "opponent",
            buzz: null,
            answer: null,
            deadlineAt: serverNow() + OTHER_ANSWER_SECONDS * 1000,
            feedback: message + " ينتقل حق الإجابة للفريق الآخر لمدة 10 ثوانٍ.",
            feedbackTone: "bad",
            result: null,
            validationClaim: "",
            validationClaimAt: 0
        };
    }
    if (attempts < MAX_TOTAL_ATTEMPTS) {
        return {
            ...current,
            state: STATES.BUZZER_OPEN,
            answerTeam: "",
            answerPhase: "",
            buzz: null,
            answer: null,
            deadlineAt: 0,
            feedback: message + " فُتح الجرس مجددًا — المحاولة " + (attempts + 1) + " من " + MAX_TOTAL_ATTEMPTS + ".",
            feedbackTone: "bad",
            result: null,
            validationClaim: "",
            validationClaimAt: 0
        };
    }
    const expected = questionById(current.question?.id)?.answer || "";
    return {
        ...current,
        state: STATES.ANSWER_REVEAL,
        answerTeam: "",
        answerPhase: "",
        buzz: null,
        answer: null,
        pendingOwner: "",
        pendingSelectionPlayerIds: [],
        revealedAnswer: expected,
        result: { valid: false, reason: message },
        deadlineAt: serverNow() + REVEAL_MILLISECONDS,
        feedback: "❌ انتهت المحاولات — تبقى الخلية بدون مالك.",
        feedbackTone: "bad",
        validationClaim: "",
        validationClaimAt: 0
    };
}

async function pressBell(team) {
    const game = currentRoom?.game; const mine = getMyPlayer();
    if (!game || game.state !== STATES.BUZZER_OPEN || !game.question || game.buzz || mine?.team !== team) return;
    const result = await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.BUZZER_OPEN || !current.question || current.buzz) return;
        const attemptsUsed = Number(current.attemptsUsed || 0) + 1;
        return {
            ...current,
            state: stateForTeam(team),
            answerTeam: team,
            answerPhase: "bell",
            buzz: { playerId: myPlayerId, name: myName, team, pressedAt: serverTimestamp(), order: attemptsUsed },
            bellPresses: [...(current.bellPresses || []), { playerId: myPlayerId, name: myName, team, at: serverNow(), order: attemptsUsed }].slice(-40),
            answer: null,
            validationClaim: "",
            validationClaimAt: 0,
            result: null,
            attemptsUsed,
            deadlineAt: serverNow() + FIRST_ANSWER_SECONDS * 1000,
            feedback: "🔔 " + myName + " ضغط أولًا — أعضاء فريقه يستطيعون إرسال الإجابة.",
            feedbackTone: "bell"
        };
    });
    if (!result.committed) showToast("سبقك لاعب آخر بالجرس.", true);
}

async function requestQuestionChange() {
    if (!currentRoom || currentRoom.meta?.status !== "PLAYING") return;
    const result = await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.BUZZER_OPEN || current.buzz || !current.question) return;
        const votes = { ...(current.questionChangeVotes || {}), [myPlayerId]: true };
        const participants = Object.values(currentRoom?.players || {}).filter((player) => player && player.id && player.connected !== false);
        const required = Math.max(1, Math.ceil(participants.length / 2));
        const voteCount = participants.filter((player) => votes[player.id]).length;
        if (voteCount < required) return { ...current, questionChangeVotes: votes, feedback: "تم احتساب طلبك — نحتاج موافقة أغلبية اللاعبين لتغيير السؤال.", feedbackTone: "countdown" };
        const selectedLetter = current.selectedCell?.letter || current.question?.letter;
        const next = questionForLetter(selectedLetter, current.usedQuestions || {});
        if (!next) return { ...current, questionChangeVotes: votes, feedback: "لا يوجد سؤال آخر لهذا الحرف.", feedbackTone: "bad" };
        const deadlineAt = serverNow() + INITIAL_COUNTDOWN_SECONDS * 1000;
        return { ...current, state: STATES.COUNTDOWN_TO_QUESTION, question: next.question, usedQuestions: next.usedQuestions, questionChangeVotes: {}, countdownDeadlineAt: deadlineAt, deadlineAt, buzz: null, answer: null, answerTeam: "", answerPhase: "", attemptsUsed: 0, result: null, pendingOwner: "", feedback: "تم تغيير السؤال مع الإبقاء على الحرف — يبدأ بعد العد التنازلي.", feedbackTone: "countdown" };
    });
    if (result.committed) showToast("تم تسجيل طلب تغيير السؤال.");
}

async function submitAnswer(event) {
    event.preventDefault(); const input = $("onlineBoardAnswerInput"); const text = String(input?.value || "").trim().slice(0, 120); const game = currentRoom?.game;
    const mine = getMyPlayer();
    const answerTeam = game?.state === STATES.TEAM_ONE_ANSWERING ? "team1" : game?.state === STATES.TEAM_TWO_ANSWERING ? "team2" : "";
    if (!text || !game || !answerTeam || mine?.team !== answerTeam || game.answerTeam !== answerTeam || getRemaining(game) <= 0) return;
    await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== stateForTeam(answerTeam) || current.answerTeam !== answerTeam || current.answer || Number(current.deadlineAt) <= serverNow()) return;
        return { ...current, state: STATES.VALIDATING, answer: { playerId: myPlayerId, playerName: myName, team: answerTeam, text }, deadlineAt: 0, feedback: "تم استلام أول إجابة رسمية — جاري التحقق.", feedbackTone: "countdown" };
    });
}

async function verifyAnswerWithServer(question, expectedAnswer, playerAnswer, requiredLetter, questionId) {
    try {
        const response = await fetch(new URL("/api/online/verify-answer", window.location.origin), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, expectedAnswer, playerAnswer, requiredLetter, questionId })
        });
        if (!response.ok) return { valid: false, confidence: 0, source: "disabled" };
        const payload = await response.json();
        return { valid: payload.valid === true, confidence: Math.max(0, Math.min(1, Number(payload.confidence) || 0)), source: "ai" };
    } catch (_) {
        return { valid: false, confidence: 0, source: "unavailable" };
    }
}

async function resolveAnswer(game) {
    if (!game?.answer || game.state !== STATES.VALIDATING) return;
    const claim = await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.VALIDATING) return;
        const claimAge = serverNow() - Number(current.validationClaimAt || 0);
        if (current.validationClaim === myPlayerId && claimAge < VALIDATION_CLAIM_MILLISECONDS) return;
        if (current.validationClaim && current.validationClaim !== myPlayerId && claimAge < VALIDATION_CLAIM_MILLISECONDS) return;
        return { ...current, validationClaim: myPlayerId, validationClaimAt: serverNow() };
    });
    if (!claim.committed && claim.snapshot.val()?.validationClaim !== myPlayerId) return;
    await loadExtraQuestionBank();
    const key = game.question?.id + "|" + game.answer.playerId + "|" + game.answer.text + "|" + game.attemptsUsed; if (lastValidationKey === key) return; lastValidationKey = key;
    const record = questionById(game.question?.id);
    const expected = record?.answer || "";
    const requiredLetter = normalizeLetter(game.selectedCell?.letter || game.question?.letter);
    if (!record || firstNormalizedAnswerLetter(expected) !== requiredLetter) {
        await commitValidationResult(game, false, "حرف الإجابة لا يطابق حرف الخلية.", expected, "guard");
        return;
    }
    if (answerLooksLikeExpected(expected, game.answer.text)) {
        await commitValidationResult(game, true, "إجابة مطابقة أو بها خطأ كتابي بسيط.", expected, "normalized-fuzzy");
        return;
    }
    const remote = await verifyAnswerWithServer(game.question.text, expected, game.answer.text, requiredLetter, game.question.id);
    await commitValidationResult(game, remote.valid, remote.valid ? "تم اعتماد الإجابة بعد التحقق." : "الإجابة غير صحيحة.", expected, remote.source);
}

async function commitValidationResult(game, valid, reason, expectedAnswer, verificationSource) {
    const team = game.answerTeam || game.buzz?.team || game.answer?.team;
    const nextSelectionIds = team ? activeSelectionPlayerIds({ choiceTeam: team, selectionPlayerIds: [] }) : [];
    await runTransaction(gameRef(), (current) => {
        if (!current || current.state !== STATES.VALIDATING || !current.answer || current.question?.id !== game.question?.id) return;
        if (current.validationClaim && current.validationClaim !== myPlayerId) return;
        const answerLog = [...(current.answerLog || []), { playerId: current.answer.playerId, playerName: current.answer.playerName, team, text: current.answer.text, valid: Boolean(valid), reason, at: serverNow(), questionId: current.question?.id }].slice(-50);
        if (valid && team && current.selectedCell && !current.board?.[current.selectedCell.row]?.[current.selectedCell.col]) {
            const nextScores = { ...(current.scores || { team1: 0, team2: 0 }), [team]: Number(current.scores?.[team] || 0) + 1 };
            return { ...current, state: STATES.ANSWER_REVEAL, pendingOwner: team, pendingSelectionPlayerIds: [current.answer.playerId], revealedAnswer: expectedAnswer, answerLog, scores: nextScores, result: { valid: true, team, playerId: current.answer.playerId, playerName: current.answer.playerName, reason, verificationSource }, feedback: "✅ إجابة صحيحة — تظهر النتيجة الآن.", feedbackTone: "good", deadlineAt: serverNow() + REVEAL_MILLISECONDS, answerTeam: "", validationClaim: "", validationClaimAt: 0 };
        }
        return { ...transitionAfterFailedAttempt({ ...current, result: { valid: false, playerName: current.answer?.playerName, reason, verificationSource } }, "❌ " + reason), answerLog };
    });
}

async function expireAnswer(game) {
    await advanceTimedPhase(game);
}

async function nextQuestion() {
    await advanceTimedPhase(currentRoom?.game);
}

async function advanceTimedPhase(game = currentRoom?.game) {
    if (!game?.deadlineAt || Number(game.deadlineAt) > serverNow()) return;
    const result = await runTransaction(gameRef(), (current) => {
        if (!current || !current.deadlineAt || Number(current.deadlineAt) > serverNow()) return;
        if (current.state === STATES.COUNTDOWN_TO_QUESTION || current.state === STATES.CELL_CONFIRMED) {
            return { ...current, state: STATES.BUZZER_OPEN, deadlineAt: 0, countdownDeadlineAt: 0, feedback: "السؤال ظاهر — الجرس مفتوح للفريقين.", feedbackTone: "bell" };
        }
        if (current.state === STATES.TEAM_ONE_ANSWERING || current.state === STATES.TEAM_TWO_ANSWERING) {
            return transitionAfterFailedAttempt(current, "⏱️ انتهت مهلة الإجابة.");
        }
        if (current.state === STATES.ANSWER_REVEAL) {
            const nextBoard = normalizeBoardMatrix(current.board);
            const cell = current.selectedCell;
            if (current.pendingOwner && cell && !nextBoard[cell.row]?.[cell.col]) nextBoard[cell.row][cell.col] = current.pendingOwner;
            const path = current.pendingOwner ? findWinPath(nextBoard, current.pendingOwner) : null;
            const nextRound = Number(current.round || 1) + 1;
            if (path || nextRound > MAX_QUESTIONS || nextBoard.every((row) => row.every(Boolean))) {
                return { ...current, state: STATES.GAME_FINISHED, board: nextBoard, winnerTeam: path ? current.pendingOwner : "", winPath: path || [], pendingOwner: "", pendingSelectionPlayerIds: [], deadlineAt: 0, feedback: path ? "🏆 اكتمل مسار الفريق الفائز." : "انتهت الأسئلة المتاحة.", feedbackTone: path ? "win" : "bad" };
            }
            const nextChoiceTeam = current.pendingOwner || current.choiceTeam || "team1";
            const nextIds = current.pendingSelectionPlayerIds?.length ? current.pendingSelectionPlayerIds : activeSelectionPlayerIds({ choiceTeam: nextChoiceTeam, selectionPlayerIds: [] });
            return {
                ...current,
                state: STATES.SELECTING_CELL,
                board: nextBoard,
                round: nextRound,
                selectedCell: null,
                question: null,
                choices: {},
                choiceTeam: nextChoiceTeam,
                choicePlayerId: nextIds.length === 1 ? nextIds[0] : "",
                selectionPlayerIds: nextIds,
                pendingSelectionPlayerIds: [],
                pendingOwner: "",
                answerTeam: "",
                answerPhase: "",
                buzz: null,
                answer: null,
                validationClaim: "",
                validationClaimAt: 0,
                result: null,
                revealedAnswer: "",
                deadlineAt: 0,
                feedback: nextIds.length === 1 ? "الخلية أصبحت ملكًا لـ " + teamName(nextChoiceTeam) + " — يختار صاحب الإجابة الصحيحة الخلية التالية." : "اختاروا الخلية التالية واتفقوا عليها.",
                feedbackTone: "countdown"
            };
        }
    });
    if (result.committed && result.snapshot.val()?.state === STATES.GAME_FINISHED) {
        await update(ref(db), { [roomPath() + "/meta/status"]: "FINISHED", [roomPath() + "/meta/updatedAt"]: serverTimestamp() }).catch(() => {});
    }
}

async function finishMatch() { if (!isHost()) return; await update(ref(db), { [roomPath() + "/meta/status"]: "FINISHED", [roomPath() + "/game/state"]: STATES.GAME_FINISHED, [roomPath() + "/game/deadlineAt"]: 0, [roomPath() + "/game/feedback"]: "انتهت الجلسة.", [roomPath() + "/game/feedbackTone"]: "" }); }

async function requestRematch() {
    if (!currentRoom || !myPlayerId) return;
    const result = await runTransaction(roomRef(), (room) => {
        if (!room?.meta || !room.game || (room.meta.status !== "FINISHED" && room.game.state !== STATES.GAME_FINISHED)) return;
        const participants = Object.values(room.players || {}).filter((player) => player && player.id && player.connected !== false);
        const rematchReadyBy = { ...(room.game.rematchReadyBy || {}), [myPlayerId]: true };
        const allReady = participants.length > 0 && participants.every((player) => rematchReadyBy[player.id]);
        const teamsReady = participants.some((player) => player.team === "team1") && participants.some((player) => player.team === "team2");
        if (!allReady || !teamsReady) return { ...room, game: { ...room.game, rematchReadyBy, feedback: !teamsReady ? "يجب وجود لاعب متصل في كل فريق قبل الإعادة." : "تم تسجيل جاهزيتك — ننتظر بقية اللاعبين لإعادة المباراة.", feedbackTone: "countdown" } };
        const cellLetters = createBoardLetters();
        const game = {
            state: STATES.READY_CHECK, round: 1, board: createEmptyBoard(), cellLetters,
            selectedCell: null, question: null, usedQuestions: {}, choiceTeam: "", choicePlayerId: "",
            selectionPlayerIds: [], choices: {}, readyBy: {}, rematchReadyBy: {},
            questionChangeVotes: {}, bellPresses: [], answerLog: [], pendingSelectionPlayerIds: [],
            pendingOwner: "", countdownDeadlineAt: 0, answerTeam: "", answerPhase: "",
            validationClaim: "", validationClaimAt: 0, buzz: null, answer: null,
            attemptsUsed: 0, result: null, revealedAnswer: "", deadlineAt: 0,
            scores: { team1: 0, team2: 0 }, winnerTeam: "", winPath: [],
            feedback: "اضغطوا «أنا جاهز» لبدء المباراة الجديدة.", feedbackTone: "countdown"
        };
        return { ...room, meta: { ...room.meta, status: "PLAYING", updatedAt: serverTimestamp() }, game };
    });
    if (result.committed && result.snapshot.val()?.meta?.status === "PLAYING") showToast("اكتملت الجاهزية — بدأت مباراة جديدة.");
}

function renderChat(messages) {
    const node = $("onlineBoardChatMessages"); if (!node) return;
    const list = Object.values(messages || {}).filter(Boolean).sort((a, b) => Number(a.createdAt || a.clientAt || 0) - Number(b.createdAt || b.clientAt || 0)).slice(-80);
    node.innerHTML = list.length ? list.map((message) => '<div class="ob-chat-message ' + (message.playerId === myPlayerId ? "is-me" : "") + '"><strong>' + escapeHtml(message.name || "لاعب") + '</strong> ' + escapeHtml(message.text || "") + '</div>').join("") : '<small style="color:rgba(255,255,255,.45)">ابدأوا الحديث هنا</small>';
    node.scrollTop = node.scrollHeight;
}
async function sendChat(text) { const clean = String(text || "").trim().slice(0, 240); if (clean && roomCode) await set(push(ref(db, roomPath() + "/chat")), { playerId: myPlayerId, name: myName, text: clean, createdAt: serverTimestamp(), clientAt: serverNow() }); }
async function leaveRoom(showMessage = true) {
    if (roomCode && myPlayerId) {
        await runTransaction(roomRef(), (room) => {
            if (!room || !room.players?.[myPlayerId]) return;
            return { ...room, players: { ...(room.players || {}), [myPlayerId]: { ...room.players[myPlayerId], connected: false, lastSeen: serverNow() } } };
        }).catch(() => {});
    }
    roomUnsubscribe?.(); chatUnsubscribe?.(); connectionUnsubscribe?.(); clearInterval(heartbeatTimer); clearInterval(clockTimer);
    roomUnsubscribe = null; chatUnsubscribe = null; connectionUnsubscribe = null; roomCode = ""; myPlayerId = ""; myName = ""; currentRoom = null; clearSession(); setView("onlineBoardWelcome"); showResume(); if (showMessage) showToast("غادرت الجلسة.");
}

function tickClock() {
    const game = currentRoom?.game;
    if (!game) return;
    if ([STATES.COUNTDOWN_TO_QUESTION, STATES.CELL_CONFIRMED, STATES.TEAM_ONE_ANSWERING, STATES.TEAM_TWO_ANSWERING, STATES.ANSWER_REVEAL].includes(game.state) && getRemaining(game) <= 0) advanceTimedPhase(game).catch((error) => console.error("online phase transition failed", error));
    if (game.deadlineAt) {
        const remaining = getRemaining(game);
        $("onlineBoardCountdown").textContent = remaining + "ث";
        $("onlineBoardTimer").textContent = remaining + "ث";
        if ($("onlineBoardAnswerCountdown")) $("onlineBoardAnswerCountdown").textContent = remaining + "ث";
    }
}
function showResume() {
    const card = $("onlineBoardResume");
    if (!card) return;
    const session = readSession();
    if (!session) { card.hidden = true; return; }
    card.hidden = false;
    $("onlineBoardResumeText").textContent = session.name + " • جلسة " + session.roomCode;
}
async function refreshResume() {
    if (readSession() && !(await hasResumableSession())) { showResume(); return; }
    showResume();
}

$("onlineBoardCreateForm")?.addEventListener("submit", (event) => { event.preventDefault(); const name = cleanName($("onlineBoardCreateName").value); if (name) createRoom(name); });
$("onlineBoardJoinForm")?.addEventListener("submit", (event) => { event.preventDefault(); const name = cleanName($("onlineBoardJoinName").value); if (name) joinRoom($("onlineBoardJoinCode").value, name); });
$("onlineBoardHomeBtn")?.addEventListener("click", (event) => {
    event.preventDefault();
    if (!currentRoom || !roomCode) {
        window.location.href = 'https://8aaaf.com/';
        return;
    }
    showOnlineConfirm({
        title: "الخروج من الجلسة؟",
        message: "سيتم إنهاء اتصالك بهذه الجلسة والعودة إلى متجر قاف.",
        confirmText: "خروج"
    }).then(async (accepted) => {
        if (!accepted) return;
        await leaveRoom(false);
        window.location.href = "https://8aaaf.com/";
    });
});
$("onlineBoardHelpBtn")?.addEventListener("click", openOnlineHelp);
$("onlineBoardHelpClose")?.addEventListener("click", closeOnlineHelp);
$("onlineBoardHelpModal")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeOnlineHelp(); });
$("onlineBoardJoinCode")?.addEventListener("input", (event) => { event.target.value = cleanCode(event.target.value); });
$("onlineBoardResumeBtn")?.addEventListener("click", () => { const session = readSession(); if (session) joinRoom(session.roomCode, session.name, session.playerId); });
$("onlineBoardLobbyLeave")?.addEventListener("click", () => leaveRoom());
$("onlineBoardCopyCode")?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(roomCode); showToast("تم نسخ كود الجلسة."); } catch (_) { showToast("كود الجلسة: " + roomCode); } });
$("onlineBoardStartBtn")?.addEventListener("click", startMatch);
$("onlineBoardReadyBtn")?.addEventListener("click", setReady);
$("onlineBoardTeam1Name")?.addEventListener("input", (event) => updateTeamName("team1", event.target.value));
$("onlineBoardTeam2Name")?.addEventListener("input", (event) => updateTeamName("team2", event.target.value));
$("onlineBoardBell1")?.addEventListener("click", () => pressBell("team1"));
$("onlineBoardBell2")?.addEventListener("click", () => pressBell("team2"));
$("onlineBoardChangeQuestion")?.addEventListener("click", requestQuestionChange);
$("onlineBoardAnswerForm")?.addEventListener("submit", submitAnswer);
$("onlineBoardNextRound")?.addEventListener("click", nextQuestion);
$("onlineBoardFinish")?.addEventListener("click", () => {
    showOnlineConfirm({
        title: "إنهاء الجلسة؟",
        message: "سيتم إنهاء المباراة وعرض النتيجة لجميع اللاعبين.",
        confirmText: "إنهاء الجلسة"
    }).then((accepted) => { if (accepted) finishMatch(); });
});
$("onlineBoardPlayAgain")?.addEventListener("click", requestRematch);
$("onlineBoardResultsLobby")?.addEventListener("click", () => { setView("onlineBoardLobby"); renderLobby(); });
$("onlineBoardResultsLeave")?.addEventListener("click", () => leaveRoom());
$("onlineBoardChatForm")?.addEventListener("submit", (event) => { event.preventDefault(); const input = $("onlineBoardChatInput"); sendChat(input.value).then(() => { input.value = ""; }); });
$("onlineBoardConfirmCancel")?.addEventListener("click", () => closeOnlineConfirm(false));
$("onlineBoardConfirmAccept")?.addEventListener("click", () => closeOnlineConfirm(true));
$("onlineBoardConfirm")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeOnlineConfirm(false); });
document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if ($("onlineBoardHelpModal") && !$("onlineBoardHelpModal").hidden) { closeOnlineHelp(); return; }
    if (!$("onlineBoardConfirm")?.hidden) closeOnlineConfirm(false);
});

window.addEventListener("resize", () => { if (currentRoom?.meta?.status === "PLAYING") renderBoard(currentRoom.game); });
document.querySelector(".ob-board-wrap")?.addEventListener("wheel", (event) => {
    // Ctrl + wheel is browser zoom in Chromium; keep it from changing the board view.
    if (event.ctrlKey) event.preventDefault();
}, { passive: false });
document.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
}, { passive: false });
document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && ["+", "-", "=", "0"].includes(event.key)) event.preventDefault();
});
clockTimer = setInterval(tickClock, 250);
bindConnection();
refreshResume();
document.body.dataset.onlineBoardReady = "true";
