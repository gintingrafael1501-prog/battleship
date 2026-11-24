const canvas = document.getElementById("battleCanvas"), ctx = canvas.getContext("2d");
const statusText = document.getElementById("status-text"), btnMain = document.getElementById("btn-main");
const btnAuto = document.getElementById("btn-auto"), weaponBar = document.getElementById("weapon-bar");
const levelSelect = document.getElementById("level-select");
const fleetCountEl = document.getElementById("fleet-count"), ledLabelEl = document.getElementById("led-label");
const endModal = document.getElementById("end-modal"), endTitle = document.getElementById("end-title"), endDesc = document.getElementById("end-desc");
const wpStandard = document.getElementById("wp-standard"), wpSonar = document.getElementById("wp-sonar"), wpBarrage = document.getElementById("wp-barrage");
const sonarChargeEl = document.getElementById("sonar-charge"), barrageChargeEl = document.getElementById("barrage-charge");

const GRID = 8;
let cw = 380, ch = 520, cell = 30, radarX = 0, radarY = 10, oceanX = 0, oceanY = 270;
let radarAngle = 0, waveTime = 0, phase = "setup", playerTurn = true, soundOn = true;
let targetR = 3, targetC = 3, selectedWeapon = "standard";

const SONAR_MAX = 2, BARRAGE_MAX = 4;
let sonarCharge = 2, barrageCharge = 4;
let difficulty = "medium";

let playerBoard = [], enemyBoard = [], playerShips = [], enemyShips = [];
let missiles = [], explosions = [], splashes = [], floatingLabels = [];
let aiTargets = [];

let draggingShip = null, dragMoved = false, dragStartX = 0, dragStartY = 0;
let dragOffsetX = 0, dragOffsetY = 0, previewR = -1, previewC = -1, previewValid = false;

const SHIP_TYPES = [
    { name: "Carrier", size: 5, code: "05" },
    { name: "Battleship", size: 4, code: "04" },
    { name: "Cruiser", size: 3, code: "03" },
    { name: "Submarine", size: 3, code: "03" },
    { name: "Destroyer", size: 2, code: "02" }
];

