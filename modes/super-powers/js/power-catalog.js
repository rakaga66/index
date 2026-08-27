(function () {
    'use strict';

    const ALL_WINDOWS = [
        'BEFORE_QUESTION', 'QUESTION_ACTIVE', 'AFTER_BELL', 'BEFORE_ANSWER',
        'AFTER_WRONG_ANSWER', 'AFTER_CORRECT_ANSWER', 'CELL_SELECTION', 'ROUND_END'
    ];
    const beforeQuestion = ['BEFORE_QUESTION', 'CELL_SELECTION'];
    const afterQuestion = ['QUESTION_ACTIVE', 'AFTER_BELL', 'BEFORE_ANSWER'];
    const betweenRounds = ['ROUND_END', 'BEFORE_QUESTION'];
    const make = (id, name, description, icon, category, rarity, targetType, effect, activationWindow = ALL_WINDOWS, metadata = {}) => ({
        id, name, description, icon, category, rarity, activationWindow, targetType, strength: metadata.strength || 50,
        metadata: { effect, ...metadata }
    });

    // القائمة الرسمية المعتمدة. تفاصيل الاستخدام والقيود تحفظ مع كل قوة
    // حتى تظهر نفسها للمقدم واللاعبين، ولا يتم توزيع قوتين بالمعرّف نفسه.
    const powers = [
        make('steal_cell', 'سرقة خلية', 'تحول خلية يملكها الخصم إلى لون فريقك.', '🦹', 'offensive', 'نادرة', 'OPPONENT_CELL', 'steal-cell', beforeQuestion, { strength: 78, usage: 'الفريق يطلب القوة ويختار الخلية، ثم يستخدم المقدم القوة لتغيير لونها.', limit: 'لا تستخدم على خلية ضمن مسار فوز مكتمل بالفعل.' }),
        make('shield_cell', 'درع الخلية', 'تحمي خلية من أن يأخذها الخصم.', '🛡️', 'defensive', 'شائعة', 'OWN_CELL', 'shield-cell', beforeQuestion, { strength: 42, usage: 'قبل بداية السؤال يحدد الفريق خلية يملكها؛ تصبح محمية لجولة كاملة.', limit: 'لا يمكن سرقتها أو تغيير لونها أثناء الدرع.' }),
        make('double_strike', 'الضربة المزدوجة', 'إذا فاز فريقك بالسؤال يحصل على خليتين بدل خلية واحدة.', '⚔️', 'rare', 'نادرة', 'TEAM', 'double-strike', beforeQuestion, { strength: 72, usage: 'تُفعّل قبل ظهور السؤال؛ عند الإجابة الصحيحة يأخذ الفريق الخلية المختارة ثم يختار خلية إضافية متاحة.', limit: 'إذا أخطأ الفريق تضيع القوة ولا تنتقل للفريق الثاني.' }),
        make('freeze_opponent', 'تجميد الخصم', 'يؤخر قدرة الخصم على الضغط على الجرس.', '🧊', 'offensive', 'نادرة', 'TEAM', 'freeze-opponent', beforeQuestion, { strength: 64, usage: 'قبل ظهور السؤال؛ عند بدايته يتعطل جرس الخصم مؤقتًا.', limit: 'التأخير مضبوط بحد أقصى 3 ثوانٍ.' }),
        make('cancel_opponent_choice', 'إلغاء اختيار الخصم', 'يلغي اختيار الخصم للخلية المحددة.', '🚫', 'offensive', 'نادرة', 'OPPONENT_CELL', 'cancel-opponent-choice', beforeQuestion, { strength: 66, usage: 'قبل ظهور السؤال يحدد الفريق خلية الخصم إذا كان الدور له، ثم يلغي اختيارها.', limit: 'تستخدم فقط عندما يكون الدور للخصم.' }),
        make('power_block', 'حظر القوى', 'يمنع الفريق المنافس من استخدام أي قوة لبقية الجولة.', '⛔', 'offensive', 'أسطورية', 'TEAM', 'power-block', beforeQuestion, { strength: 96, usage: 'قبل السؤال أو في بداية الجولة؛ تُقفل قوى الخصم حتى نهايتها.', limit: 'أندر قوة ولا تتكرر في التوزيع.' }),
        make('reveal_secrets', 'كشف الأسرار', 'تكشف قوتين عشوائيتين من القوى المتبقية للخصم.', '🕵️', 'support', 'نادرة', 'TEAM', 'reveal-secrets', betweenRounds, { strength: 57, usage: 'بين الجولات؛ يعرض النظام اسم ووصف قوتين للخصم.' }),
        make('swap_power', 'تبديل القوة', 'تتخلص من قوة غير مستخدمة وتحصل على قوة عشوائية جديدة.', '♻️', 'support', 'شائعة', 'POWER', 'swap-power', betweenRounds, { strength: 46, usage: 'بين الجولات؛ يختار الفريق قوة غير مستخدمة ويستبدلها النظام بقوة أخرى.' }),
        make('double_challenge', 'التحدي المضاعف', 'يجعل الجولة القادمة على خليتين بدل خلية.', '🎲', 'rare', 'أسطورية', 'TEAM', 'double-challenge', beforeQuestion, { strength: 84, usage: 'قبل السؤال؛ إذا فاز فريقك يأخذ خليتين، وإذا خسر يحصل الخصم على الخليتين.', limit: 'قوة مخاطرة عالية.' }),
        make('mute_player', 'كتم لاعب', 'لاعب واحد من الخصم لا يشارك في الجولة.', '🔇', 'offensive', 'نادرة', 'OPPONENT_PLAYER', 'mute-player', beforeQuestion, { strength: 62, usage: 'قبل السؤال يحدد الفريق لاعبًا من الخصم؛ تُعطّل مشاركته حتى نهاية الجولة.', limit: 'لا تستخدم إذا كان لدى الخصم لاعب واحد فقط قادر على اللعب.' }),
        make('savior', 'المنقذ', 'يمنع الخصم من أخذ خلية حاسمة مرة واحدة.', '🦸', 'defensive', 'أسطورية', 'OPPONENT_CELL', 'savior', ['AFTER_CORRECT_ANSWER'], { strength: 100, usage: 'إذا كانت إجابة الخصم ستؤدي مباشرة إلى فوزه، تلغى ملكية الخلية وتعود متاحة.', limit: 'قوة نادرة جدًا.' }),
        make('big_bet', 'الرهان الكبير', 'تراهن بخلية تملكها مقابل فرصة ربح خليتين.', '💰', 'rare', 'أسطورية', 'OWN_CELL', 'big-bet', beforeQuestion, { strength: 90, usage: 'قبل السؤال يختار الفريق خلية كرهن؛ عند الفوز يأخذ خليتين.', limit: 'عند الخسارة تنتقل الخلية المرهونة للخصم.' }),
        make('recover_cell', 'استعادة الخلية', 'تستعيد خلية خسرتها مؤخرًا.', '↩️', 'defensive', 'نادرة', 'CELL', 'recover-cell', betweenRounds, { strength: 63, usage: 'بين الجولات؛ يسترجع الفريق آخر خلية أخذها الخصم منه.', limit: 'لا يمكن استرجاع خلية قديمة.' }),
        make('copy_power', 'نسخ القوة', 'تنسخ آخر قوة استخدمها الفريق المنافس.', '📋', 'support', 'نادرة', 'POWER', 'copy-power', ['AFTER_CORRECT_ANSWER', 'ROUND_END'], { strength: 71, usage: 'بعد استخدام الخصم قوة؛ يطلب الفريق النسخ وتضاف نسخة قابلة للاستخدام مرة واحدة.', limit: 'لا تنسخ القوى الأسطورية.' }),
        make('choose_responder', 'اختيار المجيب', 'تجبر الخصم أن يجيب عن طريق لاعب محدد.', '🎯', 'offensive', 'نادرة', 'OPPONENT_PLAYER', 'choose-responder', beforeQuestion, { strength: 67, usage: 'قبل السؤال يختار الفريق لاعبًا من الخصم؛ هو المسموح له بالإجابة فقط إذا فاز فريقه بالجرس.' }),
        make('duel', 'المبارزة', 'تحول الجولة إلى مواجهة لاعب ضد لاعب.', '⚔️', 'rare', 'أسطورية', 'PLAYER_PAIR', 'duel', beforeQuestion, { strength: 85, usage: 'قبل السؤال يختار كل فريق لاعبًا؛ هذان فقط يضغطان الجرس ويجيبان.' }),
        make('revive_power', 'إحياء قوة', 'تسترجع قوة سبق أن استهلكتها.', '✨', 'support', 'نادرة', 'POWER', 'revive-power', betweenRounds, { strength: 74, usage: 'بين الجولات؛ يختار الفريق قوة مستخدمة فتعاد جاهزة.', limit: 'لا يمكن إحياء قوة إحياء قوة نفسها.' }),
        make('turn_table', 'قلب الطاولة', 'قوة فوضوية نادرة تغير وضع اللوحة.', '🌀', 'rare', 'أسطورية', 'BOARD', 'turn-table', betweenRounds, { strength: 95, usage: 'بين الجولات؛ يختار النظام عشوائيًا خلية يملكها كل فريق ويبدل ملكيتهما.', limit: 'لا تختار خلايا تعلن فوزًا مباشرة.' }),

        // Compatibility entries for matches created before القائمة الرسمية.
        make('double_point', 'النقطة المضاعفة', 'يضاعف نقطة الإجابة الصحيحة القادمة للفريق.', '✨', 'rare', 'نادرة', 'TEAM', 'double-point', ALL_WINDOWS, { strength: 72, legacy: true }),
        make('extra_time', 'وقت إضافي', 'يضيف خمس ثوانٍ إلى فرصة الفريق.', '⏱️', 'support', 'شائعة', 'TEAM', 'extra-time', ALL_WINDOWS, { strength: 48, seconds: 5, legacy: true }),
        make('shuffle_cells', 'خلط الخلايا', 'يخلط الحروف غير المحجوزة قبل السؤال التالي.', '🔀', 'offensive', 'نادرة', 'BOARD', 'shuffle', ALL_WINDOWS, { strength: 58, legacy: true })
    ];
    powers.slice(-3).forEach(power => { power.legacy = true; });

    function ensureTeamEffects(state, teamId) {
        state.teamEffects = state.teamEffects || {};
        state.teamEffects[teamId] = state.teamEffects[teamId] || {};
        return state.teamEffects[teamId];
    }
    function targetText(target) {
        if (!target) return '';
        if (target.cell?.letter) return ' الخلية ' + target.cell.letter;
        if (target.player?.name) return ' اللاعب ' + target.player.name;
        if (target.power?.name) return ' القوة ' + target.power.name;
        return '';
    }
    function record(state, request, definition, detail) {
        state.powerEffects = Array.isArray(state.powerEffects) ? state.powerEffects : [];
        state.powerEffects.unshift({ powerId: definition?.id || request.powerId, teamId: request.teamId, requestId: request.id, target: request.target || null, detail, at: Date.now() });
        state.powerEffects = state.powerEffects.slice(0, 50);
    }
    function markTeam(state, request, definition, key, value, detail) {
        ensureTeamEffects(state, request.teamId)[key] = value;
        record(state, request, definition, detail);
    }
    function effect(powerId, handler) { window.SuperPowerSystem.registerEffect(powerId, handler); }

    window.SuperPowerSystem.registerPowers(powers);
    effect('steal_cell', ({ state, request, definition }) => { state.boardEffects = state.boardEffects || {}; state.boardEffects.stealCell = request.target || null; record(state, request, definition, 'طلب سرقة' + targetText(request.target) + '.'); });
    effect('shield_cell', ({ state, request, definition }) => { const team = ensureTeamEffects(state, request.teamId); team.shieldCells = team.shieldCells || []; if (request.target) team.shieldCells.push(request.target); record(state, request, definition, 'تم تجهيز درع' + targetText(request.target) + ' لجولة كاملة.'); });
    effect('double_strike', ({ state, request, definition }) => { markTeam(state, request, definition, 'doubleStrike', true, 'الفريق يحصل على خليتين عند الفوز.'); });
    effect('freeze_opponent', ({ state, request, definition }) => { const opponent = request.teamId === 'team1' ? 'team2' : 'team1'; ensureTeamEffects(state, opponent).frozenForQuestion = true; ensureTeamEffects(state, opponent).frozenSeconds = 3; record(state, request, definition, 'تم تجميد جرس الخصم 3 ثوانٍ.'); });
    effect('cancel_opponent_choice', ({ state, request, definition }) => { state.questionEffects = state.questionEffects || {}; state.questionEffects.cancelledOpponentChoice = request.target || null; record(state, request, definition, 'أُلغي اختيار الخصم' + targetText(request.target) + '.'); });
    effect('power_block', ({ state, request, definition }) => { const opponent = request.teamId === 'team1' ? 'team2' : 'team1'; ensureTeamEffects(state, opponent).powerBlockedRound = true; record(state, request, definition, 'أقفلت قوى الفريق المنافس حتى نهاية الجولة.'); });
    effect('reveal_secrets', ({ state, request, definition }) => { ensureTeamEffects(state, request.teamId).revealedOpponentPowers = true; record(state, request, definition, 'كُشفت قوتان عشوائيتان من قوى الخصم للمقدم.'); });
    effect('swap_power', ({ state, request, definition }) => { markTeam(state, request, definition, 'swapPowerTarget', request.target || null, 'تم تسجيل تبديل القوة.'); });
    effect('double_challenge', ({ state, request, definition }) => { markTeam(state, request, definition, 'doubleChallenge', true, 'الجولة القادمة على خليتين؛ الخسارة تمنحهما للخصم.'); });
    effect('mute_player', ({ state, request, definition }) => { const team = ensureTeamEffects(state, request.teamId); team.mutedPlayers = team.mutedPlayers || []; if (request.target?.player) team.mutedPlayers.push(request.target.player); record(state, request, definition, 'تم كتم لاعب من الخصم حتى نهاية الجولة.'); });
    effect('savior', ({ state, request, definition }) => { markTeam(state, request, definition, 'savior', request.target || true, 'المنقذ جاهز لإلغاء خلية حاسمة.'); });
    effect('big_bet', ({ state, request, definition }) => { markTeam(state, request, definition, 'bigBet', request.target || null, 'تم تسجيل الخلية المرهونة؛ الفوز يمنح خليتين والخسارة تنقل الرهن.'); });
    effect('recover_cell', ({ state, request, definition }) => { markTeam(state, request, definition, 'recoverCell', request.target || true, 'تم طلب استعادة آخر خلية خسرها الفريق.'); });
    effect('copy_power', ({ state, request, definition }) => { markTeam(state, request, definition, 'copyPower', request.target || true, 'تم تجهيز نسخة من آخر قوة غير أسطورية.'); });
    effect('choose_responder', ({ state, request, definition }) => { markTeam(state, request, definition, 'restrictedResponder', request.target?.player || request.target || null, 'تم اختيار مجيب الخصم.'); });
    effect('duel', ({ state, request, definition }) => { markTeam(state, request, definition, 'duelPlayers', request.target || null, 'بدأت المبارزة بين لاعبين.'); });
    effect('revive_power', ({ state, request, definition }) => { markTeam(state, request, definition, 'revivePower', request.target || null, 'تم طلب إحياء قوة مستخدمة.'); });
    effect('turn_table', ({ state, request, definition }) => { state.boardEffects = state.boardEffects || {}; state.boardEffects.turnTable = true; record(state, request, definition, 'تم تجهيز قلب الطاولة مع حماية مسارات الفوز.'); });

    // Legacy effects used by saved sessions created before the 30-power list.
    effect('double_point', ({ state, request, definition }) => { markTeam(state, request, definition, 'nextPointMultiplier', 2, 'النقطة الصحيحة القادمة مضاعفة.'); });
    effect('extra_time', ({ state, request, definition }) => { const team = ensureTeamEffects(state, request.teamId); team.extraAnswerSeconds = Number(team.extraAnswerSeconds || 0) + 5; record(state, request, definition, 'أضيفت 5 ثوانٍ للفريق.'); });
    effect('shuffle_cells', ({ state, request, definition }) => { state.boardEffects = state.boardEffects || {}; state.boardEffects.shuffleRequestedBy = request.teamId; state.boardEffects.shuffleRequestedAt = Date.now(); record(state, request, definition, 'طلب الفريق خلط الخلايا غير المحجوزة.'); });
})();
