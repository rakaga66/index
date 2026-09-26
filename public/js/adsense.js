(() => {
    const config = window.QAAF_ADSENSE_CONFIG;
    const publisherId = String(config?.publisherId || '').trim();
    const allowedHosts = new Set(['8aaaf.com', 'www.8aaaf.com']);

    if (!allowedHosts.has(window.location?.hostname) || !/^ca-pub-\d{16}$/.test(publisherId)) return;

    const slotIds = {
        top: String(config.topSlotId || '').trim(),
        bottom: String(config.bottomSlotId || '').trim()
    };
    const placements = [...document.querySelectorAll('[data-adsense-placement]')]
        .map((container) => ({
            container,
            slotId: slotIds[container.dataset.adsensePlacement]
        }))
        .filter(({ slotId }) => /^\d{6,20}$/.test(slotId || ''));

    if (!placements.length) return;

    for (const { container, slotId } of placements) {
        const label = document.createElement('span');
        label.className = 'portal-adsense-placement__label';
        label.textContent = 'إعلان';

        const ad = document.createElement('ins');
        ad.className = 'adsbygoogle';
        ad.style.display = 'block';
        ad.dataset.adClient = publisherId;
        ad.dataset.adSlot = slotId;
        ad.dataset.adFormat = 'auto';
        ad.dataset.fullWidthResponsive = 'true';

        container.replaceChildren(label, ad);
        container.hidden = false;
    }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    script.addEventListener('load', () => {
        placements.forEach(() => {
            try {
                (window.adsbygoogle = window.adsbygoogle || []).push({});
            } catch (error) {
                console.error('تعذر تهيئة إعلان Google AdSense.', error);
            }
        });
    }, { once: true });
    script.addEventListener('error', () => {
        for (const { container } of placements) container.hidden = true;
    }, { once: true });

    document.head.appendChild(script);
})();
