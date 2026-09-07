// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as T from '@symbion/runtype'

export * from './format-version.js'

// Profile connection status: true = connected, 'R' = request pending, undefined = not connected
export const tProfileConnectionStatus = T.union(T.boolean, T.literal('R'))
export type ProfileConnectionStatus = T.TypeOf<typeof tProfileConnectionStatus>

// Profile status: A = Active, B = Blocked, M = Muted, S = Suspended
export const tProfileStatus = T.literal('A', 'B', 'M', 'S')
export type ProfileStatus = T.TypeOf<typeof tProfileStatus>

// Per-profile trust preference for proxy-token authentication on passive reads.
// 'always' = always authenticate, 'never' = never authenticate, undefined/null = ask (default).
export const tProfileTrust = T.literal('always', 'never')
export type ProfileTrust = T.TypeOf<typeof tProfileTrust>

// Community role hierarchy (matches backend core/roles.rs)
export const tCommunityRole = T.literal(
	'public',
	'follower',
	'supporter',
	'contributor',
	'moderator',
	'leader'
)
export type CommunityRole = T.TypeOf<typeof tCommunityRole>

// Numeric role levels for permission comparison
export const ROLE_LEVELS: Record<CommunityRole, number> = {
	public: 0,
	follower: 1,
	supporter: 2,
	contributor: 3,
	moderator: 4,
	leader: 5
}

// ============================================================================
// PROFILE SECTIONS
// ============================================================================

// Section types available for profile about page
export const tSectionType = T.literal(
	'about',
	'contact',
	'location',
	'links',
	'work',
	'education',
	'skills',
	'rules',
	'custom'
)
export type SectionType = T.TypeOf<typeof tSectionType>

// Section visibility for personal profiles
export const tPersonalVisibility = T.literal('P', 'F', 'C')
export type PersonalVisibility = T.TypeOf<typeof tPersonalVisibility>

// Section visibility for community profiles (role-based)
export const tCommunityVisibility = T.literal(
	'P',
	'follower',
	'supporter',
	'contributor',
	'moderator',
	'leader'
)
export type CommunityVisibility = T.TypeOf<typeof tCommunityVisibility>

// Generic link icon options
export const tLinkIcon = T.literal(
	'globe',
	'mail',
	'phone',
	'map-pin',
	'code',
	'video',
	'music',
	'book',
	'briefcase',
	'heart',
	'star',
	'message',
	'rss',
	'file'
)
export type LinkIcon = T.TypeOf<typeof tLinkIcon>

// Tab configuration entry
export const tTabEntry = T.struct({
	id: T.string,
	visible: T.boolean,
	order: T.number,
	label: T.optional(T.string)
})
export type TabEntry = T.TypeOf<typeof tTabEntry>

// Tab configuration
export const tTabConfig = T.struct({
	tabs: T.array(tTabEntry),
	defaultTab: T.optional(T.string)
})
export type TabConfig = T.TypeOf<typeof tTabConfig>

// Section content types (structured sections store JSON-encoded content)
export interface ContactContent {
	email?: string
	phone?: string
	website?: string
}

export interface LinkEntry {
	label: string
	url: string
	icon?: LinkIcon
}

export interface LinksContent {
	links: LinkEntry[]
}

export interface LocationContent {
	city?: string
	country?: string
	address?: string
}

export interface WorkEntry {
	org: string
	role?: string
	from?: string
	to?: string
}

export interface WorkContent {
	entries: WorkEntry[]
}

export interface EducationEntry {
	school: string
	degree?: string
	from?: string
	to?: string
}

export interface EducationContent {
	entries: EducationEntry[]
}

export interface SkillsContent {
	tags: string[]
}

// ============================================================================
// PROFILE
// ============================================================================

export const tProfile = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	type: T.optional(T.literal('person', 'community')),
	profilePic: T.optional(T.string),
	status: T.optional(tProfileStatus),
	connected: T.optional(tProfileConnectionStatus),
	following: T.optional(T.boolean),
	follower: T.optional(T.boolean),
	trust: T.optional(tProfileTrust),
	roles: T.optional(T.array(T.string)), // Community roles (e.g., ['leader'], ['moderator'])
	// profiles.feed_read_at / msg_read_at — read watermarks. Served as ISO 8601
	// strings (like createdAt); older payloads / direct writes may be numeric
	// epoch seconds, so accept both and normalize on the client (createdAtToSeconds).
	feedReadAt: T.optional(T.union(T.string, T.number)),
	msgReadAt: T.optional(T.union(T.string, T.number)),
	// Composition control for the home feed (community profiles): true = hidden
	// from the merged home feed; absent/false = shown (the default).
	hiddenInHome: T.optional(T.boolean),
	x: T.optional(T.record(T.string))
})
export type Profile = T.TypeOf<typeof tProfile>

export const tOptionalProfile = T.nullable(tProfile)
export type OptionalProfile = T.TypeOf<typeof tOptionalProfile>

export const tActionType = T.literal(
	'CONN',
	'FLLW',
	'POST',
	'REPOST',
	'REACT',
	'CMNT',
	'SHRE',
	'MSG',
	'FSHR',
	'PRINVT',
	'SUBS'
)
export type ActionType = T.TypeOf<typeof tActionType>

export const tActionStatus = T.literal(
	'P', // Pending (draft/unpublished)
	'A', // Active (default when NULL - published/finalized)
	'D', // Deleted (soft delete)
	'C', // Created (pending approval - e.g. connection requests)
	'N', // New (notification - awaiting user acknowledgment)
	'R', // Draft (saved but not yet published)
	'S' // Scheduled (draft with confirmed publish time)
)
export type ActionStatus = T.TypeOf<typeof tActionStatus>

export const tAction = T.struct({
	actionId: T.string,
	type: T.string,
	subType: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	issuerTag: T.string,
	audienceTag: T.optional(T.string),
	content: T.optional(T.unknown),
	attachments: T.optional(T.array(T.string)),
	subject: T.optional(T.string),
	createdAt: T.number,
	expiresAt: T.optional(T.number)
})
export type Action = T.TypeOf<typeof tAction>

