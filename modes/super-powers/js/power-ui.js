(function () {
    'use strict';

    const STORAGE_KEY = 'hojas_superpowers_power_state_v2';
    const MODE = window.SuperPowerSystem;
    let powerState = null;
    let intentsUnsubscribe = null;
    let announcementTimer = null;
    const handledIntents = new Set();

    function settings() {
        return {
            powerCountPerTeam: Number(teamSetup?.powerSettings?.powerCountPerTeam || 6),
            unlockAtCells: Number(teamSetup?.powerSettings?.unlockAtCells || 2),
            maxPowersPerTeamPerRound: Number(teamSetup?.powerSettings?.maxPowersPerTeamPerRound || 2),
            opponentVisibility: teamSetup?.powerSettings?.opponentVisibility || 'COUNT_ONLY'
        };
    }

    function definitionForIntent(intent) {
        const item = powerState?.teams?.[intent?.teamId]?.inventory?.find(candidate => candidate.instanceId === intent?.instanceId);
        return item ? MODE.getCatalog().find(definition => definition.id === item.powerId) : null;
    }

    function isLivePlayer(player) {
        if (!player?.name || player.connected === false) return false;
        const lastSeen = Number(player.lastSeen || 0);
        return !lastSeen || Date.now() - lastSeen < 45000;
    }

    async function liveRoster(db) {
        const cached = typeof _livePlayers !== 'undefined' && _livePlayers ? _livePlayers : {};
        try {
            const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
            // Prefer a fresh snapshot for validation. The realtime listener can
            // briefly lag behind a newly joined player, so falling back to a
            // non-empty cache here could reject a valid request during that
            // small race window.
            const remote = (await get(ref(db, `superPowerRooms/${buzzerRoom}/players`))).val() || {};
            return Object.keys(remote).length ? remote : cached;
        } catch (_) {
            return cached;
        }
    }

    async function normalizeIntent(intent, db) {
        const teamId = intent?.teamId;
        if (!['team1', 'team2'].includes(teamId)) return { ok: false, reason: 'الفريق غير معروف.' };
        const definition = definitionForIntent(intent);
        if (!definition) return { ok: false, reason: 'القوة غير موجودة في قائمة الفريق.' };
        const kind = String(definition.targetType || 'TEAM').toUpperCase();
        const normalized = { ...intent, source: intent.source || 'player' };
        const opponent = teamId === 'team1' ? 'team2' : 'team1';
        if (normalized.source !== 'presenter') {
            const roster = await liveRoster(db);
            const requester = intent?.playerId ? roster[intent.playerId] : null;
            if (!isLivePlayer(requester) || requester.team !== teamId) return { ok: false, reason: 'لا يمكن قبول الطلب إلا من لاعب متصل داخل الفريق.' };
            normalized.playerId = intent.playerId;
            normalized.playerName = String(requester.name);
        }
        if (['OPPONENT_PLAYER', 'PLAYER'].includes(kind)) {
            const target = intent?.target?.player;
            const roster = await liveRoster(db);
            const player = target?.id ? roster[target.id] : null;
            if (!isLivePlayer(player) || player.team !== opponent) return { ok: false, reason: 'اختر لاعبًا موجودًا ومتصلًا من الفريق المنافس.' };
            normalized.target = { player: { id: target.id, name: String(player.name), team: player.team } };
        } else if (kind === 'PLAYER_PAIR') {
            const requestedPlayers = Array.isArray(intent?.target?.players) ? intent.target.players : [];
            const roster = await liveRoster(db);
            const players = requestedPlayers.map(target => target?.id ? ({ id: target.id, ...(roster[target.id] || {}) }) : null);
            if (players.length !== 2 || players.some(player => !isLivePlayer(player) || !['team1', 'team2'].includes(player.team)) || new Set(players.map(player => player.id)).size !== 2 || new Set(players.map(player => player.team)).size !== 2) {
                return { ok: false, reason: 'اختر لاعبًا موجودًا من كل فريق للمبارزة.' };
            }
            normalized.target = { players: players.map(player => ({ id: player.id, name: String(player.name), team: player.team })) };
        } else if (['OPPONENT_CELL', 'OWN_CELL', 'CELL'].includes(kind)) {
            const cell = intent?.target?.cell;
            const row = Number(cell?.row), col = Number(cell?.col);
            const validCoordinates = Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 5 && col >= 0 && col < 5;
            const owner = validCoordinates ? board?.[row]?.[col] : null;
            if (!validCoordinates || !cell?.letter || (kind === 'OPPONENT_CELL' && owner !== opponent) || (kind === 'OWN_CELL' && owner !== teamId)) {
                return { ok: false, reason: 'اختر خلية صحيحة من اللوحة.' };
            }
            normalized.target = { cell: { row, col, letter: String(cell.letter) } };
        }
        return normalized;
    }

    function remaining(team) {
        return (team?.inventory || []).filter(item => item.status !== MODE.POWER_STATUS.USED).length;
    }

    function store() {
        if (!powerState) return;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(powerState)); } catch (_) {}
    }

    function restore() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (saved?.gameMode === MODE.GAME_MODES.SUPER_POWERS) powerState = saved;
        } catch (_) {}
        return powerState;
    }

    async function publish() {
        if (!powerState || !buzzerRoom || !gameIsActive) return;
        store();
        render();
        try {
            const db = await ensureFirebase();
            const { ref, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
            await update(ref(db, `superPowerRooms/${buzzerRoom}`), {
                powerState: null,
                presenterPowerState: powerState,
                powerViews: {
                    team1: MODE.getTeamView(powerState, 'team1'),
                    team2: MODE.getTeamView(powerState, 'team2')
                }
            });
            await update(ref(db, `superPowerRooms/${buzzerRoom}/game`), {
                powerAnnouncement: powerState.lastPowerAnnouncement || null
            });
            // game هو مصدر الحقيقة المشترك؛ يضمن هذا أن يرى الجمهور والمقدم
            // واللاعبون إعلان استخدام القوة نفسه في اللحظة نفسها.
            await window.publishLiveGameState?.({ powerAnnouncement: powerState.lastPowerAnnouncement || null });
        } catch (error) { console.warn('تعذر مزامنة القوى الخارقة', error); }
    }

    function render() {
        if (!powerState) return;
        ['team1', 'team2'].forEach((teamId, index) => {
            const team = powerState.teams[teamId];
            const count = document.getElementById(`powerTeam${index + 1}Count`);
            const name = document.getElementById(`powerTeam${index + 1}Name`);
            if (count) count.textContent = remaining(team);
            if (name) name.textContent = teamSetup?.[teamId]?.name || teamId;
            count?.closest('.power-team-count')?.classList.toggle('is-unlocked', Boolean(team?.unlocked));
        });
        const notice = document.getElementById('powerCatalogNotice');
        if (notice) notice.textContent = powerState.awaitingCatalog
            ? 'بانتظار إضافة قائمة القوى من صاحب اللعبة؛ النظام جاهز ولن يختلق قوى تلقائيًا.'
            : 'كل فريق يرى تفاصيل قواه فقط، والمقدم يؤكد أي استخدام.';
        const log = document.getElementById('powerEventLog');
        if (log) log.innerHTML = (powerState.eventLog || []).slice(0, 30).map(event =>
            `<div class="power-event-log__item">${escapeHtml(event.message || event.type)}<time>${new Date(event.at || Date.now()).toLocaleTimeString('ar-SA')}</time></div>`
        ).join('') || '<div class="power-event-log__item">لا توجد أحداث بعد.</div>';
    }

    function escapeHtml(value) {
        const node = document.createElement('div');
        node.textContent = String(value || '');
        return node.innerHTML;
    }

    function toast(message, bad) {
        if (typeof showGameToast === 'function') showGameToast(message, Boolean(bad));
    }

    function showUnlock(teamIds) {
        teamIds.forEach(teamId => {
            const el = document.createElement('div');
            el.className = 'power-unlock-toast';
            el.textContent = `🔓 انفتحت قوى ${teamSetup?.[teamId]?.name || teamId}`;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 3000);
        });
    }

    function announcePowerUse(result) {
        if (!result?.ok || !result.definition) return;
        const teamId = result.teamId || 'team1';
        const announcement = {
            id: `power-${result.requestId || result.definition.id}-${Date.now()}`,
            teamId,
            teamName: teamSetup?.[teamId]?.name || teamId,
            powerId: result.definition.id,
            powerName: result.definition.name,
            icon: result.definition.icon,
            createdAt: Date.now(),
            expiresAt: Date.now() + 5000
        };
        powerState.lastPowerAnnouncement = announcement;
        window.showPowerAnnouncement?.(announcement);
        clearTimeout(announcementTimer);
        announcementTimer = setTimeout(() => {
            if (powerState?.lastPowerAnnouncement?.id !== announcement.id) return;
            powerState.lastPowerAnnouncement = null;
            publish();
        }, 5000);
    }

    async function applyActivatedEffect(result) {
        if (!result?.ok || !result.definition) return;
        if (result.definition.id === 'shuffle_cells' && typeof window.shuffleBoard === 'function') window.shuffleBoard();
        announcePowerUse(result);
        if (typeof showGameToast === 'function') showGameToast(`⚡ ${result.definition.name} مفعّلة في الجولة`);
    }

    async function initialize(force = false) {
        if (!force) restore();
        const hasUsableInventory = powerState?.teams?.team1?.inventory?.length && powerState?.teams?.team2?.inventory?.length;
        const knownPowerIds = new Set(MODE.getCatalog().map(definition => definition.id));
        const hasOfficialInventory = ['team1', 'team2'].every(teamId =>
            (powerState?.teams?.[teamId]?.inventory || []).every(item => knownPowerIds.has(item.powerId))
        );
        if (!powerState || force || powerState.awaitingCatalog || !hasUsableInventory || !hasOfficialInventory) {
            powerState = MODE.createMatchState({ settings: settings(), currentRound: teamSetup.currentRound });
        }
        powerState.settings = MODE.normalizeSettings({ ...powerState.settings, ...settings() });
        window.powerState = powerState;
        const unlocked = MODE.updateUnlocks(powerState, board, { team1: teamSetup.team1.name, team2: teamSetup.team2.name });
        if (unlocked.length) showUnlock(unlocked);
        await publish();
        await listenForIntents();
        return powerState;
    }

    async function listenForIntents() {
        if (!buzzerRoom || intentsUnsubscribe) return;
        const db = await ensureFirebase();
        const { ref, onValue, update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        intentsUnsubscribe = onValue(ref(db, `superPowerRooms/${buzzerRoom}/powerIntents`), snapshot => {
            const teams = snapshot.val() || {};
            Object.entries(teams).forEach(([teamId, group]) => Object.entries(group || {}).forEach(([id, rawIntent]) => {
                // الاستماع يبدأ من آخر حالة محفوظة؛ تجاهل النوايا التي عولجت
                // سابقًا حتى لا يتحول إعادة تحميل شاشة اللعبة إلى طلب جديد.
                if (!rawIntent || rawIntent.processed || handledIntents.has(id)) return;
                handledIntents.add(id);
                const intent = { ...rawIntent, teamId };
                (async () => {
                    let result;
                    if (intent.type === 'REQUEST') {
                        const normalized = await normalizeIntent(intent, db);
                        result = normalized.ok ? MODE.requestPower(powerState, normalized) : normalized;
                        toast(result.ok ? 'وصل طلب القوة إلى المقدم للموافقة' : result.reason, !result.ok);
                    } else if (intent.type === 'CANCEL') {
                        result = MODE.cancelRequest(powerState, intent.requestId, teamId);
                        toast(result.ok ? 'تم إلغاء طلب القوة' : result.reason, !result.ok);
                    } else {
                        result = { ok: false, reason: 'نوع طلب غير معروف.' };
                    }
                    await update(ref(db, `superPowerRooms/${buzzerRoom}/powerIntents/${teamId}/${id}`), { processed: true, ok: Boolean(result.ok), reason: result.reason || '', requestId: result.request?.id || '', processedAt: Date.now() });
                    await publish();
                })().catch(error => {
                    console.error('تعذر معالجة طلب القوة', error);
                    update(ref(db, `superPowerRooms/${buzzerRoom}/powerIntents/${teamId}/${id}`), { processed: true, ok: false, reason: 'تعذر معالجة الطلب، حاول مجددًا.', processedAt: Date.now() }).catch(() => {});
                });
            }));
        });
    }

    window.initializeSuperPowerMatch = () => initialize(true);
    window.restoreSuperPowerMatch = () => initialize(false);
    window.superPowersAfterBoardChange = async () => {
        if (!powerState) return;
        const unlocked = MODE.updateUnlocks(powerState, board, { team1: teamSetup.team1.name, team2: teamSetup.team2.name });
        if (unlocked.length) showUnlock(unlocked);
        await publish();
    };
    window.superPowersStartRound = async round => { if (powerState) { MODE.startRound(powerState, round); await publish(); } };
    window.setSuperPowerActivationWindow = async name => { if (powerState && MODE.setActivationWindow(powerState, name)) await publish(); };
    window.activateSuperPowerRequest = async requestId => {
        if (!powerState) return { ok: false, reason: 'لا توجد جلسة قوى.' };
        const pendingRequest = powerState.requests?.[requestId];
        if (!pendingRequest) return { ok: false, reason: 'طلب القوة غير موجود أو انتهى.' };
        // Re-check the requester and target at the moment of approval. A
        // player may disconnect, change team, or a cell may be claimed while
        // the presenter is reviewing the request; approving stale data would
        // otherwise apply a power to a target that is no longer valid.
        try {
            const fresh = await normalizeIntent({
                ...pendingRequest,
                playerId: pendingRequest.requestedBy?.id || '',
                playerName: pendingRequest.requestedBy?.name || '',
                source: pendingRequest.source || 'player'
            }, await ensureFirebase());
            if (!fresh.ok) {
                toast(fresh.reason, true);
                return fresh;
            }
            pendingRequest.target = fresh.target || pendingRequest.target || null;
        } catch (_) {
            const failure = { ok: false, reason: 'تعذر التحقق من الهدف، حاول مرة أخرى.' };
            toast(failure.reason, true);
            return failure;
        }
        const result = await MODE.activateRequest(powerState, requestId, { teamName: teamSetup[powerState.requests?.[requestId]?.teamId]?.name });
        toast(result.ok ? `تم تفعيل ${result.definition.name}` : result.reason, !result.ok);
        await applyActivatedEffect(result);
        await publish(); return result;
    };
    window.presenterUseSuperPower = async ({ teamId, instanceId, target = null } = {}) => {
        if (!powerState) return { ok: false, reason: 'لا توجد جلسة قوى.' };
        const candidate = { teamId, instanceId, target, activationWindow: powerState.activationWindow, playerId: 'presenter', playerName: 'المقدم', source: 'presenter' };
        let normalized = candidate;
        try {
            normalized = await normalizeIntent(candidate, await ensureFirebase());
        } catch (_) {
            const failure = { ok: false, reason: 'تعذر التحقق من هدف القوة، حاول مرة أخرى.' };
            toast(failure.reason, true);
            return failure;
        }
        if (!normalized.ok) { toast(normalized.reason, true); return normalized; }
        const request = MODE.requestPower(powerState, normalized);
        if (!request.ok) { toast(request.reason, true); return request; }
        toast(`تم إرسال طلب تأكيد ${request.request.powerName} — اضغط «تأكيد وتفعيل»`, false);
        await publish();
        return { ...request, pending: true };
    };
    window.cancelSuperPowerRequest = async requestId => { const result = MODE.cancelRequest(powerState, requestId); await publish(); return result; };
    window.getSuperPowerMatchSummary = () => powerState ? MODE.getMatchSummary(powerState) : null;
    window.getSuperPowerPointMultiplier = teamId => Number(powerState?.teamEffects?.[teamId]?.nextPointMultiplier || 1);
    window.consumeSuperPowerPointMultiplier = teamId => {
        const effect = powerState?.teamEffects?.[teamId];
        const multiplier = Number(effect?.nextPointMultiplier || 1);
        if (effect && multiplier > 1) { effect.nextPointMultiplier = 1; publish(); }
        return multiplier;
    };
    window.getPublicSuperPowerState = () => powerState ? {
        gameMode: powerState.gameMode, settings: powerState.settings, currentRound: powerState.currentRound,
        activationWindow: powerState.activationWindow, awaitingCatalog: powerState.awaitingCatalog,
        lastPowerAnnouncement: powerState.lastPowerAnnouncement || null,
        teams: Object.fromEntries(['team1','team2'].map(id => [id, { unlocked: powerState.teams[id].unlocked, remainingCount: remaining(powerState.teams[id]), usedCount: (powerState.teams[id].inventory || []).filter(x => x.status === MODE.POWER_STATUS.USED).length, roundPowerUsage: powerState.teams[id].roundPowerUsage }]))
    } : null;
    window.adjPowerCount = delta => {
        teamSetup.powerSettings = teamSetup.powerSettings || {};
        teamSetup.powerSettings.powerCountPerTeam = Math.max(1, Math.min(9, Number(teamSetup.powerSettings.powerCountPerTeam || 6) + Number(delta || 0)));
        const el = document.getElementById('powerCountVal'); if (el) el.textContent = teamSetup.powerSettings.powerCountPerTeam;
    };
    window.openPowerLog = () => { document.getElementById('powerLogModal')?.classList.add('show'); document.getElementById('powerLogModal')?.setAttribute('aria-hidden','false'); render(); };
    window.closePowerLog = () => { document.getElementById('powerLogModal')?.classList.remove('show'); document.getElementById('powerLogModal')?.setAttribute('aria-hidden','true'); };

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('#setPowerVisibilityGroup .toggle-btn').forEach(button => button.addEventListener('click', () => {
            teamSetup.powerSettings = teamSetup.powerSettings || {};
            teamSetup.powerSettings.opponentVisibility = button.dataset.value;
            document.querySelectorAll('#setPowerVisibilityGroup .toggle-btn').forEach(item => item.classList.toggle('selected', item === button));
        }));
        render();
    });
})();
