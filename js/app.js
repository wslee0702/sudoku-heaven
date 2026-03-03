// ===================== 수도쿠 게임 전체 로직 =====================

// ── 셀 DOM 요소 참조 (9x9 배열)
const cellEls = [];

// ── 플래시 중인 셀 추적 (renderCell에서 클래스 유지용)
const flashingCells  = new Set(); // 'r,c' 형태
const flashingFinals = new Set(); // 전체 완성 플래시용

// ── 마지막 저장 기록 (HoF 하이라이트용)
let lastSavedRecord  = null;
let rankToastTimer   = null;

// ── 게임 상태
const Game = {
    board:        null,   // 9x9 현재 보드 (0=빈칸)
    solution:     null,   // 9x9 정답 보드
    given:        null,   // 9x9 boolean - 처음부터 주어진 숫자
    memos:        null,   // 9x9 Set - 메모 숫자들
    hinted:       null,   // 9x9 boolean - 힌트로 밝혀진 칸
    initialBoard: null,   // 다시하기용 초기 상태

    selected:     null,   // {row, col} 또는 null
    selectedNum:  0,      // 키패드에서 선택된 숫자 (0=선택 없음)
    difficulty:   5,
    memoMode:     false,
    showErrors:   true,
    completed:    false,
    hintsLeft:    5,

    // 이력 관리 (Undo/Redo)
    history:      [],     // 스냅샷 스택 (최대 50)
    future:       [],     // 다시하기 스택

    // 완성된 줄/박스 추적 (중복 플래시 방지)
    completedLines: new Set(), // 'row-0', 'col-3', 'box-1-2' 형태

    timerSeconds:   0,
    timerInterval:  null,
    paused:         false,
};

// ===================== 유틸 =====================

function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ===================== 이력 관리 (Undo/Redo) =====================

function saveToHistory() {
    const snapshot = {
        board:     Game.board.map(row => [...row]),
        memos:     Game.memos.map(row => row.map(s => new Set(s))),
        hinted:    Game.hinted.map(row => [...row]),
        hintsLeft: Game.hintsLeft,
    };
    Game.history.push(snapshot);
    if (Game.history.length > 50) Game.history.shift();
    Game.future = []; // 새 액션이 생기면 다시하기 스택 초기화
    updateUndoRedoBtns();
}

function captureCurrentState() {
    return {
        board:     Game.board.map(row => [...row]),
        memos:     Game.memos.map(row => row.map(s => new Set(s))),
        hinted:    Game.hinted.map(row => [...row]),
        hintsLeft: Game.hintsLeft,
    };
}

function restoreState(snapshot) {
    Game.board     = snapshot.board;
    Game.memos     = snapshot.memos;
    Game.hinted    = snapshot.hinted;
    Game.hintsLeft = snapshot.hintsLeft;
    Game.completed = false;
}

function undo() {
    if (Game.history.length === 0 || Game.completed) return;
    Game.future.push(captureCurrentState());
    restoreState(Game.history.pop());
    recomputeCompletedLines();
    updateHintBtn();
    updateUndoRedoBtns();
    renderBoard();
}

function redo() {
    if (Game.future.length === 0) return;
    Game.history.push(captureCurrentState());
    restoreState(Game.future.pop());
    recomputeCompletedLines();
    updateHintBtn();
    updateUndoRedoBtns();
    renderBoard();
    checkComplete();
}

function updateUndoRedoBtns() {
    document.getElementById('undo-btn').disabled = Game.history.length === 0;
    document.getElementById('redo-btn').disabled = Game.future.length === 0;
}

// ===================== 보드 DOM 생성 =====================

function createBoardDOM() {
    const boardEl = document.getElementById('sudoku-board');
    boardEl.innerHTML = '';
    cellEls.length = 0;

    for (let r = 0; r < 9; r++) {
        cellEls.push([]);
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.className = 'sudoku-cell';
            if (c === 2 || c === 5) cell.classList.add('thick-right');
            if (r === 2 || r === 5) cell.classList.add('thick-bottom');
            cell.addEventListener('click', () => onCellClick(r, c));
            boardEl.appendChild(cell);
            cellEls[r].push(cell);
        }
    }
}

// ===================== 셀 렌더링 =====================

function renderCell(r, c) {
    const cell = cellEls[r][c];
    const val      = Game.board[r][c];
    const isGiven  = Game.given[r][c];
    const isHinted = Game.hinted[r][c];
    const isSel    = Game.selected && Game.selected.row === r && Game.selected.col === c;

    // 클래스 초기화 (thick 클래스는 유지)
    cell.className = 'sudoku-cell';
    if (c === 2 || c === 5) cell.classList.add('thick-right');
    if (r === 2 || r === 5) cell.classList.add('thick-bottom');

    // 선택/강조 상태
    if (isSel) {
        cell.classList.add('selected');
    } else if (Game.selected) {
        const { row: sr, col: sc } = Game.selected;
        const selVal  = Game.board[sr][sc];
        const sameRow = sr === r;
        const sameCol = sc === c;
        const sameBox = Math.floor(sr / 3) === Math.floor(r / 3) &&
                        Math.floor(sc / 3) === Math.floor(c / 3);

        if (sameRow || sameCol || sameBox) cell.classList.add('highlight');

        // 선택된 셀의 숫자와 같은 숫자 강조
        if (val !== 0 && selVal !== 0 && val === selVal) {
            cell.classList.add('same-number');
        }
    }

    // 키패드 선택 숫자 하이라이트 (선택된 셀 제외)
    if (!isSel && Game.selectedNum !== 0 && val === Game.selectedNum) {
        cell.classList.add('numpad-match');
    }

    // 오류 표시
    if (Game.showErrors && val !== 0 && !isGiven && !isHinted) {
        if (val !== Game.solution[r][c]) cell.classList.add('error');
    }

    // 셀 타입
    if (!isGiven && !isHinted && val !== 0) cell.classList.add('user-input');
    if (isHinted) cell.classList.add('hinted');

    // 플래시 클래스 유지 (애니메이션 중이면 제거하지 않음)
    if (flashingCells.has(`${r},${c}`))  cell.classList.add('cell-flash');
    if (flashingFinals.has(`${r},${c}`)) cell.classList.add('cell-flash-final');

    // 내용 렌더링
    cell.innerHTML = '';
    if (val !== 0) {
        cell.textContent = val;
    } else if (Game.memos[r][c].size > 0) {
        const grid = document.createElement('div');
        grid.className = 'memo-grid';
        for (let n = 1; n <= 9; n++) {
            const span = document.createElement('span');
            span.className = 'memo-num';
            span.textContent = Game.memos[r][c].has(n) ? n : '';
            grid.appendChild(span);
        }
        cell.appendChild(grid);
    }
}