export const tNewAction = T.struct({
	type: T.string,
	subType: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	audienceTag: T.optional(T.string),
	content: T.optional(T.unknown),
	attachments: T.optional(T.array(T.string)),
	subject: T.optional(T.string),
	expiresAt: T.optional(T.number),
	visibility: T.optional(T.string), // 'P' = Public, 'C' = Connected, 'F' = Followers
	flags: T.optional(T.string), // Action flags (e.g. 'O' = open group on CONV)
	draft: T.optional(T.boolean), // true = save as draft (status 'R')
	publishAt: T.optional(T.number) // Unix timestamp for scheduled publishing
})
export type NewAction = T.TypeOf<typeof tNewAction>

// Profile info embedded in actions (subset of Profile)
export const tProfileInfo = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	profilePic: T.optional(T.string),
	type: T.optional(T.literal('person', 'community'))
})
export type ProfileInfo = T.TypeOf<typeof tProfileInfo>

// Explicit interface so `subjectAction` can recursively reference ActionView.
// (A plain `T.TypeOf<typeof tActionView>` cannot type a self-referential
// runtype — TS would infer `any`.)
export interface ActionView {
	actionId: string
	type: string
	subType?: string
	parentId?: string
	rootId?: string
	issuer: ProfileInfo
	audience?: ProfileInfo
	content?: unknown
	attachments?: Array<{
		fileId: string
		dim?: [number, number] | null
		localVariants?: string[]
	}>
	subject?: string
	subjectProfile?: ProfileInfo
	// Hydrated original action referenced by `subject` (e.g. the post a REPOST
	// shares). Populated by the backend listing path so the client can render
	// the embedded original card without a second fetch.
	subjectAction?: ActionView
	createdAt: string | number
	// Local ingestion time on the serving node (when this action arrived/was
	// inserted), as ISO 8601 or epoch seconds. The home feed orders and tracks
	// reads by this so late-federated posts (old createdAt, recent arrival)
	// surface correctly; single-context feeds fall back to createdAt. Absent on
	// relationship/system rows the backend doesn't stamp.
	receivedAt?: string | number
	expiresAt?: string | number
	status?: ActionStatus
	// Raw signed JWS for this action. Absent on normal feed/list payloads;
	// populated only when the list query requests it (includeTokens), so a
	// viewer can verify the action signature client-side.
	token?: string
	stat?: {
		ownReaction?: string
		reactions?: string
		// Last-comment timestamp and reader's comment-read watermark. Served as
		// ISO 8601 strings (like createdAt); accept numeric epoch seconds too and
		// normalize on the client (createdAtToSeconds). The unread comment dot is
		// `lastCommentAt > commentsReadAt`.
		lastCommentAt?: string | number
		commentsReadAt?: string | number
		commentCount?: number // Total comment count, federated as STAT `c`
		reposts?: number // Total active reposts of this action
		// Map keyed by audienceTag → repostActionId, listing every active REPOST
		// by the requesting tenant that targets this action. Enables multi-target
		// ✓-badges and the per-target "undo repost" affordance.
		ownRepostIds?: Record<string, string>
	}
	visibility?: string
	// Action flags string serialized by the backend (e.g. CONV 'O' = open group,
	// joinable without invitation). `is_open` = flags.contains('O').
	flags?: string
	// Reader's own thread-subscription level on this thread root, backed by
	// actions.sub_level (private, never federated). Absent = not subscribed.
	subLevel?: 'W' | 'T' | 'M'
	x?: unknown // Extensible metadata (x.role for SUBS, etc.)
}
export const tActionView: T.Type<ActionView> = T.struct({
	actionId: T.string,
	type: T.string,
	subType: T.optional(T.string),
	parentId: T.optional(T.string),
	rootId: T.optional(T.string),
	issuer: tProfileInfo,
	audience: T.optional(tProfileInfo),
	content: T.optional(T.unknown),
	attachments: T.optional(
		T.array(
			T.struct({
				fileId: T.string,
				dim: T.optional(T.union(T.tuple(T.number, T.number), T.nullValue)),
				localVariants: T.optional(T.array(T.string)) // Locally available variants: ["vis.tn", "vis.sd", ...]
			})
		)
	),
	subject: T.optional(T.string),
	subjectProfile: T.optional(tProfileInfo),
	subjectAction: T.optional(T.lazy((): T.Type<ActionView> => tActionView)),
	createdAt: T.union(T.string, T.number),
	receivedAt: T.optional(T.union(T.string, T.number)),
	expiresAt: T.optional(T.union(T.string, T.number)),
	status: T.optional(tActionStatus),
	stat: T.optional(
		T.struct({
			ownReaction: T.optional(T.string),
			reactions: T.optional(T.string),
			lastCommentAt: T.optional(T.union(T.string, T.number)),
			commentsReadAt: T.optional(T.union(T.string, T.number)),
			commentCount: T.optional(T.number),
			reposts: T.optional(T.number),
			ownRepostIds: T.optional(T.record(T.string))
		})
	),
	visibility: T.optional(T.string),
	flags: T.optional(T.string),
	subLevel: T.optional(T.literal('W', 'T', 'M')),
	x: T.optional(T.unknown),
	token: T.optional(T.string)
})

// Action types //
//////////////////

// User relations
export const tConnectAction = T.struct({
	type: T.literal('CONN'),
	subType: T.undefinedValue,
	content: T.optional(T.string),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.undefinedValue,
	subject: T.string
})
export type ConnectAction = T.TypeOf<typeof tConnectAction>

export const tFollowAction = T.struct({
	type: T.literal('FLLW'),
	subType: T.undefinedValue,
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.undefinedValue,
	subject: T.string
})
export type FollowAction = T.TypeOf<typeof tFollowAction>

// Posts

/** Body of a `POST` with `subType: 'LDOC'` — a reference to a live collaborative document. */
export const tLiveDocPostContent = T.struct({
	/** '<idTag>:<fileId>' — fully qualified so a federated reader can address the node
	 *  that SERVES the document without guessing. The idTag half names that node, never
	 *  an owner profile. Same grammar as a route resId. */
	doc: T.string,
	/** Picks the app bundle. Sanitised by `shellEmbedAppName` before it reaches a URL. */
	contentType: T.string,
	/** fileName at post time. Display fallback when the row cannot be fetched. */
	title: T.optional(T.string),
	/** The author's commentary — the prose half of the post. */
	text: T.optional(T.string)
})
export type LiveDocPostContent = T.TypeOf<typeof tLiveDocPostContent>

