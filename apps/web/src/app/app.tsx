import type { ParentProps } from "solid-js"
import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import { useLocation, useNavigate } from "@solidjs/router"
import { Dynamic } from "solid-js/web"
import { getOrUndefined } from "~/core/lib/monad"

import { ActivityBar, AuxPanel, Shell, SidePanel, TitlesBar, type ActivityItem } from "~/core/lib/solid-workbench-ui"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/core/components/ui/tooltip"
import { Button } from "~/core/components/ui/button"
import { ChevronLeftIcon, DownloadIcon, FileCodeIcon, RefreshIcon, PanelLeftIcon, PlusIcon, SparklesIcon } from "~/core/lib/ui/icons"
import { FOOT, NAV, railOf, viewAt } from "./views"
import type { View } from "~/edition/types"
import { appName } from "~/edition"
import { journal, reopenKept } from "~/core/journal/store"
import { handOver } from "~/core/journal/handover"
import { searchFor, useQuery } from "~/core/journal/query"
import { AiChat } from "~/core/components/ai-chat"
import { ProposalReview } from "~/core/components/proposal-review"
import { sending } from "~/core/ai/store"
import { createRenewal } from "~/core/lib/renewal"
import { Searching } from "~/core/lib/ui/searching"
import { underReview } from "~/core/journal/proposals"
import { showed, wantedQuery } from "~/core/journal/showing"
import { ComposePanel } from "~/core/compose/ComposePanel"
import { EntryEditor } from "~/core/compose/EntryEditor"
import { editing, stopEditingEntry } from "~/core/compose/editing"
import { dock, type InTheDock } from "~/core/dock"
import { narrow, overHalf, viewportWidth } from "~/core/lib/narrow"
import { actionFor } from "~/core/lib/shortcuts"
import { ShortcutsHelp } from "~/core/components/shortcuts-help"
import { BookSwitcher } from "~/core/components/book-switcher"
import { t } from "~/core/i18n"

/** What the dock is called, by what is in it. */
const dockTitle = (showing: InTheDock | undefined): string => {
  switch (showing) {
    case "editing":
      return t("edit.title")
    case "reviewing":
      return t("propose.title")
    case "chatting":
      return t("ai.dock")
    case "composing":
    case undefined:
      return t("compose.title")
  }
}

/**
 * The one place a panel's width is animated.
 *
 * The shell leaves this to whoever uses it, since a neighbour that redraws — a
 * canvas, a map — would flicker for the length of the slide. Nothing here does,
 * so both panels get the same short slide, and anyone who has asked for less
 * motion gets none.
 */
const SLIDE = "transition-[width] duration-150 ease-out motion-reduce:transition-none"

/**
 * No panel may be wider than the window.
 *
 * A panel that overflows has its far edge, and whatever sits on it, pushed off
 * screen — for the composer that is the button which closes it, leaving no way
 * back. Given as a function so it follows a window being resized.
 *
 * One pixel short of the window, because a panel lays out its splitter beside
 * itself and that line has to land somewhere.
 */
const withinWindow = (): number => Math.max(1, viewportWidth() - 1)

/**
 * The rail and the explorer at rest, and the line they must not both cross.
 *
 * Written as what the two of them settle at rather than what they currently
 * measure, so that dragging the explorer past half a desktop window does not
 * snap it to the whole of one and pin it there with no way back. See `overHalf`.
 */
const RAIL = 48
const EXPLORER = 260

/** The rail's own edge, and the explorer's splitter: a line each. */
const EDGES = 2