function renderBoard() {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            renderCell(r, c);
        }
    }
}

// ===================== 줄/박스 완성 플래시 =====================

function triggerFlash(cells, isFinal = false) {
    const targetSet  = isFinal ? flashingFinals : flashingCells;
    const cssClass   = isFinal ? 'cell-flash-final' : 'cell-flash';
    const duration   = isFinal ? 1300 : 950;

    cells.forEach(([r, c]) => {
        const key = `${r},${c}`;
        targetSet.add(key);
        const el = cellEls[r][c];
        // 애니메이션 재시작을 위해 클래스 제거 후 강제 리플로우
        el.classList.remove(cssClass);
        void el.offsetWidth;
        el.classList.add(cssClass);
    });

    setTimeout(() => {
        cells.forEach(([r, c]) => {
            const key = `${r},${c}`;
            targetSet.delete(key);
            if (cellEls[r]?.[c]) cellEls[r][c].classList.remove(cssClass);
        });
    }, duration);
}

// 완성된 줄/박스/숫자를 다시 계산 (undo 후 사용)
function recomputeCompletedLines() {
    Game.completedLines = new Set();
    for (let r = 0; r < 9; r++) {
        if (isLineComplete('row', r, 0)) Game.completedLines.add(`row-${r}`);
    }
    for (let c = 0; c < 9; c++) {
        if (isLineComplete('col', 0, c)) Game.completedLines.add(`col-${c}`);
    }
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            if (isBoxComplete(br, bc)) Game.completedLines.add(`box-${br}-${bc}`);
        }
    }
    // 숫자별 완성 상태도 재계산
    for (let num = 1; num <= 9; num++) {
        let count = 0, allCorrect = true;
        outer: for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (Game.board[r][c] === num) {
                    if (Game.solution[r][c] !== num) { allCorrect = false; break outer; }
                    count++;
                }
            }
        }
        if (allCorrect && count === 9) Game.completedLines.add(`num-${num}`);
    }
}

function isLineComplete(type, r, c) {
    if (type === 'row') {
        for (let cc = 0; cc < 9; cc++) {
            if (Game.board[r][cc] !== Game.solution[r][cc]) return false;
        }
        return true;
    }
    if (type === 'col') {
        for (let rr = 0; rr < 9; rr++) {
            if (Game.board[rr][c] !== Game.solution[rr][c]) return false;
        }
        return true;
    }
    return false;
}

function isBoxComplete(br, bc) {
    for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
            if (Game.board[r][c] !== Game.solution[r][c]) return false;
        }
    }
    return true;
}

// 입력 후 새로 완성된 줄/박스 찾아 플래시
function checkLineCompletions() {
    const flashCells = new Map(); // 'r,c' → [r,c] (중복 방지)

    for (let r = 0; r < 9; r++) {
        const key = `row-${r}`;
        if (!Game.completedLines.has(key) && isLineComplete('row', r, 0)) {
            Game.completedLines.add(key);
            for (let c = 0; c < 9; c++) flashCells.set(`${r},${c}`, [r, c]);
        }
    }
    for (let c = 0; c < 9; c++) {
        const key = `col-${c}`;
        if (!Game.completedLines.has(key) && isLineComplete('col', 0, c)) {
            Game.completedLines.add(key);
            for (let r = 0; r < 9; r++) flashCells.set(`${r},${c}`, [r, c]);
        }
    }
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const key = `box-${br}-${bc}`;
            if (!Game.completedLines.has(key) && isBoxComplete(br, bc)) {
                Game.completedLines.add(key);
                for (let r = br * 3; r < br * 3 + 3; r++) {
                    for (let c = bc * 3; c < bc * 3 + 3; c++) {
                        flashCells.set(`${r},${c}`, [r, c]);
                    }
                }
            }
        }
    }

    if (flashCells.size > 0) triggerFlash([...flashCells.values()]);
}

// 숫자 9개 모두 올바르게 입력됐을 때 플래시
function checkNumberCompletion(num) {
    if (num === 0) return;
    const key = `num-${num}`;
    if (Game.completedLines.has(key)) return;

    const cells = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (Game.board[r][c] === num) {
                if (Game.solution[r][c] !== num) return; // 오답 포함 → 아직 아님
                cells.push([r, c]);
            }
        }
    }
    if (cells.length === 9) {
        Game.completedLines.add(key);
        triggerFlash(cells);
    }
}

// ===================== 게임 시작 / 다시하기 =====================

function showStartScreen() {
    document.getElementById('start-screen').classList.remove('hidden');
}

async function showHofOverlay(showSaveBanner = false) {
    const levelFilter = document.getElementById('hof-level-filter');
    if (levelFilter) levelFilter.value = Game.difficulty;
    // 기본 탭: 시즌·전체레벨 (index 1 = 'all')
    document.querySelectorAll('.hof-tab').forEach((b, i) => b.classList.toggle('active', i === 1));

    // 저장 성공 배너 제어
    const banner = document.getElementById('hof-save-banner');
    if (banner) banner.classList.toggle('hidden', !showSaveBanner);

    // 오버레이 즉시 표시 (기록은 비동기로 로드)
    document.getElementById('hof-overlay').classList.remove('hidden');
    await renderHallOfFame();
}

