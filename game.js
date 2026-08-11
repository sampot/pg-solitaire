/**
 * 接龍（Klondike 克朗代克）— 純函式規則邏輯。
 * 發牌、翻牌、移動、暫存 4 堆、A→K 建堆、計時／步數、本機最佳。
 * 不碰 DOM，可單元測試。
 */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"]; // 黑黑紅紅
export const SUIT_CHAR = ["♠", "♥", "♦", "♣"];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function makeDeck(rand = Math.random) {
  const cards = [];
  for (const s of [0, 1, 2, 3]) {
    for (const r of RANKS) {
      cards.push({ suit: s, rank: r, up: false });
    }
  }
  return shuffle(cards, rand);
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardKey(c) {
  return `${c.suit}-${c.rank}`;
}

/**
 * 建一局：發 7 列、剩餘當 stock。
 *   tableau: Array<Card[]>（每列 1..7，最上面一張翻開）
 *   stock: Card[]（剩餘；face-down）
 *   waste: Card[]（翻出）— waste[0] 為頂
 *   foundations: [Card[], Card[], ...]（4 堆，升序）
 *   moves, done
 */
export function newGame(rand = Math.random) {
  const deck = makeDeck(rand);
  const tableau = [];
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    const pile = deck.slice(idx, idx + col + 1);
    idx += col + 1;
    pile.forEach((c) => (c.up = false));
    if (pile.length) pile[pile.length - 1].up = true;
    tableau.push(pile);
  }
  const stock = deck.slice(idx);
  return {
    tableau,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    moves: 0,
    done: false,
    won: false,
  };
}

/** 花色是否紅色（紅心／方塊）。 */
export function isRed(suit) {
  return suit === 1 || suit === 2;
}

export function oppositeColor(a, b) {
  return isRed(a) !== isRed(b);
}

/** 列上可移動的連續牌面尾部（商品）。 */
export function runToTop(pile) {
  if (!pile.length) return [];
  const run = [];
  for (let i = pile.length - 1; i >= 0; i--) {
    const c = pile[i];
    if (run.length === 0 && !c.up) return [];
    if (run.length === 0) {
      if (!c.up) return [];
      run.push(c);
      continue;
    }
    if (!c.up) break;
    const prev = run[run.length - 1];
    if (oppositeColor(c.suit, prev.suit) && c.rank === prev.rank - 1) {
      run.push(c);
    } else {
      break;
    }
  }
  return run.reverse();
}

/** 翻開列頂的覆蓋牌。 */
export function flipTop(tableau, col) {
  const pile = tableau[col];
  if (pile.length && !pile[pile.length - 1].up) {
    pile[pile.length - 1].up = true;
  }
}

/**
 * 是否能從 aPile 移到 bPile 頂（a 頂 ≤ b 頂小一、異色）。
 * bId: 0..6 列 或純函式呼叫用物件。
 */
export function canMoveToTableau(fromCard, toCard) {
  if (!toCard) return fromCard.rank === 13; // A 放到空列（等價：K 的 rank 13）
  return oppositeColor(fromCard.suit, toCard.suit) && fromCard.rank === toCard.rank - 1;
}

/** 是否能移到 foundation（升序、同花色；最上面是 A 或 +1）。 */
export function canMoveToFoundation(card, foundationTop) {
  if (!foundationTop) return card.rank === 1; // A
  return card.suit === foundationTop.suit && card.rank === foundationTop.rank + 1;
}

/**
 * 移動牌疊。
 * opts:
 *   from: "tableau" | "waste" | "foundation"
 *   fromCol: 列／暫存索引
 *   size: 要移幾張（tableau 可移多張商品；waste/foundation 固定 1）
 *   to: "tableau" | "foundation"
 *   toCol: 目標列／暫存索引
 * 回傳 { ok, reason? }。
 */
