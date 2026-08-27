(function (global) {
    'use strict';

    const DURATION = 5000;
    let hideTimer = null;

    function getRoot() {
        let root = document.getElementById('powerUseAnnouncement');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'powerUseAnnouncement';
        root.className = 'power-use-announcement';
        root.setAttribute('aria-live', 'assertive');
        root.setAttribute('aria-atomic', 'true');
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <div class="power-use-announcement__backdrop" aria-hidden="true"></div>
            <section class="power-use-announcement__card" role="status">
                <div class="power-use-announcement__icon" id="powerUseAnnouncementIcon">⚡</div>
                <div class="power-use-announcement__eyebrow">استخدام قوة خارقة</div>
                <strong class="power-use-announcement__power" id="powerUseAnnouncementPower"></strong>
                <div class="power-use-announcement__team" id="powerUseAnnouncementTeam"></div>
            </section>`;
        (document.body || document.documentElement).appendChild(root);
        return root;
    }

    function show(announcement) {
        if (!announcement || !announcement.id) return;
        const expiresAt = Number(announcement.expiresAt || (Date.now() + DURATION));
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) return;
        const root = getRoot();
        if (root.dataset.announcementId === String(announcement.id) && root.classList.contains('show')) return;
        root.dataset.announcementId = String(announcement.id);
        root.querySelector('#powerUseAnnouncementIcon').textContent = announcement.icon || '⚡';
        root.querySelector('#powerUseAnnouncementPower').textContent = announcement.powerName || 'قوة خارقة';
        root.querySelector('#powerUseAnnouncementTeam').textContent = `${announcement.teamName || announcement.teamId || 'الفريق'} استخدم القوة`;
        root.classList.remove('show');
        // إعادة تشغيل حركة الظهور عند كل قوة جديدة.
        void root.offsetWidth;
        root.classList.add('show');
        root.setAttribute('aria-hidden', 'false');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (root.dataset.announcementId === String(announcement.id)) {
                root.classList.remove('show');
                root.setAttribute('aria-hidden', 'true');
            }
        }, remaining);
    }

    function hide() {
        const root = document.getElementById('powerUseAnnouncement');
        if (!root) return;
        clearTimeout(hideTimer);
        root.classList.remove('show');
        root.setAttribute('aria-hidden', 'true');
    }

    global.showPowerAnnouncement = show;
    global.syncPowerAnnouncement = show;
    global.hidePowerAnnouncement = hide;
})(window);