function hideHofOverlay() {
    document.getElementById('hof-overlay').classList.add('hidden');
    hideRankToast();
    lastSavedRecord = null;
}

function hideStartScreen() {
    document.getElementById('start-screen').classList.add('hidden');
}

function newGame(levelOverride) {
    if (Game.timerInterval) clearInterval(Game.timerInterval);

    hideRankToast();
    hideStartScreen();
    stopConfetti();

    const level = levelOverride !== undefined ? levelOverride : Game.difficulty;

    Game.difficulty = level;
    Game.completed  = false;
    Game.selected   = null;
    Game.memoMode   = false;
    Game.hintsLeft  = 5;
    Game.paused     = false;
    Game.history    = [];
    Game.future     = [];
    Game.completedLines = new Set();
    Game.selectedNum = 0;

    updateDifficultyDisplay(level);

    updateMemoBtn();
    updateHintBtn();
    updateUndoRedoBtns();
    updateNumpadUI();

    showLoading(true);

    setTimeout(() => {
        const { puzzle, solution } = SudokuEngine.createPuzzle(level);

        Game.board    = puzzle.map(row => [...row]);
        Game.solution = solution;
        Game.given    = puzzle.map(row => row.map(v => v !== 0));
        Game.memos    = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
        Game.hinted   = Array.from({ length: 9 }, () => Array(9).fill(false));
        Game.initialBoard = puzzle.map(row => [...row]);

        renderBoard();
        showLoading(false);
        startTimer();
    }, 50);
}

function restartGame() {
    if (!Game.initialBoard) return;
    if (!confirm(t('confirmRestart'))) return;

    if (Game.timerInterval) clearInterval(Game.timerInterval);

    Game.board    = Game.initialBoard.map(row => [...row]);
    Game.given    = Game.initialBoard.map(row => row.map(v => v !== 0));
    Game.memos    = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));
    Game.hinted   = Array.from({ length: 9 }, () => Array(9).fill(false));
    Game.selected = null;
    Game.completed  = false;
    Game.hintsLeft  = 5;
    Game.memoMode   = false;
    Game.paused     = false;
    Game.history    = [];
    Game.future     = [];
    Game.completedLines = new Set();
    Game.selectedNum = 0;

    updateMemoBtn();
    updateHintBtn();
    updateUndoRedoBtns();
    updateNumpadUI();
    renderBoard();
    startTimer();
}

// ===================== 셀 클릭 =====================

function onCellClick(r, c) {
    if (Game.paused || Game.completed) return;

    // 이미 선택된 셀 재클릭
    if (Game.selected && Game.selected.row === r && Game.selected.col === c) {
        if (Game.selectedNum !== 0 && !Game.given[r][c] && !Game.hinted[r][c]) {
            // 같은 숫자 → 지우기 / 다른 숫자 → 입력
            inputNumber(Game.board[r][c] === Game.selectedNum ? 0 : Game.selectedNum);
        }
        return;
    }

    Game.selected = { row: r, col: c };

    if (Game.selectedNum !== 0 && !Game.given[r][c] && !Game.hinted[r][c]) {
        // 같은 숫자 → 지우기 / 다른 숫자 → 입력
        inputNumber(Game.board[r][c] === Game.selectedNum ? 0 : Game.selectedNum);
    } else {
        renderBoard();
    }
}

function selectCell(r, c) {
    if (Game.paused || Game.completed) return;
    Game.selected = { row: r, col: c };
    renderBoard();
}

// ===================== 숫자 입력 =====================

function inputNumber(num) {
    if (!Game.selected || Game.completed || Game.paused) return;

    const { row: r, col: c } = Game.selected;
    if (Game.given[r][c] || Game.hinted[r][c]) return;

    saveToHistory(); // 입력 전 상태 저장

    if (num === 0) {
        // 모드에 관계없이 숫자 + 메모 모두 지우기
        Game.board[r][c] = 0;
        Game.memos[r][c].clear();
    } else if (Game.memoMode) {
        if (Game.memos[r][c].has(num)) Game.memos[r][c].delete(num);
        else Game.memos[r][c].add(num);
    } else {
        Game.board[r][c] = num;
        Game.memos[r][c].clear();
        clearRelatedMemos(r, c, num);
        checkLineCompletions();
        checkNumberCompletion(num);
        checkComplete();
    }

    renderBoard();
}

// 같은 행/열/박스의 메모에서 해당 숫자 자동 삭제
function clearRelatedMemos(r, c, num) {
    if (num === 0) return;
    for (let cc = 0; cc < 9; cc++) {
        if (cc !== c) Game.memos[r][cc].delete(num);
    }
    for (let rr = 0; rr < 9; rr++) {
        if (rr !== r) Game.memos[rr][c].delete(num);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            if (rr !== r || cc !== c) Game.memos[rr][cc].delete(num);
        }
    }
}

// ===================== 키패드 숫자 선택 =====================

function selectNumpadNumber(num) {
    if (num === 0) {
        // 지우기 버튼은 선택 개념 없이 바로 지우기
        Game.selectedNum = 0;
        updateNumpadUI();
        renderBoard();
        if (Game.selected) inputNumber(0);
        return;
    }

    if (Game.selectedNum === num) {
        Game.selectedNum = 0; // 같은 버튼 다시 클릭하면 해제
    } else {
        Game.selectedNum = num;
    }

    updateNumpadUI();
    renderBoard();

    // 셀이 선택된 상태면 해당 번호 입력
    if (Game.selected && Game.selectedNum !== 0) {
        const { row: r, col: c } = Game.selected;
        if (!Game.given[r][c] && !Game.hinted[r][c]) {
            inputNumber(Game.selectedNum);
        }
    }
}

