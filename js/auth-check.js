(function () {
    const AUTH_SERVER = 'https://hojas-auth9-production.up.railway.app';

    // 1. أولاً: حاول قراءة التوكن من الرابط إذا وجد (بعد العودة من سيرفر المصادقة)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
        localStorage.setItem('hojas_token', tokenFromUrl);
        // إعادة تحميل الصفحة فوراً بشكل نظيف لإخفاء التوكن من الرابط وتفعيل الجلسة
        const cleanUrl = window.location.origin + window.location.pathname;
        window.location.href = cleanUrl;
        return; 
    }

    // 2. فحص الجلسة (التحقق من تسجيل الدخول)
    const sessionToken = localStorage.getItem('hojas_auth_token') || localStorage.getItem('hojas_token');
    const isLoginPage = window.location.pathname.includes('login.html');

    if (!sessionToken && !isLoginPage) {
        // إذا لم يكن هناك جلسة، يتم التوجيه لصفحة تسجيل الدخول الجديدة.
        // تحديد المسار بناءً على موقع الصفحة الحالية (داخل مجلد pages أو في الجذر)
        const inSubfolder = window.location.pathname.includes('/pages/');
        const loginPath = inSubfolder ? '../hojas-auth/public/login.html' : 'hojas-auth/public/login.html';
        window.location.href = loginPath;
    }
})();
