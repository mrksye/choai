/**
 * Which of a list are ticked, as a run of clicks leaves them.
 *
 * A proposal is three entries or it is three hundred, and the difference is not
 * one of degree: three are ticked one at a time, three hundred are ticked in
 * runs, and a panel that only knows how to toggle one makes the second case
 * impossible rather than tedious.
 *
 * Held apart from the panel because it is the part with the rules in it — where
 * a run starts, which way it goes, what a shifted click does to what was already
 * there — and because those are worth checking without a browser.
 */

const spanning = (from: number, to: number): readonly number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, step) => from + step)

const toggled = (ticked: ReadonlySet<number>, at: number): ReadonlySet<number> =>
  ticked.has(at) ? new Set([...ticked].filter((one) => one !== at)) : new Set([...ticked, at])

/**
 * A click, with or without shift held.
 *
 * Plain, it toggles the one clicked, and that becomes where the next run starts
 * from. Shifted, everything between there and here is made to match how the
 * start of the run stands — so ticking one and shift-clicking another forty on
 * ticks the forty, and unticking one and shift-clicking unticks them. The run's
 * start is left alone, so a second shifted click widens or narrows the same run
 * rather than beginning a new one.
 */
export const tickedBy = (
  ticked: ReadonlySet<number>,
  anchor: number | undefined,
  at: number,
  asRun: boolean,
): ReadonlySet<number> => {
  if (!asRun || anchor === undefined) return toggled(ticked, at)

  const run = new Set(spanning(Math.min(anchor, at), Math.max(anchor, at)))
  return ticked.has(anchor)
    ? new Set([...ticked, ...run])
    : new Set([...ticked].filter((one) => !run.has(one)))
}

/** Where the next run starts from after a click. A shifted click does not move it. */
export const anchorAfter = (anchor: number | undefined, at: number, asRun: boolean): number =>
  asRun && anchor !== undefined ? anchor : at

export const allOf = (count: number): ReadonlySet<number> => new Set(spanning(0, count - 1))

export const noneOf = (): ReadonlySet<number> => new Set()
