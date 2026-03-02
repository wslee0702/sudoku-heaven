// ===================== 수도쿠 게임 전체 로직 =====================

// ── 셀 DOM 요소 참조 (9x9 배열)
const cellEls = [];

// ── 플래시 중인 셀 추적 (renderCell에서 클래스 유지용)
const flashingCells  = new Set(); // 'r,c' 형태
const flashingFinals = new Set(); // 전체 완성 플래시용

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

function hideStartScreen() {
    document.getElementById('start-screen').classList.add('hidden');
}

function newGame(levelOverride) {
    if (Game.timerInterval) clearInterval(Game.timerInterval);

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
    if (!confirm('처음 상태로 되돌릴까요? 지금까지의 입력이 지워집니다.')) return;

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

    if (Game.memoMode) {
        if (num === 0) {
            Game.memos[r][c].clear();
        } else {
            if (Game.memos[r][c].has(num)) Game.memos[r][c].delete(num);
            else Game.memos[r][c].add(num);
        }
    } else {
        if (num === 0) {
            Game.board[r][c] = 0;
        } else {
            Game.board[r][c] = num;
            Game.memos[r][c].clear();
        }
        checkLineCompletions();
        checkNumberCompletion(num);
        checkComplete();
    }

    renderBoard();
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

    Game.board[targetR][targetC] = Game.solution[targetR][targetC];
    Game.hinted[targetR][targetC] = true;
    Game.memos[targetR][targetC].clear();
    Game.hintsLeft--;

    updateHintBtn();
    renderBoard();
    checkLineCompletions();
    checkNumberCompletion(Game.solution[targetR][targetC]);
    checkComplete();
}

function updateHintBtn() {
    document.getElementById('hints-left').textContent = Game.hintsLeft;
    document.getElementById('hint-btn').disabled = Game.hintsLeft <= 0;
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
        btn.textContent = '✏️ 메모 ON';
    } else {
        btn.classList.remove('active');
        btn.textContent = '✏️ 메모';
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
    if (badge) badge.textContent = `${info.name} Lv.${level}`;
}

// ===================== 시즌 관리 =====================

const SEASON_META_KEY = 'sudoku_season_meta';
const ARCHIVE_KEY     = 'sudoku_archive';
const MAX_RECORDS     = 200;

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
    if (!confirm(`"${season.name}"을 종료하고 명예의 전당에 보관할까요?\n새 시즌이 바로 시작됩니다.`)) return;
    archiveSeason(season);
    renderLeaderboard();
    renderHallOfFame();
    alert(`${season.name}이 종료되어 명예의 전당에 보관됐어요! 새 시즌이 시작됩니다.`);
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

function saveRecord(name) {
    const hintsUsed = 5 - Game.hintsLeft;
    const score     = Game.timerSeconds + hintsUsed * 60;
    const diffInfo  = SudokuEngine.getDifficultyInfo(Game.difficulty);

    const record = {
        name:        escapeHtml(name.trim() || '이름없음'),
        difficulty:  Game.difficulty,
        diffName:    diffInfo.name,
        tier:        diffInfo.tier,
        timeSeconds: Game.timerSeconds,
        hintsUsed,
        score,
        date: new Date().toLocaleDateString('ko-KR'),
    };

    const records = getCurrentSeasonRecords();
    records.push(record);
    records.sort((a, b) => a.score - b.score);
    saveCurrentSeasonRecords(records);

    // 전 세계 기록에도 저장 (실패해도 로컬은 이미 저장됨)
    saveScoreOnline(record);

    renderLeaderboard();

    // 저장 후: celeb 정보 + save-section 숨기고 post-save-section 크게 표시
    document.querySelector('.celeb-main-info').style.display = 'none';
    document.querySelector('.save-section').style.display = 'none';
    document.getElementById('post-save-section').classList.remove('hidden');

    showPostSaveLeaderboard(record, records);
    stopConfetti();
}

// ── post-save 3개 탭 데이터 캐시
let _psData = {};

