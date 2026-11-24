const canvas = document.getElementById("battleCanvas"), ctx = canvas.getContext("2d");
const turnText = document.getElementById("turn-text"), endModal = document.getElementById("end-modal");
const endTitle = document.getElementById("end-title"), endDesc = document.getElementById("end-desc");
const wpStandard = document.getElementById("wp-standard"), wpSonar = document.getElementById("wp-sonar"), wpBarrage = document.getElementById("wp-barrage");
const sonarAmmoEl = document.getElementById("sonar-ammo"), barrageAmmoEl = document.getElementById("barrage-ammo");

const GRID = 8;
let cw = 380, ch = 520, cell = 30, radarX = 0, radarY = 10, oceanX = 0, oceanY = 270;
let radarAngle = 0, waveTime = 0, playerTurn = true, gameOver = false, soundOn = true;
let targetR = 3, targetC = 3, selectedWeapon = "standard", sonarAmmo = 2, barrageAmmo = 1;
let playerBoard = [], enemyBoard = [], playerShips = [], enemyShips = [];
let missiles = [], explosions = [], splashes = [], floatingLabels = [];

const SHIP_TYPES = [
    { size: 5, code: "05" }, { size: 4, code: "04" }, { size: 3, code: "03" },
    { size: 3, code: "03" }, { size: 2, code: "02" }
];

