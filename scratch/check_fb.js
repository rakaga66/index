import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyCV2ZAVYmHxbgZvFPmWtooCHR6C4aMOE3A",
    authDomain: "buzzer-game-f2983.firebaseapp.com",
    databaseURL: "https://buzzer-game-f2983-default-rtdb.firebaseio.com",
    projectId: "buzzer-game-f2983",
    storageBucket: "buzzer-game-f2983.firebasestorage.app",
    messagingSenderId: "125573747954",
    appId: "1:125573747954:web:8dac68183e6e326b8b2c6b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function inspect() {
    try {
        const snap = await get(ref(db, 'users'));
        if (snap.exists()) {
            const data = snap.val();
            for (const phone in data) {
                console.log(`User: ${phone}`);
                console.log(`  lastHeartbeat: ${data[phone].lastHeartbeat}`);
                console.log(`  sessions:`, data[phone].sessions);
            }
        } else {
            console.log("No users found.");
        }
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
inspect();
