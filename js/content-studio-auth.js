(async function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const form = $('authForm'), button = $('loginButton');
    let auth, signIn, signOut, firebase, db, controller, epoch = 0;
    const config = {
        apiKey: 'AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A',
        authDomain: 'buzzer-game-f2983.firebaseapp.com',
        databaseURL: 'https://buzzer-game-f2983-default-rtdb.firebaseio.com',
        projectId: 'buzzer-game-f2983', storageBucket: 'buzzer-game-f2983.firebasestorage.app',
        messagingSenderId: '125573747954', appId: '1:125573747954:web:8dac68183e6e326b8b2c6b'
    };
    function clearSession() {
        sessionStorage.removeItem('isAdmin'); sessionStorage.removeItem('adminUid');
        controller?.destroy(); controller = null;
        $('studio').hidden = true; $('authGate').hidden = false;
        document.querySelector('.skip-link').href = '#authForm';
    }
    async function authorize() {
        const user = auth.currentUser;
        if (!user) throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
        const snapshot = await firebase.get(firebase.ref(db, `admins/${user.uid}`));
        const record = snapshot.val();
        if (record !== true && record?.isAdmin !== true && record?.role !== 'admin') {
            throw new Error('هذا الحساب لا يملك صلاحية إدارة المحتوى.');
        }
        if (auth.currentUser?.uid !== user.uid) throw new Error('تغيّرت جلسة الدخول. حاول مجددًا.');
        sessionStorage.setItem('isAdmin', 'true'); sessionStorage.setItem('adminUid', user.uid);
        return user;
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!auth || button.disabled || !form.reportValidity()) return;
        button.disabled = true; $('authError').textContent = ''; $('authStatus').textContent = 'جارٍ تسجيل الدخول…';
        try {
            await signIn(auth, $('email').value.trim(), $('password').value);
            $('password').value = '';
        } catch (error) {
            $('authError').textContent = error.code === 'auth/too-many-requests'
                ? 'محاولات كثيرة. انتظر قليلًا ثم جرّب مجددًا.'
                : error.code === 'auth/network-request-failed' ? 'تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.'
                : 'تعذر الدخول. تحقق من البريد وكلمة المرور.';
            $('authStatus').textContent = ''; button.disabled = false;
        }
    });
    $('retryAuth').addEventListener('click', () => location.reload());
    try {
        const [appTools, authTools, dbTools] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
        ]);
        firebase = dbTools;
        const app = appTools.getApps()[0] || appTools.initializeApp(config);
        auth = authTools.getAuth(app); db = firebase.getDatabase(app);
        signIn = authTools.signInWithEmailAndPassword; signOut = authTools.signOut;
        authTools.onAuthStateChanged(auth, async user => {
            const revision = ++epoch;
            clearSession();
            if (!user) { button.disabled = false; $('authStatus').textContent = ''; return; }
            button.disabled = true; $('authStatus').textContent = 'جارٍ التحقق من صلاحية الإدارة…';
            try {
                await authorize();
                if (revision !== epoch) return;
                if (!Array.isArray(window.questionsData) || !window.questionsData.length) throw new Error('تعذر تحميل مكتبة اللعبة. أعد تحميل الصفحة.');
                const store = window.ContentStudioStore.create({ firebase, db, library: window.QuestionLibrary,
                    base: window.questionsData, authorize });
                $('authGate').hidden = true; $('studio').hidden = false;
                document.querySelector('.skip-link').href = '#workspace';
                controller = window.ContentStudio.mount({ store, email: user.email || 'مشرف', logout: () => signOut(auth) });
                $('authError').textContent = '';
            } catch (error) {
                if (revision !== epoch) return;
                clearSession(); button.disabled = false; $('authStatus').textContent = '';
                $('authError').textContent = error.message?.includes('صلاحية') ? error.message : 'تعذر التحقق من الصلاحية أو تحميل المحتوى. أعد المحاولة.';
                $('retryAuth').hidden = false;
            }
        });
    } catch (_) {
        $('authStatus').textContent = '';
        $('authError').textContent = 'تعذر تحميل خدمة الدخول. تحقق من الاتصال وأعد المحاولة.';
        $('retryAuth').hidden = false;
    }
})();
