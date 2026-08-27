(function (global) {
    'use strict';

    const GAME_MODES = Object.freeze({ NORMAL: 'NORMAL', SUPER_POWERS: 'SUPER_POWERS' });
    const POWER_STATUS = Object.freeze({ LOCKED: 'locked', READY: 'ready', PENDING: 'pending', USED: 'used' });
    const POWER_CATEGORIES = Object.freeze(['offensive', 'defensive', 'support', 'rare']);
    const ACTIVATION_WINDOWS = Object.freeze([
        'BEFORE_QUESTION', 'QUESTION_ACTIVE', 'AFTER_BELL', 'BEFORE_ANSWER',
        'AFTER_WRONG_ANSWER', 'AFTER_CORRECT_ANSWER', 'CELL_SELECTION', 'ROUND_END'
    ]);
    const DEFAULT_SETTINGS = Object.freeze({
        powerCountPerTeam: 6,
        unlockAtCells: 2,
        maxPowersPerTeamPerRound: 2,
        opponentVisibility: 'COUNT_ONLY'
    });

    // The owner will supply the real list and effects later. Keeping this empty
    // prevents placeholder powers from leaking into real matches.
    const catalog = new Map();
    const effects = new Map();

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function normalizeSettings(settings = {}) {
        return {
            // القائمة الرسمية تحتوي 18 قوة؛ تسع لكل فريق كحد أقصى حتى لا
            // يحصل فريقان على القوة نفسها في الجلسة.
            powerCountPerTeam: Math.max(1, Math.min(9, Number(settings.powerCountPerTeam) || DEFAULT_SETTINGS.powerCountPerTeam)),
            unlockAtCells: Math.max(1, Math.min(10, Number(settings.unlockAtCells) || DEFAULT_SETTINGS.unlockAtCells)),
            maxPowersPerTeamPerRound: Math.max(1, Math.min(5, Number(settings.maxPowersPerTeamPerRound) || DEFAULT_SETTINGS.maxPowersPerTeamPerRound)),
            opponentVisibility: settings.opponentVisibility === 'FULL' ? 'FULL' : 'COUNT_ONLY'
        };
    }

    function validateDefinition(power) {
        if (!power || typeof power !== 'object') throw new Error('تعريف القوة غير صالح.');
        const required = ['id', 'name', 'description', 'icon', 'category', 'rarity', 'activationWindow', 'targetType'];
        for (const key of required) if (!power[key]) throw new Error(`خاصية القوة ناقصة: ${key}`);
        if (!POWER_CATEGORIES.includes(power.category)) throw new Error(`تصنيف القوة غير معروف: ${power.category}`);
        const windows = Array.isArray(power.activationWindow) ? power.activationWindow : [power.activationWindow];
        if (!windows.every(windowName => ACTIVATION_WINDOWS.includes(windowName))) throw new Error(`توقيت القوة غير معروف: ${power.id}`);
        return {
            id: String(power.id),
            name: String(power.name),
            description: String(power.description),
            icon: String(power.icon),
            category: power.category,
            rarity: String(power.rarity),
            activationWindow: windows,
            targetType: String(power.targetType),
            strength: Math.max(1, Math.min(100, Number(power.strength) || 50)),
            reusable: Boolean(power.reusable),
            legacy: Boolean(power.legacy),
            metadata: clone(power.metadata || {})
        };
    }

    function registerPowers(definitions = []) {
        for (const raw of definitions) {
            const definition = validateDefinition(raw);
            if (catalog.has(definition.id)) throw new Error(`معرّف القوة مكرر: ${definition.id}`);
            catalog.set(definition.id, definition);
        }
        return getCatalog();
    }

    function registerEffect(powerId, handler) {
        if (!catalog.has(powerId)) throw new Error(`القوة غير مسجلة: ${powerId}`);
        if (typeof handler !== 'function') throw new Error('منفذ القوة يجب أن يكون دالة.');
        effects.set(powerId, handler);
    }

    function getCatalog() {
        return [...catalog.values()].map(clone);
    }

    function categoryBuckets(definitions) {
        return POWER_CATEGORIES.reduce((buckets, category) => {
            buckets[category] = definitions.filter(power => power.category === category);
            return buckets;
        }, {});
    }

    function shuffled(list, random = Math.random) {
        const copy = [...list];
        for (let index = copy.length - 1; index > 0; index -= 1) {
            const next = Math.floor(random() * (index + 1));
            [copy[index], copy[next]] = [copy[next], copy[index]];
        }
        return copy;
    }

    function balancedDistribution(count, random = Math.random) {
        const definitions = getCatalog().filter(power => !power.legacy);
        if (!definitions.length) return { team1: [], team2: [], awaitingCatalog: true };
        const buckets = categoryBuckets(definitions);
        const picks = { team1: [], team2: [] };
        const strength = { team1: 0, team2: 0 };
        // Each power is dealt only once across both teams in a match.
        const used = new Set();
        const categoryOrder = shuffled(POWER_CATEGORIES, random);

        function candidates(team, category) {
            const preferred = buckets[category].filter(power => !used.has(power.id));
            const fallback = definitions.filter(power => !used.has(power.id));
            return preferred.length ? preferred : (fallback.length ? fallback : definitions);
        }

        for (let index = 0; index < count * 2; index += 1) {
            const team = strength.team1 <= strength.team2 ? 'team1' : 'team2';
            const category = categoryOrder[index % categoryOrder.length];
            const options = shuffled(candidates(team, category), random)
                .sort((a, b) => Math.abs((strength[team] + a.strength) - strength[team === 'team1' ? 'team2' : 'team1'])
                    - Math.abs((strength[team] + b.strength) - strength[team === 'team1' ? 'team2' : 'team1']));
            const selected = options[0];
            if (!selected) break;
            picks[team].push(selected);
            used.add(selected.id);
            strength[team] += selected.strength;
        }

        while (picks.team1.length < count && definitions.length) picks.team1.push(clone(definitions[picks.team1.length % definitions.length]));
        while (picks.team2.length < count && definitions.length) picks.team2.push(clone(definitions[picks.team2.length % definitions.length]));
        return { ...picks, awaitingCatalog: false, strength };
    }

    function inventoryItem(definition) {
        return {
            instanceId: global.crypto?.randomUUID?.() || `${definition.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            powerId: definition.id,
            name: definition.name,
            icon: definition.icon,
            shortDescription: definition.description,
            category: definition.category,
            rarity: definition.rarity,
            targetType: definition.targetType,
            metadata: clone(definition.metadata || {}),
            activationWindow: clone(definition.activationWindow),
            status: POWER_STATUS.LOCKED,
            requestedBy: null,
            requestId: null,
            usedAt: null,
            usedRound: null
        };
    }

    function createTeamState(teamId, definitions) {
        return {
            teamId,
            unlocked: false,
            unlockedAt: null,
            roundPowerUsage: 0,
            inventory: definitions.map(inventoryItem)
        };
    }

    function createMatchState(options = {}) {
        const settings = normalizeSettings(options.settings);
        const distribution = balancedDistribution(settings.powerCountPerTeam, options.random);
        return {
            version: 1,
            gameMode: GAME_MODES.SUPER_POWERS,
            settings,
            currentRound: Number(options.currentRound) || 1,
            activationWindow: 'BEFORE_QUESTION',
            awaitingCatalog: Boolean(distribution.awaitingCatalog),
            teams: {
                team1: createTeamState('team1', distribution.team1),
                team2: createTeamState('team2', distribution.team2)
            },
            requests: {},
            eventLog: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    function appendEvent(state, event) {
        state.eventLog = Array.isArray(state.eventLog) ? state.eventLog : [];
        state.eventLog.unshift({ id: global.crypto?.randomUUID?.() || `${Date.now()}`, at: Date.now(), ...event });
        state.eventLog = state.eventLog.slice(0, 100);
        state.updatedAt = Date.now();
    }

    function getDefinition(item) {
        return item ? catalog.get(item.powerId) || null : null;
    }

    function countOwnedCells(board, teamId) {
        return Array.isArray(board) ? board.flat().filter(cell => cell === teamId).length : 0;
    }

    function updateUnlocks(state, board, teamNames = {}) {
        if (!state?.teams) return [];
        const unlocked = [];
        for (const teamId of ['team1', 'team2']) {
            const team = state.teams[teamId];
            if (team.unlocked || countOwnedCells(board, teamId) < state.settings.unlockAtCells) continue;
            team.unlocked = true;
            team.unlockedAt = Date.now();
            for (const item of team.inventory) if (item.status === POWER_STATUS.LOCKED) item.status = POWER_STATUS.READY;
            const teamName = teamNames[teamId] || teamId;
            appendEvent(state, { type: 'POWERS_UNLOCKED', teamId, message: `🔓 تم فتح قوى ${teamName}.` });
            unlocked.push(teamId);
        }
        return unlocked;
    }

    function findItem(state, teamId, instanceId) {
        return state?.teams?.[teamId]?.inventory?.find(item => item.instanceId === instanceId) || null;
    }

    function validateRequest(state, { teamId, instanceId, activationWindow }) {
        const team = state?.teams?.[teamId];
        if (!team) return { ok: false, reason: 'الفريق غير معروف.' };
        const item = findItem(state, teamId, instanceId);
        if (!item) return { ok: false, reason: 'القوة غير مملوكة لهذا الفريق.' };
        const definition = getDefinition(item);
        if (!definition) return { ok: false, reason: 'قواعد هذه القوة لم تُضف بعد.' };
        if (!team.unlocked || item.status === POWER_STATUS.LOCKED) return { ok: false, reason: 'القوى ما زالت مقفلة.' };
        if (item.status === POWER_STATUS.USED && !definition.reusable) return { ok: false, reason: 'تم استخدام هذه القوة سابقًا.' };
        if (item.status === POWER_STATUS.PENDING) return { ok: false, reason: 'تم طلب هذه القوة بالفعل.' };
        if (team.roundPowerUsage >= state.settings.maxPowersPerTeamPerRound) return { ok: false, reason: 'استخدم الفريق الحد الأقصى لهذه الجولة.' };
        const windowName = activationWindow || state.activationWindow;
        if (!definition.activationWindow.includes(windowName)) return { ok: false, reason: 'لا يمكن استخدام القوة في هذا التوقيت.' };
        return { ok: true, team, item, definition, activationWindow: windowName };
    }

    function requestPower(state, request) {
        const check = validateRequest(state, request);
        if (!check.ok) return check;
        const requestId = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        check.item.status = POWER_STATUS.PENDING;
        check.item.requestId = requestId;
        check.item.requestedBy = { id: request.playerId || '', name: request.playerName || 'لاعب' };
        state.requests[requestId] = {
            id: requestId,
            teamId: request.teamId,
            instanceId: request.instanceId,
            powerId: check.definition.id,
            requestedBy: clone(check.item.requestedBy),
            target: clone(request.target || null),
            activationWindow: check.activationWindow,
            status: 'PENDING',
            createdAt: Date.now()
        };
        appendEvent(state, { type: 'POWER_REQUESTED', teamId: request.teamId, private: true, message: `⏳ تم طلب ${check.definition.name}.` });
        return { ok: true, request: clone(state.requests[requestId]) };
    }

    function cancelRequest(state, requestId, actorTeamId) {
        const request = state?.requests?.[requestId];
        if (!request || request.status !== 'PENDING') return { ok: false, reason: 'الطلب غير متاح للإلغاء.' };
        if (actorTeamId && request.teamId !== actorTeamId) return { ok: false, reason: 'لا يمكن إلغاء طلب فريق آخر.' };
        const item = findItem(state, request.teamId, request.instanceId);
        if (item) {
            item.status = POWER_STATUS.READY;
            item.requestId = null;
            item.requestedBy = null;
        }
        request.status = 'CANCELLED';
        request.cancelledAt = Date.now();
        appendEvent(state, { type: 'POWER_REQUEST_CANCELLED', teamId: request.teamId, private: true, message: 'تم إلغاء طلب القوة.' });
        return { ok: true };
    }

    function validateActivation(state, requestId) {
        const request = state?.requests?.[requestId];
        if (!request || request.status !== 'PENDING') return { ok: false, reason: 'طلب القوة غير موجود أو انتهى.' };
        const check = validateRequest(state, {
            teamId: request.teamId,
            instanceId: request.instanceId,
            activationWindow: state.activationWindow
        });
        if (!check.ok && check.reason !== 'تم طلب هذه القوة بالفعل.') return check;
        const item = findItem(state, request.teamId, request.instanceId);
        const definition = getDefinition(item);
        if (!definition) return { ok: false, reason: 'قواعد هذه القوة لم تُضف بعد.' };
        if (!definition.activationWindow.includes(state.activationWindow)) return { ok: false, reason: 'انتهى توقيت استخدام القوة.' };
        if (!effects.has(definition.id)) return { ok: false, reason: 'تأثير هذه القوة لم يُضف بعد.' };
        return { ok: true, request, item, definition, team: state.teams[request.teamId] };
    }

    async function activateRequest(state, requestId, context = {}) {
        const check = validateActivation(state, requestId);
        if (!check.ok) return check;
        await effects.get(check.definition.id)({ state, request: clone(check.request), definition: clone(check.definition), context });
        check.request.status = 'ACTIVATED';
        check.request.activatedAt = Date.now();
        check.item.status = check.definition.reusable ? POWER_STATUS.READY : POWER_STATUS.USED;
        check.item.usedAt = Date.now();
        check.item.usedRound = state.currentRound;
        check.item.requestId = null;
        check.team.roundPowerUsage += 1;
        appendEvent(state, {
            type: 'POWER_ACTIVATED', teamId: check.request.teamId,
            message: `⚡ ${context.teamName || check.request.teamId} استخدم ${check.definition.name}.`
        });
        return {
            ok: true,
            definition: clone(check.definition),
            teamId: check.request.teamId,
            requestId: check.request.id
        };
    }

    function setActivationWindow(state, activationWindow) {
        if (!ACTIVATION_WINDOWS.includes(activationWindow)) return false;
        state.activationWindow = activationWindow;
        state.updatedAt = Date.now();
        return true;
    }

    function startRound(state, roundNumber) {
        state.currentRound = Number(roundNumber) || state.currentRound + 1;
        state.activationWindow = 'BEFORE_QUESTION';
        for (const teamId of ['team1', 'team2']) state.teams[teamId].roundPowerUsage = 0;
        appendEvent(state, { type: 'ROUND_STARTED', message: `بدأت الجولة ${state.currentRound}.` });
    }

    function getTeamView(state, viewerTeamId) {
        if (!state?.teams) return null;
        const result = { settings: clone(state.settings), currentRound: state.currentRound, activationWindow: state.activationWindow, awaitingCatalog: state.awaitingCatalog, teams: {}, eventLog: [] };
        for (const teamId of ['team1', 'team2']) {
            const own = teamId === viewerTeamId || state.settings.opponentVisibility === 'FULL';
            const team = state.teams[teamId];
            result.teams[teamId] = own ? clone(team) : {
                teamId, unlocked: team.unlocked,
                remainingCount: team.inventory.filter(item => item.status !== POWER_STATUS.USED).length,
                usedCount: team.inventory.filter(item => item.status === POWER_STATUS.USED).length,
                roundPowerUsage: team.roundPowerUsage
            };
        }
        result.eventLog = (state.eventLog || []).filter(event => !event.private || event.teamId === viewerTeamId).map(clone);
        return result;
    }

    function getMatchSummary(state) {
        const summary = {};
        for (const teamId of ['team1', 'team2']) {
            const inventory = state?.teams?.[teamId]?.inventory || [];
            summary[teamId] = {
                used: inventory.filter(item => item.status === POWER_STATUS.USED).map(item => clone(getDefinition(item))).filter(Boolean),
                remaining: inventory.filter(item => item.status !== POWER_STATUS.USED).map(item => clone(getDefinition(item))).filter(Boolean)
            };
        }
        return summary;
    }

    global.SuperPowerSystem = Object.freeze({
        GAME_MODES, POWER_STATUS, POWER_CATEGORIES, ACTIVATION_WINDOWS, DEFAULT_SETTINGS,
        registerPowers, registerEffect, getCatalog, createMatchState, updateUnlocks,
        validateRequest, requestPower, cancelRequest, validateActivation, activateRequest,
        setActivationWindow, startRound, getTeamView, getMatchSummary, normalizeSettings
    });
})(window);
