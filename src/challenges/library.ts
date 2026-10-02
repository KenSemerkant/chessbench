import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Challenge, ChallengeLoadError } from "../engine/types.ts";
import { validateChallenge } from "../engine/validation.ts";

export interface LibraryLoadResult {
  challenges: Challenge[];
  errors: ChallengeLoadError[];
  directory: string;
}

function errorOf(file: string, field: string, reason: string): ChallengeLoadError {
  return new ChallengeLoadError(file, field, reason);
}

/**
 * Load every *.json challenge definition in a directory (FR-005). Invalid
 * files are skipped with file+field+reason errors — never a crash. Later
 * duplicates lose to the first file (sorted) claiming an id.
 */
export async function loadLibrary(directory: string): Promise<LibraryLoadResult> {
  const challenges: Challenge[] = [];
  const errors: ChallengeLoadError[] = [];
  const seen = new Set<string>();

  let entries: string[];
  try {
    entries = (await readdir(directory)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    errors.push(errorOf(directory, "(directory)", "challenge library directory cannot be read"));
    return { challenges, errors, directory };
  }

  for (const entry of entries) {
    const path = join(directory, entry);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      errors.push(errorOf(entry, "(root)", "file is not valid JSON"));
      continue;
    }
    try {
      const challenge = validateChallenge(parsed, entry);
      if (seen.has(challenge.id)) {
        errors.push(errorOf(entry, "id", `duplicate challenge id "${challenge.id}"`));
        continue;
      }
      seen.add(challenge.id);
      challenges.push(challenge);
    } catch (err) {
      if (err instanceof ChallengeLoadError) {
        errors.push(err);
      } else {
        errors.push(errorOf(entry, "(root)", "unexpected validation failure"));
      }
    }
  }
  return { challenges, errors, directory };
}

/** Look up a loaded challenge by id; throws ChallengeLoadError for unknown ids. */
export function getChallenge(challenges: Challenge[], id: string): Challenge {
  const found = challenges.find((c) => c.id === id);
  if (!found) {
    throw new ChallengeLoadError(id, "id", `unknown challenge id "${id}"`);
  }
  return found;
}

/** Selector-friendly listing (id/title/difficulty/tags only). */
export function listChallenges(
  challenges: Challenge[],
): Array<Pick<Challenge, "id" | "title" | "mateInN" | "difficulty" | "tags">> {
  return challenges.map(({ id, title, mateInN, difficulty, tags }) => ({ id, title, mateInN, difficulty, tags }));
}
