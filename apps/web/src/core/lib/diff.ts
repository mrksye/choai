/**
 * Two texts compared line by line, and a unified patch read back into the same
 * lines — so what is about to be sent and what was sent before are drawn by one
 * hand.
 *
 * Numbers are one-based, as an editor counts them, and each line carries the
 * number it has on the side it exists on.
 */

export type DiffLine =
  | { readonly kind: "same"; readonly text: string; readonly before: number; readonly after: number }
  | { readonly kind: "added"; readonly text: string; readonly after: number }
  | { readonly kind: "removed"; readonly text: string; readonly before: number }

/**
 * A line as it is shown: a line of the diff, or a stretch left out of it.
 *
 * `gap` is lines nobody changed, counted; `hunk` is a patch's own header, which
 * arrives with the stretch it leaves out already decided by whoever made it.
 */
export type Shown =
  | DiffLine
  | { readonly kind: "gap"; readonly hidden: number }
  | { readonly kind: "hunk"; readonly header: string }

/**
 * Past this many cells the middle of a diff is not searched for what the two
 * sides share, and is shown as taken out and written again. A journal changed
 * at its end — which is how a journal mostly changes — never gets near it,
 * because what both texts begin and end with is set aside first.
 */
const SEARCHED_AT_MOST = 4_000_000

const linesOf = (text: string): readonly string[] =>
  text === "" ? [] : text.replace(/\n$/, "").split("\n")

const sharedFromStart = (a: readonly string[], b: readonly string[]): number => {
  const limit = Math.min(a.length, b.length)
  const first = Array.from({ length: limit }, (_, at) => at).find((at) => a[at] !== b[at])
  return first ?? limit
}

const sharedFromEnd = (a: readonly string[], b: readonly string[], fromStart: number): number => {
  const limit = Math.min(a.length, b.length) - fromStart
  const first = Array.from({ length: limit }, (_, at) => at).find(
    (at) => a[a.length - 1 - at] !== b[b.length - 1 - at],
  )
  return first ?? limit
}

type Step = { readonly kind: DiffLine["kind"]; readonly text: string }

/**
 * The longest run the two share, as a table read from the bottom-right: each
 * cell is how many lines from there on the two still have in common.
 */
const commonTable = (a: readonly string[], b: readonly string[]): readonly Int32Array[] => {
  const rows = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
    }
  }
  return rows
}

const stepsThrough = (a: readonly string[], b: readonly string[]): readonly Step[] => {
  if (a.length * b.length > SEARCHED_AT_MOST) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ]
  }
  const table = commonTable(a, b)
  const steps: Step[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      steps.push({ kind: "same", text: a[i] })
      i += 1
      j += 1
    } else if (i < a.length && (j === b.length || table[i + 1][j] >= table[i][j + 1])) {
      steps.push({ kind: "removed", text: a[i] })
      i += 1
    } else {
      steps.push({ kind: "added", text: b[j] })
      j += 1
    }
  }
  return steps
}

const numbered = (steps: readonly Step[]): readonly DiffLine[] => {
  const lines: DiffLine[] = []
  let before = 0
  let after = 0
  for (const step of steps) {
    if (step.kind !== "added") before += 1
    if (step.kind !== "removed") after += 1
    lines.push(
      step.kind === "same"
        ? { kind: "same", text: step.text, before, after }
        : step.kind === "added"
          ? { kind: "added", text: step.text, after }
          : { kind: "removed", text: step.text, before },
    )
  }
  return lines
}

/** Every line of both texts, in order, each marked as kept, added or taken out. */
export const lineDiff = (before: string, after: string): readonly DiffLine[] => {
  const a = linesOf(before)
  const b = linesOf(after)
  const start = sharedFromStart(a, b)
  const end = sharedFromEnd(a, b, start)
  const same = (text: string): Step => ({ kind: "same", text })
  return numbered([
    ...a.slice(0, start).map(same),
    ...stepsThrough(a.slice(start, a.length - end), b.slice(start, b.length - end)),
    ...a.slice(a.length - end).map(same),
  ])
}

/** How many lines went in and how many came out. */
export const changes = (lines: readonly DiffLine[]): { readonly added: number; readonly removed: number } => ({
  added: lines.filter((line) => line.kind === "added").length,
  removed: lines.filter((line) => line.kind === "removed").length,
})

/**
 * Only the changes and a few lines either side of each, with what is left out
 * counted rather than dropped silently.
 */
export const aroundChanges = (lines: readonly DiffLine[], context = 3): readonly Shown[] => {
  const near = new Set(
    lines.flatMap((line, at) =>
      line.kind === "same" ? [] : Array.from({ length: context * 2 + 1 }, (_, step) => at - context + step),
    ),
  )
  const kept = lines.map((_, at) => near.has(at))
  return lines.flatMap((line, at): readonly Shown[] => {
    if (kept[at]) return [line]
    const startsAGap = at === 0 || kept[at - 1]
    if (!startsAGap) return []
    const run = kept.slice(at).findIndex((each) => each)
    return [{ kind: "gap", hidden: run === -1 ? lines.length - at : run }]
  })
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * A unified patch as GitHub sends one with a commit, read into the same lines.
 *
 * The file headers are not in it — GitHub gives the name separately — and the
 * note that a file has no newline at its end is about the file rather than a
 * line of it, so it is left out.
 */
export const fromPatch = (patch: string): readonly Shown[] => {
  const shown: Shown[] = []
  let before = 0
  let after = 0
  for (const line of linesOf(patch)) {
    const hunk = HUNK.exec(line)
    if (hunk !== null) {
      before = Number(hunk[1]) - 1
      after = Number(hunk[2]) - 1
      shown.push({ kind: "hunk", header: line })
    } else if (line.startsWith("+")) {
      after += 1
      shown.push({ kind: "added", text: line.slice(1), after })
    } else if (line.startsWith("-")) {
      before += 1
      shown.push({ kind: "removed", text: line.slice(1), before })
    } else if (!line.startsWith("\\")) {
      before += 1
      after += 1
      shown.push({ kind: "same", text: line.slice(1), before, after })
    }
  }
  return shown
}
