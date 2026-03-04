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

// ── IP 기반 국가 코드 자동 감지 (캐시: localStorage)
async function detectCountry() {
    const cached = localStorage.getItem('sudoku_country');
    if (cached) return cached;
    try {
        const res  = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data.success && data.country_code) {
            localStorage.setItem('sudoku_country', data.country_code);
            return data.country_code;
        }
    } catch (e) {
        console.warn('[IP] 국가 감지 실패:', e);
    }
    return 'XX';
}

// ── 점수 저장 전 기본 유효성 검사 (DB CHECK와 이중 방어)
function isValidRecord(record) {
    if (!record.name || record.name.length < 1 || record.name.length > 20) return false;
    if (record.difficulty < 1 || record.difficulty > 20)                   return false;
    if (record.timeSeconds < 10)                                            return false;
    if (record.hintsUsed < 0 || record.hintsUsed > 5)                      return false;
    if (record.score < 10)                                                  return false;
    return true;
}

// ── 점수 저장 후 삽입된 id 반환 (하이라이트용)
async function saveScoreOnline(record) {
    if (!isValidRecord(record)) {
        console.warn('[Supabase] 유효하지 않은 기록, 저장 건너뜀', record);
        return null;
    }
    const sb = getSupabase();
    if (!sb) {
        console.warn('[Supabase] 클라이언트 초기화 실패 (CDN 로드 확인)');
        return null;
    }
    try {
        const insertObj = {
            player_name:  record.name,
            difficulty:   record.difficulty,
            diff_name:    record.diffName,
            tier:         record.tier,
            time_seconds: record.timeSeconds,
            hints_used:   record.hintsUsed,
            score:        record.score,
        };
        if (record.dailyDate)   insertObj.daily_date   = record.dailyDate;
        if (record.puzzleSeed)  insertObj.puzzle_seed  = record.puzzleSeed;
        if (record.countryCode && record.countryCode !== 'XX') insertObj.country_code = record.countryCode;
        const { data, error } = await sb.from('scores').insert(insertObj).select('id').single();
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
async function loadGlobalScores({ level = null, sinceIso = null, dailyDate = null, limit = 1000 } = {}) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
        let q = sb
            .from('scores')
            .select('*')
            .order('score', { ascending: true })
            .limit(limit);

        if (level !== null)      q = q.eq('difficulty', level);
        if (sinceIso !== null)   q = q.gte('created_at', sinceIso);
        if (dailyDate !== null)  q = q.eq('daily_date', dailyDate);

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
