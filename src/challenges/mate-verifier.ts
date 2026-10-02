import { Chess, Move } from "chess.js";

export interface MateProof {
  move: string;
  /** Every legal defensive reply must have a continuation; empty means checkmate. */
  replies: Record<string, MateProof>;
}
export interface MateVerification { depth: number; proof: MateProof; nodes: number }
export const uci = (move: Move): string => move.from + move.to + (move.promotion ?? "");

/** Offline curation only. Never called by the runtime engine or exposed to agents. */
export function verifyMate(fen: string, maxDepth: number, nodeLimit = 25000): MateVerification | null {
  const game = new Chess(fen);
  const solver = game.turn();
  let nodes = 0;
  const memo = new Map<string, MateProof | null>();
  const search = (remaining: number): MateProof | null => {
    if (++nodes > nodeLimit) throw new Error("mate verification node limit exceeded");
    if (remaining === 0 || game.isGameOver()) return null;
    const key = `${game.fen()}|${remaining}`;
    if (memo.has(key)) return memo.get(key)!;
    const moves = game.moves({ verbose: true }).sort((a, b) =>
      Number(b.san.includes("#")) - Number(a.san.includes("#")) ||
      Number(b.san.includes("+")) - Number(a.san.includes("+")) || uci(a).localeCompare(uci(b)));
    for (const move of moves) {
      game.move(move);
      if (game.isCheckmate()) {
        game.undo();
        const proof = { move: uci(move), replies: {} };
        memo.set(key, proof);
        return proof;
      }
      let wins = remaining > 1 && !game.isGameOver();
      const replies: Record<string, MateProof> = {};
      if (wins) {
        for (const reply of game.moves({ verbose: true })) {
          game.move(reply);
          const continuation = game.turn() === solver ? search(remaining - 1) : null;
          game.undo();
          if (!continuation) { wins = false; break; }
          replies[uci(reply)] = continuation;
        }
      }
      game.undo();
      if (wins) {
        const proof = { move: uci(move), replies };
        memo.set(key, proof);
        return proof;
      }
    }
    memo.set(key, null);
    return null;
  };
  for (let depth = 1; depth <= maxDepth; depth++) {
    const proof = search(depth);
    if (proof) return { depth, proof, nodes };
  }
  return null;
}

/**
 * The solver's UCI moves along the deterministic defender's replies: apply the
 * proof's move, let the given defender pick its reply, descend into that
 * branch, repeat. One move per solver turn (length === mate depth). Curation
 * only — never called by the runtime engine or exposed to agents.
 */
export function solutionMoves(fen: string, proof: MateProof, defender: (fen: string) => string | null): string[] {
  const game = new Chess(fen);
  const line: string[] = [];
  let node: MateProof | undefined = proof;
  const play = (uciMove: string): void => {
    game.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] });
  };
  while (node) {
    line.push(node.move);
    play(node.move);
    if (Object.keys(node.replies).length === 0) break;
    const reply = defender(game.fen());
    if (reply === null) break;
    play(reply);
    node = node.replies[reply];
  }
  return line;
}

/** Check the stored positive proof cheaply, without relying on a single principal variation. */
export function validateMateProof(fen: string, proof: MateProof, remaining: number): boolean {
  if (remaining < 1) return false;
  const game = new Chess(fen);
  try { game.move({ from: proof.move.slice(0, 2), to: proof.move.slice(2, 4), promotion: proof.move[4] }); }
  catch { return false; }
  if (game.isCheckmate()) return Object.keys(proof.replies).length === 0;
  if (game.isGameOver() || remaining === 1) return false;
  const replies = game.moves({ verbose: true });
  if (replies.length !== Object.keys(proof.replies).length) return false;
  return replies.every((reply) => {
    const continuation = proof.replies[uci(reply)];
    if (!continuation) return false;
    game.move(reply);
    const valid = validateMateProof(game.fen(), continuation, remaining - 1);
    game.undo();
    return valid;
  });
}
