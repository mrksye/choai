import type { JSX } from 'solid-js'
import { MainContent } from './MainContent'

/**
 * The VSCode-shaped layout skeleton. A TitlesBar across the top, and beneath it
 * [ActivityBar | SidePanel | Main | AuxPanel] laid out in a row — a thin frame
 * and nothing more. Every region arrives as a slot; the Shell itself holds no
 * domain and no state. It occupies exactly one screen (one screen's worth of
 * height, minus the safe area), and scrolling happens inside each region.
 */
export function Shell(props: {
  titles?: JSX.Element
  activity?: JSX.Element
  panel?: JSX.Element
  aux?: JSX.Element
  children?: JSX.Element
  /** Fired when the background of the main area is clicked directly; clicks on
   * descendants are ignored. */
  onMainBackgroundClick?: () => void
}): JSX.Element {
  return (
    <div
      class="flex flex-col overflow-hidden bg-background text-foreground"
      // One screen's height with the safe-area insets **subtracted**. Laying
      // 100dvh over a body that already avoids the insets pushes the bottom of
      // the page off-screen by exactly that much. Written inline rather than as
      // a utility class so the shell needs nothing added to the host's CSS.
      style={{ height: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }}
    >
      {props.titles}
      <div class="flex min-h-0 flex-1">
        {props.activity}
        {props.panel}
        <MainContent onBackgroundClick={props.onMainBackgroundClick}>{props.children}</MainContent>
        {props.aux}
      </div>
    </div>
  )
}
