import { describe, it, expect } from "vitest";
import {
  makeDeck,
  shuffle,
  newGame,
  runToTop,
  canMoveToTableau,
  canMoveToFoundation,
  moveCards,
  drawStock,
  isWon,
  autoFoundation,
  remainingCards,
  isRed,
  oppositeColor,
  cardKey,
} from "./game.js";

let _seed = 1;
function seq() {
  _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0;
  return _seed / 4294967296;
}
const mid = () => 0.5;

describe("makeDeck / newGame（發牌）", () => {
  it("52 張、4 花色 13 階", () => {
    const d = makeDeck(() => 0.5);
    expect(d.length).toBe(52);
    expect(new Set(d.map((c) => `${c.suit}-${c.rank}`)).size).toBe(52);
  });
  it("發 7 列 1..7 且頂張翻開", () => {
    const g = newGame(seq);
    expect(g.tableau.length).toBe(7);
    g.tableau.forEach((pile, i) => {
      expect(pile.length).toBe(i + 1);
      expect(pile[pile.length - 1].up).toBe(true);
    });
  });
  it("stock 為 24 張（剩餘）", () => {
    const g = newGame(seq);
    const dealt = 1 + 2 + 3 + 4 + 5 + 6 + 7;
    expect(g.stock.length).toBe(52 - dealt);
  });
  it("shuffle 保留全部牌", () => {
    const s = shuffle(makeDeck(), () => 0.7);
    expect(s.length).toBe(52);
  });
});

describe("規則判定（canMoveToTableau / canMoveToFoundation / color）", () => {
  it("isRed / oppositeColor", () => {
    expect(isRed(1)).toBe(true); // hearts
    expect(isRed(2)).toBe(true); // diamonds
    expect(isRed(0)).toBe(false);
    expect(oppositeColor(0, 1)).toBe(true);
    expect(oppositeColor(0, 3)).toBe(false);
  });
  it("列上合法：異色且差一階", () => {
    const to = { suit: 1, rank: 6 }; // 紅 6
    expect(canMoveToTableau({ suit: 0, rank: 5 }, to)).toBe(true);
    expect(canMoveToTableau({ suit: 1, rank: 5 }, to)).toBe(false); // 同色
    expect(canMoveToTableau({ suit: 0, rank: 4 }, to)).toBe(false); // 差太多
  });
  it("空列只收 K", () => {
    expect(canMoveToTableau({ suit: 0, rank: 13 }, null)).toBe(true);
    expect(canMoveToTableau({ suit: 0, rank: 12 }, null)).toBe(false);
  });
  it("foundation：空堆收 A、同花 +1", () => {
    expect(canMoveToFoundation({ suit: 0, rank: 1 }, null)).toBe(true);
    expect(canMoveToFoundation({ suit: 0, rank: 5 }, { suit: 0, rank: 4 })).toBe(true);
    expect(canMoveToFoundation({ suit: 1, rank: 5 }, { suit: 0, rank: 4 })).toBe(false); // 異花
    expect(canMoveToFoundation({ suit: 0, rank: 6 }, { suit: 0, rank: 4 })).toBe(false); // 跳階
  });
});

describe("runToTop", () => {
  it("連續異色商品", () => {
    const run = runToTop([
      { suit: 0, rank: 5, up: false },
      { suit: 1, rank: 6, up: true },
      { suit: 0, rank: 7, up: true },
    ]);
    expect(run.map((c) => c.rank)).toEqual([6, 7]);
  });
  it("無翻開頂張 → 空", () => {
    expect(runToTop([{ suit: 0, rank: 5, up: false }])).toEqual([]);
  });
});

