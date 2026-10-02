import { describe, expect, test } from "bun:test";
import { verifyMate, validateMateProof } from "../../src/challenges/mate-verifier.ts";

const mateInTwo = "k7/8/2K5/8/8/8/3Q4/8 w - - 0 1";
const mateInOne = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

describe("offline forced-mate verification", () => {
  test("finds the shortest forced mate rather than trusting a supplied depth", () => {
    expect(verifyMate(mateInOne, 3)?.depth).toBe(1);
    expect(verifyMate(mateInTwo, 1)).toBeNull();
    const verified = verifyMate(mateInTwo, 2)!;
    expect(verified.depth).toBe(2);
    expect(validateMateProof(mateInTwo, verified.proof, 2)).toBe(true);
  });

  test("a legal non-mating move is not a proof", () => {
    expect(validateMateProof(mateInOne, { move: "a1a2", replies: {} }, 1)).toBe(false);
    expect(validateMateProof(mateInOne, { move: "a1a9", replies: {} }, 1)).toBe(false);
  });

  test("omitting a defensive reply invalidates the winning strategy", () => {
    const proof = structuredClone(verifyMate(mateInTwo, 2)!.proof);
    delete proof.replies[Object.keys(proof.replies)[0]];
    expect(validateMateProof(mateInTwo, proof, 2)).toBe(false);
  });

  test("node-budget exhaustion is an error, never a fabricated mate result", () => {
    expect(() => verifyMate(mateInTwo, 2, 1)).toThrow("node limit");
  });
});