export const tPostAction = T.struct({
	type: T.literal('POST'),
	subType: T.string,
	/** Plain text, except for `subType: 'LDOC'`, where it is a {@link LiveDocPostContent} object. */
	content: T.union(T.string, tLiveDocPostContent),
	attachments: T.optional(T.array(T.string)),
	parentId: T.undefinedValue,
	audience: T.optional(T.string),
	subject: T.undefinedValue
})
export type PostAction = T.TypeOf<typeof tPostAction>

// Content spreading
export const tAckAction = T.struct({
	type: T.literal('ACK'),
	subType: T.undefinedValue,
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.string,
	audience: T.optional(T.string),
	subject: T.undefinedValue
})
export type AckAction = T.TypeOf<typeof tAckAction>

export const tRepostAction = T.struct({
	type: T.literal('REPOST'),
	subType: T.undefinedValue,
	content: T.optional(T.string),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.optional(T.string),
	subject: T.string // The action being shared (non-hierarchical reference, like REACT/APRV)
})
export type RepostAction = T.TypeOf<typeof tRepostAction>

export const tShareAction = T.struct({
	type: T.literal('SHRE'),
	subType: T.undefinedValue,
	content: T.optional(T.string),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.string,
	subject: T.string
})
export type ShareAction = T.TypeOf<typeof tShareAction>

// Content reactions
export const tCommentAction = T.struct({
	type: T.literal('CMNT'),
	subType: T.undefinedValue,
	content: T.string,
	attachments: T.optional(T.array(T.string)),
	parentId: T.string,
	audience: T.undefinedValue,
	subject: T.undefinedValue
})
export type CommentAction = T.TypeOf<typeof tCommentAction>

export const tReactAction = T.struct({
	type: T.literal('REACT'),
	subType: T.literal('LIKE', 'LOVE', 'LAUGH', 'WOW', 'SAD', 'ANGRY', 'DEL'),
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.string,
	audience: T.undefinedValue,
	subject: T.undefinedValue
})
export type ReactAction = T.TypeOf<typeof tReactAction>

// Federated statistics for a post (parentId).
// Emitted by the backend; never created by clients directly.
export const tStatAction = T.struct({
	type: T.literal('STAT'),
	subType: T.undefinedValue,
	content: T.struct({
		r: T.optional(T.string), // compact total+per-type, e.g. "54,L52,V2"
		c: T.optional(T.number), // total comments
		rp: T.optional(T.number) // total reposts
	}),
	attachments: T.undefinedValue,
	parentId: T.string,
	audience: T.undefinedValue,
	subject: T.undefinedValue
})
export type StatAction = T.TypeOf<typeof tStatAction>

// Messages
export const tMessageAction = T.struct({
	type: T.literal('MSG'),
	subType: T.string,
	content: T.string,
	attachments: T.optional(T.array(T.string)),
	parentId: T.optional(T.string), // CONV_id for group messages, MSG_id for replies
	audience: T.optional(T.string), // For DMs only
	subject: T.undefinedValue // Forbidden (use parentId for CONV hierarchy)
})
export type MessageAction = T.TypeOf<typeof tMessageAction>

// Conversations (group message containers)
export const tConvContent = T.struct({
	name: T.string,
	description: T.optional(T.string),
	joinMode: T.optional(T.literal('auto', 'moderated'))
})
export type ConvContent = T.TypeOf<typeof tConvContent>

export const tConvAction = T.struct({
	type: T.literal('CONV'),
	subType: T.undefinedValue,
	content: tConvContent,
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.undefinedValue,
	subject: T.optional(T.string)
})
export type ConvAction = T.TypeOf<typeof tConvAction>

// Group membership (subject = CONV id). Role lives in x.role.
export const tSubsAction = T.struct({
	type: T.literal('SUBS'),
	subType: T.optional(T.literal('DEL')),
	content: T.undefinedValue,
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.optional(T.string),
	subject: T.string // CONV id
})
export type SubsAction = T.TypeOf<typeof tSubsAction>

// Group invitation (subject = CONV id, audience = invitee)
export const tInvtAction = T.struct({
	type: T.literal('INVT'),
	subType: T.undefinedValue,
	content: T.struct({
		role: T.optional(T.string),
		groupName: T.optional(T.string),
		message: T.optional(T.string)
	}),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.string,
	subject: T.string // CONV id
})
export type InvtAction = T.TypeOf<typeof tInvtAction>

// Files
export const tFileShareAction = T.struct({
	type: T.literal('FSHR'),
	subType: T.optional(T.literal('READ', 'COMMENT', 'WRITE')),
	content: T.struct({ fileName: T.string, contentType: T.string, fileTp: T.optional(T.string) }),
	attachments: T.undefinedValue,
	parentId: T.undefinedValue,
	audience: T.string,
	subject: T.string
})

export const tBaseAction = T.taggedUnion('type')({
	// User relations
	CONN: tConnectAction,
	FLLW: tFollowAction,

	// Posts
	POST: tPostAction,
	// Content spreading
	ACK: tAckAction,
	REPOST: tRepostAction,
	SHRE: tShareAction,
	// Content reactions
	CMNT: tCommentAction,
	REACT: tReactAction,
	STAT: tStatAction,

	// Messages
	MSG: tMessageAction,
	CONV: tConvAction,
	SUBS: tSubsAction,
	INVT: tInvtAction,

	// Files
	FSHR: tFileShareAction
})
export type BaseAction = T.TypeOf<typeof tBaseAction>

// ============================================
// APP MANIFEST
// ============================================

// App kinds
export const tAppKind = T.literal('internal', 'bundled', 'installed')
export type AppKind = T.TypeOf<typeof tAppKind>

// Well-known capabilities
export const tAppCapability = T.literal(
	'storage',
	'settings',
	'crdt',
	'rtdb',
	'camera',
	'sensor',
	'media',
	'document',
	'embed',
	'notification'
)
export type AppCapability = T.TypeOf<typeof tAppCapability>

