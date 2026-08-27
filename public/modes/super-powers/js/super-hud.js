(function () {
    'use strict';

    const MODE = () => window.SuperPowerSystem;
    const STATUS = () => MODE()?.POWER_STATUS || { LOCKED: 'locked', READY: 'ready', PENDING: 'pending', USED: 'used' };
    const POWER_SLOT_COUNT = 6;
    let slotSignatures = { team1: '', team2: '' };

    const fallbackNames = { team1: 'الفريق الأول', team2: 'الفريق الثاني' };

    function teamName(teamId) {
        const index = teamId === 'team2' ? 2 : 1;
        return document.getElementById(`name${index}`)?.textContent?.trim() || fallbackNames[teamId];
    }

    function visibleInventory(team) {
        const inventory = Array.isArray(team?.inventory) ? team.inventory : [];
        const status = STATUS();
        return [
            ...inventory.filter(item => item.status === status.USED),
            ...inventory.filter(item => item.status !== status.USED)
        ].slice(0, POWER_SLOT_COUNT);
    }

    function remaining(team) {
        const status = STATUS();
        const inventory = Array.isArray(team?.inventory) ? team.inventory : [];
        const used = inventory.filter(item => item.status === status.USED).length;
        return Math.max(0, POWER_SLOT_COUNT - used);
    }

    function stateLabel(team) {
        if (!team?.unlocked) return 'مقفلة';
        if ((team.inventory || []).some(item => item.status === STATUS().PENDING)) return 'طلب معلّق';
        return remaining(team) ? 'متاحة' : 'مستنفدة';
    }

    function slotLabel(item, team) {
        return item?.status === STATUS().USED ? 'مستخدمة' : 'مقفلة';
    }

    function slotClass(item, team) {
        const status = STATUS();
        return item?.status === status.USED ? 'is-used is-used-power' : 'is-empty is-locked';
    }

    function inventorySignature(team) {
        const items = visibleInventory(team);
        return Array.from({ length: POWER_SLOT_COUNT }, (_, index) => {
            const item = items[index];
            if (!item) return `empty-${index}`;
            return `${item.instanceId || ''}|${item.powerId || ''}|${item.status || ''}|${item.name || ''}`;
        }).join('~');
    }

    function buildSlots(teamId, team) {
        const root = document.getElementById(`superPowerSlots${teamId === 'team1' ? 'Team1' : 'Team2'}`);
        if (!root) return;
        const signature = inventorySignature(team);
        if (slotSignatures[teamId] === signature && root.querySelectorAll('.super-power-slot').length === POWER_SLOT_COUNT) return;
        slotSignatures[teamId] = signature;
        root.replaceChildren();
        const inventory = visibleInventory(team);
        const status = STATUS();
        Array.from({ length: POWER_SLOT_COUNT }, (_, index) => inventory[index] || {
            instanceId: `empty-${teamId}-${index}`,
            status: status.LOCKED
        }).forEach(item => {
            const used = item.status === status.USED;
            const slot = document.createElement('div');
            slot.className = `super-power-slot ${slotClass(item, team)}`;
            slot.dataset.instanceId = item.instanceId || '';
            slot.title = used ? (item.shortDescription || item.name || 'قوة خارقة مستخدمة') : 'مكان قوة فارغ';
            slot.setAttribute('aria-label', used ? (item.name || 'قوة مستخدمة') : 'خانة قوة فارغة');
            slot.setAttribute('aria-disabled', used ? 'false' : 'true');

            const icon = document.createElement('span');
            icon.className = 'super-power-slot__icon';
            icon.textContent = used ? (item.icon || '⚡') : '🔒';
            icon.setAttribute('aria-hidden', 'true');

            const copy = document.createElement('span');
            copy.className = 'super-power-slot__copy';
            const name = document.createElement('span');
            name.className = 'super-power-slot__name';
            name.textContent = used ? (item.name || 'قوة مستخدمة') : 'مكان فارغ';
            const state = document.createElement('span');
            state.className = 'super-power-slot__state';
            state.textContent = used ? 'مستخدمة' : 'مقفلة';
            copy.append(name, state);
            slot.append(icon, copy);
            root.appendChild(slot);
        });
    }

    function refreshSlots(teamId, team) {
        const root = document.getElementById(`superPowerSlots${teamId === 'team1' ? 'Team1' : 'Team2'}`);
        if (!root) return;
        buildSlots(teamId, team);
        const inventory = visibleInventory(team);
        const status = STATUS();
        [...root.querySelectorAll('.super-power-slot')].forEach((slot, index) => {
            const item = inventory[index] || { status: status.LOCKED };
            slot.className = `super-power-slot ${slotClass(item, team)}`;
            const state = slot.querySelector('.super-power-slot__state');
            if (state) state.textContent = slotLabel(item, team);
            const used = item.status === status.USED;
            slot.title = used ? (item.shortDescription || item.name || 'قوة مستخدمة') : 'مكان قوة فارغ';
        });
    }

    function updateTeam(teamId, team) {
        const index = teamId === 'team2' ? 2 : 1;
        const name = teamName(teamId);
        const count = remaining(team);
        const label = stateLabel(team);
        const powerName = document.getElementById(`powerTeam${index}Name`);
        const powerCount = document.getElementById(`powerTeam${index}Count`);
        const powerState = document.getElementById(`powerTeam${index}State`);
        const sideName = document.getElementById(`superSideName${index}`);
        const sideScore = document.getElementById(`superSideScore${index}`);
        const sideState = document.getElementById(`superSideState${index}`);
        const score = document.getElementById(`score${index}`)?.textContent?.trim() || '0';
        if (powerName) powerName.textContent = name;
        if (powerCount) powerCount.textContent = String(count);
        if (powerState) powerState.textContent = label;
        if (sideName) sideName.textContent = name;
        if (sideScore) sideScore.textContent = score;
        if (sideState) sideState.textContent = label;
        document.querySelector(`.power-team-count--${teamId === 'team1' ? 'one' : 'two'}`)?.classList.toggle('is-unlocked', Boolean(team?.unlocked));
        document.querySelector(`[data-super-team-card="${teamId}"]`)?.classList.toggle('is-locked', !team?.unlocked);
        refreshSlots(teamId, team);
    }

    function updateTurn(state) {
        const chip = document.getElementById('superTurnChip');
        const text = document.getElementById('superTurnText');
        if (!chip || !text) return;
        const timer = document.getElementById('timerDisplay');
        const timerVisible = timer && timer.style.display !== 'none';
        const windowName = state?.activationWindow || 'BEFORE_QUESTION';
        const labels = {
            BEFORE_QUESTION: 'بانتظار السؤال',
            CELL_SELECTION: 'اختيار الخلية',
            QUESTION_ACTIVE: 'السؤال مفتوح',
            AFTER_BELL: 'وقت الإجابة',
            BEFORE_ANSWER: 'وقت الإجابة',
            AFTER_WRONG_ANSWER: 'إجابة خاطئة',
            AFTER_CORRECT_ANSWER: 'إجابة صحيحة',
            ROUND_END: 'نهاية الجولة'
        };
        const timerText = document.getElementById('timerTeam')?.textContent?.trim();
        text.textContent = timerVisible && timerText ? timerText.replace(/:$/, '') : (labels[windowName] || 'جاهز للعب');
        const active = Boolean(timerVisible || state?.lastPowerAnnouncement);
        chip.dataset.state = active ? 'active' : 'ready';
        document.querySelectorAll('[data-super-team-card]').forEach(card => {
            const teamId = card.dataset.superTeamCard;
            const currentName = teamName(teamId);
            card.classList.toggle('is-turn', Boolean(timerText && timerText.includes(currentName)));
        });
    }

    function render() {
        const state = window.powerState;
        if (!state?.teams) {
            updateTeam('team1', null);
            updateTeam('team2', null);
            updateTurn(null);
            return;
        }
        updateTeam('team1', state.teams.team1);
        updateTeam('team2', state.teams.team2);
        updateTurn(state);
    }

    window.renderShadowPowerHud = render;
    document.addEventListener('DOMContentLoaded', () => {
        render();
        window.setInterval(render, 350);
    });
})();