function showPostSaveLeaderboard(record, currentSeasonRecords) {
    const season   = getCurrentSeason();
    const diffInfo = SudokuEngine.getDifficultyInfo(Game.difficulty);

    // 1. 현재 시즌 · 현재 레벨
    const levelRecs    = currentSeasonRecords.filter(r => r.difficulty === Game.difficulty);
    const levelRawIdx  = levelRecs.findIndex(r =>
        r.name === record.name && r.score === record.score && r.timeSeconds === record.timeSeconds);
    const levelIdx     = levelRawIdx >= 0 && levelRawIdx < 10 ? levelRawIdx : -1;

    // 2. 현재 시즌 · 전체 레벨
    const allRawIdx    = currentSeasonRecords.findIndex(r =>
        r.name === record.name && r.score === record.score && r.timeSeconds === record.timeSeconds);
    const allIdx       = allRawIdx >= 0 && allRawIdx < 10 ? allRawIdx : -1;

    // 3. 역대 · 현재 레벨 (아카이브 포함)
    const alltimeRecs  = [...levelRecs];
    getArchive().forEach(s => {
        try {
            const sr = JSON.parse(localStorage.getItem(getSeasonRecordsKey(s.id))) || [];
            alltimeRecs.push(...sr.filter(r => r.difficulty === Game.difficulty));
        } catch {}
    });
    alltimeRecs.sort((a, b) => a.score - b.score);
    const atRawIdx     = alltimeRecs.findIndex(r =>
        r.name === record.name && r.score === record.score && r.timeSeconds === record.timeSeconds);
    const atIdx        = atRawIdx >= 0 && atRawIdx < 10 ? atRawIdx : -1;

    _psData = {
        level:   { records: levelRecs.slice(0, 10), idx: levelIdx },
        all:     { records: currentSeasonRecords.slice(0, 10), idx: allIdx },
        alltime: { records: alltimeRecs.slice(0, 10), idx: atIdx },
    };

    // 탭 레이블 업데이트 (시즌명 + 연월 표시)
    const _d = new Date();
    const _mon = _d.toLocaleString('en-US', { month: 'short' });
    const seasonLabel = `${season.name} (${_d.getFullYear()}.${_mon}.)`;

    document.querySelectorAll('.ps-tab').forEach(btn => {
        const t = btn.dataset.pstab;
        if (t === 'level')   btn.textContent = `${seasonLabel} · Lv.${Game.difficulty}`;
        if (t === 'all')     btn.textContent = `${seasonLabel} · 전체`;
        if (t === 'alltime') btn.textContent = `역대 · Lv.${Game.difficulty}`;
    });

    // 첫 번째 탭 활성화
    document.querySelectorAll('.ps-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.ps-tab[data-pstab="level"]').classList.add('active');
    renderPostSaveTab('level');
}

function renderPostSaveTab(tab) {
    const { records = [], idx = -1 } = _psData[tab] || {};
    renderPostSaveRecords(records, idx, tab === 'all');
}