const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function playSound(type) {
    if (!soundOn || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const list = {
        lock: ["sine", 920, 920, 0.08, 0.07],
        launch: ["sawtooth", 440, 130, 0.14, 0.32],
        hit: ["square", 140, 30, 0.22, 0.42],
        miss: ["triangle", 260, 85, 0.12, 0.22],
        sunk: ["sawtooth", 180, 45, 0.28, 0.65],
        ready: ["sine", 660, 990, 0.12, 0.2]
    };
    const cfg = list[type];
    if (!cfg) return;
    osc.type = cfg[0];
    osc.frequency.setValueAtTime(cfg[1], now);
    osc.frequency.exponentialRampToValueAtTime(cfg[2], now + cfg[4]);
    gain.gain.setValueAtTime(cfg[3], now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + cfg[4]);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(now + cfg[4]);
}
function resize() {
    const wrap = canvas.parentElement, dpr = window.devicePixelRatio || 1;
    cw = wrap.clientWidth; ch = wrap.clientHeight;
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const maxGridH = Math.floor((ch - 24) / 2);
    const maxGridW = cw - 84;
    cell = Math.max(22, Math.floor(Math.min(maxGridH, maxGridW) / GRID));

    const gridPx = cell * GRID;
    radarX = oceanX = Math.floor((cw - gridPx) / 2);
    radarY = Math.floor((ch / 2 - gridPx) / 2);
    oceanY = Math.floor(ch / 2 + (ch / 2 - gridPx) / 2);
}

const emptyBoard = () => Array.from({ length: GRID }, () => Array(GRID).fill(0));

function canFit(board, r, c, size, horiz, ignoreShip) {
    for (let k = 0; k < size; k++) {
        const nr = horiz ? r : r + k, nc = horiz ? c + k : c;
        if (nr < 0 || nc < 0 || nr >= GRID || nc >= GRID) return false;
        if (board[nr][nc] !== 0) {
            if (!ignoreShip) return false;
            const isSelf = ignoreShip.cells.some(pt => pt.r === nr && pt.c === nc);
            if (!isSelf) return false;
        }
    }
    return true;
}

function rebuildBoardFromShips(ships) {
    const b = emptyBoard();
    ships.forEach(s => {
        s.cells = [];
        for (let k = 0; k < s.size; k++) {
            const nr = s.horizontal ? s.r : s.r + k;
            const nc = s.horizontal ? s.c + k : s.c;
            b[nr][nc] = 1;
            s.cells.push({ r: nr, c: nc });
        }
    });
    return b;
}

function generateRandomFleet() {
    const b = emptyBoard();
    return SHIP_TYPES.map(info => {
        while (true) {
            const horiz = Math.random() < 0.5, r = Math.floor(Math.random() * GRID), c = Math.floor(Math.random() * GRID);
            if (canFit(b, r, c, info.size, horiz, null)) {
                let cells = [];
                for (let k = 0; k < info.size; k++) {
                    const nr = horiz ? r : r + k, nc = horiz ? c + k : c;
                    b[nr][nc] = 1; cells.push({ r: nr, c: nc });
                }
                return { name: info.name, code: info.code, size: info.size, r, c, horizontal: horiz, cells, sunk: false };
            }
        }
    });
}

function initGame() {
    resize();
    difficulty = levelSelect.value;
    playerShips = generateRandomFleet();
    playerBoard = rebuildBoardFromShips(playerShips);
    enemyShips = generateRandomFleet();
    enemyBoard = rebuildBoardFromShips(enemyShips);

    missiles = []; explosions = []; splashes = []; floatingLabels = []; aiTargets = [];
    phase = "setup"; playerTurn = true;
    targetR = 3; targetC = 3;
    sonarCharge = SONAR_MAX;
    barrageCharge = BARRAGE_MAX;
    selectWeapon("standard");
    updateSkillUI();
    endModal.classList.add("hidden");

    btnMain.textContent = "⚔️";
    btnMain.classList.remove("combat-mode");
    btnAuto.style.display = "inline-block";
    levelSelect.disabled = false;
    weaponBar.classList.add("locked");
    ledLabelEl.textContent = "SETUP";
    fleetCountEl.textContent = "5/5";
    statusText.textContent = "GESER KAPAL / TAP PUTAR, TEKAN ⚔️";
    statusText.style.color = "#facc15";
}
function updateSkillUI() {
    const sonarReady = sonarCharge >= SONAR_MAX;
    const barrageReady = barrageCharge >= BARRAGE_MAX;

    sonarChargeEl.textContent = sonarReady ? "SIAP ⚡" : sonarCharge + "/" + SONAR_MAX + " ⚡";
    barrageChargeEl.textContent = barrageReady ? "SIAP ⚡" : barrageCharge + "/" + BARRAGE_MAX + " ⚡";

    wpSonar.classList.toggle("charging", !sonarReady);
    wpBarrage.classList.toggle("charging", !barrageReady);
}

function addSkillEnergy(amount) {
    const wasSonar = sonarCharge >= SONAR_MAX, wasBarrage = barrageCharge >= BARRAGE_MAX;
    sonarCharge = Math.min(SONAR_MAX, sonarCharge + amount);
    barrageCharge = Math.min(BARRAGE_MAX, barrageCharge + amount);
    updateSkillUI();
    if ((!wasSonar && sonarCharge >= SONAR_MAX) || (!wasBarrage && barrageCharge >= BARRAGE_MAX)) playSound("ready");
}

function selectWeapon(type) {
    if ((type === "sonar" && sonarCharge < SONAR_MAX) || (type === "barrage" && barrageCharge < BARRAGE_MAX)) return;
    selectedWeapon = type;
    wpStandard.classList.toggle("active", type === "standard");
    wpSonar.classList.toggle("active", type === "sonar");
    wpBarrage.classList.toggle("active", type === "barrage");
}

wpStandard.onclick = () => selectWeapon("standard");
wpSonar.onclick = () => selectWeapon("sonar");
wpBarrage.onclick = () => selectWeapon("barrage");
document.getElementById("btn-replay").onclick = initGame;
levelSelect.onchange = () => { difficulty = levelSelect.value; playSound("lock"); };

btnAuto.onclick = () => {
    if (phase !== "setup") return;
    draggingShip = null;
    playerShips = generateRandomFleet();
    playerBoard = rebuildBoardFromShips(playerShips);
    playSound("lock");
};

document.getElementById("btn-sound").onclick = (e) => {
    soundOn = !soundOn; e.target.textContent = soundOn ? "🔊" : "🔇";
};

canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (phase !== "setup") return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const col = Math.floor((px - oceanX) / cell), row = Math.floor((py - oceanY) / cell);
    const targetShip = playerShips.find(s => s.cells.some(pt => pt.r === row && pt.c === col));

    if (targetShip) {
        const nextHoriz = !targetShip.horizontal;
        if (canFit(playerBoard, targetShip.r, targetShip.c, targetShip.size, nextHoriz, targetShip)) {
            targetShip.horizontal = nextHoriz;
            playerBoard = rebuildBoardFromShips(playerShips);
            playSound("lock");
        } else {
            playSound("miss");
        }
    }
});

canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    const rect = canvas.getBoundingClientRect(), gridPx = cell * GRID;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;

    if (phase === "setup") {
        if (px >= oceanX && px <= oceanX + gridPx && py >= oceanY && py <= oceanY + gridPx) {
            const col = Math.floor((px - oceanX) / cell), row = Math.floor((py - oceanY) / cell);
            const found = playerShips.find(s => s.cells.some(pt => pt.r === row && pt.c === col));
            if (found) {
                draggingShip = found;
                dragMoved = false;
                dragStartX = px; dragStartY = py;
                dragOffsetX = px - (oceanX + found.c * cell);
                dragOffsetY = py - (oceanY + found.r * cell);
                draggingShip.floatX = oceanX + found.c * cell;
                draggingShip.floatY = oceanY + found.r * cell;
                previewR = found.r; previewC = found.c; previewValid = true;
                playSound("lock");
            }
        }
        return;
    }

    if (phase === "combat" && playerTurn) {
        if (px >= radarX && px <= radarX + gridPx && py >= radarY && py <= radarY + gridPx) {
            targetC = Math.floor((px - radarX) / cell);
            targetR = Math.floor((py - radarY) / cell);
            playSound("lock");
        }
    }
});

window.addEventListener("pointermove", (e) => {
    if (!draggingShip || phase !== "setup") return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (Math.hypot(px - dragStartX, py - dragStartY) > 8) dragMoved = true;

    const liftY = e.pointerType === "touch" ? 55 : 0;
    const shipLeftX = px - dragOffsetX;
    const shipTopY = (py - liftY) - dragOffsetY;

    draggingShip.floatX = shipLeftX;
    draggingShip.floatY = shipTopY;

    previewC = Math.round((shipLeftX - oceanX) / cell);
    previewR = Math.round((shipTopY - oceanY) / cell);
    previewValid = canFit(playerBoard, previewR, previewC, draggingShip.size, draggingShip.horizontal, draggingShip);
});

window.addEventListener("pointerup", () => {
    if (draggingShip && phase === "setup") {
        if (!dragMoved) {
            const nextHoriz = !draggingShip.horizontal;
            if (canFit(playerBoard, draggingShip.r, draggingShip.c, draggingShip.size, nextHoriz, draggingShip)) {
                draggingShip.horizontal = nextHoriz;
                playerBoard = rebuildBoardFromShips(playerShips);
                playSound("lock");
            } else {
                playSound("miss");
            }
        } else if (previewValid) {
            draggingShip.r = previewR;
            draggingShip.c = previewC;
            playerBoard = rebuildBoardFromShips(playerShips);
            playSound("lock");
        } else {
            playSound("miss");
        }
    }
    draggingShip = null;
    previewR = -1; previewC = -1;
});

btnMain.onclick = () => {
    if (phase === "setup") {
        draggingShip = null;
        phase = "combat";
        btnMain.textContent = "💥";
        btnMain.classList.add("combat-mode");
        btnAuto.style.display = "none";
        levelSelect.disabled = true;
        weaponBar.classList.remove("locked");
        ledLabelEl.textContent = "SHOTS";
        statusText.textContent = "GILIRANMU: KUNCI TARGET RADAR";
        statusText.style.color = "#4ade80";
        playSound("lock");
        return;
    }

    if (phase !== "combat" || !playerTurn || missiles.length > 0) return;

    if (selectedWeapon === "sonar" && sonarCharge >= SONAR_MAX) {
        sonarCharge = 0; updateSkillUI();
        launchMissile(targetR, targetC, true, "sonar");
        selectWeapon("standard");
    } else if (selectedWeapon === "barrage" && barrageCharge >= BARRAGE_MAX) {
        barrageCharge = 0; updateSkillUI();
        const drList = [0, -1, 1, 0, 0], dcList = [0, 0, 0, -1, 1];
        for (let i = 0; i < 5; i++) {
            const nr = targetR + drList[i], nc = targetC + dcList[i];
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) launchMissile(nr, nc, true, "normal");
        }
        selectWeapon("standard");
    } else if (enemyBoard[targetR][targetC] !== 2 && enemyBoard[targetR][targetC] !== 3) {
        launchMissile(targetR, targetC, true, "normal");
        const isHit = enemyBoard[targetR][targetC] === 1 || enemyBoard[targetR][targetC] === 4;
        addSkillEnergy(isHit ? 2 : 1);
    }
};
function launchMissile(r, c, isPlayer, mode) {
    playSound("launch");
    missiles.push({
        x: cw / 2, y: isPlayer ? ch : 0,
        destX: (isPlayer ? radarX : oceanX) + c * cell + cell / 2,
        destY: (isPlayer ? radarY : oceanY) + r * cell + cell / 2,
        r, c, isPlayer, mode, progress: 0
    });
}

