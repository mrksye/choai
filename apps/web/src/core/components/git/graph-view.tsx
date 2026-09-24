import { For, Show, type JSX } from "solid-js"

import type { History } from "~/core/github/history"
import { strokes, widthOf, type Row } from "~/core/github/graph"

/**
 * The history as lanes, one row a commit, newest at the top.
 *
 * Each row draws its own slice of the lines, so the graph is as long as the
 * list and nothing has to be measured to draw it.
 */
export function GraphView(props: {
  readonly history: History
  readonly chosen: string | undefined
  readonly onChoose: (sha: string) => void
}): JSX.Element {
  const width = (): number => widthOf(props.history.rows)
  return (
    <ul class="flex flex-col">
      <For each={props.history.rows}>
        {(row) => (
          <li>
            <button
              type="button"
              onClick={() => props.onChoose(row.sha)}
              class="flex w-full items-center gap-2 pr-2 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              classList={{ "bg-accent text-accent-foreground": props.chosen === row.sha }}
            >
              <Lanes row={row} width={width()} head={props.history.heads.has(row.sha)} />
              <Summary history={props.history} row={row} />
            </button>
          </li>
        )}
      </For>
    </ul>
  )
}

const HEIGHT = 32
const LANE = 16
const x = (lane: number): number => LANE / 2 + lane * LANE

/**
 * Colours that stay apart from one another on either background, taken by
 * column in turn. Lightness and chroma are held level so no lane reads as more
 * important than another.
 */
const COLOURS = [
  "oklch(0.65 0.15 250)",
  "oklch(0.65 0.15 150)",
  "oklch(0.65 0.15 30)",
  "oklch(0.65 0.15 300)",
  "oklch(0.65 0.15 80)",
  "oklch(0.65 0.15 200)",
  "oklch(0.65 0.15 0)",
  "oklch(0.65 0.15 110)",
]
const colourOf = (lane: number): string => COLOURS[lane % COLOURS.length]

function Lanes(props: { readonly row: Row; readonly width: number; readonly head: boolean }): JSX.Element {
  return (
    <svg
      width={props.width * LANE}
      height={HEIGHT}
      viewBox={`0 0 ${props.width * LANE} ${HEIGHT}`}
      class="shrink-0"
      aria-hidden="true"
    >
      <For each={strokes(props.row)}>
        {(stroke) => (
          <line
            x1={x(stroke.from.lane)}
            y1={stroke.from.y * HEIGHT}
            x2={x(stroke.to.lane)}
            y2={stroke.to.y * HEIGHT}
            stroke={colourOf(stroke.of)}
            stroke-width="2"
          />
        )}
      </For>
      <circle
        cx={x(props.row.lane)}
        cy={HEIGHT / 2}
        r={props.head ? 5 : 4}
        fill={props.head ? "var(--background)" : colourOf(props.row.lane)}
        stroke={colourOf(props.row.lane)}
        stroke-width="2"
      />
    </svg>
  )
}

const firstLine = (message: string): string => message.split("\n")[0]

const dayOf = (at: number): string => (at === 0 ? "" : new Date(at).toLocaleDateString())

function Summary(props: { readonly history: History; readonly row: Row }): JSX.Element {
  const commit = () => props.history.commits.get(props.row.sha)
  const heads = (): readonly string[] => props.history.heads.get(props.row.sha) ?? []
  return (
    <span class="flex min-w-0 flex-1 items-center gap-2">
      <For each={heads()}>
        {(name) => (
          <span
            class="shrink-0 rounded border px-1.5 py-px text-[0.65rem] font-medium"
            classList={{ "border-primary text-primary": name === props.history.branch }}
            style={{ "border-color": name === props.history.branch ? undefined : colourOf(props.row.lane) }}
          >
            {name}
          </span>
        )}
      </For>
      <span class="min-w-0 flex-1 truncate">{firstLine(commit()?.message ?? "")}</span>
      <Show when={commit()}>
        {(known) => (
          <span class="hidden shrink-0 text-muted-foreground @md:inline">
            {known().author} · {dayOf(known().at)}
          </span>
        )}
      </Show>
    </span>
  )
}