// Well-known content type actions
export const tContentTypeAction = T.literal('view', 'edit', 'create')
export type ContentTypeAction = T.TypeOf<typeof tContentTypeAction>

// Import source declaration — external MIME types an app can convert from
export const tImportSource = T.struct({
	mimeType: T.string,
	label: T.string,
	extensions: T.optional(T.array(T.string))
})
export type ImportSource = T.TypeOf<typeof tImportSource>

// Full-text index manifest: what an app declares it wants indexed for a content
// type it owns. The backend (`crates/cloudillo-search/src/rules.rs`) is the
// authority — it re-validates every manifest at registration and rejects unknown
// keys; these types only move the mistake to compile time.

// One text source inside a document: a bare dotted path, or the same path with
// extraction options.
//
// `extract: 'text'` (default) walks the selected node and takes every string leaf;
// `extract: 'string'` takes the node verbatim, skipping it unless it is a string.
// Walk modifiers: `keys` allowlists the object keys carrying prose (strings under
// no key — array elements and the selected node itself — are always kept, and
// containers always descended, so a document with dynamic keys still reaches its
// text); `excludeKeys` drops whole subtrees by key; `prefixKeys` prefixes the
// strings under a named key; `prefix` prefixes every token the rule emits and is
// the only form that survives `extract: 'string'` or a selector landing on the
// value itself.
//
// `keys` gates by *name*, so it cannot reach a value nothing names — the part
// rule's `prune` gates by *position* and covers that case.
//
// Rules within one list are extracted in declaration order into one buffer, so one
// prose stream must stay one rule; splitting it scrambles reading order. Give
// metadata (tags, captions) its own rule — it merely trails the text.
export const tIndexFieldRule = T.union(
	T.string,
	T.struct({
		// Dotted path, or an RFC 9535 JSONPath query (leading `$`).
		path: T.optional(T.string),
		// Deprecated alias for `path`, kept because stored manifests use it.
		field: T.optional(T.string),
		extract: T.optional(T.literal('text', 'string')),
		keys: T.optional(T.array(T.string)),
		excludeKeys: T.optional(T.array(T.string)),
		prefix: T.optional(T.string),
		prefixKeys: T.optional(T.record(T.string)),
		maxDepth: T.optional(T.number)
	})
)
export type IndexFieldRule = T.TypeOf<typeof tIndexFieldRule>

// One collection's rule. Without `attachTo` it emits one index row per document
// (`kind` names the RTDB collection). With `attachTo` it emits nothing of its
// own — its text folds into the owning part's body, which is what makes a hit
// deep-link to the page rather than to the whole file.
export const tIndexPartRule = T.struct({
	kind: T.string,
	attachTo: T.optional(T.struct({ kind: T.string, field: T.string })),
	// Field recorded as the row's anchor. `'docId'` means the document's own
	// RTDB id, which is the only way to name it — ids are keys, not fields.
	anchor: T.optional(T.string),
	order: T.optional(T.array(T.string)),
	parent: T.optional(T.string),
	// RFC 9535 queries whose matches are deleted from a document of this kind
	// before `title` / `body` / `tags` see it. Deletion-only: it can shorten the
	// indexed text, never reorder or invent any.
	//
	// The only way to drop a value nothing names: notillo stores a styled run as
	// the positional tuple `['szöveg', 'b']`, both slots under one enclosing key,
	// so no `keys` allowlist can separate the prose from the style flag — but
	// `$..c[0:][1:]` names the tail slot directly.
	//
	// Prefer the slice `[0:]` to the wildcard `[*]`: a slice is inert on anything
	// that is not an array, a wildcard descends objects too. A notillo table block
	// keeps an *object* under the same `c` key an inline block uses for its array,
	// so `[*]` would descend it, reach `rows`, and delete every row but the first.
	//
	// A pattern not starting with `$`, and the bare `$` (which would null the whole
	// document), are refused at registration. Max 8 per part.
	prune: T.optional(T.array(T.string)),
	title: T.optional(T.array(tIndexFieldRule)),
	body: T.optional(T.array(tIndexFieldRule)),
	tags: T.optional(T.array(tIndexFieldRule))
})
export type IndexPartRule = T.TypeOf<typeof tIndexPartRule>

export const tIndexRules = T.struct({
	v: T.optional(T.number),
	parts: T.array(tIndexPartRule),
	// Guard rails. The server clamps these to its own ceilings rather than
	// failing, and truncates rather than refusing to index.
	limits: T.optional(
		T.struct({
			maxParts: T.optional(T.number),
			maxBodyChars: T.optional(T.number),
			maxTotalChars: T.optional(T.number)
		})
	)
})
export type IndexRules = T.TypeOf<typeof tIndexRules>

// Island registry (site builder)
// ------------------------------
// A published page is inert HTML except for marked elements — islands — which the
// shell mounts a live component into. The declaration below is the same kind of
// contract as `tIndexRules` above: runtype-validated and versioned, so one process
// can act on another app's blocks without running that app's code.
//
// Only the *declaration* lives here. The built-in declarations, the props
// extraction and the `data-*` attributes are `@cloudillo/core`'s `site-islands.ts`;
// the component table is the shell's `site/island-registry.tsx`.

// How the island is mounted, which changes the mechanics:
//   replace = the publisher emits a placeholder and mounting swaps it out
//   enhance = the static markup stays (so it works with JS off) and mounting only
//             attaches behaviour to it
export const tSiteIslandKind = T.literal('replace', 'enhance')
export type SiteIslandKind = T.TypeOf<typeof tSiteIslandKind>

// Closed set of placeholder shapes the publisher may emit for an app-declared
// island. A closed enum and not an HTML template: a template would be third-party
// HTML injected into the site owner's own origin, needing a sanitizer and an
// escaping contract of its own.
//   box    = a bordered block of a fixed height, with a label
//   media  = a poster image plus a label
//   inline = a span inside a text run
export const tSiteIslandShape = T.literal('box', 'media', 'inline')
export type SiteIslandShape = T.TypeOf<typeof tSiteIslandShape>

