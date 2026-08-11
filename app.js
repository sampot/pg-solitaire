/**
 * 接龍（Klondike）— 介面與互動。
 * 拖曳／點擊移動牌；stock→waste 翻牌；A→K 建堆；計時／步數；本機最佳。
 */
import {
  newGame,
  moveCards,
  drawStock,
  runToTop,
  isWon,
  autoFoundation,
  cardKey,
  SUIT_CHAR,
} from "./game.js";
import { SolitaireAudio } from "./audio.js";

const audio = new SolitaireAudio();

const els = {
  status: document.getElementById("status"),
  btnNew: document.getElementById("btn-new"),
  btnMute: document.getElementById("btn-mute"),
  btnUndo: document.getElementById("btn-undo"),
  btnHint: document.getElementById("btn-hint"),
  stock: document.getElementById("stock"),
  waste: document.getElementById("waste"),
  foundations: document.getElementById("foundations"),
  tableau: document.getElementById("tableau"),
  moves: document.getElementById("moves"),
  time: document.getElementById("time"),
  best: document.getElementById("best-label"),
  endPanel: document.getElementById("end-panel"),
  endTitle: document.getElementById("end-title"),
  endInfo: document.getElementById("end-info"),
  btnAgain: document.getElementById("btn-again"),
};

const BEST_KEY = "pg-solitaire-best";

let state = null;
let phase = "idle"; // idle | playing | over
let bestSeconds = 0;
let timerInterval = null;
let elapsed = 0;
let drag = null; // { from, fromCol, size }

function cardFile(c) {
  const rank = c.rank === 1 ? "A" : c.rank === 11 ? "J" : c.rank === 12 ? "Q" : c.rank === 13 ? "K" : String(c.rank).padStart(2, "0");
  const suit = c.suit === 0 ? "spades" : c.suit === 1 ? "hearts" : c.suit === 2 ? "diamonds" : "clubs";
  return `card_${suit}_${rank}.png`;
}

function cardEl(c) {
  const img = document.createElement("img");
  img.src = `assets/cards/${cardFile(c)}`;
  img.alt = `${rankZh(c.rank)} ${SUIT_CHAR[c.suit]}`;
  img.draggable = false;
  img.className = "card-img";
  return img;
}

function rankZh(r) {
  if (r === 1) return "A";
  if (r === 11) return "J";
  if (r === 12) return "Q";
  if (r === 13) return "K";
  return String(r);
}

function setStatus(msg, tone = "") {
  els.status.textContent = msg;
  els.status.dataset.tone = tone;
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function loadBest() {
  try {
    const res = await fetch(`/api/kv/${BEST_KEY}`);
    if (res.ok) {
      const t = (await res.text()).trim();
      if (/^\d+$/.test(t)) {
        bestSeconds = Number(t);
        els.best.textContent = bestSeconds ? fmtTime(bestSeconds) : "—";
        return;
      }
    }
  } catch {
    /* 無 KV */
  }
  els.best.textContent = "—";
}

async function saveBest() {
  try {
    await fetch(`/api/kv/${BEST_KEY}`, { method: "PUT", body: String(bestSeconds) });
  } catch {
    /* 無 KV */
  }
}

function startGame() {
  audio.unlock();
  audio.select();
  clearInterval(timerInterval);
  state = newGame();
  phase = "playing";
  elapsed = 0;
  els.endPanel.classList.add("hidden");
  els.time.textContent = "0:00";
  els.moves.textContent = "0";
  setStatus("把牌 A→K 依花色建到右上；開局了。");
  render();
  timerInterval = setInterval(() => {
    if (phase === "playing") {
      elapsed += 1;
      els.time.textContent = fmtTime(elapsed);
    }
  }, 1000);
}

function render() {
  // foundations
  els.foundations.innerHTML = "";
  for (let f = 0; f < 4; f++) {
    const slot = document.createElement("div");
    slot.className = "slot foundation-slot";
    slot.dataset.f = f;
    const pile = state.foundations[f];
    const top = pile[pile.length - 1];
    if (top) {
      slot.appendChild(cardEl(top));
      slot.addEventListener("pointerdown", () => beginDragFromFoundation(f));
    } else {
      slot.classList.add("empty");
      slot.textContent = "A";
    }
    els.foundations.appendChild(slot);
  }

  // stock + waste
  els.stock.innerHTML = "";
  const stockBtn = document.createElement("button");
  stockBtn.type = "button";
  stockBtn.className = "stock-btn";
  const back = document.createElement("img");
  back.src = "assets/cards/card_back.png";
  back.alt = "牌堆";
  back.draggable = false;
  if (state.stock.length) {
    stockBtn.appendChild(back);
    stockBtn.addEventListener("click", () => {
      if (phase !== "playing") return;
      const r = drawStock(state);
      if (r.ok) {
        audio.draw();
        els.moves.textContent = String(state.moves);
        render();
      }
    });
  } else {
    stockBtn.classList.add("empty");
    stockBtn.textContent = "重洗";
    stockBtn.addEventListener("click", () => {
      if (phase !== "playing") return;
      const r = drawStock(state);
      if (r.recycled) {
        audio.draw();
        render();
      }
    });
  }
  els.stock.appendChild(stockBtn);

  els.waste.innerHTML = "";
  const wasteSlot = document.createElement("div");
  wasteSlot.className = "slot waste-slot";
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    wasteSlot.appendChild(cardEl(wasteTop));
    wasteSlot.dataset.upto = cardKey(wasteTop);
    wasteSlot.addEventListener("pointerdown", () => beginDragFromWaste());
  } else {
    wasteSlot.classList.add("empty");
    wasteSlot.textContent = "—";
  }
  els.waste.appendChild(wasteSlot);

  // tableau
  els.tableau.innerHTML = "";
  for (let col = 0; col < 7; col++) {
    const pile = state.tableau[col];
    const stack = document.createElement("div");
    stack.className = "column";
    stack.dataset.col = col;

    const run = runToTop(pile);
    for (let i = 0; i < pile.length; i++) {
      const c = pile[i];
      const pos = document.createElement("div");
      pos.className = "cardpos";
      const isRun = i >= pile.length - run.length;
      if (c.up) {
        pos.appendChild(cardEl(c));
        if (isRun) {
          pos.dataset.upto = cardKey(c);
          pos.addEventListener("pointerdown", () => beginDragFromTableau(col, i));
        } else {
          pos.addEventListener("pointerdown", () => {
            if (phase !== "playing") return;
            audio.flip();
            pos.dataset = {};
            // 翻牌已由規則於移動時才翻；手動點擊覆牌＝翻開該疊頂（近似）
            const topCard = pile[pile.length - 1];
            if (!topCard.up) {
              topCard.up = true;
              audio.flip();
              render();
            }
          });
        }
      } else {
        const back = document.createElement("img");
        back.src = "assets/cards/card_back.png";
        back.alt = "牌背";
        back.draggable = false;
        back.className = "card-img back";
        pos.appendChild(back);
        pos.dataset.upto = cardKey(c);
      }
      stack.appendChild(pos);
    }

    if (pile.length === 0) {
      stack.classList.add("empty-col");
    }
    // 在此列放牌（drag 結束時）
    stack.addEventListener("pointerup", (e) => {
      if (drag) {
        e.preventDefault();
        const r = commitDrag(col, "tableau");
        if (r === "ok") audio.place();
        else audio.invalid();
        drag = null;
        render();
      }
    });

    els.tableau.appendChild(stack);
  }
}

