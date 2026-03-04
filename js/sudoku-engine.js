// 수도쿠 엔진 - 퍼즐 생성 및 풀이 알고리즘

const SudokuEngine = (() => {

    // 시드 기반 난수 생성기 (Mulberry32 PRNG) - 같은 seed → 항상 같은 퍼즐
    function mulberry32(seed) {
        let s = seed >>> 0;
        return function() {
            s = s + 0x6D2B79F5 | 0;
            let t = Math.imul(s ^ s >>> 15, 1 | s);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // 배열을 무작위로 섞는 함수 (rand 함수 주입 가능)
    function shuffle(arr, rand) {
        const r = rand || Math.random;
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(r() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // 특정 위치에 숫자를 놓을 수 있는지 확인
    function isValidPlacement(board, row, col, num) {
        // 같은 행 확인
        for (let c = 0; c < 9; c++) {
            if (board[row][c] === num) return false;
        }
        // 같은 열 확인
        for (let r = 0; r < 9; r++) {
            if (board[r][col] === num) return false;
        }
        // 같은 3x3 박스 확인
        const br = Math.floor(row / 3) * 3;
        const bc = Math.floor(col / 3) * 3;
        for (let r = br; r < br + 3; r++) {
            for (let c = bc; c < bc + 3; c++) {
                if (board[r][c] === num) return false;
            }
        }
        return true;
    }

    // 특정 빈 칸에 들어갈 수 있는 숫자 목록 반환
    function getCandidates(board, row, col) {
        if (board[row][col] !== 0) return [];
        const candidates = [];
        for (let n = 1; n <= 9; n++) {
            if (isValidPlacement(board, row, col, n)) candidates.push(n);
        }
        return candidates;
    }

    // 후보 숫자가 가장 적은 빈 칸 찾기 (MRV 휴리스틱 - 더 빠른 풀이를 위해)
    function findBestCell(board) {
        let minLen = 10;
        let best = null;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (board[r][c] === 0) {
                    const cands = getCandidates(board, r, c);
                    if (cands.length < minLen) {
                        minLen = cands.length;
                        best = [r, c, cands];
                        if (minLen === 0) return best; // 막힌 경우 즉시 반환
                    }
                }
            }
        }
        return best;
    }

    // 해답 개수 세기 (최대 max개까지만) - 유일 해답 확인용
    function countSolutions(board, max = 2) {
        const cell = findBestCell(board);
        if (!cell) return 1; // 빈 칸 없음 = 해답 찾음

        const [r, c, cands] = cell;
        if (cands.length === 0) return 0; // 막힌 상태

        let total = 0;
        for (const num of cands) {
            board[r][c] = num;
            total += countSolutions(board, max);
            board[r][c] = 0;
            if (total >= max) break; // 이미 충분한 해답 찾음
        }
        return total;
    }

    // 보드를 무작위로 채우기 (완성된 수도쿠 생성)
    function fillBoardRandom(board, rand) {
        const cell = findBestCell(board);
        if (!cell) return true; // 모두 채워짐

        const [r, c, cands] = cell;
        if (cands.length === 0) return false; // 막힌 상태

        for (const num of shuffle(cands, rand)) {
            board[r][c] = num;
            if (fillBoardRandom(board, rand)) return true;
            board[r][c] = 0;
        }
        return false;
    }

    // 완성된 수도쿠 보드 생성
    function generateSolution(rand) {
        const board = Array.from({ length: 9 }, () => Array(9).fill(0));
        fillBoardRandom(board, rand);
        return board;
    }

    // 난이도별 이름과 그룹 반환
    function getDifficultyInfo(level) {
        if (level <= 2)  return { name: '입문', tier: 'beginner', stars: '⭐' };
        if (level <= 4)  return { name: '쉬움', tier: 'easy', stars: '⭐⭐' };
        if (level <= 6)  return { name: '보통', tier: 'medium', stars: '⭐⭐⭐' };
        if (level <= 8)  return { name: '어려움', tier: 'hard', stars: '⭐⭐⭐⭐' };
        return              { name: '전문가', tier: 'expert', stars: '⭐⭐⭐⭐⭐' };
    }

    // 난이도에 따른 주어진 숫자 개수 계산
    // 레벨 1 → 58개 (매우 쉬움, 빈칸 23개), 레벨 10 → 24개 (전문가, 빈칸 57개)
    function getClueCount(level) {
        return Math.round(58 - (level - 1) * 34 / 9);
    }

    // 퍼즐 생성 - 완성된 보드에서 숫자를 제거하여 퍼즐 만들기
    function createPuzzle(level, rand) {
        const solution = generateSolution(rand);
        const puzzle = solution.map(row => [...row]);
        const targetClues = getClueCount(level);
        const toRemove = 81 - targetClues;

        // 모든 칸 위치를 무작위로 섞기
        const positions = shuffle(
            Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9]),
            rand
        );

        let removed = 0;
        let iterations = 0;
        const MAX_ITERATIONS = 500; // 무한 루프 방지

        for (const [r, c] of positions) {
            if (removed >= toRemove || iterations++ > MAX_ITERATIONS) break;

            const saved = puzzle[r][c];
            puzzle[r][c] = 0;

            // 이 칸을 제거해도 유일한 해답이 있는지 확인
            const test = puzzle.map(row => [...row]);
            if (countSolutions(test) === 1) {
                removed++;
            } else {
                puzzle[r][c] = saved; // 복원
            }
        }

        return { puzzle, solution };
    }

    // 주어진 보드 풀기 (힌트 기능용)
    function solve(board) {
        const b = board.map(row => [...row]);
        if (solveFirst(b)) return b;
        return null;
    }

    function solveFirst(board) {
        const cell = findBestCell(board);
        if (!cell) return true;

        const [r, c, cands] = cell;
        if (cands.length === 0) return false;

        for (const num of cands) {
            board[r][c] = num;
            if (solveFirst(board)) return true;
            board[r][c] = 0;
        }
        return false;
    }

    // 시드 기반 퍼즐 생성 (같은 seed + level → 항상 같은 퍼즐)
    function createPuzzleSeeded(level, seed) {
        const rand = mulberry32(seed);
        return createPuzzle(level, rand);
    }

    // 공개 API
    return {
        createPuzzle,
        createPuzzleSeeded,
        solve,
        getDifficultyInfo,
        getClueCount,
        isValidPlacement
    };
})();
