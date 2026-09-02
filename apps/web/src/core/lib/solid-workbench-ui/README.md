# solid-workbench-ui

A **headless, VSCode-like application shell** for SolidJS. It divides one screen into the
familiar workbench regions — title bar, activity bar, side panel, main content, auxiliary
panel — with **resizable splitters** between them. It owns the *frame and the geometry*;
**you bring the content** for each region. No styling opinions beyond the skeleton, no domain.

Think of it as the [VSCode "workbench"](https://code.visualstudio.com/docs/getstarted/userinterface)
layout, extracted as a reusable Solid primitive.

## Key Features

- 🧱 **Multi-region shell** — title bar × activity rail × side panel × main × aux panel, nested in one viewport.
- 🧠 **Headless** — the shell places and resizes regions; every region's content is yours.
- ↔️ **Resizable splitters** — panel widths drag to taste, via a dependency-free `createResizable` (no external DnD lib).
- 🧩 **Composable** — pass each region as a prop (`titles` / `activity` / `panel` / `aux` / children); open/close panels reactively.
- ⚡ **SolidJS-native** — fine-grained reactivity; no re-render churn when panels resize or toggle.

> **Not** a router, a window manager, or a docking/tiling engine with draggable tabs. It is the
> fixed IDE-style shell (fixed regions, resizable borders). Solid-only by design.

## Parts

| Export | Role |
|---|---|
| `Shell` | The frame. Slots: `titles`, `activity`, `panel`, `aux`, and `children` (main). |
| `TitlesBar` / `Tab` | Top title bar and its tabs. |
| `ActivityBar` | The left icon rail (`ActivityItem[]` — id, label, icon, active, onSelect). |
| `SidePanel` | Collapsible primary panel (explorer). |
| `AuxPanel` | Collapsible secondary panel (inspector). |
| `MainContent` | The main editor region. |
| `Splitter` | A draggable border between regions. |
| `createResizable` | Headless resize primitive (`ResizeSide`); the splitter is built on it. |

## Usage

```tsx
import { Shell, ActivityBar, SidePanel, AuxPanel, TitlesBar, Tab, type ActivityItem } from '~/lib/solid-workbench-ui';

const items: ActivityItem[] = [
  { id: 'files', label: 'Files', icon: <FilesIcon />, active: true, onSelect: openFiles },
  { id: 'search', label: 'Search', icon: <SearchIcon />, onSelect: openSearch },
];

<Shell
  titles={<TitlesBar><Tab active>My Editor</Tab></TitlesBar>}
  activity={<ActivityBar items={items} expanded={false} />}
  panel={<SidePanel open>{/* explorer */}</SidePanel>}
  aux={<AuxPanel open>{/* inspector */}</AuxPanel>}
>
  {/* main content */}
</Shell>
```

## Requirements

`solid-js`, and Tailwind theme tokens in the shadcn idiom — `bg-card`, `text-muted-foreground`,
`border-border` and friends. Nothing else: no button library, no tooltip library, no icon set,
and no utility classes that have to be added to the host stylesheet.

Two things follow from that, and are worth knowing:

- **Buttons are plain `<button>` elements.** The shell styles them with the theme tokens above
  rather than importing anyone's `Button`.
- **Tooltips are yours to supply.** A collapsed `ActivityBar` is icons alone, so labels have to
  surface somehow; by default that is the native `title` attribute. Pass `renderTooltip` to use
  whichever tooltip the surrounding application already has:

  ```tsx
  <ActivityBar
    items={items}
    expanded={expanded()}
    renderTooltip={(label, trigger) => (
      <Tooltip placement="right" gutter={8}>
        <TooltipTrigger as={() => trigger} />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    )}
  />
  ```

## Status

Vendored into this repository from the author's own copy, which was extracted from the
[yamazumi](https://github.com/mrksye/yamazumi-scenario) app. **Not published to npm.**

## License

MIT © mrksye