export const tSiteIslandSpec = T.struct({
	// Block type this applies to, in its long spelling (`documentEmbed`).
	blockType: T.string,
	kind: tSiteIslandKind,
	shape: tSiteIslandShape,
	// Dot paths into the block record parameterizing the placeholder shape, e.g.
	// `pr.name`. The shape is ours, the data is the app's.
	labelFrom: T.optional(T.string),
	heightFrom: T.optional(T.string),
	posterFrom: T.optional(T.string),
	// Names of the block's own props (entries of its `pr` map) copied into the
	// island's `data-props`. Scalars only — an object or an array is dropped.
	props: T.optional(T.array(T.string)),
	// Which of `props` carry a URL. Declarative only — the check happens where the
	// value lands, in the shell's island components, which are the side that knows
	// a `src` from an ordinary string. The publisher writes them out unchanged.
	hrefProps: T.optional(T.array(T.string)),
	// App whose iframe renders it live. Left unset in a manifest — the shell's
	// collection point stamps the declaring app's id in.
	appId: T.optional(T.string)
})
export type SiteIslandSpec = T.TypeOf<typeof tSiteIslandSpec>

// Version of the island contract, separate from `tContentTypeHandler.formatVersion`
// (which versions the search rules and drives reindexing).
export const tSiteIslandRules = T.struct({
	v: T.optional(T.number),
	islands: T.array(tSiteIslandSpec)
})
export type SiteIslandRules = T.TypeOf<typeof tSiteIslandRules>

// Part addressing (search hits into static files)
// -----------------------------------------------
// `tContentTypeHandler.navParam` says how a *document's* parts are deep-linked
// through the declaring app. The declaration below says how a *static file's*
// parts are addressed when there is no app in the loop: an `objTp: 'F'` search
// hit carries a `partId` — a site container's page, a PDF's page — and the
// client resolves it through the hit's `contentType`. So the search crate keeps
// no content-type table of its own, and making a new format part-addressable is
// a manifest change rather than a server change.

// What a `partId` of this content type is:
//   sitePath   = a site-absolute URL path (`/blog/hello`, or `/` at a root
//                mount), resolvable against the host the hit's `ownerTag` names
//                with no manifest lookup
//   pageNumber = a 1-based page ordinal within the file
//   appNav     = a key only the declaring app can resolve, deep-linked through
//                `navParam` — the behaviour that predates this declaration,
//                spelled out so one rule covers every hit carrying a `partId`
export const tPartAddressingKind = T.literal('sitePath', 'pageNumber', 'appNav')
export type PartAddressingKind = T.TypeOf<typeof tPartAddressingKind>

// Version of the part-addressing contract, separate from
// `tContentTypeHandler.formatVersion` (which versions the search rules and
// drives reindexing).
export const tPartAddressing = T.struct({
	v: T.optional(T.number),
	kind: tPartAddressingKind
})
export type PartAddressing = T.TypeOf<typeof tPartAddressing>

// Content type handler
export const tContentTypeHandler = T.struct({
	mimeType: T.string,
	actions: T.optional(T.array(T.string)),
	priority: T.optional(T.string),
	importFrom: T.optional(T.array(tImportSource)),
	// Where documents of this type live, so the indexer knows how to read one.
	storeTp: T.optional(T.literal('RTDB', 'CRDT', 'BLOB')),
	// Launch param a search hit deep-links through, e.g. `'nav'` for notillo's
	// `cl:notillo/<owner>:<fileId>?nav=<pageId>`.
	navParam: T.optional(T.string),
	// How a search hit's `partId` into a *file* of this type is addressed — the
	// static-file counterpart of `navParam` right above. Absent means files of
	// this type have no addressable parts, so a `partId` on such a hit is not
	// resolvable and the whole file is the target.
	parts: T.optional(tPartAddressing),
	// Version of the search-index contract in `search` below, `major.minor.patch`
	// with each component 0-999. Bump it whenever `search` changes: the server
	// orders registrations by it and ignores any older than what it already holds.
	// Not `tAppManifest.version` (the app's own release version), which must not be
	// used here.
	formatVersion: T.optional(T.string),
	// Declaring this claims the content type's search index for this app. Only
	// one app per tenant may hold a claim; see the shell's format handler.
	search: T.optional(tIndexRules),
	// Block types of this content type that a published page mounts live. A
	// declaration for a block type `@cloudillo/core` already knows is ignored:
	// built-ins win, so an app cannot flip `image` from `enhance` to `replace`.
	islands: T.optional(tSiteIslandRules)
})
export type ContentTypeHandler = T.TypeOf<typeof tContentTypeHandler>

// Launch mode — a broad declaration of how the app can be started
export const tLaunchMode = T.struct({
	id: T.string,
	label: T.string,
	description: T.optional(T.string),
	accept: T.optional(T.array(T.string)),
	translations: T.optional(
		T.record(
			T.struct({
				label: T.optional(T.string),
				description: T.optional(T.string)
			})
		)
	)
})
export type LaunchMode = T.TypeOf<typeof tLaunchMode>

// Main app manifest
export const tAppManifest = T.struct({
	// Core identity
	id: T.string,
	name: T.string,
	// The app's own release version (`pkg.version`), *not* the version of any
	// document format it declares — see `tContentTypeHandler.formatVersion`.
	version: T.string,
	kind: tAppKind,
	// Publisher id_tag, recorded as the `publisherTag` of every doc format this
	// manifest declares. Omitted by the apps this build ships, for which the
	// backend defaults to `cloudillo.org`.
	publisher: T.optional(T.string),

	// Loading (external/bundled apps)
	url: T.optional(T.string),

	// Display
	icon: T.optional(T.string),
	description: T.optional(T.string),
	translations: T.optional(
		T.record(
			T.struct({
				name: T.optional(T.string),
				description: T.optional(T.string)
			})
		)
	),

	// Content type handling
	contentTypes: T.optional(T.array(tContentTypeHandler)),

	// Launch modes
	launchModes: T.optional(T.array(tLaunchMode)),

	// Menu hint (default order for initial menu config; undefined = not in menu)
	defaultOrder: T.optional(T.number),

	// Bus capabilities this app uses
	capabilities: T.optional(T.array(T.string)),

	// Extensibility
	meta: T.optional(T.record(T.unknown))
})
export type AppManifest = T.TypeOf<typeof tAppManifest>

// ============================================
// FULL-TEXT SEARCH
// ============================================

