// ===================== Supabase 연결 =====================
// 전 세계 기록 저장 / 불러오기 담당

const SUPABASE_URL = 'https://vldzkmghvhxtjghqqrkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DxjMTl41EP4Jy-Kxw_kKJQ_2zFrt3YT';

let _sb = null;

function getSupabase() {
    if (!_sb && typeof supabase !== 'undefined') {
        _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return _sb;
}

// ── 점수 저장 (실패해도 로컬엔 이미 저장되어 있으므로 게임에 영향 없음)
async function saveScoreOnline(record) {
    const sb = getSupabase();
    if (!sb) return;
    try {
        await sb.from('scores').insert({
            player_name:  record.name,
            difficulty:   record.difficulty,
            diff_name:    record.diffName,
            tier:         record.tier,
            time_seconds: record.timeSeconds,
            hints_used:   record.hintsUsed,
            score:        record.score,
        });
    } catch (e) {
        // 온라인 저장 실패 → 조용히 무시
    }
}

// ── 전 세계 기록 불러오기
// level: null이면 전체, 숫자면 해당 레벨만
async function loadGlobalScores({ level = null } = {}) {
    const sb = getSupabase();
    if (!sb) return null; // null = Supabase 라이브러리 로드 실패

    try {
        let q = sb
            .from('scores')
            .select('*')
            .order('score', { ascending: true })
            .limit(50);

        if (level !== null) q = q.eq('difficulty', level);

        const { data, error } = await q;
        if (error) return [];
        return data;
    } catch (e) {
        return [];
    }
}