function updateNumpadUI() {
    document.querySelectorAll('.num-btn').forEach(btn => {
        const n = parseInt(btn.dataset.num);
        if (n !== 0 && n === Game.selectedNum) {
            btn.classList.add('num-active');
        } else {
            btn.classList.remove('num-active');
        }
    });
}

// ===================== 완성 확인 =====================

function checkComplete() {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (Game.board[r][c] !== Game.solution[r][c]) return;
        }
    }

    Game.completed = true;
    stopTimer();

    // 전체 보드 골드 플래시 후 축하 화면
    const allCells = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) allCells.push([r, c]);
    }
    triggerFlash(allCells, true);
    renderBoard();

    setTimeout(() => showCelebration(), 1000);
}

// ===================== 힌트 =====================

function useHint() {
    if (Game.hintsLeft <= 0 || Game.completed || Game.paused) return;

    let targetR = -1, targetC = -1;

    if (Game.selected) {
        const { row: r, col: c } = Game.selected;
        if (Game.board[r][c] === 0) { targetR = r; targetC = c; }
    }

    if (targetR === -1) {
        const emptyCells = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (Game.board[r][c] === 0) emptyCells.push([r, c]);
            }
        }
        if (emptyCells.length === 0) return;
        const pick = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        [targetR, targetC] = pick;
    }

    saveToHistory();

    const hintNum = Game.solution[targetR][targetC];
    Game.board[targetR][targetC] = hintNum;
    Game.hinted[targetR][targetC] = true;
    Game.memos[targetR][targetC].clear();
    clearRelatedMemos(targetR, targetC, hintNum);
    Game.hintsLeft--;

    updateHintBtn();
    renderBoard();
    checkLineCompletions();
    checkNumberCompletion(hintNum);
    checkComplete();
}

function updateHintBtn() {
    const btn = document.getElementById('hint-btn');
    btn.innerHTML = `${t('hintPrefix')}<span id="hints-left">${Game.hintsLeft}</span>`;
    btn.disabled = Game.hintsLeft <= 0;
}

// ===================== 메모 모드 =====================

function toggleMemoMode() {
    Game.memoMode = !Game.memoMode;
    updateMemoBtn();
}

function updateMemoBtn() {
    const btn = document.getElementById('memo-btn');
    if (Game.memoMode) {
        btn.classList.add('active');
        btn.textContent = t('memoOn');
    } else {
        btn.classList.remove('active');
        btn.textContent = t('memoOff');
    }
}

// ===================== 타이머 =====================

function startTimer() {
    Game.timerSeconds = 0;
    Game.paused = false;
    updateTimerDisplay();
    Game.timerInterval = setInterval(() => {
        if (!Game.paused) {
            Game.timerSeconds++;
            updateTimerDisplay();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(Game.timerInterval);
    Game.timerInterval = null;
}

function updateTimerDisplay() {
    document.getElementById('timer-display').textContent = formatTime(Game.timerSeconds);
}

function pauseGame() {
    if (Game.completed) return;
    Game.paused = true;
    document.getElementById('pause-overlay').classList.remove('hidden');
    document.getElementById('pause-btn').textContent = '▶';
}

function resumeGame() {
    Game.paused = false;
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('pause-btn').textContent = '⏸';
}

// ===================== 로딩 화면 =====================

function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (show) el.classList.remove('hidden');
    else       el.classList.add('hidden');
}

// ===================== 난이도 표시 업데이트 =====================

function updateDifficultyDisplay(level) {
    const info  = SudokuEngine.getDifficultyInfo(level);
    const badge = document.getElementById('game-diff-badge');
    if (badge) badge.textContent = `${translateDiffName(info.name)} Lv.${level}`;
}

// ===================== 시즌 관리 =====================

const SEASON_META_KEY = 'sudoku_season_meta';
const ARCHIVE_KEY     = 'sudoku_archive';
const MAX_RECORDS     = 1000;

function getSeasonRecordsKey(id) { return `sudoku_records_S${id}`; }

function getCurrentSeason() {
    const raw = localStorage.getItem(SEASON_META_KEY);
    if (raw) return JSON.parse(raw);
    return initSeason();
}

function initSeason(id) {
    const newId = id || 1;
    const season = {
        id:       newId,
        name:     `시즌 ${newId}`,
        startDate: new Date().toLocaleDateString('ko-KR'),
        autoEndDate: getNextMonthDate(),
    };
    localStorage.setItem(SEASON_META_KEY, JSON.stringify(season));
    return season;
}

function getNextMonthDate() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// 페이지 로드 시 자동 시즌 종료 체크
function checkAutoSeasonEnd() {
    const season = getCurrentSeason();
    if (!season.autoEndDate) return;

    const today = new Date().toISOString().split('T')[0];
    if (today >= season.autoEndDate) {
        archiveSeason(season);
    }
}

function archiveSeason(season) {
    const endDate = new Date().toLocaleDateString('ko-KR');
    const archive = getArchive();
    archive.push({ ...season, endDate });
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));

    // 새 시즌 시작
    const newSeason = initSeason(season.id + 1);
    return newSeason;
}

function endSeason() {
    const season = getCurrentSeason();
    if (!confirm(t('confirmEndSeason', season.name))) return;
    archiveSeason(season);
    renderHallOfFame();
    alert(t('seasonEndedAlert', season.name));
}

function getArchive() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY)) || []; }
    catch { return []; }
}

function getCurrentSeasonRecords() {
    const season = getCurrentSeason();
    try { return JSON.parse(localStorage.getItem(getSeasonRecordsKey(season.id))) || []; }
    catch { return []; }
}

function saveCurrentSeasonRecords(records) {
    const season = getCurrentSeason();
    localStorage.setItem(getSeasonRecordsKey(season.id), JSON.stringify(records.slice(0, MAX_RECORDS)));
}

