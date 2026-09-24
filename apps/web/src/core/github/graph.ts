/**
 * A repository's history drawn as lanes: which column each commit sits in, and
 * which lines run past, into and out of it.
 *
 * Nothing here knows how it is drawn. A row says where its commit is and where
 * every line is above and below it; `strokes` turns that into segments, in
 * lanes and halves of a row, for whatever does the drawing.
 */

/** A commit, as much of one as its place in the graph needs. */
export interface Node {
  readonly sha: string
  readonly parents: readonly string[]
  /** When it was committed, in milliseconds. */
  readonly at: number
}

/** A column, and the commit the line in it is on its way to — or free. */
export type Lane = string | undefined

export interface Row {
  readonly sha: string
  readonly parents: readonly string[]
  /** The column this commit sits in. */
  readonly lane: number
  /** What each column is waiting for as it arrives at this row. */
  readonly above: readonly Lane[]
  /** And as it leaves. */
  readonly below: readonly Lane[]
}

/**
 * Children before parents, and otherwise the newest first.
 *
 * Commits fetched branch by branch come back in no one order, and a commit
 * drawn above one of its children would have its line run upwards. Dates alone
 * do not settle it: a clock that was wrong when somebody committed is enough.
 */
export const ordered = <C extends Node>(commits: readonly C[]): readonly C[] => {
  const known = new Set(commits.map((commit) => commit.sha))
  const waitingOn = new Map<string, number>(commits.map((commit) => [commit.sha, 0]))
  commits.forEach((commit) =>
    commit.parents
      .filter((parent) => known.has(parent))
      .forEach((parent) => waitingOn.set(parent, (waitingOn.get(parent) ?? 0) + 1)),
  )
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]))
  const newestFirst = (a: C, b: C): number => b.at - a.at || a.sha.localeCompare(b.sha)
  const out: C[] = []
  let ready = commits.filter((commit) => waitingOn.get(commit.sha) === 0).sort(newestFirst)
  while (ready.length > 0) {
    const [next, ...rest] = ready
    out.push(next)
    const freed = next.parents.flatMap((parent) => {
      if (!known.has(parent)) return []
      const left = (waitingOn.get(parent) ?? 0) - 1
      waitingOn.set(parent, left)
      const commit = bySha.get(parent)
      return left === 0 && commit !== undefined ? [commit] : []
    })
    ready = [...rest, ...freed].sort(newestFirst)
  }
  return out
}

const freeIn = (lanes: readonly Lane[]): number => {
  const free = lanes.indexOf(undefined)
  return free === -1 ? lanes.length : free
}

const setAt = (lanes: readonly Lane[], at: number, value: Lane): readonly Lane[] =>
  at === lanes.length ? [...lanes, value] : lanes.map((each, i) => (i === at ? value : each))

const withoutTrailingFree = (lanes: readonly Lane[]): readonly Lane[] => {
  const last = lanes.findLastIndex((each) => each !== undefined)
  return lanes.slice(0, last + 1)
}

/**
 * Every commit given its column.
 *
 * A commit goes where a line was already waiting for it, or into the first free
 * column. Its first parent carries on in the same column, so a branch keeps a
 * straight line; any further parent — a merge — takes a column already waiting
 * for it, or a free one. Lines that were all waiting for the same commit meet
 * at it and end there. Columns are never shuffled to close a gap, so a line
 * that runs past a commit runs straight.
 */
export const laid = (commits: readonly Node[]): readonly Row[] =>
  commits.reduce<{ readonly rows: readonly Row[]; readonly lanes: readonly Lane[] }>(
    (state, commit) => {
      const above = state.lanes
      const waiting = above.indexOf(commit.sha)
      const lane = waiting === -1 ? freeIn(above) : waiting
      const met = above.map((each) => (each === commit.sha ? undefined : each))
      const carried = setAt(met, lane, commit.parents[0])
      const below = withoutTrailingFree(
        commit.parents
          .slice(1)
          .reduce((lanes, parent) => (lanes.includes(parent) ? lanes : setAt(lanes, freeIn(lanes), parent)), carried),
      )
      return {
        rows: [...state.rows, { sha: commit.sha, parents: commit.parents, lane, above, below }],
        lanes: below,
      }
    },
    { rows: [], lanes: [] },
  ).rows

/** A straight line within one row, from one lane to another, top (0) to bottom (1). */
export interface Stroke {
  readonly from: { readonly lane: number; readonly y: 0 | 0.5 }
  readonly to: { readonly lane: number; readonly y: 0.5 | 1 }
  /** Which lane it belongs to, for its colour. */
  readonly of: number
}

/**
 * The lines one row is drawn with.
 *
 * Above the commit: every line arriving either runs on down, or — if it was
 * waiting for this commit — bends into it. Below: the commit's own line runs
 * out of it into every column now waiting for one of its parents, and every
 * line that only passes by carries straight on.
 */
export const strokes = (row: Row): readonly Stroke[] => {
  const arriving = row.above.flatMap((waiting, lane): readonly Stroke[] =>
    waiting === undefined
      ? []
      : waiting === row.sha
        ? [{ from: { lane, y: 0 }, to: { lane: row.lane, y: 0.5 }, of: lane }]
        : [{ from: { lane, y: 0 }, to: { lane, y: 0.5 }, of: lane }],
  )
  const passingBy = (lane: number): boolean =>
    lane !== row.lane && row.above[lane] !== undefined && row.above[lane] !== row.sha
  const leaving = row.below.flatMap((waiting, lane): readonly Stroke[] => {
    if (waiting === undefined) return []
    const straight: readonly Stroke[] = passingBy(lane)
      ? [{ from: { lane, y: 0.5 }, to: { lane, y: 1 }, of: lane }]
      : []
    const fromHere =
      lane === row.lane || (row.parents.includes(waiting) && !(passingBy(lane) && waiting === row.parents[0]))
    const bent: readonly Stroke[] = fromHere
      ? [{ from: { lane: row.lane, y: 0.5 }, to: { lane, y: 1 }, of: lane }]
      : []
    return [...straight, ...bent]
  })
  return [...arriving, ...leaving]
}

/** How many columns a row needs, so every row of a graph can be drawn to the same width. */
export const widthOf = (rows: readonly Row[]): number =>
  Math.max(1, ...rows.map((row) => Math.max(row.above.length, row.below.length, row.lane + 1)))
