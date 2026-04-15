(async function () {
    const firebaseConfig = {
        apiKey:            "AIzaSyCV2ZAVYhMbzgVFPmNtooCHR6C4aMOE3A",
        authDomain:        "buzzer-game-f2983.firebaseapp.com",
        databaseURL:       "https://buzzer-game-f2983-default-rtdb.firebaseio.com",
        projectId:         "buzzer-game-f2983",
        storageBucket:     "buzzer-game-f2983.firebasestorage.app",
        messagingSenderId: "125573747954",
        appId:             "1:125573747954:web:8dac681836e326b8b2c6b"
    };

    const loginUrl = window.location.origin + '/login.html';

    if (window.location.href.includes('login.html') || window.location.href.includes('admin.html')) {
        return;
    }

    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const { getAuth, onAuthStateChanged, signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
        const { getDatabase, ref, onValue, set } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");

        const app = initializeApp(firebaseConfig, "public-auth-check");
        const auth = getAuth(app);
        const db  = getDatabase(app);

        onAuthStateChanged(auth, (user) => {
            if (!user) {
                clearAndRedirect();
                return;
            }

            const token = sessionStorage.getItem('hojas_token');
            const phone = sessionStorage.getItem('hojas_username');

            if (!token || !phone) {
                clearAndRedirect();
                return;
            }

            const userRef = ref(db, `users/${phone}`);

            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (data.token !== token || data.isActivated === false) {
                        clearAndRedirect();
                    }
                } else {
                    clearAndRedirect();
                }
            }, (err) => {
                console.warn('Access Denied by Security Rules');
                clearAndRedirect();
            });

            const heartbeatInterval = setInterval(() => {
                set(ref(db, `users/${phone}/lastHeartbeat`), Date.now()).catch(() => {
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