// What kind of object a hit points at.
//   F = file, D = a part inside a document, A = action, P = profile
export const tSearchObjType = T.literal('F', 'D', 'A', 'P')
export type SearchObjType = T.TypeOf<typeof tSearchObjType>

/**
 * A highlighted range within a snippet, as **UTF-16 code-unit** offsets — the
 * unit `String.prototype.slice` takes, so a range can be sliced out of the
 * snippet directly.
 */
export const tSearchMatch = T.struct({
	start: T.number,
	end: T.number
})
export type SearchMatch = T.TypeOf<typeof tSearchMatch>

// One result from `GET /api/search`. A hit with a `partId` is resolved through
// its `contentType`, whose handler's `parts` declaration says what the `partId`
// means — `appNav` builds the portable reference
// `cl:{appId}/{ownerTag}:{objId}?{navParam}={partId}` the shell already
// resolves, `sitePath` is a link to the path itself. One rule, every part type.
// Absent fields are omitted by the server, never sent as null.
export const tSearchHit = T.struct({
	objTp: tSearchObjType,
	// fileId, actionId or idTag, depending on `objTp`. For `'D'` it is the
	// containing document's fileId.
	objId: T.string,
	// Deep-link key within the document — for notillo, the page id.
	partId: T.optional(T.string),
	partKind: T.optional(T.string),
	parentPart: T.optional(T.string),
	// Finest-grained anchor inside the part — for notillo, the block id.
	anchorId: T.optional(T.string),
	appId: T.optional(T.string),
	navParam: T.optional(T.string),
	contentType: T.optional(T.string),
	title: T.optional(T.string),
	// Server-built excerpt, plain text. No markup: the highlight travels out of
	// band in `snippetMatches`, because an in-band marker is ambiguous with a
	// document that contains that marker literally.
	snippet: T.optional(T.string),
	// Ranges within `snippet` to emphasise, ascending and non-overlapping.
	snippetMatches: T.optional(T.array(tSearchMatch)),
	tags: T.optional(T.array(T.string)),
	ownerTag: T.optional(T.string),
	// The profile's picture file id — `'P'` hits only. Resolves against the
	// PROFILE's own node: getFileUrl(hit.objId, hit.profilePic, 'vis.pf').
	profilePic: T.optional(T.string),
	updatedAt: T.string,
	// Higher is more relevant.
	score: T.number
})
export type SearchHit = T.TypeOf<typeof tSearchHit>

export const tSearchQuery = T.struct({
	q: T.string,
	// Comma-separated subset of `file,doc,action,profile`.
	type: T.optional(T.string),
	// Confine the search to one document and its parts.
	fileId: T.optional(T.string),
	contentType: T.optional(T.string),
	// Comma-separated tags, AND-combined. Applied inside the full-text match
	// rather than to its results, so a text+tag query cannot lose a hit that
	// ranks below the relevance cut. With `tags` set, `q` may be empty.
	tags: T.optional(T.string),
	limit: T.optional(T.number),
	offset: T.optional(T.number)
})
export type SearchQuery = T.TypeOf<typeof tSearchQuery>

// A registered document-format manifest, as returned by `GET /api/doc-formats`.
export const tDocFormat = T.struct({
	contentType: T.string,
	publisherTag: T.string,
	appName: T.string,
	formatVersion: T.optional(T.number),
	storeTp: T.optional(T.string),
	navParam: T.optional(T.string),
	// Same validator as `tContentTypeHandler.search`. Both tiers were already
	// checked against the backend's own copy of these rules — a tenant row at PUT,
	// a bundled default at registry load — so enforcing the schema here rejects
	// only what would have failed at use anyway.
	search: T.optional(tIndexRules),
	x: T.optional(T.unknown),
	updatedAt: T.string,
	// Which tier the listing resolved this from: `'tenant'` for a row this tenant
	// owns (deletable, reverting to the bundled default) or `'bundled'` for what
	// the server build ships. Only `GET /doc-formats` sets it.
	source: T.optional(T.literal('tenant', 'bundled'))
})
export type DocFormat = T.TypeOf<typeof tDocFormat>

// Site builder
// ============

// Whether the site is served. A = Active (served), D = Disabled (configured but dark).
// Mirrors backend crates/cloudillo-types/src/meta_adapter.rs::Site::status, a char(1)
// column following the repo's single-letter status convention.
export const tSiteStatus = T.literal('A', 'D')
export type SiteStatus = T.TypeOf<typeof tSiteStatus>

const SAFE_HREF_SCHEME = /^(?:https?:|mailto:)/i

/** Whether the string holds a C0 control character or DEL, anywhere in it. */
function hasControlChar(s: string): boolean {
	for (const ch of s) {
		const c = ch.codePointAt(0) as number
		if (c < 0x20 || c === 0x7f) return true
	}
	return false
}

/**
 * Href allowlist: `http:`, `https:`, `mailto:`, and relative or same-page targets.
 * Anything else — `javascript:`, `data:`, a scheme we have not thought about —
 * yields `undefined`, and the caller renders the link's text without an anchor.
 *
 * `//host` and `/\host` are rejected despite starting with a slash: both are
 * protocol-relative, so they leave the site while reading like a local path. An
 * author who means another site can write `https:` and be explicit about it.
 *
 * An href holding a C0 control character or DEL is rejected outright, wherever it
 * sits — the comment on the guard below says why the edges are not enough.
 */
export function safeHref(href: unknown): string | undefined {
	if (typeof href !== 'string') return undefined
	const trimmed = href.trim()
	if (!trimmed) return undefined
	// Browsers strip tab, LF and CR from anywhere in a URL, not just its edges, so
	// `trim()` is not enough: `/\t/evil.example/x` walks past both guards below and
	// then resolves off-site. Refuse the whole class rather than try to out-guess the
	// parser — a control character in an href is never legitimate.
	if (hasControlChar(trimmed)) return undefined
	if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return undefined
	if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed
	return SAFE_HREF_SCHEME.test(trimmed) ? trimmed : undefined
}