// 기존 sudoku_records 데이터 → 시즌 1으로 마이그레이션
function migrateOldRecords() {
    const oldKey = 'sudoku_records';
    const old = localStorage.getItem(oldKey);
    if (!old) return;

    const oldRecords = JSON.parse(old);
    if (!oldRecords || oldRecords.length === 0) {
        localStorage.removeItem(oldKey);
        return;
    }

    // 시즌 1 메타가 없을 때만 마이그레이션
    if (!localStorage.getItem(SEASON_META_KEY)) {
        const season = initSeason(1);
        localStorage.setItem(getSeasonRecordsKey(1), JSON.stringify(oldRecords));
    }
    localStorage.removeItem(oldKey);
}

// ===================== 기록 저장 =====================

async function saveRecord(name) {
    const hintsUsed = 5 - Game.hintsLeft;
    const score     = Game.timerSeconds + hintsUsed * 60;
    const diffInfo  = SudokuEngine.getDifficultyInfo(Game.difficulty);

    const record = {
        name:        escapeHtml(name.trim() || (currentLang === 'en' ? 'Anonymous' : '이름없음')),
        difficulty:  Game.difficulty,
        diffName:    diffInfo.name,
        tier:        diffInfo.tier,
        timeSeconds: Game.timerSeconds,
        hintsUsed,
        score,
        date:    new Date().toLocaleDateString('ko-KR'),
        savedAt: Date.now(),
    };

    // 저장 버튼 비활성화
    const saveBtn = document.getElementById('save-score-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '...'; }

    // localStorage 백업 저장
    const records = getCurrentSeasonRecords();
    records.push(record);
    records.sort((a, b) => a.score - b.score);
    saveCurrentSeasonRecords(records);

    // Supabase 저장 (await → 삽입된 id 수신)
    const onlineData = await saveScoreOnline(record);
    lastSavedRecord = onlineData ? { supabaseId: onlineData.id } : null;

    // 저장 버튼 복원
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = t('saveBtn'); }

    // 순위 토스트 (로컬 기록 기준 즉시 피드백)
    const levelRecords = records.filter(r => r.difficulty === record.difficulty);
    const rank = levelRecords.findIndex(r => r.savedAt === record.savedAt) + 1;
    if (rank > 0 && rank <= 10) {
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏆';
        showRankToast(t('rankToast', emoji, record.difficulty, rank));
    }

    stopConfetti();

    // 축하 화면 닫고 명예의 전당 오픈 (저장 성공 배너 포함)
    document.getElementById('celebration-overlay').classList.add('hidden');
    showHofOverlay(true);
}

function showRankToast(msg) {
    const toast = document.getElementById('rank-toast');
    document.getElementById('rank-toast-msg').textContent = msg;
    toast.classList.add('active');
    clearTimeout(rankToastTimer);
    rankToastTimer = setTimeout(() => hideRankToast(), 4500);
}

function hideRankToast() {
    document.getElementById('rank-toast').classList.remove('active');
    clearTimeout(rankToastTimer);
    rankToastTimer = null;
}

function getPercentileMessage(score, tier, records) {
    const same = records.filter(r => r.tier === tier);
    if (same.length < 5) return null;

    const worseThan  = same.filter(r => r.score > score).length;
    const topPct     = Math.round((1 - worseThan / same.length) * 100);

    if (topPct <= 1)  return t('pct1');
    if (topPct <= 10) return t('pct10', topPct);
    if (topPct <= 25) return t('pct25', topPct);
    if (topPct <= 50) return t('pct50', topPct);
    return t('pctOther', topPct);
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
}

// ===================== 축하 화면 =====================

function showCelebration() {
    const hintsUsed = 5 - Game.hintsLeft;
    const score     = Game.timerSeconds + hintsUsed * 60;
    const diffInfo  = SudokuEngine.getDifficultyInfo(Game.difficulty);

    document.getElementById('final-time').textContent       = formatTime(Game.timerSeconds);
    document.getElementById('final-difficulty').textContent = `${translateDiffName(diffInfo.name)} Lv.${Game.difficulty}`;
    document.getElementById('final-hints').textContent      = `${hintsUsed}${t('unitHints')}`;
    document.getElementById('final-score').textContent      = `${score}${t('unitSec')}`;

    const records = getCurrentSeasonRecords();
    const pctMsg  = getPercentileMessage(score, diffInfo.tier, records);
    const pctEl   = document.getElementById('percentile-msg');
    if (pctMsg) { pctEl.textContent = pctMsg; pctEl.classList.remove('hidden'); }
    else         { pctEl.classList.add('hidden'); }

    // 닉네임 입력 화면 항상 초기 상태로 표시
    document.querySelector('.celeb-main-info').style.display = '';
    document.querySelector('.save-section').style.display = '';

    document.getElementById('player-name').value = '';
    document.getElementById('celebration-overlay').classList.remove('hidden');
    launchConfetti();
}

// ===================== 명예의 전당 렌더링 (3탭) =====================

async function renderHallOfFame() {
    const level  = parseInt(document.getElementById('hof-level-filter').value) || Game.difficulty;

    const d   = new Date();
    const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    // 시즌 레이블 = 이번 달 (전 세계 공통 기준)
    const seasonLabel = `${d.getFullYear()} ${mon}`;

    document.getElementById('hof-season-label').textContent = seasonLabel;

    // 탭 레이블 업데이트
    document.querySelectorAll('.hof-tab').forEach(btn => {
        const tab = btn.dataset.hoftab;
        if (tab === 'level')      btn.textContent = `${seasonLabel} · Lv.${level}`;
        if (tab === 'all')        btn.textContent = `${seasonLabel} · ${t('tabSeasonAll')}`;
        if (tab === 'alltime')    btn.textContent = `${t('tabAlltime')} · Lv.${level}`;
        if (tab === 'alltimeall') btn.textContent = `${t('tabAlltime')} · ${t('tabSeasonAll')}`;
    });

    const activeTab = document.querySelector('.hof-tab.active');
    await renderHofTab(activeTab ? activeTab.dataset.hoftab : 'level', level);
}