describe("moveCards（合法／非法）", () => {
  function simpleGame() {
    const g = newGame(seq);
    // 清空，改放可控牌
    g.tableau = [
      [{ suit: 1, rank: 6, up: true }], // 紅 6
      [{ suit: 0, rank: 5, up: true }], // 黑 5
      [],
      [],
      [],
      [],
      [],
    ];
    return g;
  }
  it("合法移動到列", () => {
    const g = simpleGame();
    const r = moveCards(g, { from: "tableau", fromCol: 1, size: 1, to: "tableau", toCol: 0 }); // 黑5 → 紅6
    expect(r.ok).toBe(true);
    expect(g.tableau[0].map((c) => c.rank)).toEqual([6, 5]);
    expect(g.tableau[1]).toEqual([]);
    expect(g.moves).toBe(1);
  });
  it("非法移動被拒（同色）", () => {
    const g = simpleGame();
    // 把 col1 設為紅 6 → 放上 紅6 頂的黑5 其實合法；用同色測試
    g.tableau[1] = [{ suit: 1, rank: 5, up: true }];
    const r = moveCards(g, { from: "tableau", fromCol: 1, size: 1, to: "tableau", toCol: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid-move");
  });
  it("移到 foundation", () => {
    const g = simpleGame();
    g.foundations[0].push({ suit: 0, rank: 4, up: true }); // 黑 4
    const r = moveCards(g, { from: "tableau", fromCol: 0, to: "foundation", toCol: 0 }); // 移紅6？不合法；改用正確
    // 改成把黑5 疊上的黑5 → 不行。直接放一張黑5 到黑4
    g.tableau[1] = [{ suit: 0, rank: 5, up: true }];
    const r2 = moveCards(g, { from: "tableau", fromCol: 1, to: "foundation", toCol: 0 });
    expect(r2.ok).toBe(true);
    expect(g.foundations[0].length).toBe(2);
  });
  it("非法 foundation（非 +1）被拒", () => {
    const g = simpleGame();
    const r = moveCards(g, { from: "tableau", fromCol: 0, to: "foundation", toCol: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid-foundation");
  });
  it("不可移動蓋住的牌", () => {
    const g = simpleGame();
    g.tableau[1][0].up = false;
    const r = moveCards(g, { from: "tableau", fromCol: 1, size: 1, to: "tableau", toCol: 0 });
    expect(r.ok).toBe(false);
  });
});

describe("drawStock", () => {
  it("stock 翻到 waste 頂張翻開", () => {
    const g = newGame(seq);
    const before = g.stock.length;
    const r = drawStock(g);
    expect(r.ok).toBe(true);
    expect(g.stock.length).toBe(before - 1);
    expect(g.waste.length).toBe(1);
    expect(g.waste[g.waste.length - 1].up).toBe(true);
  });
  it("stock 空時回收 waste", () => {
    const g = newGame(seq);
    g.stock = [];
    g.waste = [{ suit: 0, rank: 3, up: true }];
    const r = drawStock(g);
    expect(r.ok).toBe(true);
    expect(r.recycled).toBe(true);
    expect(g.stock.length).toBe(1);
    expect(g.waste.length).toBe(0);
  });
  it("stock 空且 waste 空 → 失敗", () => {
    const g = newGame(seq);
    g.stock = [];
    g.waste = [];
    expect(drawStock(g).ok).toBe(false);
  });
});

describe("勝利／autoFoundation／剩餘", () => {
  it("isWon 需 4 堆皆滿", () => {
    const g = newGame(seq);
    expect(isWon(g)).toBe(false);
    g.foundations = [full(), full(), full(), full()];
    expect(isWon(g)).toBe(true);
  });
  it("moveCards 移最後一張牌到 foundation 觸發勝利", () => {
    const g = newGame(seq);
    g.foundations = [full(), full(), full(), []];
    g.foundations[3] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((r) => ({ suit: 3, rank: r + 1, up: true })); // clubs 1..12
    g.tableau = Array.from({ length: 7 }, () => []);
    g.tableau[0] = [{ suit: 3, rank: 13, up: true }]; // club K
    const r = moveCards(g, { from: "tableau", fromCol: 0, to: "foundation", toCol: 3 });
    expect(r.ok).toBe(true);
    expect(g.done).toBe(true);
    expect(g.won).toBe(true);
  });
  it("autoFoundation 把可放的放上堆", () => {
    const g = newGame(seq);
    g.stock = [];
    g.waste = [];
    g.foundations = [[], [], [], []];
    g.tableau = [
      [{ suit: 0, rank: 1, up: true }], // 黑 A → 應上 foundation
      [],
      [],
      [],
      [],
      [],
      [],
    ];
    const acted = autoFoundation(g);
    expect(acted).toBe(true);
    expect(g.foundations.some((f) => f.length === 1 && f[0].rank === 1)).toBe(true);
  });
  it("remainingCards 統計剩餘", () => {
    const g = newGame(seq);
    const dealt = 1 + 2 + 3 + 4 + 5 + 6 + 7;
    // 未翻牌前：stock(24) + tableau(dealt) = 52
    const r1 = remainingCards(g);
    expect(r1).toBe(52);
    // 翻一張 stock 到 waste：stock 少一、waste 多一，總數不變
    drawStock(g);
    expect(remainingCards(g)).toBe(52);
  });
  it("cardKey 產生唯一鍵", () => {
    expect(cardKey({ suit: 2, rank: 10 })).toBe("2-10");
  });
});

function full() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => ({ suit: 0, rank: r, up: true }));
}
