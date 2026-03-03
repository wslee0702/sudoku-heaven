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

// ── 점수 저장 후 삽입된 id 반환 (하이라이트용)
async function saveScoreOnline(record) {
    const sb = getSupabase();
    if (!sb) {
        console.warn('[Supabase] 클라이언트 초기화 실패 (CDN 로드 확인)');
        return null;
    }
    try {
        const { data, error } = await sb.from('scores').insert({
            player_name:  record.name,
            difficulty:   record.difficulty,
            diff_name:    record.diffName,
            tier:         record.tier,
            time_seconds: record.timeSeconds,
            hints_used:   record.hintsUsed,
            score:        record.score,
        }).select('id').single();
        if (error) {
            console.error('[Supabase] INSERT 오류:', error.code, error.message);
            // 42501 = RLS 정책 위반 (Supabase 대시보드에서 INSERT 정책 추가 필요)
            return null;
        }
        return data; // { id }
    } catch (e) {
        console.error('[Supabase] INSERT 예외:', e);
        return null;
    }
}

// ── 전 세계 기록 불러오기
// options: { level, sinceIso, limit }
async function loadGlobalScores({ level = null, sinceIso = null, limit = 1000 } = {}) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
        let q = sb
            .from('scores')
            .select('*')
            .order('score', { ascending: true })
            .limit(limit);

        if (level !== null) q = q.eq('difficulty', level);
        if (sinceIso !== null) q = q.gte('created_at', sinceIso);

        const { data, error } = await q;
        if (error) {
            console.error('[Supabase] SELECT 오류:', error.code, error.message);
            return null; // null 반환 → 로컬 폴백 사용
        }
        return data;
    } catch (e) {
        console.error('[Supabase] SELECT 예외:', e);
        return null;
    }
}