// A nav target, refused unless `safeHref` above accepts it.
//
// It lives in the *validator* rather than only in the editor that writes it because a
// nav target is painted into an `href` server-side, on the site owner's own origin,
// before any JS runs — so "the settings form checked it" is not a property of the
// stored value. `PATCH /api/sites` is reachable by any leader with a token.
//
// The decoded value is the trimmed one `safeHref` returns, so a target only ever
// reaches storage in the form the allowlist judged.
//
// **What it costs, stated plainly**: refusing a target refuses the value it sits in.
// On the *write* side that is the point — `PATCH /api/sites` carries `SiteNavItem[]`
// and a list with one unvouchable target is one nobody should store. On the *read*
// side it was too much: `T.array` fails whole, so a target that reached storage out
// of band made `GET /api/sites` fail its response decode, including for the settings
// page an owner would go to in order to delete it. The read fields go through
// `tSiteNavList` below instead, which drops the entry and keeps the list.
//
// **Not a class of its own for the sake of it**: `T.string.matches()` registers an
// async *validator*, which `T.decode` does not run, and every consumer on this path
// decodes. So the check has to live in `decode`.
class SiteNavTargetType extends T.Type<string> {
	print(): string {
		return 'SiteNavTarget'
	}

	decode(u: unknown, _opts: T.DecoderOpts): T.Result<string, T.RTError> {
		const href = safeHref(u)
		return href === undefined
			? T.error('expected a relative path, #fragment, http(s): or mailto: target')
			: T.ok(href)
	}

	async validate(v: string, opts: T.DecoderOpts): Promise<T.Result<string, T.RTError>> {
		return this.validateBase(v, opts)
	}
}

export const tSiteNavTarget: T.Type<string> = new SiteNavTargetType()

// A second-level navigation entry. See `tSiteNavItem`.
//
// `target` carries the same allowlist as its parent's: a submenu link is painted into
// the same server-rendered nav.
export const tSiteNavChild = T.struct({
	label: T.string,
	target: tSiteNavTarget
})
export type SiteNavChild = T.TypeOf<typeof tSiteNavChild>

// One top-level entry in the site's main navigation.
//
// `target` is a site-absolute path (`/blog/hello`) or an absolute external URL — never a
// document or page reference. A path survives the document behind it being unpublished
// (the link 404s, which is legible) where a dangling id does not, and it needs no
// resolution step at serve time. Navigation is not routing: a target may name a path no
// document serves, and may omit one that is served.
//
// That is now **enforced** rather than promised — see `tSiteNavTarget` above. The
// backend does not yet mirror the check: `crates/cloudillo-site/src/wrapper.rs`
// (`push_nav_item`) paints the stored target into an `href` with escaping but no scheme
// allowlist, so a writer that is not a JS client can still store a `javascript:` target.
// Closing that is a backend change this repository cannot make.
//
// One level of nesting, and structurally so: `tSiteNavChild` has no children of its own.
export const tSiteNavItem = T.struct({
	label: T.string,
	target: tSiteNavTarget,
	children: T.optional(T.array(tSiteNavChild))
})
export type SiteNavItem = T.TypeOf<typeof tSiteNavItem>

/**
 * The entries of one nav level that survive, in order.
 *
 * **Depth** is capped by the shape, not by a counter: a child decodes against
 * `tSiteNavChild`, which has no `children` of its own, so a grandchild cannot
 * survive. **Targets** are free text an author typed into the settings editor,
 * reaching an `href` every anonymous reader loads from the owner's own origin — so
 * a target `safeHref` refuses takes its whole entry with it rather than being kept
 * as a bare label.
 *
 * Both readers of a stored nav share it: `tSiteNavList` below, and the shell's boot
 * seed (`shell/src/site/detect.ts`, which re-exports it as `normalizeNav`).
 */
export function normalizeSiteNav(entries: unknown[]): SiteNavItem[] {
	const nav: SiteNavItem[] = []
	for (const entry of entries) {
		// `tSiteNavChild` is exactly a nav entry's own two fields, which is why the
		// top level decodes against it too.
		const decoded = T.decode(tSiteNavChild, entry, { unknownFields: 'drop' })
		if (!T.isOk(decoded)) continue
		const target = safeHref(decoded.ok.target)
		if (!target) continue

		// Decoding got us this far, so `entry` is an object; anything but an array
		// under `children` is simply no children.
		const raw = (entry as { children?: unknown }).children
		const children: SiteNavChild[] = []
		for (const child of Array.isArray(raw) ? raw : []) {
			const decodedChild = T.decode(tSiteNavChild, child, { unknownFields: 'drop' })
			if (!T.isOk(decodedChild)) continue
			const childTarget = safeHref(decodedChild.ok.target)
			if (childTarget) children.push({ label: decodedChild.ok.label, target: childTarget })
		}
		nav.push(
			children.length
				? { label: decoded.ok.label, target, children }
				: { label: decoded.ok.label, target }
		)
	}
	return nav
}

// The stored nav, read forgivingly: one entry a newer writer or an out-of-band call
// left un-vouchable is dropped, not the whole list. `T.array(tSiteNavItem)` fails
// whole, and the page an owner would use to delete a bad entry reads through this
// same response — so refusing it locked them out of the only repair. The writer side
// is unchanged: `PATCH /api/sites` still carries `SiteNavItem[]`.
//
// A class for the same reason `tSiteNavTarget` is one: `T.string.matches()` registers
// an async *validator*, which `T.decode` does not run, and every consumer here
// decodes.
class SiteNavListType extends T.Type<SiteNavItem[]> {
	print(): string {
		return 'SiteNavList'
	}

	decode(u: unknown, _opts: T.DecoderOpts): T.Result<SiteNavItem[], T.RTError> {
		// Forgiving about the *entries*, not about the shape: a nav that is not a
		// list at all is a malformed response, not a nav with nothing in it.
		if (!Array.isArray(u)) return T.error('expected an array of nav entries')
		return T.ok(normalizeSiteNav(u))
	}

	async validate(
		v: SiteNavItem[],
		opts: T.DecoderOpts
	): Promise<T.Result<SiteNavItem[], T.RTError>> {
		return this.validateBase(v, opts)
	}
}

export const tSiteNavList: T.Type<SiteNavItem[]> = new SiteNavListType()