function renderPostSaveRecords(records, highlightIdx = -1, showLevel = false) {
    const container = document.getElementById('post-save-records');
    if (records.length === 0) {
        container.innerHTML = '<div style="padding:14px;text-align:center;color:#64748B;font-size:0.88rem">아직 기록이 없어요!</div>';
        return;
    }
    container.innerHTML = records.map((r, i) => {
        const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}위`;
        const hl = i === highlightIdx ? ' post-save-highlight' : '';
        const levelBadge = showLevel ? `<span class="post-level-tag">Lv.${r.difficulty}</span>` : '';
        return `
            <div class="post-save-row${hl}">
                <span class="post-rank">${icon}</span>
                <span class="post-name">${r.name}${levelBadge}</span>
                <span class="post-score">${formatTime(r.timeSeconds)}</span>
                <span class="post-hints">${r.hintsUsed}힌트</span>
                <span class="post-pts">${r.score}초</span>
            </div>
        `;
    }).join('');
}

function getPercentileMessage(score, tier, records) {
    const same = records.filter(r => r.tier === tier);
    if (same.length < 5) return null;

    const worseThan  = same.filter(r => r.score > score).length;
    const topPct     = Math.round((1 - worseThan / same.length) * 100);

    if (topPct <= 1)  return `🥇 이 난이도 최고 기록이에요!`;
    if (topPct <= 10) return `🏆 상위 ${topPct}%! 정말 대단해요!`;
    if (topPct <= 25) return `🎉 상위 ${topPct}%의 훌륭한 기록이에요!`;
    if (topPct <= 50) return `👍 상위 ${topPct}%의 기록이에요!`;
    return `📊 상위 ${topPct}%의 기록이에요. 더 잘할 수 있어요!`;
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
    document.getElementById('final-difficulty').textContent = `${diffInfo.name} Lv.${Game.difficulty}`;
    document.getElementById('final-hints').textContent      = `${hintsUsed}개`;
    document.getElementById('final-score').textContent      = `${score}초`;

    const records = getCurrentSeasonRecords();
    const pctMsg  = getPercentileMessage(score, diffInfo.tier, records);
    const pctEl   = document.getElementById('percentile-msg');
    if (pctMsg) { pctEl.textContent = pctMsg; pctEl.classList.remove('hidden'); }
    else         { pctEl.classList.add('hidden'); }

    // 이전 게임의 post-save 상태 초기화 (닉네임 입력 화면이 항상 먼저 보이도록)
    document.querySelector('.celeb-main-info').style.display = '';
    document.querySelector('.save-section').style.display = '';
    document.getElementById('post-save-section').classList.add('hidden');
    document.querySelectorAll('.ps-tab').forEach((b, i) => b.classList.toggle('active', i === 0));

    document.getElementById('player-name').value = '';
    document.getElementById('celebration-overlay').classList.remove('hidden');
    launchConfetti();
}

// ===================== 기록판 렌더링 =====================

function renderLeaderboard() {
    const season    = getCurrentSeason();
    const filterVal = document.getElementById('lb-filter').value;

    // 시즌 탭 레이블에 월 표시 (예: 현재 시즌 (2026.Mar))
    const tabEl = document.querySelector('.lb-tab[data-tab="current"]');
    if (tabEl) {
        const d = new Date();
        const mon = d.toLocaleString('en-US', { month: 'short' });
        tabEl.textContent = `현재 시즌 (${d.getFullYear()}.${mon})`;
    }

    document.getElementById('lb-season-name').textContent = season.name;
    document.getElementById('lb-season-date').textContent =
        `시작: ${season.startDate} | 다음 자동 종료: ${season.autoEndDate || '-'}`;

    let records = getCurrentSeasonRecords();
    if (filterVal !== 'all') {
        const lv = parseInt(filterVal.replace('level-', ''));
        records = records.filter(r => r.difficulty === lv);
    }
    records.sort((a, b) => a.score - b.score);
    const top = records.slice(0, 15);

    const container = document.getElementById('lb-entries');
    if (top.length === 0) {
        container.innerHTML = '<div class="lb-empty">아직 기록이 없어요. 게임을 완성하면 여기에 나타나요!</div>';
        return;
    }

    container.innerHTML = top.map((r, i) => {
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        const rankIcon  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        return `
            <div class="lb-entry-row">
                <span class="lb-rank ${rankClass}">${rankIcon}</span>
                <span class="lb-name">${r.name}</span>
                <span>${r.diffName} Lv.${r.difficulty}</span>
                <span class="lb-time">${formatTime(r.timeSeconds)}</span>
                <span>${r.hintsUsed}개</span>
                <span class="lb-score">${r.score}초</span>
                <span class="lb-date">${r.date}</span>
            </div>
        `;
    }).join('');
}

// ===================== 명예의 전당 렌더링 =====================

function renderHallOfFame() {
    const archive   = getArchive();
    const container = document.getElementById('hof-entries');

    if (archive.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = [...archive].reverse().map(season => {
        const records = (() => {
            try { return JSON.parse(localStorage.getItem(getSeasonRecordsKey(season.id))) || []; }
            catch { return []; }
        })();
        records.sort((a, b) => a.score - b.score);
        const top = records.slice(0, 10);

        const rowsHtml = top.length === 0
            ? '<div class="lb-empty">기록 없음</div>'
            : top.map((r, i) => {
                const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
                const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                return `
                    <div class="lb-entry-row">
                        <span class="lb-rank ${rankClass}">${rankIcon}</span>
                        <span class="lb-name">${r.name}</span>
                        <span>${r.diffName} Lv.${r.difficulty}</span>
                        <span class="lb-time">${formatTime(r.timeSeconds)}</span>
                        <span>${r.hintsUsed}개</span>
                        <span class="lb-score">${r.score}초</span>
                        <span class="lb-date">${r.date}</span>
                    </div>
                `;
            }).join('');

        return `
            <div class="hof-season-item">
                <div class="hof-season-header" onclick="toggleHofSeason(this)">
                    <div>
                        <span>🏆 ${season.name}</span>
                        <span class="hof-season-meta"> &nbsp;${season.startDate} ~ ${season.endDate || '?'} &nbsp;(${records.length}개 기록)</span>
                    </div>
                    <span class="hof-toggle-icon">▼</span>
                </div>
                <div class="hof-season-records">
                    <div class="lb-table-wrap">
                        <div class="lb-header-row">
                            <span>순위</span><span>닉네임</span><span>난이도</span>
                            <span>시간</span><span>힌트</span><span>점수</span><span>날짜</span>
                        </div>
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleHofSeason(headerEl) {
    const records = headerEl.nextElementSibling;
    const icon    = headerEl.querySelector('.hof-toggle-icon');
    const isOpen  = records.classList.toggle('open');
    icon.textContent = isOpen ? '▲' : '▼';
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

// ===================== 시작 화면 이벤트 =====================

function bindStartScreen() {
    // 레벨 버튼 클릭 → 바로 게임 시작
    document.querySelectorAll('.level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lv = parseInt(btn.dataset.level);
            newGame(lv);
        });
    });

    // 명예의 전당 바로가기
    document.getElementById('start-hof-btn').addEventListener('click', () => {
        hideStartScreen();
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="hof"]').classList.add('active');
        document.getElementById('lb-current-panel').classList.add('hidden');
        document.getElementById('lb-hof-panel').classList.remove('hidden');
        renderHallOfFame();
        document.querySelector('.leaderboard-section').scrollIntoView({ behavior: 'smooth' });
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

    // Post-save 탭 전환
    document.querySelectorAll('.ps-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ps-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPostSaveTab(btn.dataset.pstab);
        });
    });

    // 완성 후 화면: 같은 난이도 새 게임
    document.getElementById('same-diff-new-game-btn').addEventListener('click', () => {
        document.getElementById('celebration-overlay').classList.add('hidden');
        document.querySelector('.celeb-main-info').style.display = '';
        document.querySelector('.save-section').style.display = '';
        document.getElementById('post-save-section').classList.add('hidden');
        // ps-tab 초기 상태 복원
        document.querySelectorAll('.ps-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
        newGame(Game.difficulty);
    });

    // 완성 후 화면: 홈 (다른 난이도 선택)
    document.getElementById('diff-select-btn').addEventListener('click', () => {
        document.getElementById('celebration-overlay').classList.add('hidden');
        document.querySelector('.celeb-main-info').style.display = '';
        document.querySelector('.save-section').style.display = '';
        document.getElementById('post-save-section').classList.add('hidden');
        document.querySelectorAll('.ps-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
        showStartScreen();
    });

    // 완성 후 화면: 명예의 전당
    document.getElementById('ps-hof-btn').addEventListener('click', () => {
        document.getElementById('celebration-overlay').classList.add('hidden');
        document.querySelector('.celeb-main-info').style.display = '';
        document.querySelector('.save-section').style.display = '';
        document.getElementById('post-save-section').classList.add('hidden');
        document.querySelectorAll('.ps-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
        // 명예의 전당 탭 활성화 후 스크롤
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="hof"]').classList.add('active');
        document.getElementById('lb-current-panel').classList.add('hidden');
        document.getElementById('lb-hof-panel').classList.remove('hidden');
        renderHallOfFame();
        document.querySelector('.leaderboard-section').scrollIntoView({ behavior: 'smooth' });
    });

    // 기록 초기화
    document.getElementById('clear-records-btn').addEventListener('click', () => {
        if (confirm('현재 시즌 기록을 모두 삭제할까요?')) {
            const season = getCurrentSeason();
            localStorage.removeItem(getSeasonRecordsKey(season.id));
            renderLeaderboard();
        }
    });

    // 시즌 종료
    document.getElementById('end-season-btn').addEventListener('click', endSeason);

    // 리더보드 필터
    document.getElementById('lb-filter').addEventListener('change', renderLeaderboard);

    // 리더보드 탭
    document.querySelectorAll('.lb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const which = tab.dataset.tab;
            document.getElementById('lb-current-panel').classList.toggle('hidden', which !== 'current');
            document.getElementById('lb-hof-panel').classList.toggle('hidden', which !== 'hof');
            if (which === 'hof') renderHallOfFame();
        });
    });

    // ── 관리자 비밀 접근: lb-title 5번 클릭 (3초 이내)
    let adminClickCount = 0;
    let adminClickTimer = null;
    document.getElementById('lb-title').addEventListener('click', () => {
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

        // Enter → 키패드 순환만 (입력 없음)
        // 다른 칸으로 이동하거나 클릭할 때 해당 번호가 입력됨
        if (key === 'Enter') {
            e.preventDefault();
            if (Game.selectedNum === 9) Game.selectedNum = 0;
            else Game.selectedNum++;
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

    updateDifficultyDisplay(Game.difficulty);
    updateUndoRedoBtns();
    renderLeaderboard();

    // 시작 화면 표시 (게임은 시작 화면에서 시작)
    showStartScreen();
});
