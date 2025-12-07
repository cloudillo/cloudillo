/**
 * Multi-Context UI - Public API
 *
 * Exports all types, atoms, and hooks for multi-context functionality.
 */

// Types
export type {
	ContextType,
	ActiveContext,
	CommunityRef,
	ContextToken,
	ContextCacheEntry,
	ContextDataCache,
	SidebarState,
	ContextSwitchEvent,
	ContextInfo
} from './types'

// Atoms
export {
	activeContextAtom,
	contextTokensAtom,
	communitiesAtom,
	favoritesAtom,
	recentContextsAtom,
	sidebarAtom,
	contextDataCacheAtom,
	lastContextSwitchAtom,
	contextSwitchingAtom,
	favoriteCommunitiesAtom,
	recentCommunitiesAtom,
	totalUnreadCountAtom
} from './atoms'

// Hooks
export {
	useApiContext,
	useCommunitiesList,
	useSidebar,
	useContextSwitch,
	useContextCache,
	useContextPath
} from './hooks'

// Context-aware API
export { useContextAwareApi } from './context-aware-api'

// Route synchronization
export { useContextFromRoute, useCurrentContextIdTag } from './use-context-from-route'

// Components
export { Sidebar } from './sidebar'

// Guest document state (for guest ref link navigation)
export { guestDocumentAtom, useGuestDocument } from './guest-document'
export type { GuestDocumentInfo } from './guest-document'
