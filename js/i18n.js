// ===================== 다국어 지원 (한국어 / English) =====================

const LANG_KEY = 'sudoku_lang';
let currentLang = localStorage.getItem(LANG_KEY) || 'ko';

const T = {
    ko: {
        // 시작 화면
        subtitle:       '레벨을 선택하면 바로 시작됩니다',
        hofLink:        '🏆 명예의 전당 보기',
        tierNames:      ['입문','입문','쉬움','쉬움','보통','보통','어려움','어려움','전문가','전문가'],
        // 게임 액션
        restart:        '↩ 다시시작',
        sameLevel:      '↺ 같은 난이도',
        home:           '🏠 홈',
        // 사이드 패널
        memoOff:        '✏️ 메모',
        memoOn:         '✏️ 메모 ON',
        errorCheck:     '🔴 오답 표시',
        hintPrefix:     '💡 힌트 남은 횟수: ',
        // 키보드 도움말
        kbTitle:        '⌨️ 키보드 단축키',
        kbItems: [
            '방향키 → 이동',
            '1~9 → 숫자 선택 + 입력',
            'Enter → 숫자 순환 / Shift+Enter → 역순환',
            'Delete / 0 → 지우기',
            '스페이스 / M → 메모 모드',
            'H → 힌트', 'P → 일시정지',
            '스페이스 → 재개 (정지 중)',
            'Ctrl+Z / ⌘Z → 되돌리기',
            'Ctrl+Y / ⌘⇧Z → 다시하기',
        ],
        // 로딩 / 정지
        loadingMsg:     '퍼즐 생성 중...',
        loadingHard:    '어려울수록 시간이 걸려요',
        pausedTitle:    '일시정지',
        pausedMsg:      '게임이 멈췄어요',
        resumeBtn:      '▶ 계속하기',
        // 축하 화면
        celebComplete:  '완성!',
        statTime:       '완성 시간',
        statDiff:       '난이도',
        statHints:      '힌트 사용',
        statScore:      '최종 점수',
        saveLabel:      '닉네임을 입력하고 기록을 저장하세요!',
        savePlaceholder:'닉네임 (최대 12자)',
        saveBtn:        '저장',
        unitHints:      '개',
        unitSec:        '초',
        // 명예의 전당
        hofTitle:       '🏆 명예의 전당',
        hofSaveBanner:  '✅ 기록이 저장됐어요!',
        hofSaveBannerError: '⚠️ 온라인 저장 실패 — 기기에만 저장됐어요. Supabase RLS 정책을 확인하세요.',
        hofSameLevel:   '↺ 같은 난이도 새 게임',
        hofHome:        '🏠 홈',
        tabSeasonAll:   '전체',
        tabAlltime:     '역대',
        colRank:        '순위', colName: '닉네임', colDiff: '난이도',
        colTime:        '시간', colHints: '힌트', colScore: '점수', colDate: '날짜',
        noRecords:      '아직 기록이 없어요!',
        hofLevelOptions: [
            'Lv.1 (입문)','Lv.2 (입문)','Lv.3 (쉬움)','Lv.4 (쉬움)',
            'Lv.5 (보통)','Lv.6 (보통)','Lv.7 (어려움)','Lv.8 (어려움)',
            'Lv.9 (전문가)','Lv.10 (전문가)',
        ],
        // 관리자 / 확인창
        confirmEndSeason:   (n) => `"${n}"을 종료하고 명예의 전당에 보관할까요?\n새 시즌이 바로 시작됩니다.`,
        seasonEndedAlert:   (n) => `${n}이 종료되어 명예의 전당에 보관됐어요! 새 시즌이 시작됩니다.`,
        confirmClearRecords:'현재 시즌 기록을 모두 삭제할까요?',
        confirmRestart:     '처음 상태로 되돌릴까요? 지금까지의 입력이 지워집니다.',
        // 로딩
        hofLoading: '로딩 중...',
        // 퍼센타일
        pct1:    '🥇 이 난이도 최고 기록이에요!',
        pct10:   (p) => `🏆 상위 ${p}%! 정말 대단해요!`,
        pct25:   (p) => `🎉 상위 ${p}%의 훌륭한 기록이에요!`,
        pct50:   (p) => `👍 상위 ${p}%의 기록이에요!`,
        pctOther:(p) => `📊 상위 ${p}%의 기록이에요. 더 잘할 수 있어요!`,
        pctLow:  '💪 다음엔 더 좋은 기록에 도전해봐요!',
        // 순위 토스트
        rankToast: (emoji, lv, rank) => `${emoji} Lv.${lv} 시즌 ${rank}위 달성!`,
        // 데일리 챌린지
        dailyBtnText: '📅 오늘의 챌린지',
        tabDaily:     '📅 오늘의 챌린지',
        autoMemoBtn:  '✨ 자동',
        // 난이도명
        diffMap: { '입문':'입문', '쉬움':'쉬움', '보통':'보통', '어려움':'어려움', '전문가':'전문가' },
    },
    en: {
        subtitle:       'Select a level to start',
        hofLink:        '🏆 Hall of Fame',
        tierNames:      ['Beginner','Beginner','Easy','Easy','Medium','Medium','Hard','Hard','Expert','Expert'],
        restart:        '↩ Restart',
        sameLevel:      '↺ Same Level',
        home:           '🏠 Home',
        memoOff:        '✏️ Notes',
        memoOn:         '✏️ Notes ON',
        errorCheck:     '🔴 Show Errors',
        hintPrefix:     '💡 Hints left: ',
        kbTitle:        '⌨️ Keyboard Shortcuts',
        kbItems: [
            'Arrow keys → Move',
            '1~9 → Select + Input',
            'Enter → Cycle / Shift+Enter → Reverse',
            'Delete / 0 → Erase',
            'Space / M → Notes mode',
            'H → Hint', 'P → Pause',
            'Space → Resume (while paused)',
            'Ctrl+Z / ⌘Z → Undo',
            'Ctrl+Y / ⌘⇧Z → Redo',
        ],
        loadingMsg:     'Generating puzzle...',
        loadingHard:    'Harder levels take longer',
        pausedTitle:    'Paused',
        pausedMsg:      'Game is paused',
        resumeBtn:      '▶ Resume',
        celebComplete:  'Complete!',
        statTime:       'Time',
        statDiff:       'Difficulty',
        statHints:      'Hints Used',
        statScore:      'Final Score',
        saveLabel:      'Enter your name to save your record!',
        savePlaceholder:'Name (max 12 chars)',
        saveBtn:        'Save',
        unitHints:      '',
        unitSec:        's',
        hofTitle:       '🏆 Hall of Fame',
        hofSaveBanner:  '✅ Record saved!',
        hofSaveBannerError: '⚠️ Online save failed — saved on this device only. Check Supabase RLS policy.',
        hofSameLevel:   '↺ New Game (Same Level)',
        hofHome:        '🏠 Home',
        tabSeasonAll:   'All',
        tabAlltime:     'All Time',
        colRank:        'Rank', colName: 'Name', colDiff: 'Level',
        colTime:        'Time', colHints: 'Hints', colScore: 'Score', colDate: 'Date',
        noRecords:      'No records yet!',
        hofLevelOptions: [
            'Lv.1 (Beginner)','Lv.2 (Beginner)','Lv.3 (Easy)','Lv.4 (Easy)',
            'Lv.5 (Medium)','Lv.6 (Medium)','Lv.7 (Hard)','Lv.8 (Hard)',
            'Lv.9 (Expert)','Lv.10 (Expert)',
        ],
        confirmEndSeason:   (n) => `End "${n}" and archive to Hall of Fame?\nA new season starts immediately.`,
        seasonEndedAlert:   (n) => `${n} ended and archived! A new season starts now.`,
        confirmClearRecords:'Delete all records for this season?',
        confirmRestart:     'Reset to start? All progress will be lost.',
        hofLoading: 'Loading...',
        pct1:    '🥇 Best record for this difficulty!',
        pct10:   (p) => `🏆 Top ${p}%! Amazing!`,
        pct25:   (p) => `🎉 Top ${p}%! Great record!`,
        pct50:   (p) => `👍 Top ${p}%!`,
        pctOther:(p) => `📊 Top ${p}%. You can do better!`,
        pctLow:  '💪 Keep going — the next one will be better!',
        rankToast: (emoji, lv, rank) => `${emoji} Lv.${lv} Season Rank #${rank}!`,
        // Daily challenge
        dailyBtnText: '📅 Daily Challenge',
        tabDaily:     '📅 Daily Challenge',
        autoMemoBtn:  '✨ Auto',
        diffMap: { '입문':'Beginner', '쉬움':'Easy', '보통':'Medium', '어려움':'Hard', '전문가':'Expert' },
    },
};

function t(key, ...args) {
    const val = T[currentLang]?.[key] ?? T['ko']?.[key];
    return typeof val === 'function' ? val(...args) : (val ?? key);
}

function translateDiffName(korName) {
    return T[currentLang].diffMap?.[korName] ?? korName;
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    if (typeof applyTranslations === 'function') applyTranslations();
}
