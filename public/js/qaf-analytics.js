import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, update, remove, onValue, onDisconnect, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
    apiKey: 'AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A',
    authDomain: 'buzzer-game-f2983.firebaseapp.com',
    databaseURL: 'https://buzzer-game-f2983-default-rtdb.firebaseio.com',
    projectId: 'buzzer-game-f2983',
    storageBucket: 'buzzer-game-f2983.firebasestorage.app',
    messagingSenderId: '125573747954',
    appId: '1:125573747954:web:8dac68183e6e326b8b2c6b'
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getDatabase(app);
const ROOT = 'siteAnalytics';
const activeSections = new Set();
const isProductionSite = location.hostname === '7roof-main.vercel.app';

function makeId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getClientId() {
    const key = 'qaf_analytics_client_v1';
    let id = localStorage.getItem(key);
    if (!id) {
        id = makeId();
        localStorage.setItem(key, id);
    }
    return id;
}

async function increment(name) {
    await runTransaction(ref(db, `${ROOT}/counters/${name}`), value => (Number(value) || 0) + 1);
}

export async function trackSection(section) {
    if (!isProductionSite) return;
    if (!['game', 'store'].includes(section) || activeSections.has(section)) return;
    activeSections.add(section);

    const clientId = getClientId();
    const presenceRef = ref(db, `${ROOT}/presence/${section}/${makeId()}`);

    increment(section === 'game' ? 'gameVisits' : 'storeVisits').catch(console.warn);

    onValue(ref(db, '.info/connected'), async snapshot => {
        if (snapshot.val() !== true) return;
        try {
            await onDisconnect(presenceRef).remove();
            await set(presenceRef, { clientId, connectedAt: serverTimestamp(), lastSeen: serverTimestamp() });
        } catch (error) {
            console.warn('Qaf presence error', error);
        }
    });

    const heartbeat = setInterval(() => {
        update(presenceRef, { lastSeen: serverTimestamp() }).catch(() => {});
    }, 30000);

    addEventListener('pagehide', () => {
        clearInterval(heartbeat);
        remove(presenceRef).catch(() => {});
    }, { once: true });
}

export async function trackGameStart() {
    if (!isProductionSite) return;
    const clientId = getClientId();
    increment('gameStarts').catch(console.warn);

    try {
        const uniqueRef = ref(db, `${ROOT}/uniqueGamePlayers/${clientId}`);
        await runTransaction(uniqueRef, current => {
            if (current !== null) return;
            return { firstPlayedAt: Date.now() };
        });
    } catch (error) {
        console.warn('Qaf game-start error', error);
    }
}

export function observeAnalytics(callback) {
    return onValue(ref(db, ROOT), snapshot => {
        const data = snapshot.val() || {};
        const counters = data.counters || {};
        const cutoff = Date.now() - 90000;
        const onlineCount = section => new Set(
            Object.values(data.presence?.[section] || {})
                .filter(item => item?.clientId && Number(item.lastSeen || item.connectedAt || 0) >= cutoff)
                .map(item => item.clientId)
        ).size;

        callback({
            gameOnline: onlineCount('game'),
            storeOnline: onlineCount('store'),
            gameVisits: Number(counters.gameVisits) || 0,
            gameStarts: Number(counters.gameStarts) || 0,
            uniqueGamePlayers: Object.keys(data.uniqueGamePlayers || {}).length,
            storeVisits: Number(counters.storeVisits) || 0
        });
    });
}