function beginDragFromTableau(col, idx) {
  if (phase !== "playing") return;
  const pile = state.tableau[col];
  const size = pile.length - idx; // idx 在 run 內 → size = 到頂張數
  drag = { from: "tableau", fromCol: col, size };
  audio.select();
}

function beginDragFromWaste() {
  if (phase !== "playing") return;
  drag = { from: "waste", fromCol: 0, size: 1 };
  audio.select();
}

function beginDragFromFoundation(f) {
  if (phase !== "playing") return;
  drag = { from: "foundation", fromCol: f, size: 1 };
  audio.select();
}

// 拖曳落點：tableau col 或 foundation index
function commitDrag(targetIdx, kind) {
  if (!drag) return "none";
  const from = drag;
  drag = null;
  if (kind === "tableau") {
    const r = moveCards(state, { from: from.from, fromCol: from.fromCol, size: from.size, to: "tableau", toCol: targetIdx });
    if (r.ok) {
      els.moves.textContent = String(state.moves);
      if (isWon(state)) {
        winGame();
      }
      return "ok";
    }
    audio.invalid();
    return "invalid";
  } else {
    const r = moveCards(state, { from: from.from, fromCol: from.fromCol, size: 1, to: "foundation", toCol: targetIdx });
    if (r.ok) {
      audio.foundation();
      els.moves.textContent = String(state.moves);
      if (isWon(state)) winGame();
      return "ok";
    }
    audio.invalid();
    return "invalid";
  }
}

function bindFoundationTargets() {
  for (let f = 0; f < 4; f++) {
    const slot = els.foundations.children[f];
    if (!slot) continue;
    slot.addEventListener("pointerup", (e) => {
      if (drag) {
        e.preventDefault();
        const r = commitDrag(f, "foundation");
        if (r === "ok") audio.foundation();
        else audio.invalid();
        drag = null;
        render();
      }
    });
  }
}

function winGame() {
  phase = "over";
  clearInterval(timerInterval);
  const secs = elapsed;
  if (bestSeconds === 0 || secs < bestSeconds) {
    bestSeconds = secs;
    saveBest();
    els.best.textContent = fmtTime(bestSeconds);
  }
  els.endPanel.classList.remove("hidden");
  els.endTitle.textContent = "接龍完成！";
  els.endInfo.textContent = `用時 ${fmtTime(secs)} · ${state.moves} 步`;
  setStatus("完成！", "win");
  audio.win();
}

function undoLast() {
  // 簡化：重新發牌作為「重來」，無完整步進 undo。
  startGame();
}

function hint() {
  if (phase !== "playing") return;
  const acted = autoFoundation(state);
  if (acted) {
    audio.foundation();
    els.moves.textContent = String(state.moves);
    render();
    setStatus("已自動把可上的牌放上基座。");
  } else {
    setStatus("目前沒有可直接上基座的牌。");
    audio.invalid();
  }
}

function bindEvents() {
  els.btnNew.addEventListener("click", startGame);
  els.btnAgain.addEventListener("click", startGame);
  els.btnUndo.addEventListener("click", undoLast);
  els.btnHint.addEventListener("click", hint);
  els.btnMute.addEventListener("click", () => {
    const on = audio.enabled;
    audio.setEnabled(!on);
    els.btnMute.setAttribute("aria-pressed", String(!on));
    els.btnMute.textContent = on ? "音效關" : "音效開";
  });
}

async function init() {
  bindEvents();
  await loadBest();
  startGame();
  bindFoundationTargets();
}

init();