export function Layout(props: ParentProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useQuery()
  const [railExpanded, setRailExpanded] = createSignal(false)
  /**
   * Where the list and the work cannot share the window, the work is what this
   * opens on.
   *
   * Otherwise there is no first screen: the list has the window, and whatever
   * the work was going to say — including the offer of a journal to somebody who
   * has none yet — is behind it with no way through, since the way through is
   * choosing something from a list that has nothing in it.
   */
  const [railVisible, setRailVisible] = createSignal(!overHalf(RAIL + EXPLORER))
  const [panelOpen, setPanelOpen] = createSignal(!overHalf(RAIL + EXPLORER))

  const chromeShowing = (): boolean => railVisible() || panelOpen()

  /**
   * Whether the left of the window is a screen of its own.
   *
   * Where the rail and the explorer together would take more than half of what
   * there is, they take all of it instead and the work goes behind them —
   * because a window that narrow was never going to show both, and pretending
   * otherwise leaves the work in a column too thin to read. Nothing here asks
   * what kind of device this is.
   */
  const snapped = (): boolean => overHalf(RAIL + EXPLORER)

  /** What the explorer is pinned to when it has the window to itself. */
  const wholeWindow = (): number => Math.max(1, viewportWidth() - RAIL - EDGES)

  /**
   * The list has done its job, so the work is what to look at.
   *
   * Everything in the list that leads somewhere calls this: choosing an account,
   * and going to the text behind the journal. Only where the two cannot share
   * the window — with room for both, a choice is a filter and nothing moves.
   */
  const showTheWork = (): void => {
    if (!snapped()) return
    setRailVisible(false)
    setPanelOpen(false)
  }

  /**
   * Choosing in the explorer is one change of address, not two.
   *
   * The query and the page it applies to are set together. Set one after the
   * other they are two navigations in a tick, and the router keeps only the last
   * of them, so the query would be dropped by the page that followed it.
   *
   * The page is the view the explorer belongs to, which is not always the one on
   * screen. An inner page borrows its rail's explorer — the journal's own text
   * sits under the account list and has no use for what the list sets — and
   * there, choosing did nothing at all: the query changed behind a page that
   * does not read it, and the only way out was the one small switch that led in.
   * So choosing is the way out as well.
   *
   * Leaving a page is going back to another one, so it is pushed; narrowing the
   * page already open is not going anywhere, and pushing there would make every
   * account tried a step to be pressed back through.
   *
   * The settings explorer chooses a section rather than a query and takes its own
   * address there, so it hands up nothing and nothing here moves.
   */
  const chose = (chosen?: string): void => {
    if (chosen !== undefined) {
      const view = railOf(current())
      navigate(view + searchFor(chosen), { replace: view === location.pathname })
    }
    showTheWork()
  }

  /**
   * The title bar's button works on the chrome as a whole, both rails at once,
   * so one press clears everything away from the books and the next brings it
   * all back.
   */
  const toggleChrome = (): void => {
    const bringBack = !chromeShowing()
    setRailVisible(bringBack)
    setPanelOpen(bringBack)
  }

  /**
   * Selecting a view opens the explorer beside it; selecting the view already
   * shown folds the explorer away, which is what the icon rail does in the
   * editor this shell is shaped after.
   *
   * The query travels along. It belongs to the books being looked at rather than
   * to the report looking at them, so changing report must not drop it.
   */
  const select = (href: string): void => {
    if (location.pathname === href) {
      setPanelOpen((open) => !open)
      return
    }
    setPanelOpen(true)
    navigate(href + location.search)
  }

  /**
   * Asked for once an hour and whenever the app comes back to the front, which
   * on a phone is the nearest thing there is to being started.
   */
  const renewal = createRenewal(60 * 60 * 1000)

  /**
   * A proposal takes the dock when whatever wrote it has stopped writing — and
   * not when the conversation has the dock, because the conversation shows it
   * already.
   *
   * Taking it there would put the reasoning behind the thing it produced, which
   * is the one place a reader needs both: what was proposed, and what was said
   * about it. Anything proposing without a conversation on screen — a script, a
   * test, a statement read while the panel was lent elsewhere — has nowhere
   * else to be seen, so it still asks for the dock.
   *
   * Something writing up a statement offers, reads back what it wrote, thinks
   * better of it and offers again; opening on each of those would flap through a
   * run of states nobody was asked to decide about. The one worth showing is the
   * one it stopped on.
   *
   * Nothing here puts it back once it has been closed: this runs when a proposal
   * arrives and when the writing stops, and closing is neither.
   */
  createEffect(
    on([underReview, sending], ([proposal, writing]) => {
      if (proposal === undefined) {
        if (dock.is("reviewing")) dock.close()
        return
      }
      if (!writing && !dock.is("chatting")) dock.show("reviewing")
    }),
  )

  /**
   * The entry being corrected is let go of when the dock stops showing it.
   *
   * It is held as a file and a range of lines, which is the most dangerous thing
   * to keep past the moment it is on screen: those lines go on meaning something
   * while nobody is looking at them. None of the others is a claim about where
   * in a file something sits, so none of them needs this.
   */
  createEffect(
    on(dock.showing, (showing) => {
      if (showing !== "editing" && editing() !== undefined) stopEditingEntry()
    }),
  )

  /** Whoever has the dock gives it back. Not cleared — closed. */
  const putDown = (): void => {
    dock.close()
  }

  /**
   * Opening the composer on a narrow window folds the rails away first. There is
   * not room for both, and this reuses the folding already here rather than
   * bringing in a second kind of container for small screens.
   */
  const compose = (): void => {
    if (narrow()) {
      setRailVisible(false)
      setPanelOpen(false)
    }
    dock.show("composing")
  }

  /** The dock needs the same room whichever of the three is in it. */
  const chat = (): void => {
    if (narrow()) {
      setRailVisible(false)
      setPanelOpen(false)
    }
    dock.show("chatting")
  }

  /**
   * Editing an entry is started from the journal, which does not know about the
   * rails, so the folding that opening the composer does by hand is done here
   * for it — the dock needs the same room either way.
   */
  createEffect(
    on(editing, (open) => {
      if (open === undefined || !narrow()) return
      setRailVisible(false)
      setPanelOpen(false)
    }),
  )

  /**
   * A query asked for from outside the tree lands here.
   *
   * The title bar's query is in the URL, which takes a router hook, which takes
   * being inside the tree — and a capability answering a question is not. So it
   * is left in a signal and picked up here, and cleared once it has been acted
   * on so that asking for it again is a second request.
   */
  createEffect(
    on(wantedQuery, (query) => {
      if (query === undefined) return
      setQuery(query)
      showed()
    }),
  )

  /**
   * The tab is named after the books in it.
   *
   * Two sets of books open in two tabs are otherwise the same word twice, and
   * an installed app puts this in its window as well — which is the one place
   * the switcher cannot be seen.
   */
  createEffect(() => {
    const open = getOrUndefined(journal())
    document.title = open === undefined ? appName() : `${open.source.label} — ${appName()}`
  })

  onMount(() => {
    void reopenKept()

    const onKey = (event: KeyboardEvent): void => {
      const action = actionFor(event)
      if (action === undefined) return
      event.preventDefault()
      if (action === "compose") dock.is("composing") ? dock.close() : compose()
      if (action === "chat") dock.is("chatting") ? dock.close() : chat()
      if (action === "togglePanels") toggleChrome()
      if (action === "close") putDown()
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  /** Whether the journal's own text is what is on screen. */
  const onSource = (): boolean => location.pathname === "/source"

  /** The view being shown, which is what the explorer beside it belongs to. */
  const current = (): View => viewAt(location.pathname)

  /**
   * The heading a rail button sits under, where it says it has one.
   *
   * Read at the moment the rail is drawn, so it follows the language the same
   * way the label does. Omitted rather than set to nothing when there is none,
   * since the rail draws a heading wherever the group changes and an empty
   * string is a change.
   */
  const groupOf = (entry: View): { group?: string } =>
    entry.reached.from === "rail" && entry.reached.group !== undefined
      ? { group: entry.reached.group() }
      : {}

  const buttonsFor = (entries: readonly View[]): ActivityItem[] =>
    entries.map((entry) => ({
      id: entry.href,
      label: entry.label(),
      icon: <entry.Icon class="h-5 w-5" />,
      active: railOf(current()) === entry.href,
      onSelect: () => select(entry.href),
      ...groupOf(entry),
    }))

  return (
    <>
      <Shell
        titles={
          <TitlesBar
            left={
              <>
                <button
                  type="button"
                  onClick={toggleChrome}
                  aria-label={chromeShowing() ? t("nav.hidePanels") : t("nav.showPanels")}
                  title={chromeShowing() ? t("nav.hidePanels") : t("nav.showPanels")}
                  class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <PanelLeftIcon class="h-4 w-4" />
                </button>
                {/* Whose books these are matters more than the app's own name,
                    and on a phone there is only room for one of them. */}
                <BookSwitcher
                  onAdd={() => navigate("/add")}
                  onSwitched={() => {
                    // The query belonged to the books being put down; an account
                    // it names may not exist in the ones being picked up.
                    setQuery("")
                    navigate("/")
                  }}
                />
              </>
            }
            center={
              // One query for whichever report is open, the way the hledger
              // command line takes one.
              <Show when={getOrUndefined(journal())}>
                <Searching
                  value={query()}
                  onInput={setQuery}
                  placeholder={t("journal.queryPlaceholder")}
                  label={t("journal.search")}
                />
              </Show>
            }
            right={
              <>
                {/* Ahead of everything else, and only ever there when there is
                    something to take: a newer version standing by. */}
                <Show when={renewal.waiting()}>
                  <button
                    type="button"
                    onClick={renewal.take}
                    aria-label={t("app.renew")}
                    title={t("app.renew")}
                    class="inline-flex size-6 items-center justify-center rounded text-primary transition-colors hover:bg-accent"
                  >
                    <RefreshIcon class="h-4 w-4" />
                  </button>
                </Show>
                <Show when={getOrUndefined(journal())}>
                  {(open) => (
                    <button
                      type="button"
                      onClick={() => void handOver(open().source)}
                      aria-label={t("journal.export")}
                      title={t("journal.export")}
                      class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <DownloadIcon class="h-4 w-4" />
                    </button>
                  )}
                </Show>
                {/* Last, and there whether or not a journal is open: the keys
                    work either way. */}
                <ShortcutsHelp />
              </>
            }
          />
        }
        activity={
          <ActivityBar
            class={SLIDE}
            visible={railVisible()}
            items={buttonsFor(NAV)}
            footer={buttonsFor(FOOT)}
            expanded={railExpanded()}
            onToggle={() => setRailExpanded((expanded) => !expanded)}
            // The trigger arrives already built, so Kobalte gets a wrapper to
            // attach its props and ref to. The wrapper has to be a real box:
            // display:contents would leave it nothing to measure, and the tooltip
            // would be placed at the origin and never notice the pointer leaving.
            renderTooltip={(label, trigger) => (
              <Tooltip placement="right" gutter={8}>
                <TooltipTrigger as="span" class="block w-full">
                  {trigger}
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            )}
          />
        }
        panel={
          <SidePanel
            class={SLIDE}
            // Pinned rather than merely allowed: a width whose floor and ceiling
            // are the same cannot be dragged off it, which is what makes the
            // explorer take the window whole and stay there.
            minWidth={() => (snapped() ? wholeWindow() : 168)}
            maxWidth={() => (snapped() ? wholeWindow() : withinWindow())}
            open={panelOpen()}
            header={
              <>
                <span>{current().label()}</span>
                {/* One group at the far end, so the two ways of writing sit
                    together rather than being spread across the heading. */}
                <div class="flex items-center gap-1">
                  <Show when={railOf(current()) === "/" && getOrUndefined(journal()) !== undefined}>
                    {/* The text behind the view being looked at, which is the
                        journal's own business rather than a view of its own.
                        A switch that shows it is on, rather than a button that
                        turns into an arrow: the rail cannot say you are here —
                        the text sits under the journal and lights the same lamp
                        — so this is the only thing on screen that can, and
                        something already lit is not something anybody presses to
                        leave. */}
                    {/* A plain button rather than the one beside it: that one
                        sets every icon inside it to 16px, and a page with code
                        on it needs the extra two to be read as one. */}
                    <button
                      type="button"
                      aria-pressed={onSource()}
                      onClick={() => {
                        navigate((onSource() ? "/" : "/source") + location.search)
                        showTheWork()
                      }}
                      aria-label={t("source.title")}
                      title={t("source.title")}
                      class="inline-flex size-6 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground"
                      classList={{
                        "bg-accent text-accent-foreground": onSource(),
                        "text-muted-foreground": !onSource(),
                      }}
                    >
                      <FileCodeIcon class="h-[18px] w-[18px]" />
                    </button>
                  </Show>
                  <Show when={current().writes && getOrUndefined(journal()) !== undefined}>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={compose}
                      aria-label={t("compose.open")}
                      title={t("compose.open")}
                      class="size-6 text-muted-foreground"
                    >
                      {/* Left unsized: Button sets any icon inside it to 16px, and a
                          smaller box here would be overflowed rather than obeyed. */}
                      <PlusIcon />
                    </Button>
                  </Show>
                  <Show when={getOrUndefined(journal()) !== undefined}>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={chat}
                      aria-label={t("ai.dock")}
                      title={t("ai.dock")}
                      class="size-6 text-muted-foreground"
                    >
                      <SparklesIcon />
                    </Button>
                  </Show>
                </div>
              </>
            }
          >
            <Dynamic component={current().Explorer} onChosen={chose} />
          </SidePanel>
        }
        aux={
          <AuxPanel
            class={SLIDE}
            initialWidth={420}
            minWidth={320}
            maxWidth={withinWindow}
            open={dock.showing() !== undefined}
            header={<span>{dockTitle(dock.showing())}</span>}
            onClose={putDown}
            closeLabel={t("compose.close")}
          >
            {/* One dock, three things beside the books: a new entry, the lines an
                existing one is written on, or a question about the lot. */}
            <Show when={dock.showing() === "editing"}>
              <EntryEditor />
            </Show>
            <Show when={dock.showing() === "reviewing"}>
              <ProposalReview />
            </Show>
            <Show when={dock.showing() === "chatting"}>
              <AiChat />
            </Show>
            <Show when={dock.showing() === "composing"}>
              <ComposePanel />
            </Show>
          </AuxPanel>
        }
      >
        {/* A column at least as tall as the screen, so a page that wants the
            height it has can take it with flex-1 — the text editor does — while
            one taller than the screen still grows and scrolls as it always
            did. */}
        <div class="flex min-h-full flex-col">
          {/* Above the work rather than in it, and only where the work is a
              screen of its own: with the rail and the explorer put away there
              is nothing else on this screen that leads back to them. Sticky,
              because the work below it scrolls. */}
          <Show when={snapped() && !chromeShowing()}>
            <button
              type="button"
              onClick={toggleChrome}
              aria-label={t("nav.back")}
              title={t("nav.back")}
              class="sticky top-0 z-10 flex h-9 w-full items-center gap-1 border-b border-border bg-background px-2 text-sm font-medium text-muted-foreground"
            >
              <ChevronLeftIcon class="h-4 w-4" />
              <span class="truncate">{current().label()}</span>
            </button>
          </Show>
          <div class="flex flex-1 flex-col p-4">{props.children}</div>
        </div>
      </Shell>
    </>
  )
}