// A tenant's site — a per-tenant singleton, which is why it carries no id.
// There is deliberately no host field: the site host is always the tenant's app
// domain, which the backend derives, so a stored copy would drift.
export const tSite = T.struct({
	status: tSiteStatus,
	// The owner's explicit main navigation. EMPTY MEANS DERIVE: the site then falls back
	// to `SiteConfig.derivedNav`, which is what every site did before this list existed.
	// A non-empty list takes over wholesale — the two are never merged, which is what
	// makes "reset to automatic" a single clear rather than an unpicking of per-item edits.
	nav: tSiteNavList,
	createdAt: T.string,
	updatedAt: T.string
})
export type Site = T.TypeOf<typeof tSite>

// One document's participation in the site — one row per document. Written by the
// mount endpoints and by publishing: a row exists from the moment the owner adds the
// document to the site, which is why every generation field below is optional.
export const tSiteDoc = T.struct({
	docFileId: T.string,
	// The path the owner configured: `/` for the root document, `/blog` for a mount.
	// Unique within the tenant, so a path is served by exactly one document. This is
	// not necessarily what is being served — see `publishedMountPath`.
	mountPath: T.string,
	// The path the currently served container was built for. Absent while the document
	// has never published. Editing `mountPath` therefore cannot break the live site:
	// the move lands at the document's next publish, which copies one into the other.
	publishedMountPath: T.optional(T.string),
	// The container currently served. Absent between "add to site" and the first publish.
	publishedFileId: T.optional(T.string),
	// The one generation kept for rollback. Absent before the second publish.
	previousFileId: T.optional(T.string),
	// When the served generation was published. Absent on a row that has none.
	publishedAt: T.optional(T.string)
})
export type SiteDoc = T.TypeOf<typeof tSiteDoc>

// The answer of both `GET /api/sites` and `PATCH /api/sites`.
//
// `site: null` means the tenant has never configured a site — distinct from a record with
// no `/` row in `docs`, which is a site that exists and serves nothing yet.
export const tSiteConfig = T.struct({
	site: T.nullable(tSite),
	docs: T.array(tSiteDoc),
	// What the navigation would be with no explicit list: the root container's manifest
	// nav, already joined onto `/` by the server. Returned whether or not `site.nav` is
	// set, because the editor shows it as the "automatic" mode and seeds a new explicit
	// list from it. Empty when there is no published root container.
	derivedNav: tSiteNavList
})
export type SiteConfig = T.TypeOf<typeof tSiteConfig>

// The body of `POST /api/sites/mounts` — bind one document of the calling tenant to
// one site path, creating the row if it does not exist yet. Same tenant only: the
// server resolves `docFileId` tenant-scoped, so another tenant's document does not
// resolve at all. Writing this never disturbs what is currently served.
export const tSiteMountRequest = T.struct({
	docFileId: T.string,
	mountPath: T.string
})
export type SiteMountRequest = T.TypeOf<typeof tSiteMountRequest>

// The body of `DELETE /api/sites/mounts` — take a document out of the site. Allowed
// even while it is serving; its containers simply become unreferenced and are reaped.
export const tSiteUnmountRequest = T.struct({
	docFileId: T.string
})
export type SiteUnmountRequest = T.TypeOf<typeof tSiteUnmountRequest>

// Both mount endpoints answer with the whole config, like `PATCH /api/sites` does:
// a mount write is a site-configuration write, and the settings page needs the new
// list rather than the one row it changed.
export const tSiteMountResult = tSiteConfig
export type SiteMountResult = SiteConfig

// One published page, as `GET /api/sites/pages` lists it for the navigation editor's
// target picker. `path` is SITE-ABSOLUTE: the server applies the mount prefix, because a
// manifest path is container-relative and only the server knows which mount served that
// container. `archetype` is the page's layout — `page` or `post` in this build, and an
// open string, so a newer publisher's archetype arrives intact.
export const tSitePage = T.struct({
	mountPath: T.string,
	path: T.string,
	title: T.string,
	archetype: T.optional(T.string)
})
export type SitePage = T.TypeOf<typeof tSitePage>

// The answer of `GET /api/sites/pages`. Read on demand when the picker opens, never
// cached: the server opens one container per mount to build it.
export const tSitePagesResult = T.array(tSitePage)
export type SitePagesResult = T.TypeOf<typeof tSitePagesResult>

// The body of `POST /api/sites/publish`. Both ids name files of the calling tenant:
// `docFileId` the Notillo document the container was built from, `containerFileId` the
// managed zip the shell has just uploaded. The container's bytes are not re-sent — the
// server reads `_site/manifest.json` back out of the stored blob.
export const tSitePublishRequest = T.struct({
	docFileId: T.string,
	containerFileId: T.string
})
export type SitePublishRequest = T.TypeOf<typeof tSitePublishRequest>

// The answer of `POST /api/sites/publish` — the `site_doc` row as it stands after the
// generation flip, so `publishedFileId` echoes the container just committed and
// `previousFileId` names the one it displaced. `tSiteDoc` rather than a bespoke struct:
// it is the row that changed, and reusing it keeps this endpoint's answer decodable by
// anything that already reads `SiteConfig.docs`.
export const tSitePublishResult = tSiteDoc
export type SitePublishResult = SiteDoc

// The body of `POST /api/sites/rollback`. Only the document is named: a `site_doc` row
// keeps exactly two generations and rollback exchanges them, so there is no version to
// address. Because the swap is symmetric it is its own inverse — calling it twice puts
// the document back where it started, which is what makes a rollback undoable once.
export const tSiteRollbackRequest = T.struct({
	docFileId: T.string
})
export type SiteRollbackRequest = T.TypeOf<typeof tSiteRollbackRequest>

// The answer of `POST /api/sites/rollback` — the `site_doc` row after the swap, so
// `publishedFileId` names the container put back in service and `previousFileId` the one
// just displaced. `tSiteDoc` rather than a bespoke struct, for the reason above
// `tSitePublishResult`: it is the row that changed.
//
// `publishedAt` is restamped by the swap. There is only one such column, so it dates the
// generation currently served, never the generation itself — a previous entry's own
// publish time is not stored and cannot be shown.
export const tSiteRollbackResult = tSiteDoc
export type SiteRollbackResult = SiteDoc

// vim: ts=4