async function renderHofTab(tab, level) {
    const showLevel  = tab === 'all' || tab === 'alltimeall';
    const showSeason = tab === 'alltime' || tab === 'alltimeall';

    // 로딩 표시
    document.getElementById('hof-records').innerHTML =
        `<div class="lb-empty lb-loading">${t('hofLoading')}</div>`;

    // "시즌" 탭 = 이번 달 / "역대" 탭 = 전체
    const sinceIso   = (tab === 'level' || tab === 'all') ? getCurrentMonthIso() : null;
    const levelParam = (tab === 'level' || tab === 'alltime') ? level : null;

    const rawData = await loadGlobalScores({ level: levelParam, sinceIso, limit: 1000 });

    let records;
    if (rawData === null) {
        // Supabase 연결 실패 → localStorage 폴백
        records = getLocalFallbackRecords(tab, level);
    } else {
        records = rawData.map(mapSupabaseRecord);
    }

    renderHofRecords(records, showLevel, showSeason);
}

// 역대 기록 - 전체 레벨 (현재 시즌 + 아카이브) - 시즌·레벨 이름 포함
function getAlltimeAllRecords() {
    const season  = getCurrentSeason();
    const current = getCurrentSeasonRecords()
        .map(r => ({ ...r, seasonName: season.name }));

    const archived = [];
    getArchive().forEach(s => {
        try {
            const sr = JSON.parse(localStorage.getItem(getSeasonRecordsKey(s.id))) || [];
            archived.push(...sr.map(r => ({ ...r, seasonName: s.name })));
        } catch {}
    });

    return [...current, ...archived].sort((a, b) => a.score - b.score);
}

// 역대 기록 (현재 시즌 + 아카이브) - 시즌 이름 포함
function getAlltimeLevelRecords(level) {
    const season  = getCurrentSeason();
    const current = getCurrentSeasonRecords()
        .filter(r => r.difficulty === level)
        .map(r => ({ ...r, seasonName: season.name }));

    const archived = [];
    getArchive().forEach(s => {
        try {
            const sr = JSON.parse(localStorage.getItem(getSeasonRecordsKey(s.id))) || [];
            archived.push(...sr.filter(r => r.difficulty === level).map(r => ({ ...r, seasonName: s.name })));
        } catch {}
    });

    return [...current, ...archived].sort((a, b) => a.score - b.score);
}

// Supabase 레코드 → 표시 형식 변환
function mapSupabaseRecord(row) {
    return {
        name:        row.player_name,
        difficulty:  row.difficulty,
        diffName:    row.diff_name,
        tier:        row.tier,
        timeSeconds: row.time_seconds,
        hintsUsed:   row.hints_used,
        score:       row.score,
        date:        row.created_at ? new Date(row.created_at).toLocaleDateString('ko-KR') : '-',
        supabaseId:  row.id,
    };
}

// 이번 달 1일 00:00 UTC ISO 문자열
function getCurrentMonthIso() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
}

// Supabase 실패 시 localStorage 폴백
function getLocalFallbackRecords(tab, level) {
    if (tab === 'level')      return getCurrentSeasonRecords().filter(r => r.difficulty === level).sort((a, b) => a.score - b.score);
    if (tab === 'all')        return getCurrentSeasonRecords().sort((a, b) => a.score - b.score);
    if (tab === 'alltime')    return getAlltimeLevelRecords(level);
    return getAlltimeAllRecords();
}

