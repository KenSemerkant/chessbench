/** Display-only check detection from a FEN (the engine remains authoritative). */
export function inCheckFromFen(fen: string): boolean {
  const [placement, turn] = fen.split(" ");
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const rows = placement.split("/");
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        f += Number(ch);
      } else {
        board[r][f++] = ch;
      }
    }
  }
  const king = turn === "w" ? "K" : "k";
  let kr = -1;
  let kf = -1;
  for (let r = 0; r < 8 && kr < 0; r++) {
    for (let f = 0; f < 8; f++) {
      if (board[r][f] === king) {
        kr = r;
        kf = f;
        break;
      }
    }
  }
  if (kr < 0) return false;
  const enemy = (p: string | null): boolean =>
    p !== null && (turn === "w" ? p === p.toLowerCase() : p === p.toUpperCase());

  // Knight attacks.
  for (const [dr, df] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
    const r = kr + dr;
    const f = kf + df;
    if (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const p = board[r][f];
      if (enemy(p) && p!.toLowerCase() === "n") return true;
    }
  }
  // Pawn attacks (direction depends on who is in check).
  const pr = turn === "w" ? kr - 1 : kr + 1;
  for (const df of [-1, 1]) {
    const f = kf + df;
    if (pr >= 0 && pr < 8 && f >= 0 && f < 8) {
      const p = board[pr][f];
      if (enemy(p) && p!.toLowerCase() === "p") return true;
    }
  }
  // King adjacency.
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = kr + dr;
      const f = kf + df;
      if (r < 0 || r >= 8 || f < 0 || f >= 8) continue;
      const p = board[r][f];
      if (enemy(p) && p!.toLowerCase() === "k") return true;
    }
  }
  // Sliding attacks.
  const rays: Array<{ dr: number; df: number; pieces: string[] }> = [
    { dr: -1, df: 0, pieces: ["r", "q"] },
    { dr: 1, df: 0, pieces: ["r", "q"] },
    { dr: 0, df: -1, pieces: ["r", "q"] },
    { dr: 0, df: 1, pieces: ["r", "q"] },
    { dr: -1, df: -1, pieces: ["b", "q"] },
    { dr: -1, df: 1, pieces: ["b", "q"] },
    { dr: 1, df: -1, pieces: ["b", "q"] },
    { dr: 1, df: 1, pieces: ["b", "q"] },
  ];
  for (const { dr, df, pieces } of rays) {
    let r = kr + dr;
    let f = kf + df;
    while (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const p = board[r][f];
      if (p !== null) {
        if (enemy(p) && pieces.includes(p.toLowerCase())) return true;
        break;
      }
      r += dr;
      f += df;
    }
  }
  return false;
}
