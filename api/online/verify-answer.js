const SYSTEM_PROMPT = `أنت محرك تحقق من الإجابات داخل لعبة "حروف".

مهمتك الوحيدة هي تحديد ما إذا كانت إجابة اللاعب تطابق الإجابة الصحيحة التي يرسلها لك النظام.

أنت لست مساعدًا عامًا.
لا تتحدث مع اللاعبين.
لا تجيب عن الأسئلة.
لا تبحث عن الإجابة الصحيحة.
لا تستخدم الإنترنت.
لا تستخدم معلوماتك العامة لتغيير الإجابة.
لا تقترح إجابات.
لا تشرح.
لا تصحح السؤال.
لا تدخل في نقاش.

الإجابة الصحيحة الرسمية هي Expected Answer التي يرسلها النظام لك.
يجب عليك فقط مقارنة Expected Answer وPlayer Answer، مع مراعاة الأخطاء الكتابية البسيطة التي لا تغير المعنى أو هوية الإجابة.
اعتبر التشكيل، والمسافات الزائدة أو الناقصة، وعلامات الترقيم، واختلاف أ / إ / آ / ا، واختلاف ى / ي، واختلاف ة / ه عند وضوح المقصود، والمسافة داخل الأسماء المركبة، واختلاف كتابة الاسم الأجنبي بالعربية عند وضوح المقصود، اختلافات غير مؤثرة.

لا تقبل الإجابة إذا كانت شخصًا أو دولة أو مدينة أو عنصرًا مختلفًا، أو إجابة عامة بدل الاسم المحدد، أو كان التشابه مجرد تشابه أسماء، أو غيّر الخطأ الإملائي المعنى فعليًا، أو كانت إجابة محتملة صحيحة في العالم لكنها ليست Expected Answer المرسل من النظام.
لا تحاول معرفة إن كان Expected Answer نفسه صحيحًا؛ اعتبره الحقيقة الرسمية لهذه الجولة.
Required Letter يستخدم فقط كتحقق إضافي، وليس للبحث عن إجابة جديدة.

أخرج JSON صالحًا فقط وبدون Markdown وبدون أي نص آخر.
الصيغة الوحيدة المسموحة: {"valid":true,"confidence":0.00} أو {"valid":false,"confidence":0.00}.
confidence رقم من 0 إلى 1. لا تضف reason أو explanation أو answer أو أي مفتاح آخر.`;

const OFFICIAL_QUESTIONS = require("./questions.json");
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;
const rateBuckets = new Map();

function allowRequest(req) {
    const headers = req?.headers || {};
    const forwarded = headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown";
    const key = String(forwarded).split(",")[0].trim().slice(0, 80) || "unknown";
    const now = Date.now();
    const current = rateBuckets.get(key);
    if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
        rateBuckets.set(key, { startedAt: now, count: 1 });
        if (rateBuckets.size > 1000) {
            for (const [bucketKey, bucket] of rateBuckets) {
                if (now - bucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(bucketKey);
            }
        }
        return true;
    }
    if (current.count >= RATE_LIMIT) return false;
    current.count += 1;
    return true;
}

function json(res, status, value) {
    res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
}

function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFKC")
        .replace(/[ًٌٍَُِّْـ]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه").replace(/[ى]/g, "ي")
        .replace(/[ؤ]/g, "و").replace(/[ئ]/g, "ي")
        .replace(/[^\u0621-\u063A\u0641-\u064A0-9a-zA-Z]/g, "");
}

// Damerau-Levenshtein also treats an adjacent transposition as one typo. This
// is important for common Arabic slips such as «جراده»/«جرداه».
function editDistance(left, right) {
    const a = String(left || ""); const b = String(right || "");
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
    for (let col = 0; col <= b.length; col += 1) matrix[0][col] = col;
    for (let row = 1; row <= a.length; row += 1) {
        for (let col = 1; col <= b.length; col += 1) {
            const substitution = matrix[row - 1][col - 1] + (a[row - 1] === b[col - 1] ? 0 : 1);
            matrix[row][col] = Math.min(matrix[row - 1][col] + 1, matrix[row][col - 1] + 1, substitution);
            if (row > 1 && col > 1 && a[row - 1] === b[col - 2] && a[row - 2] === b[col - 1]) {
                matrix[row][col] = Math.min(matrix[row][col], matrix[row - 2][col - 2] + 1);
            }
        }
    }
    return matrix[a.length][b.length];
}

function obviousMatch(expected, submitted) {
    const a = normalize(expected); const b = normalize(submitted);
    if (!a || !b) return false;
    if (a === b) return true;
    const stripArticle = (value) => value.replace(/^ال(?=[\u0621-\u064A])/, "");
    if (stripArticle(a) === stripArticle(b)) return true;
    const maxLength = Math.max(a.length, b.length);
    const maxDistance = maxLength <= 4 ? 1 : Math.min(2, Math.max(1, Math.floor(maxLength * .2)));
    return editDistance(a, b) <= maxDistance || editDistance(stripArticle(a), stripArticle(b)) <= maxDistance;
}

function firstLetter(value) {
    const normalized = normalize(value).replace(/^ال(?=[\u0621-\u064A])/, "");
    return normalized.slice(0, 1);
}