const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function playSound(type) {
    if (!soundOn || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const cfg = {
        lock: ["sine", 920, 920, 0.08, 0.07],
        launch: ["sawtooth", 440, 130, 0.15, 0.35],
        hit: ["square", 140, 30, 0.24, 0.45],
        miss: ["triangle", 260, 85, 0.14, 0.25]
    }[type];
    osc.type = cfg; osc.frequency.setValueAtTime(cfg, now);
    osc.frequency.exponentialRampToValueAtTime(cfg, now + cfg);
    gain.gain.setValueAtTime(cfg, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + cfg);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(now + cfg);
}
function resize() {
    const wrap = canvas.parentElement, dpr = window.devicePixelRatio || 1;
    cw = Math.min(wrap.clientWidth, 430); ch = wrap.clientHeight;
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cell = Math.floor(Math.min(Math.floor((ch - 26) / 2), cw - 92) / GRID);
    const gridPx = cell * GRID;
    radarX = oceanX = Math.floor((cw - gridPx) / 2);
    radarY = Math.floor((ch / 2 - gridPx) / 2);
    oceanY = Math.floor(ch / 2 + (ch / 2 - gridPx) / 2);
}

const emptyBoard = () => Array.from({ length: GRID }, () => Array(GRID).fill(0));

function canFit(board, r, c, size, horiz) {
    for (let k = 0; k < size; k++) {
        const nr = horiz ? r : r + k, nc = horiz ? c + k : c;
        if (nr >= GRID || nc >= GRID || board[nr][nc] !== 0) return false;
    }
    return true;
}

function placeFleet(board) {
    return SHIP_TYPES.map(info => {
        while (true) {
            const horiz = Math.random() < 0.5, r = Math.floor(Math.random() * GRID), c = Math.floor(Math.random() * GRID);
            if (canFit(board, r, c, info.size, horiz)) {
                for (let k = 0; k < info.size; k++) board[horiz ? r : r + k][horiz ? c + k : c] = 1;
                return { code: info.code, size: info.size, r, c, horizontal: horiz };
            }
        }
    });
}

function initGame() {
    resize();
    playerBoard = emptyBoard(); enemyBoard = emptyBoard();
    playerShips = placeFleet(playerBoard); enemyShips = placeFleet(enemyBoard);
    missiles = []; explosions = []; splashes = []; floatingLabels = [];
    playerTurn = true; gameOver = false; targetR = 3; targetC = 3; sonarAmmo = 2; barrageAmmo = 1;
    selectWeapon("standard"); updateAmmoUI();
    endModal.classList.add("hidden");
    turnText.textContent = "GILIRANMU: KUNCI TARGET"; turnText.style.color = "#4ade80";
}
function updateAmmoUI() {
    sonarAmmoEl.textContent = sonarAmmo;
    barrageAmmoEl.textContent = barrageAmmo;
}

function selectWeapon(type) {
    if ((type === "sonar" && sonarAmmo <= 0) || (type === "barrage" && barrageAmmo <= 0)) return;
    selectedWeapon = type;
    wpStandard.classList.toggle("active", type === "standard");
    wpSonar.classList.toggle("active", type === "sonar");
    wpBarrage.classList.toggle("active", type === "barrage");
}

wpStandard.onclick = () => selectWeapon("standard");
wpSonar.onclick = () => selectWeapon("sonar");
wpBarrage.onclick = () => selectWeapon("barrage");
document.getElementById("btn-replay").onclick = initGame;

document.getElementById("btn-fleet").onclick = () => {
    if (missiles.length || gameOver) return;
    playerBoard = emptyBoard(); playerShips = placeFleet(playerBoard); playSound("lock");
};

document.getElementById("btn-sound").onclick = (e) => {
    soundOn = !soundOn; e.target.textContent = soundOn ? "🔊" : "🔇";
};

canvas.addEventListener("pointerdown", (e) => {
    if (!playerTurn || gameOver) return;
    const rect = canvas.getBoundingClientRect(), gridPx = cell * GRID;
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (px >= radarX && px <= radarX + gridPx && py >= radarY && py <= radarY + gridPx) {
        targetC = Math.floor((px - radarX) / cell);
        targetR = Math.floor((py - radarY) / cell);
        playSound("lock");
    }
});

document.getElementById("btn-fire").onclick = () => {
    if (!playerTurn || gameOver || missiles.length) return;
    if (selectedWeapon === "sonar" && sonarAmmo > 0) {
        sonarAmmo--; updateAmmoUI(); launchMissile(targetR, targetC, true, "sonar"); selectWeapon("standard");
    } else if (selectedWeapon === "barrage" && barrageAmmo > 0) {
        barrageAmmo--; updateAmmoUI();
        [0, -1, 1, 0, 0].forEach((dr, i) => {
            const nr = targetR + dr, nc = targetC + [0, 0, 0, -1, 1][i];
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) launchMissile(nr, nc, true, "normal");
        });
        selectWeapon("standard");
    } else if (enemyBoard[targetR][targetC] !== 2 && enemyBoard[targetR][targetC] !== 3) {
        launchMissile(targetR, targetC, true, "normal");
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
    } else if (val === 0) {
        board[m.r][m.c] = 2; playSound("miss");
        splashes.push({ x: m.destX, y: m.destY, radius: 4, alpha: 1 });
        floatingLabels.push({ text: "MISS", x: m.destX, y: m.destY - 12, color: "#4ade80", alpha: 1 });
    }

    if (!missiles.length && !checkVictory()) {
        if (m.isPlayer) finishTurn();
        else { playerTurn = true; turnText.textContent = "GILIRANMU: KUNCI TARGET"; turnText.style.color = "#4ade80"; }
    }
}

function finishTurn() {
    playerTurn = false; turnText.textContent = "MUSUH MEMBIDIK ARMADA..."; turnText.style.color = "#f87171";
    setTimeout(() => {
        if (gameOver) return;
        let pool = [];
        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (playerBoard[r][c] < 2) pool.push({ r, c });
        if (pool.length) { const p = pool[Math.floor(Math.random() * pool.length)]; launchMissile(p.r, p.c, false, "normal"); }
    }, 850);
}

