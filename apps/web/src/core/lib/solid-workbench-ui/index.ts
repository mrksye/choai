/**
 * solid-workbench-ui — a domain-free, VSCode-like application shell for SolidJS.
 * It divides one screen into nested regions — title bar, activity bar, side
 * panel, main content, auxiliary panel — with borders you drag to resize via a
 * dependency-free `createResizable` written for the purpose. The contents, and
 * the domain, are simply injected into each region.
 */
export { Shell } from './Shell'
export { TitlesBar, Tab } from './TitlesBar'
export { ActivityBar, type ActivityItem } from './ActivityBar'
export { SidePanel } from './SidePanel'
export { AuxPanel } from './AuxPanel'
export { MainContent } from './MainContent'
export { Splitter } from './Splitter'
export { createResizable, type ResizeSide } from './resize'
export { createSlot, type Slot } from './slot'