function matchingOfficialRecord(questionId, question, requiredLetter, expectedAnswer) {
    const normalizedQuestion = normalize(question);
    const indexed = /^q-(\d+)$/.exec(String(questionId || ""));
    const indexedRecord = indexed ? OFFICIAL_QUESTIONS[Number(indexed[1])] : null;
    if (indexedRecord && normalize(indexedRecord.question) === normalizedQuestion && firstLetter(indexedRecord.letter) === requiredLetter) {
        return indexedRecord;
    }
    const candidates = OFFICIAL_QUESTIONS.filter((record) =>
        normalize(record.question) === normalizedQuestion && firstLetter(record.letter) === requiredLetter
    );
    if (candidates.length === 1) return candidates[0];
    const answerMatches = candidates.filter((record) => obviousMatch(record.answer, expectedAnswer));
    return answerMatches.length === 1 ? answerMatches[0] : null;
}

async function matchingApprovedFollowerRecord(question, requiredLetter, expectedAnswer) {
    const databaseUrl = String(process.env.ONLINE_FIREBASE_DATABASE_URL || "https://buzzer-game-f2983-default-rtdb.firebaseio.com").replace(/\/$/, "");
    try {
        const response = await fetch(databaseUrl + "/questionLibrary.json");
        if (!response.ok) return null;
        const value = await response.json();
        const records = Object.values(value || {}).filter((record) =>
            record?.status === "active" &&
            normalize(record.question) === normalize(question) &&
            firstLetter(record.letter) === requiredLetter &&
            firstLetter(record.answer) === requiredLetter
        );
        if (records.length === 1) return records[0];
        const answerMatches = records.filter((record) => obviousMatch(record.answer, expectedAnswer));
        return answerMatches.length === 1 ? answerMatches[0] : null;
    } catch (_) {
        return null;
    }
}

async function readStoredSettings() {
    const databaseUrl = String(process.env.ONLINE_FIREBASE_DATABASE_URL || "https://buzzer-game-f2983-default-rtdb.firebaseio.com").replace(/\/$/, "");
    try {
        const response = await fetch(databaseUrl + "/onlineAiSettings.json");
        if (!response.ok) return {};
        const value = await response.json();
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

function parseModelJson(value) {
    try {
        const clean = String(value || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(clean);
        return { valid: parsed.valid === true, confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)) };
    } catch (_) {
        return { valid: false, confidence: 0 };
    }
}

async function verifyAnswer(req, res) {
    if (req.method !== "POST") return json(res, 405, { valid: false, confidence: 0 });
    if (!allowRequest(req)) {
        res.setHeader("Retry-After", "60");
        return json(res, 429, { valid: false, confidence: 0, message: "rate-limit" });
    }
    let body = req.body || {};
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    const question = String(body.question || "").trim().slice(0, 600);
    const questionId = String(body.questionId || "").trim().slice(0, 120);
    const clientExpectedAnswer = String(body.expectedAnswer || "").trim().slice(0, 240);
    const playerAnswer = String(body.playerAnswer || "").trim().slice(0, 240);
    const requiredLetter = firstLetter(body.requiredLetter);
    if (!question || !playerAnswer || !requiredLetter) {
        return json(res, 400, { valid: false, confidence: 0 });
    }
    const officialRecord = matchingOfficialRecord(questionId, question, requiredLetter, clientExpectedAnswer)
        || await matchingApprovedFollowerRecord(question, requiredLetter, clientExpectedAnswer);
    const expectedAnswer = String(officialRecord?.answer || "").trim();
    if (!expectedAnswer || firstLetter(expectedAnswer) !== requiredLetter) {
        return json(res, 400, { valid: false, confidence: 0 });
    }
    if (obviousMatch(expectedAnswer, playerAnswer)) return json(res, 200, { valid: true, confidence: .96 });

    const stored = await readStoredSettings();
    const enabled = stored.enabled === undefined ? String(process.env.ONLINE_AI_ENABLED || "false").toLowerCase() === "true" : stored.enabled === true;
    const apiKey = String(process.env.ONLINE_AI_API_KEY || "").trim();
    if (!enabled || !apiKey) return json(res, 200, { valid: false, confidence: 0 });

    const endpoint = String(process.env.ONLINE_AI_ENDPOINT || "https://api.deepseek.com/chat/completions");
    const model = String(stored.model || process.env.ONLINE_AI_MODEL || "deepseek-v4-flash");
    try {
        const upstream = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
            body: JSON.stringify({
                model,
                temperature: 0,
                max_tokens: 40,
                thinking: { type: "disabled" },
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: JSON.stringify({ Question: question, "Expected answer": expectedAnswer, "Required letter": requiredLetter, "Player answer": playerAnswer }) }
                ]
            })
        });
        if (!upstream.ok) return json(res, 200, { valid: false, confidence: 0 });
        const data = await upstream.json();
        const content = data?.choices?.[0]?.message?.content || "";
        return json(res, 200, parseModelJson(content));
    } catch (_) {
        return json(res, 200, { valid: false, confidence: 0 });
    }
}

// Expose the deterministic validator for local smoke tests without exposing
// any server credentials or changing the Vercel handler contract.
module.exports = verifyAnswer;
module.exports.normalizeAnswer = normalize;
module.exports.editDistance = editDistance;
module.exports.answerMatches = obviousMatch;
module.exports.firstLetter = firstLetter;