function checkShipSunk(ships, board, isPlayerAttack) {
    ships.forEach(s => {
        if (!s.sunk && s.cells.every(pt => board[pt.r][pt.c] === 3)) {
            s.sunk = true;
            playSound("sunk");
            const mid = s.cells[Math.floor(s.cells.length / 2)];
            const cx = (isPlayerAttack ? radarX : oceanX) + mid.c * cell + cell / 2;
            const cy = (isPlayerAttack ? radarY : oceanY) + mid.r * cell + cell / 2;
            floatingLabels.push({ text: s.name.toUpperCase() + " TENGGELAM!", x: cx, y: cy - 10, color: "#ef4444", alpha: 1 });
        }
    });
    fleetCountEl.textContent = enemyShips.filter(s => !s.sunk).length + "/5";
}

function resolveImpact(m) {
    const board = m.isPlayer ? enemyBoard : playerBoard;
    if (m.mode === "sonar") {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = m.r + dr, nc = m.c + dc;
                if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && board[nr][nc] === 1) board[nr][nc] = 4;
            }
        }
        floatingLabels.push({ text: "SONAR SCAN", x: m.destX, y: m.destY - 12, color: "#38bdf8", alpha: 1 });
        playSound("lock"); return finishTurn();
    }

    const val = board[m.r][m.c];
    if (val === 1 || val === 4) {
        board[m.r][m.c] = 3; playSound("hit");
        for (let i = 0; i < 16; i++) {
            const ang = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 3.5;
            explosions.push({ x: m.destX, y: m.destY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, radius: 4 + Math.random() * 5, color: i % 2 ? "#facc15" : "#ef4444", alpha: 1 });
        }
        floatingLabels.push({ text: "HIT!", x: m.destX, y: m.destY - 12, color: "#facc15", alpha: 1 });
        checkShipSunk(m.isPlayer ? enemyShips : playerShips, board, m.isPlayer);

        if (!m.isPlayer && difficulty !== "easy") {
            const drList = [0, 0, 1, -1], dcList = [1, -1, 0, 0];
            for (let i = 0; i < 4; i++) {
                const nr = m.r + drList[i], nc = m.c + dcList[i];
                if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && playerBoard[nr][nc] < 2) {
                    aiTargets.push({ r: nr, c: nc });
                }
            }
        }
    } else if (val === 0) {
        board[m.r][m.c] = 2; playSound("miss");
        splashes.push({ x: m.destX, y: m.destY, radius: 4, alpha: 1 });
        floatingLabels.push({ text: "MISS", x: m.destX, y: m.destY - 12, color: "#4ade80", alpha: 1 });
    }

    if (missiles.length === 0 && !checkVictory()) {
        if (m.isPlayer) finishTurn();
        else { playerTurn = true; statusText.textContent = "GILIRANMU: KUNCI TARGET RADAR"; statusText.style.color = "#4ade80"; }
    }
}

function finishTurn() {
    playerTurn = false; statusText.textContent = "MUSUH MEMBIDIK ARMADA..."; statusText.style.color = "#f87171";
    setTimeout(() => {
        if (phase !== "combat") return;
        let pick = null;

        while (aiTargets.length > 0 && !pick) {
            const cand = aiTargets.shift();
            if (playerBoard[cand.r][cand.c] < 2) pick = cand;
        }

        if (!pick && difficulty === "hard" && Math.random() < 0.30) {
            let shipCells = [];
            for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (playerBoard[r][c] === 1) shipCells.push({ r, c });
            if (shipCells.length) pick = shipCells[Math.floor(Math.random() * shipCells.length)];
        }

        if (!pick) {
            let pool = [];
            for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (playerBoard[r][c] < 2) pool.push({ r, c });
            if (pool.length) pick = pool[Math.floor(Math.random() * pool.length)];
        }

        if (pick) launchMissile(pick.r, pick.c, false, "normal");
    }, 800);
}