function checkVictory() {
    const enemyAlive = enemyBoard.some(row => row.includes(1) || row.includes(4));
    const playerAlive = playerBoard.some(row => row.includes(1));
    if (!enemyAlive || !playerAlive) {
        gameOver = true;
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

function drawWarship(s) {
    const x = oceanX + s.c * cell, y = oceanY + s.r * cell;
    const w = s.horizontal ? s.size * cell : cell, h = s.horizontal ? cell : s.size * cell;
    const rip = Math.sin(waveTime * 3 + s.r) * 2.5;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5;
    roundBox(x + 2 - rip / 2, y + 2 - rip / 2, w - 4 + rip, h - 4 + rip, 9); ctx.stroke();

    ctx.fillStyle = "#94a3b8"; ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2;
    roundBox(x + 4, y + 4, w - 8, h - 8, 8); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#64748b"; roundBox(x + 7, y + 7, w - 14, h - 14, 5); ctx.fill();

    if (s.code === "05") {
        ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 1.5; ctx.beginPath();
        s.horizontal ? (ctx.moveTo(x + 12, y + h / 2), ctx.lineTo(x + w - 12, y + h / 2)) : (ctx.moveTo(x + w / 2, y + 12), ctx.lineTo(x + w / 2, y + h - 12));
        ctx.stroke();
    }

    ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(s.code, x + w / 2, y + h / 2); ctx.restore();
}

function drawRadar() {
    const gPx = cell * GRID, cx = radarX + gPx / 2, cy = radarY + gPx / 2;
    ctx.fillStyle = "#4b5563"; ctx.fillRect(radarX - 38, radarY - 6, gPx + 76, gPx + 12);
    ctx.fillStyle = "#1f2937"; ctx.fillRect(radarX - 32, radarY + 4, 24, gPx - 8); ctx.fillRect(radarX + gPx + 8, radarY + 4, 24, gPx - 8);

    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 1;
    for (let sy = radarY + 10; sy < radarY + gPx - 10; sy += 5) {
        ctx.beginPath(); ctx.moveTo(radarX - 28, sy); ctx.lineTo(radarX - 12, sy);
        ctx.moveTo(radarX + gPx + 12, sy); ctx.lineTo(radarX + gPx + 28, sy); ctx.stroke();
    }

    ctx.fillStyle = "#063b1c"; ctx.fillRect(radarX, radarY, gPx, gPx);
    ctx.strokeStyle = "rgba(74,222,128,0.22)";
    for (let rad = cell; rad <= gPx / 2; rad += cell * 1.25) { ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke(); }

    ctx.save(); ctx.beginPath(); ctx.rect(radarX, radarY, gPx, gPx); ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, gPx * 0.75);
    grad.addColorStop(0, "rgba(74,222,128,0.45)"); grad.addColorStop(1, "rgba(74,222,128,0)");
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, gPx * 0.8, radarAngle, radarAngle + 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const x = radarX + c * cell, y = radarY + r * cell, st = enemyBoard[r][c];
            ctx.strokeStyle = "rgba(74,222,128,0.35)"; ctx.strokeRect(x, y, cell, cell);
            if (st === 2) { ctx.fillStyle = "#4ade80"; ctx.font = "bold " + Math.floor(cell * 0.55) + "px sans-serif"; ctx.fillText("✖", x + cell / 2, y + cell / 2); }
            else if (st === 3) { ctx.fillStyle = "rgba(239,68,68,0.45)"; ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4); ctx.font = "bold " + Math.floor(cell * 0.6) + "px sans-serif"; ctx.fillText("🔥", x + cell / 2, y + cell / 2); }
            else if (st === 4) { ctx.fillStyle = "rgba(56,189,248,0.5)"; ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6); }
        }
    }

    if (playerTurn && !gameOver) {
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

    playerShips.forEach(drawWarship);

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const x = oceanX + c * cell, y = oceanY + r * cell;
            if (playerBoard[r][c] === 2) { ctx.fillStyle = "#bae6fd"; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, 4, 0, Math.PI * 2); ctx.fill(); }
            else if (playerBoard[r][c] === 3) { ctx.font = "bold " + Math.floor(cell * 0.65) + "px sans-serif"; ctx.fillText("💥", x + cell / 2, y + cell / 2); }
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