function renderHofRecords(records, showLevel = false, showSeason = false) {
    const container = document.getElementById('hof-records');
    if (records.length === 0) {
        container.innerHTML = `<div class="lb-empty">${t('noRecords')}</div>`;
        return;
    }

    const rowsHtml = records.map((r, i) => {
        const rankClass   = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const rankIcon    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const levelBadge  = showLevel  ? `<span class="post-level-tag">Lv.${r.difficulty}</span>` : '';
        const seasonBadge = showSeason && r.seasonName ? `<span class="post-level-tag">${r.seasonName}</span>` : '';
        const isCurrent   = lastSavedRecord && (
            (lastSavedRecord.supabaseId && r.supabaseId && r.supabaseId === lastSavedRecord.supabaseId) ||
            (!lastSavedRecord.supabaseId && r.savedAt && r.savedAt === lastSavedRecord.savedAt)
        );
        return `
            <div class="lb-entry-row${isCurrent ? ' current-record' : ''}">
                <span class="lb-rank ${rankClass}">${rankIcon}</span>
                <span class="lb-name">${r.name}${levelBadge}${seasonBadge}</span>
                <span>${translateDiffName(r.diffName || '')} Lv.${r.difficulty}</span>
                <span class="lb-time">${formatTime(r.timeSeconds)}</span>
                <span>${r.hintsUsed}${t('unitHints')}</span>
                <span class="lb-score">${r.score}${t('unitSec')}</span>
                <span class="lb-date">${r.date}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="lb-table-wrap">
            <div class="lb-header-row">
                <span>${t('colRank')}</span><span>${t('colName')}</span><span>${t('colDiff')}</span>
                <span>${t('colTime')}</span><span>${t('colHints')}</span><span>${t('colScore')}</span><span>${t('colDate')}</span>
            </div>
            ${rowsHtml}
        </div>
    `;

    // 현재 기록 행이 있으면 스크롤
    if (lastSavedRecord) {
        setTimeout(() => {
            const currentEl = container.querySelector('.current-record');
            if (currentEl) currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
    }
}

// ===================== 컨페티 =====================

let confettiFrameId = null;

function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'];
    const particles = Array.from({ length: 140 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height * 0.5,
        w: Math.random() * 12 + 5,
        h: Math.random() * 7 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: Math.random() * 4 - 2,
        vy: Math.random() * 3 + 2,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.15,
        opacity: 1,
    }));

    let frame = 0;
    const maxFrames = 220;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
            if (frame > maxFrames * 0.65) {
                p.opacity = Math.max(0, (maxFrames - frame) / (maxFrames * 0.35));
            }
            ctx.save();
            ctx.globalAlpha = p.opacity;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        frame++;
        if (frame < maxFrames) confettiFrameId = requestAnimationFrame(draw);
        else canvas.style.display = 'none';
    }

    if (confettiFrameId) cancelAnimationFrame(confettiFrameId);
    confettiFrameId = requestAnimationFrame(draw);
}

function stopConfetti() {
    if (confettiFrameId) { cancelAnimationFrame(confettiFrameId); confettiFrameId = null; }
    document.getElementById('confetti-canvas').style.display = 'none';
}

// ===================== 다국어 적용 =====================

function applyTranslations() {
    // 시작 화면
    const subtitle = document.querySelector('.start-subtitle');
    if (subtitle) subtitle.textContent = t('subtitle');
    const hofBtn = document.getElementById('start-hof-btn');
    if (hofBtn) hofBtn.textContent = t('hofLink');
    document.querySelectorAll('.level-btn').forEach(btn => {
        const lv = parseInt(btn.dataset.level);
        const nameEl = btn.querySelector('.lbtn-name');
        if (nameEl) nameEl.textContent = t('tierNames')[lv - 1] || '';
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });

    // 게임 액션 버튼
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.textContent = t('restart');
    const sameLevelBtn = document.getElementById('same-level-btn');
    if (sameLevelBtn) sameLevelBtn.textContent = t('sameLevel');
    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) homeBtn.textContent = t('home');

    // 사이드 패널
    updateMemoBtn();
    const errorLabel = document.querySelector('.toggle-pill-label span');
    if (errorLabel) errorLabel.textContent = t('errorCheck');
    updateHintBtn();

    // 키보드 도움말
    const kbTitle = document.querySelector('.keyboard-help p');
    if (kbTitle) kbTitle.textContent = t('kbTitle');
    const kbList = document.querySelector('.keyboard-help ul');
    if (kbList) kbList.innerHTML = t('kbItems').map(item => `<li>${item}</li>`).join('');

    // 로딩 오버레이
    const loadingMsg = document.querySelector('#loading-overlay .overlay-msg');
    if (loadingMsg) loadingMsg.innerHTML = `${t('loadingMsg')}<br><small>${t('loadingHard')}</small>`;

    // 일시정지 오버레이
    const pauseH2 = document.querySelector('#pause-overlay h2');
    if (pauseH2) pauseH2.textContent = t('pausedTitle');
    const pauseP = document.querySelector('#pause-overlay p');
    if (pauseP) pauseP.textContent = t('pausedMsg');
    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) resumeBtn.textContent = t('resumeBtn');

    // 축하 오버레이
    const celebH2 = document.querySelector('.celeb-header h2');
    if (celebH2) celebH2.textContent = t('celebComplete');
    const statLabels = document.querySelectorAll('.stat-label');
    ['statTime', 'statDiff', 'statHints', 'statScore'].forEach((key, i) => {
        if (statLabels[i]) statLabels[i].textContent = t(key);
    });
    const saveLabel = document.querySelector('.save-label');
    if (saveLabel) saveLabel.textContent = t('saveLabel');
    const playerName = document.getElementById('player-name');
    if (playerName) playerName.placeholder = t('savePlaceholder');
    const saveBtn = document.getElementById('save-score-btn');
    if (saveBtn) saveBtn.textContent = t('saveBtn');

    // 명예의 전당 오버레이
    const hofTitle = document.getElementById('hof-title');
    if (hofTitle) hofTitle.textContent = t('hofTitle');
    const hofSaveBanner = document.getElementById('hof-save-banner');
    if (hofSaveBanner) hofSaveBanner.textContent = t('hofSaveBanner');
    const hofSameLevelBtn = document.getElementById('hof-same-level-btn');
    if (hofSameLevelBtn) hofSameLevelBtn.textContent = t('hofSameLevel');
    const hofHomeBtn = document.getElementById('hof-home-btn');
    if (hofHomeBtn) hofHomeBtn.textContent = t('hofHome');
    const hofLevelFilter = document.getElementById('hof-level-filter');
    if (hofLevelFilter) {
        const options = t('hofLevelOptions');
        hofLevelFilter.querySelectorAll('option').forEach((opt, i) => {
            if (options[i]) opt.textContent = options[i];
        });
    }

    // 난이도 배지
    updateDifficultyDisplay(Game.difficulty);

    // HoF가 열려 있으면 재렌더링
    if (!document.getElementById('hof-overlay').classList.contains('hidden')) {
        renderHallOfFame();
    }
}

// ===================== 시작 화면 이벤트 =====================

function bindStartScreen() {
    // 레벨 버튼 클릭 → 바로 게임 시작
    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lv = parseInt(btn.dataset.level);
            newGame(lv);
        });
    });

    // 명예의 전당 바로가기 (인자 없이 호출해야 배너가 숨겨짐)
    document.getElementById('start-hof-btn').addEventListener('click', () => showHofOverlay());

    // 언어 토글
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
    });
}

// ===================== 이벤트 바인딩 =====================

