/**
 * Multi-Context UI - Type Definitions
 *
 * Defines types for the multi-context architecture that enables
 * switching between user's own profile and communities.
 */

/**
 * Type of context (user's own profile or community)
 */
export type ContextType = 'me' | 'community'

/**
 * Active context information
 * Represents the currently active community or user profile
 */
export interface ActiveContext {
  /** ID tag of the context (e.g., 'alice', 'community.example') */
  idTag: string

  /** Type of context */
  type: ContextType

  /** Display name */
  name: string

  /** Profile picture URL or file ID */
  profilePic?: string

  /** User's roles in this context */
  roles: string[]

  /** User's permissions in this context */
  permissions: string[]

  /** Additional metadata */
  metadata?: Record<string, any>
}

/**
 * Reference to a community that user is a member of
 */
export interface CommunityRef {
  /** ID tag of the community */
  idTag: string

  /** Display name */
  name: string

  /** Profile picture URL or file ID */
  profilePic?: string

  /** Whether this community is favorited/pinned */
  isFavorite: boolean

  /** Number of unread notifications in this community */
  unreadCount: number

  /** Last activity timestamp */
  lastActivityAt: Date | null

  /** Number of members (optional) */
  memberCount?: number

  /** Description (optional) */
  description?: string
}

/**
 * Token data for a context
 */
export interface ContextToken {
  /** JWT token for this context */
  token: string

  /** Tenant ID */
  tnId: number

  /** Token expiration time */
  expiresAt: Date

  /** Refresh token (if available) */
  refreshToken?: string
}

/**
 * Context data cache entry
 */
export interface ContextCacheEntry {
  /** Cached data */
  data: any[]

  /** When this data was last updated */
  lastUpdated: Date
}

/**
 * Context data cache structure
 * Maps contextIdTag -> dataType -> cache entry
 */
export interface ContextDataCache {
  [contextIdTag: string]: {
    files?: ContextCacheEntry
    feed?: ContextCacheEntry
    users?: ContextCacheEntry
    gallery?: ContextCacheEntry
    [key: string]: ContextCacheEntry | undefined
  }
}

/**
 * Sidebar state
 */
export interface SidebarState {
  /** Whether sidebar is open (mobile) */
  isOpen: boolean

  /** Whether sidebar is pinned (desktop) */
  isPinned: boolean

  /** Sidebar width in pixels */
  width: number
}

/**
 * Context switch event
 */
export interface ContextSwitchEvent {
  /** Context switched from */
  from: string

  /** Context switched to */
  to: string

  /** Timestamp of the switch */
  timestamp: Date
}

/**
 * Context info response from backend
 */
export interface ContextInfo {
  /** ID tag */
  idTag: string

  /** Context type */
  type: 'user' | 'community'

  /** Display name */
  name: string

  /** Profile picture */
  profilePic?: string

  /** User's roles in this context */
  userRoles: string[]

  /** User's permissions in this context */
  userPermissions: string[]

  /** Additional metadata */
  metadata?: {
    memberCount?: number
    description?: string
    createdAt?: string
    [key: string]: any
  }
}