export function moveCards(state, opts) {
  const { from, fromCol = 0, size = 1, to, toCol = 0 } = opts;
  if (state.done) return { ok: false, reason: "finished" };

  let source;
  if (from === "tableau") source = state.tableau[fromCol];
  else if (from === "waste") source = state.waste;
  else if (from === "foundation") source = state.foundations[fromCol];
  else return { ok: false, reason: "bad-source" };

  if (!source || !source.length) return { ok: false, reason: "empty-source" };

  // 取出要移動的牌
  let moving;
  if (from === "tableau") {
    if (size <= 0 || size > source.length) return { ok: false, reason: "bad-size" };
    const run = runToTop(source);
    if (run.length < size) return { ok: false, reason: "invalid-run" };
    moving = source.slice(source.length - size);
  } else {
    moving = [source[source.length - 1]];
  }
  if (!moving[moving.length - 1].up) return { ok: false, reason: "face-down" };

  if (to === "tableau") {
    const target = state.tableau[toCol];
    const top = target[target.length - 1] || null;
    if (!canMoveToTableau(moving[0], top)) return { ok: false, reason: "invalid-move" };
    target.push(...moving);
    source.splice(source.length - moving.length, moving.length);
    if (from === "tableau") flipTop(state.tableau, fromCol);
    state.moves++;
    checkDone(state);
    return { ok: true };
  } else if (to === "foundation") {
    const f = state.foundations[toCol];
    const top = f[f.length - 1] || null;
    if (moving.length !== 1 || !canMoveToFoundation(moving[0], top)) {
      return { ok: false, reason: "invalid-foundation" };
    }
    f.push(moving[0]);
    source.pop();
    if (from === "tableau") flipTop(state.tableau, fromCol);
    state.moves++;
    checkDone(state);
    return { ok: true };
  }
  return { ok: false, reason: "bad-dest" };
}

/** 從 stock 翻一張到 waste。 */
export function drawStock(state, recycle = true) {
  if (state.done) return { ok: false, reason: "finished" };
  if (state.stock.length === 0) {
    if (recycle && state.waste.length) {
      // 收回 waste（顛倒、蓋回）當新 stock
      state.stock = state.waste.slice().reverse();
      state.stock.forEach((c) => (c.up = false));
      state.waste = [];
      return { ok: true, recycled: true };
    }
    return { ok: false, reason: "empty-stock" };
  }
  const card = state.stock.pop();
  card.up = true;
  state.waste.push(card);
  state.moves++;
  return { ok: true, card };
}

/** 判斷是否勝利（四堆都 13 張）。 */
export function isWon(state) {
  return state.foundations.every((f) => f.length === 13);
}

function checkDone(state) {
  if (isWon(state)) {
    state.done = true;
    state.won = true;
  }
}

/** 自動解：把能上 foundation 的都放上去（單趟，供提示／自動整理）。回傳是否有所動作。 */
export function autoFoundation(state) {
  if (state.done) return false;
  let acted = false;
  const sources = [];
  if (state.waste.length) sources.push({ from: "waste", fromCol: 0, card: state.waste[state.waste.length - 1] });
  for (let col = 0; col < 7; col++) {
    const pile = state.tableau[col];
    if (pile.length && pile[pile.length - 1].up) {
      sources.push({ from: "tableau", fromCol: col, card: pile[pile.length - 1] });
    }
  }
  for (let f = 0; f < 4; f++) {
    const pile = state.foundations[f];
    if (pile.length) sources.push({ from: "foundation", fromCol: f, card: pile[pile.length - 1] });
  }

  for (const s of sources) {
    for (let f = 0; f < 4 && !state.done; f++) {
      const top = state.foundations[f][state.foundations[f].length - 1] || null;
      if (canMoveToFoundation(s.card, top)) {
        const r = moveCards(state, { from: s.from, fromCol: s.fromCol, to: "foundation", toCol: f });
        if (r.ok) {
          acted = true;
          break;
        }
      }
    }
  }
  return acted;
}

/** 計算剩餘牌數（patrick 用定勝）。 */
export function remainingCards(state) {
  let n = state.stock.length + state.waste.length;
  for (const pile of state.tableau) n += pile.length;
  return n;
}
