// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * `@cloudillo/react/doc-bar` — the DocBar and nothing else.
 *
 * A narrow entry point for apps that want the bar without the rest of the
 * library: the package index pulls in `hooks.tsx`, which imports
 * `react-router-dom` at module scope. Quillo has no router and should not grow
 * one just to show a document name.
 */

export type { InitialsAvatarProps } from './components/Avatar/index.js'
export { InitialsAvatar, initialsFor, monogramFor } from './components/Avatar/index.js'
export type { ButtonKind, ButtonProps } from './components/Button/index.js'
export { Button } from './components/Button/index.js'
export type {
	DocBarMenuProps,
	DocBarPresenceProps,
	DocBarProps,
	DocBarTitleProps
} from './components/DocBar/index.js'
export { DocBar, DocBarMenu, DocBarPresence, DocBarTitle } from './components/DocBar/index.js'
export type {
	MenuDividerProps,
	MenuHeaderProps,
	MenuItemProps
} from './components/Menu/index.js'
export { MenuDivider, MenuHeader, MenuItem } from './components/Menu/index.js'
export type { ToastsProps } from './components/Toast/index.js'
export { Toasts, useToast } from './components/Toast/index.js'
export type { EmbedViewSettings } from './components/ViewEmbed/sizing.js'
export {
	clampNatural,
	LAYOUT_ORIGIN,
	naturalSizeChanged,
	normalizeEmbedSettings,
	resizeSettings,
	storableNatural
} from './components/ViewEmbed/sizing.js'
// For quillo's embed blot
export type { DocViewEmbedProps } from './components/ViewEmbed/ViewEmbed.js'
export { DocViewEmbed } from './components/ViewEmbed/ViewEmbed.js'
export type { AppDocBarProps, UseDocBarReturn } from './docbar.js'
export { AppDocBar } from './docbar.js'
export { embedReportToStore, grantEmbedEditable, useCopyEmbedLink } from './embed-source.js'
export { useLibTranslation } from './i18n.js'
export type { DocPresence } from './presence.js'
export { useDocPresence } from './presence.js'
export { useDarkMode } from './theme.js'

// vim: ts=4