function checkVictory() {
    const enemyAlive = enemyShips.some(s => !s.sunk);
    const playerAlive = playerShips.some(s => !s.sunk);
    if (!enemyAlive || !playerAlive) {
        phase = "gameover";
        endTitle.textContent = !enemyAlive ? "KEMENANGAN!" : "ARMADA HANCUR!";
        endTitle.style.color = !enemyAlive ? "#4ade80" : "#f87171";
        endDesc.textContent = !enemyAlive ? "Semua 5 kapal musuh tenggelam!" : "Seluruh armada kapalmu tenggelam.";
        endModal.classList.remove("hidden");
        return true;
    }
    return false;
}
function roundBox(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawWarshipAt(s, x, y, isEnemyRevealed, isFloating) {
    const w = s.horizontal ? s.size * cell : cell, h = s.horizontal ? cell : s.size * cell;
    const rip = Math.sin(waveTime * 3 + s.r) * 2.5;

    ctx.save();
    if (isFloating) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 8;
    } else if (!isEnemyRevealed) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
        roundBox(x + 2 - rip / 2, y + 2 - rip / 2, w - 4 + rip, h - 4 + rip, 9); ctx.stroke();
    }

    ctx.fillStyle = s.sunk ? "#475569" : "#94a3b8";
    ctx.strokeStyle = s.sunk ? "#ef4444" : (isFloating ? "#facc15" : "#1e293b");
    ctx.lineWidth = 2;
    roundBox(x + 4, y + 4, w - 8, h - 8, 8); ctx.fill(); ctx.stroke();

    ctx.fillStyle = s.sunk ? "#334155" : "#64748b";
    roundBox(x + 7, y + 7, w - 14, h - 14, 5); ctx.fill();

    if (s.code === "05") {
        ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 1.5; ctx.beginPath();
        s.horizontal ? (ctx.moveTo(x + 12, y + h / 2), ctx.lineTo(x + w - 12, y + h / 2)) : (ctx.moveTo(x + w / 2, y + 12), ctx.lineTo(x + w / 2, y + h - 12));
        ctx.stroke();
    }

    ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(s.code, x + w / 2, y + h / 2); ctx.restore();
}

function drawRadar() {
    const gPx = cell * GRID, cx = radarX + gPx / 2, cy = radarY + gPx / 2;
    ctx.fillStyle = "#4b5563"; ctx.fillRect(radarX - 36, radarY - 6, gPx + 72, gPx + 12);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(radarX - 30, radarY + 4, 22, gPx - 8); ctx.fillRect(radarX + gPx + 8, radarY + 4, 22, gPx - 8);

    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 1;
    for (let sy = radarY + 10; sy < radarY + gPx - 10; sy += 5) {
        ctx.beginPath(); ctx.moveTo(radarX - 26, sy); ctx.lineTo(radarX - 12, sy);
        ctx.moveTo(radarX + gPx + 12, sy); ctx.lineTo(radarX + gPx + 26, sy); ctx.stroke();
    }

    ctx.fillStyle = "#063b1c"; ctx.fillRect(radarX, radarY, gPx, gPx);
    ctx.strokeStyle = "rgba(74,222,128,0.22)";
    for (let rad = cell; rad <= gPx / 2; rad += cell * 1.25) { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke(); }

    ctx.save(); ctx.beginPath(); ctx.rect(radarX, radarY, gPx, gPx); ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, gPx * 0.75);
    grad.addColorStop(0, "rgba(74,222,128,0.45)"); grad.addColorStop(1, "rgba(74,222,128,0)");
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, gPx * 0.8, radarAngle, radarAngle + 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();

    enemyShips.forEach(s => { if (s.sunk) drawWarshipAt(s, radarX + s.c * cell, radarY + s.r * cell, true, false); });

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const x = radarX + c * cell, y = radarY + r * cell, st = enemyBoard[r][c];
            ctx.strokeStyle = "rgba(74,222,128,0.35)"; ctx.strokeRect(x, y, cell, cell);
            if (st === 2) { ctx.fillStyle = "#4ade80"; ctx.font = "bold " + Math.floor(cell * 0.52) + "px sans-serif"; ctx.fillText("✖", x + cell / 2, y + cell / 2); }
            else if (st === 3) { ctx.font = "bold " + Math.floor(cell * 0.58) + "px sans-serif"; ctx.fillText("🔥", x + cell / 2, y + cell / 2); }
            else if (st === 4) { ctx.fillStyle = "rgba(56,189,248,0.55)"; ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6); }
        }
    }

    if (phase === "combat" && playerTurn) {
        ctx.strokeStyle = "#facc15"; ctx.lineWidth = 2.5;
        ctx.strokeRect(radarX + targetC * cell + 2, radarY + targetR * cell + 2, cell - 4, cell - 4);
    }
}

