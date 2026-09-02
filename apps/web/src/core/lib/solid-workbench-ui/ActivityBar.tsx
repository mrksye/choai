import { For, Show, type JSX } from 'solid-js'

/** One entry in the activity bar: a view, or a global action. */
export type ActivityItem = {
  id: string
  label: string
  icon: JSX.Element
  active?: boolean
  onSelect?: () => void
}

/**
 * The icon rail down the left edge — VSCode's activity bar. By default it is a
 * narrow, icons-only strip; clicking its right edge widens it far enough to show
 * labels, and clicking again folds it back. There is no dragging to an arbitrary
 * width: it has two fixed states. `expanded` and `onToggle` belong to the
 * caller. Knows nothing about any domain.
 *
 * The width is deliberately not animated. Put something like a WebGL map beside
 * it and every width change triggers a resize that clears the drawing buffer,
 * which reads as flickering for the whole length of the animation.
 */
export function ActivityBar(props: {
  items: ActivityItem[]
  footer?: ActivityItem[]
  expanded: boolean
  onToggle?: () => void
  collapsedWidth?: number
  expandedWidth?: number
  /** false folds it to zero width and hides it completely, drag edge and all.
   * Defaults to true. */
  visible?: boolean
  /** Classes for the outer box, which is where its width is set. Transitions
   * belong here rather than in the shell: whether a width should animate depends
   * on what sits beside it. */
  class?: string
  /**
   * Wrap a collapsed item's button so its label can be shown on hover.
   *
   * Collapsed items are icons alone, so the label has to surface somehow. The
   * shell will not choose a tooltip library on your behalf: leave this out and
   * the native `title` attribute does the job, or pass one to use whichever
   * tooltip the surrounding application already has.
   */
  renderTooltip?: (label: string, trigger: JSX.Element) => JSX.Element
}): JSX.Element {
  const visible = (): boolean => props.visible ?? true
  const navW = (): number => (props.expanded ? props.expandedWidth ?? 208 : props.collapsedWidth ?? 48)
  return (
    <div
      class={`flex shrink-0 overflow-hidden ${props.class ?? ''}`}
      style={{ width: visible() ? `${navW() + 1}px` : '0px' }}
      aria-hidden={!visible()}
    >
      <nav
        class="flex flex-col gap-0.5 overflow-hidden bg-muted px-1.5 py-2"
        style={{ width: `${navW()}px` }}
      >
        <For each={props.items}>{(item) => (
          <ActivityButton item={item} expanded={props.expanded} renderTooltip={props.renderTooltip} />
        )}</For>
        <div class="flex-1" />
        <For each={props.footer ?? []}>{(item) => (
          <ActivityButton item={item} expanded={props.expanded} renderTooltip={props.renderTooltip} />
        )}</For>
      </nav>
      <button
        type="button"
        onClick={() => props.onToggle?.()}
        aria-label={props.expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        title={props.expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        class="group relative z-10 w-px shrink-0 cursor-pointer border-none bg-border p-0"
      >
        <span class="absolute inset-y-0 -left-1 -right-1 transition-colors group-hover:bg-sky-400/40" />
      </button>
    </div>
  )
}

function ActivityButton(props: {
  item: ActivityItem
  expanded: boolean
  renderTooltip?: (label: string, trigger: JSX.Element) => JSX.Element
}): JSX.Element {
  const collapsed = (): boolean => !props.expanded

  const button = (
    <button
      type="button"
      onClick={() => props.item.onSelect?.()}
      aria-label={props.item.label}
      // Without a tooltip renderer the native title is the fallback, so a
      // collapsed rail is never a row of unlabelled icons.
      title={collapsed() && !props.renderTooltip ? props.item.label : undefined}
      class={
        'flex h-9 w-full items-center rounded-lg transition-colors ' +
        (props.expanded ? 'gap-2.5 px-2.5 ' : 'justify-center ') +
        (props.item.active
          ? 'bg-primary text-primary-foreground hover:bg-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')
      }
    >
      <span class="flex h-5 w-5 shrink-0 items-center justify-center">{props.item.icon}</span>
      <Show when={props.expanded}>
        <span class="truncate text-sm">{props.item.label}</span>
      </Show>
    </button>
  )

  const renderTooltip = props.renderTooltip
  return collapsed() && renderTooltip ? renderTooltip(props.item.label, button) : button
}
