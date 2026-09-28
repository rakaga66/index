export const ONLINE_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

const FINISHED_GAME_STATES = new Set(["FINISHED", "GAME_FINISHED"]);
const JOINABLE_ROOM_STATUSES = new Set(["WAITING", "PLAYING"]);

export function roomCreatedAt(room) {
    const createdAt = Number(room?.meta?.createdAt || room?.game?.createdAt || 0);
    return Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0;
}

export function roomExpiresAt(room) {
    const createdAt = roomCreatedAt(room);
    if (!createdAt) return 0;
    const hardExpiry = createdAt + ONLINE_ROOM_TTL_MS;
    const explicitExpiry = Number(room?.meta?.expiresAt || 0);
    // Keep expiry anchored to creation even if a stale or malformed room has
    // an extended expiresAt value written by an older client.
    return Number.isFinite(explicitExpiry) && explicitExpiry > 0
        ? Math.min(explicitExpiry, hardExpiry)
        : hardExpiry;
}

export function isFinishedRoom(room) {
    return room?.meta?.status === "FINISHED" ||
        FINISHED_GAME_STATES.has(String(room?.meta?.state || "")) ||
        FINISHED_GAME_STATES.has(String(room?.game?.state || ""));
}

export function isExpiredRoom(room, now = Date.now()) {
    const expiresAt = roomExpiresAt(room);
    return !expiresAt || Number(now) >= expiresAt;
}

export function roomJoinError(room, code, now = Date.now()) {
    if (!room?.meta || String(room.meta.code || "") !== String(code || "")) {
        return "لم نجد جلسة بهذا الكود.";
    }
    if (isFinishedRoom(room)) {
        return "انتهت هذه الجلسة ولا يمكن الدخول إليها.";
    }
    if (isExpiredRoom(room, now)) {
        return "انتهت صلاحية الجلسة بعد 24 ساعة. أنشئ جلسة جديدة.";
    }
    if (!JOINABLE_ROOM_STATUSES.has(String(room.meta.status || ""))) {
        return "هذه الجلسة غير متاحة للدخول.";
    }
    return "";
}

export function isRoomJoinable(room, code, now = Date.now()) {
    return !roomJoinError(room, code, now);
}
