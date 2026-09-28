import test from 'node:test';
import assert from 'node:assert/strict';
import { ONLINE_ROOM_TTL_MS, isRoomJoinable, roomJoinError } from '../js/online-room-policy.mjs';

const now = 1_800_000_000_000;
function room(overrides = {}) {
    return {
        meta: { code: '123456', status: 'WAITING', createdAt: now - 60_000 },
        game: { state: 'WAITING' },
        ...overrides
    };
}

test('a fresh waiting or playing session remains joinable', () => {
    assert.equal(isRoomJoinable(room(), '123456', now), true);
    assert.equal(isRoomJoinable(room({ meta: { code: '123456', status: 'PLAYING', createdAt: now - 60_000 } }), '123456', now), true);
});

test('finished game state blocks new entry even if room status was left as PLAYING', () => {
    const staleWinner = room({ meta: { code: '123456', status: 'PLAYING', createdAt: now - 60_000 }, game: { state: 'GAME_FINISHED', winnerTeam: 'team1' } });
    assert.equal(isRoomJoinable(staleWinner, '123456', now), false);
    assert.match(roomJoinError(staleWinner, '123456', now), /انتهت هذه الجلسة/);
});

test('completed sessions reject everyone, including a previous participant', () => {
    const finished = room({ meta: { code: '123456', status: 'FINISHED', createdAt: now - 60_000 } });
    assert.equal(isRoomJoinable(finished, '123456', now), false);
});

test('sessions older than 24 hours and sessions without a trustworthy creation time are rejected', () => {
    const old = room({ meta: { code: '123456', status: 'WAITING', createdAt: now - ONLINE_ROOM_TTL_MS - 1 } });
    const missingTimestamp = room({ meta: { code: '123456', status: 'WAITING' } });
    assert.equal(isRoomJoinable(old, '123456', now), false);
    assert.equal(isRoomJoinable(missingTimestamp, '123456', now), false);
    assert.match(roomJoinError(old, '123456', now), /24 ساعة/);
});

test('a mismatched room code is rejected before any player can be added', () => {
    assert.equal(isRoomJoinable(room(), '654321', now), false);
    assert.match(roomJoinError(room(), '654321', now), /لم نجد جلسة/);
});
