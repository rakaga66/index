(async function () {
    const firebaseConfig = {
        apiKey: "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A",
        authDomain: "buzzer-game-f2983.firebaseapp.com",
        databaseURL: "https://buzzer-game-f2983-default-rtdb.firebaseio.com",
        projectId: "buzzer-game-f2983",
        storageBucket: "buzzer-game-f2983.firebasestorage.app",
        messagingSenderId: "125573747954",
        appId: "1:125573747954:web:8dac68183e6e326b8b2c6b"
    };

    // تحديد مسار صفحة الدخول بناءً على موقع الصفحة الحالية
    const inSubfolder = window.location.pathname.includes('/pages/');
    const loginUrl = inSubfolder ? '../login.html' : 'login.html';

    // استثناء صفحات الدخول
    if (window.location.href.includes('login.html') || window.location.href.includes('admin.html')) {
        return;
    }

    try {
        const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const { getAuth, onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
        const { getDatabase, ref, onValue, set } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        const auth = getAuth(app);
        const db  = getDatabase(app);

        // مراقبة حالة جلسة Firebase
        onAuthStateChanged(auth, (user) => {
            if (!user) {
                // لا توجد جلسة أمنية -> تحويل للوجين
                clearAndRedirect();
                return;
            }

            // إذا وجد مستخدم، نربطه بحساب الجوال المسجل في sessionStorage
            const token = sessionStorage.getItem('hojas_token');
            const phone = sessionStorage.getItem('hojas_username');

            if (!token || !phone) {
                clearAndRedirect();
                return;
            }

            const userRef = ref(db, `users/${phone}`);

            // 1. مراقبة لحظية عبر القاعدة (سيتم الرفض إذا انتهت صلاحية الجلسة أو تغيرت البيانات)
            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (!data.sessions || !data.sessions[token] || data.isActivated === false) {
                        clearAndRedirect();
                    }
                } else {
                    clearAndRedirect();
                }
            }, (err) => {
                // إذا رفضت القاعدة الطلب (Permission Denied)
                console.warn('Access Denied by Security Rules');
                clearAndRedirect();
            });

            // 2. Heartbeat (تحديث النشاط)
            const heartbeatInterval = setInterval(() => {
                set(ref(db, `users/${phone}/sessions/${token}`), Date.now()).catch(() => {
                    clearInterval(heartbeatInterval);
                });
            }, 30000);
        });

        async function clearAndRedirect() {
            sessionStorage.clear();
            await signOut(auth).catch(() => {});
            window.location.href = loginUrl;
        }

    } catch (e) {
        console.error('Critical Auth Error:', e);
    }
})();