function bindEvents() {
    // 게임 액션 바: 같은 난이도 새 게임
    document.getElementById('same-level-btn').addEventListener('click', () => {
        newGame(Game.difficulty);
    });

    // 게임 액션 바: 홈 (시작 화면으로)
    document.getElementById('home-btn').addEventListener('click', showStartScreen);

    // 일시정지
    document.getElementById('pause-btn').addEventListener('click', () => {
        if (Game.paused) resumeGame();
        else pauseGame();
    });
    document.getElementById('resume-btn').addEventListener('click', resumeGame);

    // Undo / Redo 버튼
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('redo-btn').addEventListener('click', redo);

    // 메모 모드
    document.getElementById('memo-btn').addEventListener('click', toggleMemoMode);

    // 오답 표시
    document.getElementById('error-check').addEventListener('change', e => {
        Game.showErrors = e.target.checked;
        renderBoard();
    });

    // 숫자 패드
    document.querySelectorAll('.num-btn').forEach(btn => {
        btn.addEventListener('click', () => selectNumpadNumber(parseInt(btn.dataset.num)));
    });

    // 힌트
    document.getElementById('hint-btn').addEventListener('click', useHint);

    // 기록 저장
    document.getElementById('save-score-btn').addEventListener('click', () => {
        saveRecord(document.getElementById('player-name').value);
    });
    document.getElementById('player-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') saveRecord(document.getElementById('player-name').value);
    });

    // 다시시작 버튼
    document.getElementById('restart-btn').addEventListener('click', restartGame);

    // 명예의 전당 오버레이 닫기
    document.getElementById('hof-close-btn').addEventListener('click', hideHofOverlay);

    // 명예의 전당 푸터: 같은 난이도 새 게임
    document.getElementById('hof-same-level-btn').addEventListener('click', () => {
        hideHofOverlay();
        newGame(Game.difficulty);
    });

    // 명예의 전당 푸터: 홈
    document.getElementById('hof-home-btn').addEventListener('click', () => {
        hideHofOverlay();
        showStartScreen();
    });

    // 명예의 전당 탭 전환
    document.querySelectorAll('.hof-tab').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.hof-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const level = parseInt(document.getElementById('hof-level-filter').value) || Game.difficulty;
            await renderHofTab(btn.dataset.hoftab, level);
        });
    });

    // 명예의 전당 레벨 필터
    document.getElementById('hof-level-filter').addEventListener('change', () => renderHallOfFame());

    // 명예의 전당 관리자 버튼
    document.getElementById('hof-end-season-btn').addEventListener('click', endSeason);
    document.getElementById('hof-clear-records-btn').addEventListener('click', () => {
        if (confirm(t('confirmClearRecords'))) {
            const season = getCurrentSeason();
            localStorage.removeItem(getSeasonRecordsKey(season.id));
            renderHallOfFame();
        }
    });

    // ── 관리자 비밀 접근: hof-title 5번 클릭 (3초 이내)
    let adminClickCount = 0;
    let adminClickTimer = null;
    document.getElementById('hof-title').addEventListener('click', () => {
        adminClickCount++;
        clearTimeout(adminClickTimer);
        adminClickTimer = setTimeout(() => { adminClickCount = 0; }, 3000);
        if (adminClickCount >= 5) {
            adminClickCount = 0;
            const btns = document.querySelectorAll('.admin-btn');
            const isHidden = btns[0].classList.contains('hidden');
            btns.forEach(btn => btn.classList.toggle('hidden', !isHidden));
        }
    });

    // ── 키보드
    document.addEventListener('keydown', e => {
        // 입력창 포커스 중이면 무시
        if (document.activeElement.tagName === 'INPUT') return;

        // 시작 화면이 열려 있으면 무시
        if (!document.getElementById('start-screen').classList.contains('hidden')) return;

        const key = e.key;

        // Ctrl+Z (Undo)
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }
        // Ctrl+Y 또는 Ctrl+Shift+Z (Redo)
        if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
            return;
        }

        // 스페이스: 일시정지 중이면 재개, 게임 중이면 메모 토글
        if (key === ' ') {
            e.preventDefault();
            if (Game.paused)       { resumeGame(); return; }
            if (!Game.completed)   { toggleMemoMode(); return; }
            return;
        }

        // P: 일시정지 (게임 중일 때만)
        if (key.toLowerCase() === 'p') {
            if (!Game.paused && !Game.completed) pauseGame();
            return;
        }

        if (Game.paused || Game.completed) return;

        // 방향키
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)) {
            e.preventDefault();
            if (!Game.selected) { selectCell(0, 0); return; }
            const { row: r, col: c } = Game.selected;
            let nr = r, nc = c;
            if (key === 'ArrowUp')    nr = Math.max(0, r - 1);
            if (key === 'ArrowDown')  nr = Math.min(8, r + 1);
            if (key === 'ArrowLeft')  nc = Math.max(0, c - 1);
            if (key === 'ArrowRight') nc = Math.min(8, c + 1);
            selectCell(nr, nc);
            return;
        }

        // Enter → 키패드 순환 (Shift+Enter = 역방향)
        if (key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                if (Game.selectedNum === 0) Game.selectedNum = 9;
                else Game.selectedNum--;
            } else {
                if (Game.selectedNum === 9) Game.selectedNum = 0;
                else Game.selectedNum++;
            }
            updateNumpadUI();
            renderBoard();
            return;
        }

        // 숫자 1~9
        if (key >= '1' && key <= '9') {
            const n = parseInt(key);
            Game.selectedNum = n;
            updateNumpadUI();
            renderBoard();
            inputNumber(n);
            return;
        }

        // 지우기
        if (key === '0' || key === 'Backspace' || key === 'Delete') {
            e.preventDefault();
            Game.selectedNum = 0;
            updateNumpadUI();
            inputNumber(0);
            return;
        }

        // 단축키들
        if (key.toLowerCase() === 'm') { toggleMemoMode(); return; }
        if (key.toLowerCase() === 'h') { useHint(); return; }
    });
}

// ===================== 초기화 =====================

document.addEventListener('DOMContentLoaded', () => {
    migrateOldRecords();       // 기존 데이터 마이그레이션
    checkAutoSeasonEnd();      // 자동 시즌 종료 체크

    createBoardDOM();
    bindEvents();
    bindStartScreen();

    applyTranslations();       // 저장된 언어로 UI 초기화
    updateUndoRedoBtns();

    // 시작 화면 표시 (게임은 시작 화면에서 시작)
    showStartScreen();
});
