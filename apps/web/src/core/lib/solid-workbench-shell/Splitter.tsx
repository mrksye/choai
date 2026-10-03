import type { JSX } from 'solid-js'

/**
 * The draggable divider that stretches the panels either side of it — VSCode's
 * sash. It looks like a 1px line, but its hit area spills over on both sides so
 * it is easy to grab. `onPointerDown` comes from createResizable.
 */
export function Splitter(props: { onPointerDown: (e: PointerEvent) => void }): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      class="group relative z-10 w-px shrink-0 cursor-col-resize bg-border"
      onPointerDown={props.onPointerDown}
    >
      <div class="absolute inset-y-0 -left-1 -right-1 transition-colors group-hover:bg-sky-400/40" />
    </div>
  )
}