function drawOcean() {
    ctx.fillStyle = "#1d4ed8"; ctx.fillRect(0, Math.floor(ch / 2), cw, Math.ceil(ch / 2));
    ctx.strokeStyle = "rgba(147,197,253,0.16)"; ctx.lineWidth = 2;
    for (let y = Math.floor(ch / 2) + 12; y < ch; y += 22) {
        ctx.beginPath();
        for (let x = 0; x <= cw; x += 20) {
            const wy = y + Math.sin(x * 0.04 + waveTime + y) * 3;
            x === 0 ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
        }
        ctx.stroke();
    }

    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const x = oceanX + c * cell, y = oceanY + r * cell;
            ctx.fillStyle = "rgba(30,58,138,0.45)"; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            ctx.strokeStyle = "rgba(147,197,253,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, cell, cell);
        }
    }

    if (draggingShip && dragMoved && previewR !== -1 && previewC !== -1) {
        for (let k = 0; k < draggingShip.size; k++) {
            const nr = draggingShip.horizontal ? previewR : previewR + k;
            const nc = draggingShip.horizontal ? previewC + k : previewC;
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) {
                ctx.fillStyle = previewValid ? "rgba(74, 222, 128, 0.45)" : "rgba(239, 68, 68, 0.55)";
                ctx.fillRect(oceanX + nc * cell + 2, oceanY + nr * cell + 2, cell - 4, cell - 4);
            }
        }
    }

    playerShips.forEach(s => {
        if (s !== draggingShip || !dragMoved) {
            drawWarshipAt(s, oceanX + s.c * cell, oceanY + s.r * cell, false, false);
        }
    });

    if (draggingShip && dragMoved) {
        drawWarshipAt(draggingShip, draggingShip.floatX, draggingShip.floatY, false, true);
    }

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const x = oceanX + c * cell, y = oceanY + r * cell;
            if (playerBoard[r][c] === 2) { ctx.fillStyle = "#bae6fd"; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, 4, 0, Math.PI * 2); ctx.fill(); }
            else if (playerBoard[r][c] === 3) { ctx.font = "bold " + Math.floor(cell * 0.62) + "px sans-serif"; ctx.fillText("💥", x + cell / 2, y + cell / 2); }
        }
    }
}

function loop() {
    ctx.clearRect(0, 0, cw, ch); radarAngle += 0.035; waveTime += 0.03;
    drawOcean(); drawRadar();

    for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i]; m.progress += 0.06;
        const cx = m.x + (m.destX - m.x) * m.progress, cy = m.y + (m.destY - m.y) * m.progress;
        ctx.strokeStyle = "rgba(254,240,138,0.7)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(cx, cy); ctx.stroke();
        ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
        if (m.progress >= 1) { missiles.splice(i, 1); resolveImpact(m); }
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
        const ex = explosions[i]; ex.x += ex.vx; ex.y += ex.vy; ex.alpha -= 0.03;
        if (ex.alpha <= 0) { explosions.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = ex.alpha; ctx.fillStyle = ex.color;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    for (let i = splashes.length - 1; i >= 0; i--) {
        const sp = splashes[i]; sp.radius += 0.7; sp.alpha -= 0.03;
        if (sp.alpha <= 0) { splashes.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = sp.alpha; ctx.strokeStyle = "#7dd3fc"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }

    for (let i = floatingLabels.length - 1; i >= 0; i--) {
        const fl = floatingLabels[i]; fl.y -= 0.6; fl.alpha -= 0.025;
        if (fl.alpha <= 0) { floatingLabels.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = fl.alpha; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
        ctx.fillStyle = fl.color; ctx.fillText(fl.text, fl.x, fl.y); ctx.restore();
    }

    requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
initGame();
loop();
