// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Message Bus Type Definitions
 *
 * This module defines all message types for inter-frame communication
 * between shell, apps, and service worker. All messages are validated
 * at runtime using @symbion/runtype.
 */

import * as T from '@symbion/runtype'

// Protocol version - increment on breaking changes
export const PROTOCOL_VERSION = 1

// ============================================
// BASE ENVELOPE
// ============================================

/**
 * Base envelope that all messages must have
 */
export const tMessageEnvelope = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.string
})
export type MessageEnvelope = T.TypeOf<typeof tMessageEnvelope>

/** Build a message runtype with the shared envelope preamble. */
/** Equivalent of `T.struct`'s required/optional key split, for message fields. */
// biome-ignore lint/suspicious/noExplicitAny: runtype types are invariant under tsgo's strict variance; `unknown` rejects NumberType etc.
type MsgPayload<P extends Record<string, T.Type<any>>> = {
	[K in keyof P as undefined extends T.TypeOf<P[K]> ? never : K]: T.TypeOf<P[K]>
} & {
	[K in keyof P as undefined extends T.TypeOf<P[K]> ? K : never]?: T.TypeOf<P[K]>
}

/** Build a message runtype with the shared envelope preamble. */
// biome-ignore lint/suspicious/noExplicitAny: runtype types are invariant under tsgo's strict variance; `unknown` rejects NumberType etc.
function msg<T extends string, P extends Record<string, T.Type<any>>>(
	type: T,
	fields: P
): T.Type<{ cloudillo: true; v: 1; type: T } & MsgPayload<P>> {
	return T.struct({
		cloudillo: T.trueValue,
		v: T.literal(PROTOCOL_VERSION),
		type: T.literal(type),
		...fields
	}) as unknown as T.Type<{ cloudillo: true; v: 1; type: T } & MsgPayload<P>>
}

/**
 * Stamped by `setupEmbedRelay` on every message it forwards up from a nested
 * embed, and by nothing else.
 *
 * The relay reposts from the HOST app's window, so the shell sees the host as
 * the sender and resolves everything connection-scoped — resId, appName, token —
 * against the HOST's connection. This flag is the only thing distinguishing "the
 * app asked" from "something embedded inside the app asked"; handlers that must
 * not act on an embed's behalf check it (see `doc:rename.req` in the shell). The
 * relay sets it unconditionally after copying the child's message, so a child can
 * neither forge nor clear it.
 *
 * Spread into every `app>shell` struct the relay may forward: `T.struct` rejects
 * unknown fields, so an unlisted type would have its stamped message dropped
 * whole rather than merely unstamped.
 */
export const tRelayed = { relayed: T.optional(T.boolean) }

// ============================================
// MESSAGE DIRECTIONS
// ============================================

export type MessageDirection = 'app>shell' | 'shell>app' | 'shell>sw' | 'sw>shell'

// ============================================
// MESSAGE CATEGORIES
// ============================================

export type MessageCategory =
	| 'auth'
	| 'storage'
	| 'settings'
	| 'sw'
	| 'nav'
	| 'ui'
	| 'crdt'
	| 'sensor'

// ============================================
// AUTH MESSAGES
// ============================================

/**
 * App requests initialization from shell
 * Direction: app -> shell
 */
export const tAuthInitReq = msg('auth:init.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		appName: T.string,
		resId: T.optional(T.string) // Resource ID from URL hash
	})
})
export type AuthInitReq = T.TypeOf<typeof tAuthInitReq>

/**
 * Shell responds with initialization data
 * Direction: shell -> app
 */
export const tAuthInitRes = msg('auth:init.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			idTag: T.optional(T.string),
			/**
			 * Whether a real user is signed in to the shell. `idTag` alone cannot
			 * say: for a share-link guest it falls back to the context/owner tag,
			 * so a guest trusting it would publish the OWNER's identity as its own.
			 */
			authenticated: T.optional(T.boolean),
			tnId: T.optional(T.id),
			roles: T.optional(T.array(T.string)),
			theme: T.string,
			darkMode: T.optional(T.boolean),
			language: T.optional(T.string),
			token: T.optional(T.string),
			access: T.optional(T.literal('read', 'comment', 'write')),
			tokenLifetime: T.optional(T.number),
			displayName: T.optional(T.string),
			navState: T.optional(T.string),
			ancestors: T.optional(T.array(T.string)),
			params: T.optional(T.string)
		})
	),
	error: T.optional(T.string)
})
export type AuthInitRes = T.TypeOf<typeof tAuthInitRes>

/**
 * App requests token refresh
 * Direction: app -> shell
 */
export const tAuthTokenRefreshReq = msg('auth:token.refresh.req', {
	...tRelayed,
	id: T.number
})
export type AuthTokenRefreshReq = T.TypeOf<typeof tAuthTokenRefreshReq>

/**
 * Shell responds with new token
 * Direction: shell -> app
 */
export const tAuthTokenRefreshRes = msg('auth:token.refresh.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			token: T.string,
			tokenLifetime: T.optional(T.number)
		})
	),
	error: T.optional(T.string)
})
export type AuthTokenRefreshRes = T.TypeOf<typeof tAuthTokenRefreshRes>

/**
 * Shell proactively pushes token update to app
 * Direction: shell -> app (notification, no response expected)
 */
export const tAuthTokenPush = msg('auth:token.push', {
	payload: T.struct({
		token: T.string,
		tokenLifetime: T.optional(T.number)
	})
})
export type AuthTokenPush = T.TypeOf<typeof tAuthTokenPush>

/**
 * Shell proactively pushes initialization data to app
 * Direction: shell -> app (notification, no response expected)
 *
 * Used when shell initializes app before app requests init.
 */
export const tAuthInitPush = msg('auth:init.push', {
	payload: T.struct({
		idTag: T.optional(T.string),
		/** See `tAuthInitRes` — a guest's `idTag` is the owner's, this is not. */
		authenticated: T.optional(T.boolean),
		tnId: T.optional(T.id),
		roles: T.optional(T.array(T.string)),
		theme: T.string,
		darkMode: T.optional(T.boolean),
		language: T.optional(T.string),
		token: T.optional(T.string),
		access: T.optional(T.literal('read', 'comment', 'write')),
		tokenLifetime: T.optional(T.number),
		displayName: T.optional(T.string),
		navState: T.optional(T.string),
		ancestors: T.optional(T.array(T.string)),
		params: T.optional(T.string)
	})
})
export type AuthInitPush = T.TypeOf<typeof tAuthInitPush>

// ============================================
// APP LIFECYCLE MESSAGES
// ============================================

/**
 * Loading stage for app ready notification
 */
export const tAppReadyStage = T.literal('auth', 'synced', 'ready')
export type AppReadyStage = T.TypeOf<typeof tAppReadyStage>

/**
 * App notifies shell it has reached a loading stage
 * Direction: app -> shell (notification, no response expected)
 *
 * Used to inform shell about app loading progress so it can
 * hide loading indicators at the right time.
 *
 * Stages:
 * - 'auth': App has received and processed auth data
 * - 'synced': CRDT/data sync is complete
 * - 'ready': App is fully interactive (default if no stage specified)
 */
export const tAppReadyNotify = msg('app:ready.notify', {
	...tRelayed,
	payload: T.struct({
		stage: T.optional(tAppReadyStage)
	})
})
export type AppReadyNotify = T.TypeOf<typeof tAppReadyNotify>

/**
 * App notifies shell of an error (e.g., CRDT connection failure)
 * Direction: app -> shell (notification, no response expected)
 *
 * Used to inform the shell that a critical error occurred so it can
 * display an error UI overlay instead of showing an empty document.
 */
export const tAppErrorNotify = msg('app:error.notify', {
	...tRelayed,
	payload: T.struct({
		code: T.number,
		message: T.string
	})
})
export type AppErrorNotify = T.TypeOf<typeof tAppErrorNotify>

/**
 * App pushes its current document title (and dirty flag) to the shell
 * Direction: app -> shell (notification, no response expected)
 *
 * Lets an app refine the breadcrumb title shown in the shell header beyond
 * the file name the shell pre-fetches. `dirty` marks unsaved changes so the
 * shell can show a leading `*` on the document segment.
 */
export const tAppTitlePush = msg('app:title.push', {
	payload: T.struct({
		// Omit `title` to keep the shell's prefetched file name and only update
		// the dirty flag; provide it to override the displayed title.
		title: T.optional(T.string),
		dirty: T.optional(T.boolean)
	})
})
export type AppTitlePush = T.TypeOf<typeof tAppTitlePush>

// ============================================
// STORAGE MESSAGES
// ============================================

/**
 * Storage operation types
 */
export const tStorageOp = T.literal('get', 'set', 'delete', 'list', 'clear', 'quota')
export type StorageOp = T.TypeOf<typeof tStorageOp>

/**
 * App requests storage operation
 * Direction: app -> shell
 */
export const tStorageOpReq = msg('storage:op.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		op: tStorageOp,
		ns: T.string,
		key: T.optional(T.string),
		value: T.optional(T.unknown),
		prefix: T.optional(T.string)
	})
})
export type StorageOpReq = T.TypeOf<typeof tStorageOpReq>

/**
 * Shell responds to storage operation
 * Direction: shell -> app
 */
export const tStorageOpRes = msg('storage:op.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(T.unknown),
	error: T.optional(T.string)
})
export type StorageOpRes = T.TypeOf<typeof tStorageOpRes>

// ============================================
// MEDIA PICKER MESSAGES
// ============================================

/**
 * Visibility levels for content
 * P = Public, C = Connected, F = Followers (most restrictive)
 */
export const tVisibility = T.literal('P', 'C', 'F')
export type Visibility = T.TypeOf<typeof tVisibility>

/**
 * Visibility hierarchy: lower number = more public
 */
export const VISIBILITY_ORDER: Record<Visibility, number> = {
	P: 0, // Public - most visible
	C: 1, // Connected - medium
	F: 2 // Followers - most restrictive
}

/**
 * Cropping aspect ratio presets
 */
export const tCropAspect = T.literal('16:9', '4:3', '3:2', '1:1', 'circle', 'free')
export type CropAspect = T.TypeOf<typeof tCropAspect>

/**
 * App requests media picker from shell
 * Direction: app -> shell
 */
export const tMediaPickReq = msg('media:pick.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		// Session ID for correlating ACK and result (generated by app)
		sessionId: T.string,
		// Filter by media type (MIME pattern: 'image/*', 'video/*', 'audio/*', 'application/pdf')
		mediaType: T.optional(T.string),
		// Explicit visibility level for comparison
		documentVisibility: T.optional(tVisibility),
		// Alternatively, fetch visibility from this file ID
		documentFileId: T.optional(T.string),
		// Site sources: only Public files may be picked at all. The picker disables
		// everything else and offers "Make public" instead of "Grant document access" —
		// a share grants the document, and a published page's reader is anonymous.
		requirePublic: T.optional(T.boolean),
		// Enable image cropping (images only)
		enableCrop: T.optional(T.boolean),
		// Allowed crop aspect ratios
		cropAspects: T.optional(T.array(tCropAspect)),
		// Dialog title override
		title: T.optional(T.string)
	})
})
export type MediaPickReq = T.TypeOf<typeof tMediaPickReq>

/**
 * Shell acknowledges media picker request (dialog is opening)
 * Direction: shell -> app
 *
 * This is sent immediately when the picker starts opening.
 * The actual result comes later via media:pick.result push.
 */
export const tMediaPickAck = msg('media:pick.ack', {
	replyTo: T.number,
	ok: T.boolean,
	// Optional session ID for correlating with result
	data: T.optional(
		T.struct({
			sessionId: T.string
		})
	),
	error: T.optional(T.string)
})
export type MediaPickAck = T.TypeOf<typeof tMediaPickAck>

/**
 * Shell pushes media picker result to app
 * Direction: shell -> app (notification, no response expected)
 *
 * Sent when user completes selection or cancels the picker.
 * This is a push notification, not a response, so there's no timeout.
 */
export const tMediaPickResultPush = msg('media:pick.result', {
	payload: T.struct({
		// Session ID to correlate with the original request
		sessionId: T.string,
		// Whether user selected something (false = cancelled)
		selected: T.boolean,
		// Selection data (only present if selected = true)
		fileId: T.optional(T.string),
		fileName: T.optional(T.string),
		contentType: T.optional(T.string),
		// Image dimensions [width, height] (for images only)
		dim: T.optional(T.tuple(T.number, T.number)),
		// Visibility of selected media
		visibility: T.optional(tVisibility),
		// Whether user acknowledged visibility warning
		visibilityAcknowledged: T.optional(T.boolean),
		// Cropped variant ID if cropping was applied
		croppedVariantId: T.optional(T.string)
	})
})
export type MediaPickResultPush = T.TypeOf<typeof tMediaPickResultPush>

/**
 * Shell pushes file ID resolution to app
 * Direction: shell -> app (notification, no response expected)
 *
 * Sent when a temp file ID (e.g., @123) is resolved to its final
 * content-addressed ID (e.g., f1~abc123...) after variant processing.
 */
export const tMediaFileResolvedPush = msg('media:file.resolved', {
	payload: T.struct({
		// The temporary file ID (e.g., @123)
		tempId: T.string,
		// The final content-addressed file ID (e.g., f1~abc123...)
		finalId: T.string
	})
})
export type MediaFileResolvedPush = T.TypeOf<typeof tMediaFileResolvedPush>

// ============================================
// DOCUMENT PICKER MESSAGES
// ============================================

/**
 * App requests document picker from shell
 * Direction: app -> shell
 */
export const tDocPickReq = msg('doc:pick.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		sessionId: T.string,
		fileTp: T.optional(T.string),
		contentType: T.optional(T.string),
		sourceFileId: T.optional(T.string),
		// Site sources: only Public documents may be embedded — see tMediaPickReq
		requirePublic: T.optional(T.boolean),
		title: T.optional(T.string)
	})
})
export type DocPickReq = T.TypeOf<typeof tDocPickReq>

/**
 * Shell acknowledges document picker request (dialog is opening)
 * Direction: shell -> app
 */
export const tDocPickAck = msg('doc:pick.ack', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			sessionId: T.string
		})
	),
	error: T.optional(T.string)
})
export type DocPickAck = T.TypeOf<typeof tDocPickAck>

/**
 * Shell pushes document picker result to app
 * Direction: shell -> app (notification, no response expected)
 */
export const tDocPickResultPush = msg('doc:pick.result', {
	payload: T.struct({
		sessionId: T.string,
		selected: T.boolean,
		fileId: T.optional(T.string),
		fileName: T.optional(T.string),
		contentType: T.optional(T.string),
		fileTp: T.optional(T.string),
		appId: T.optional(T.string)
	})
})
export type DocPickResultPush = T.TypeOf<typeof tDocPickResultPush>

// ============================================
// DOCUMENT INFO MESSAGES
// ============================================

/** The tenant owning a document's content. */
export const tDocOwner = T.struct({
	idTag: T.string,
	name: T.optional(T.string),
	profilePic: T.optional(T.string),
	type: T.optional(T.literal('person', 'community'))
})
export type DocOwner = T.TypeOf<typeof tDocOwner>

/**
 * Everything an app needs to name and attribute the document it is showing.
 *
 * Resolved by the shell, never by the app: a sandboxed app holds exactly one
 * token for exactly one node, while a pinned or placed foreign-owned document
 * has a row on the viewing context's node *and* an origin on the owner's node.
 *
 * Deliberately narrow — add a field back together with the UI that renders it,
 * not before.
 */
export const tDocInfo = T.struct({
	/** '<ownerTag>:<fileId>' — lets the app discard a stale push after navigation. */
	resId: T.string,
	fileId: T.string,
	state: T.literal('loading', 'ready', 'unavailable'),
	fileName: T.optional(T.string),
	/** The tenant owning the CONTENT — differs from the serving context for pinned/placed docs. */
	owner: T.optional(tDocOwner),
	/** true → the content owner is not the viewer, so the owner chip is shown. NOT a provenance
	 *  signal: a community's own document is served by the context it belongs to and still sets
	 *  this. Apps must not infer `FileView.upstream` from it. */
	isCrossOwner: T.boolean,
	canRename: T.boolean,
	/** The viewer may share this document to their feed: a signed-in identity plus write access
	 *  to a local row that ORIGINATES here. Deliberately not the `canRename` rule — rename is
	 *  record authority and reaches a mirrored copy, while a post is a claim about what the
	 *  audience can reach, and a mirror is a link the author cannot widen. False for a
	 *  share-link guest. Optional so a DocInfo from an older shell still decodes; every shell
	 *  producer sets it explicitly. */
	canPost: T.optional(T.boolean)
})
export type DocInfo = T.TypeOf<typeof tDocInfo>

/**
 * App requests document info from shell
 * Direction: app -> shell
 */
export const tDocInfoReq = msg('doc:info.req', {
	...tRelayed,
	id: T.number
})
export type DocInfoReq = T.TypeOf<typeof tDocInfoReq>

/**
 * Shell responds with document info
 * Direction: shell -> app
 */
export const tDocInfoRes = msg('doc:info.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(tDocInfo),
	error: T.optional(T.string)
})
export type DocInfoRes = T.TypeOf<typeof tDocInfoRes>

/**
 * Shell pushes document info to app
 * Direction: shell -> app (notification, no response expected)
 *
 * Sent unprompted on resolve and on every subsequent change (rename, pin,
 * access change), so an app never has to poll.
 */
export const tDocInfoPush = msg('doc:info.push', {
	payload: tDocInfo
})
export type DocInfoPush = T.TypeOf<typeof tDocInfoPush>

/**
 * App requests a rename of the document it is showing
 * Direction: app -> shell
 *
 * Deliberately carries NO fileId: the shell derives the target from the
 * connection's resId, so an app cannot aim a rename at another file. Do not add
 * one — `__tests__/message-bus/docinfo.test.ts` guards this.
 */
export const tDocRenameReq = msg('doc:rename.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		fileName: T.string
	})
})
export type DocRenameReq = T.TypeOf<typeof tDocRenameReq>

/**
 * Shell responds to a rename request
 * Direction: shell -> app
 */
export const tDocRenameRes = msg('doc:rename.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			fileName: T.string
		})
	),
	error: T.optional(T.string)
})
export type DocRenameRes = T.TypeOf<typeof tDocRenameRes>

// Deliberately no `profile:get` message pair: apps resolve collaborator profiles
// themselves, straight from the DOCUMENT's node, via `api.profiles.getBatch()`
// (shape: `PublicProfile` in `api-types.ts`). A shell round-trip could only ever
// answer from the VIEWER's own mirror, which does not know a stranger.

// ============================================
// THEME MESSAGES
// ============================================

/**
 * Shell pushes a live theme change to all initialized apps
 * Direction: shell -> app (notification, no response expected)
 */
export const tThemeUpdate = msg('theme:update', {
	payload: T.struct({
		darkMode: T.boolean
	})
})
export type ThemeUpdate = T.TypeOf<typeof tThemeUpdate>

// ============================================
// EMBED MESSAGES
// ============================================

/**
 * App requests to open an embedded document
 * Direction: app -> shell
 */
export const tEmbedOpenReq = msg('embed:open.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		targetFileId: T.string,
		targetContentType: T.string,
		sourceFileId: T.string,
		access: T.optional(T.literal('read', 'comment', 'write')),
		navState: T.optional(T.string),
		params: T.optional(T.string),
		ancestors: T.optional(T.array(T.string))
	})
})
export type EmbedOpenReq = T.TypeOf<typeof tEmbedOpenReq>

/**
 * Embedded app reports its current view state to the parent
 * Direction: app -> shell (notification, no response expected)
 *
 * Carries both navigation state and aspect ratio info.
 * Sent on navigation changes (debounced for continuous changes)
 * and once after init with aspect ratio info.
 */
export const tEmbedViewStatePush = msg('embed:viewstate.push', {
	...tRelayed,
	payload: T.struct({
		viewState: T.string,
		aspectRatio: T.optional(T.tuple(T.number, T.number)),
		aspectFixed: T.optional(T.boolean)
	})
})
export type EmbedViewStatePush = T.TypeOf<typeof tEmbedViewStatePush>

/**
 * Parent tells embedded app to navigate to a specific state
 * Direction: shell -> app (notification, no response expected)
 *
 * Sent on initial load and when parent wants to change the view.
 */
export const tEmbedViewStateSet = msg('embed:viewstate.set', {
	payload: T.struct({
		viewState: T.optional(T.string)
	})
})
export type EmbedViewStateSet = T.TypeOf<typeof tEmbedViewStateSet>

/**
 * Shell responds with embed URL and nonce for token isolation
 * Direction: shell -> app
 */
export const tEmbedOpenRes = msg('embed:open.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			embedUrl: T.string,
			nonce: T.string,
			resId: T.optional(T.string)
		})
	),
	error: T.optional(T.string)
})
export type EmbedOpenRes = T.TypeOf<typeof tEmbedOpenRes>

/**
 * Shell responds with selected media (DEPRECATED - kept for backwards compatibility)
 * Direction: shell -> app
 *
 * @deprecated Use media:pick.ack + media:pick.result pattern instead.
 * This response type had a fixed timeout which caused issues with
 * user-interactive dialogs. The new pattern separates the "dialog opened"
 * acknowledgment from the "user made a choice" result.
 */
export const tMediaPickRes = msg('media:pick.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			fileId: T.string,
			fileName: T.string,
			contentType: T.string,
			// Visibility of selected media
			visibility: T.optional(tVisibility),
			// Whether user acknowledged visibility warning
			visibilityAcknowledged: T.optional(T.boolean),
			// Cropped variant ID if cropping was applied
			croppedVariantId: T.optional(T.string)
		})
	),
	error: T.optional(T.string)
})
export type MediaPickRes = T.TypeOf<typeof tMediaPickRes>

// ============================================
// SETTINGS MESSAGES
// ============================================

/**
 * App requests to get a setting value
 * Direction: app -> shell
 */
export const tSettingsGetReq = msg('settings:get.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		key: T.string
	})
})
export type SettingsGetReq = T.TypeOf<typeof tSettingsGetReq>

/**
 * Shell responds with setting value
 * Direction: shell -> app
 */
export const tSettingsGetRes = msg('settings:get.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(T.unknown),
	error: T.optional(T.string)
})
export type SettingsGetRes = T.TypeOf<typeof tSettingsGetRes>

/**
 * App requests to set a setting value
 * Direction: app -> shell
 */
export const tSettingsSetReq = msg('settings:set.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		key: T.string,
		value: T.unknown
	})
})
export type SettingsSetReq = T.TypeOf<typeof tSettingsSetReq>

/**
 * Shell responds to set operation
 * Direction: shell -> app
 */
export const tSettingsSetRes = msg('settings:set.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(T.unknown),
	error: T.optional(T.string)
})
export type SettingsSetRes = T.TypeOf<typeof tSettingsSetRes>

/**
 * App requests to list settings with optional prefix filter
 * Direction: app -> shell
 */
export const tSettingsListReq = msg('settings:list.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		prefix: T.optional(T.string)
	})
})
export type SettingsListReq = T.TypeOf<typeof tSettingsListReq>

/**
 * Shell responds with list of settings
 * Direction: shell -> app
 */
export const tSettingsListRes = msg('settings:list.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.array(
			T.struct({
				key: T.string,
				value: T.unknown
			})
		)
	),
	error: T.optional(T.string)
})
export type SettingsListRes = T.TypeOf<typeof tSettingsListRes>

// ============================================
// CRDT MESSAGES
// ============================================

/**
 * App requests a reusable clientId for a Yjs document
 * Direction: app -> shell
 *
 * The shell manages a pool of clientIds in IndexedDB and uses
 * Web Locks to ensure no two tabs use the same clientId for the
 * same document simultaneously.
 */
export const tCrdtClientIdReq = msg('crdt:clientid.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		docId: T.string
	})
})
export type CrdtClientIdReq = T.TypeOf<typeof tCrdtClientIdReq>

/**
 * Shell responds with a reusable clientId
 * Direction: shell -> app
 */
export const tCrdtClientIdRes = msg('crdt:clientid.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			clientId: T.number
		})
	),
	error: T.optional(T.string)
})
export type CrdtClientIdRes = T.TypeOf<typeof tCrdtClientIdRes>

/**
 * App appends a CRDT update to the cache + updates the clock
 * Direction: app -> shell
 */
export const tCrdtCacheAppendReq = msg('crdt:cache.append.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		docId: T.string,
		update: T.unknown, // Uint8Array (structured clone)
		clientId: T.number,
		clock: T.number,
		offline: T.optional(T.boolean)
	})
})
export type CrdtCacheAppendReq = T.TypeOf<typeof tCrdtCacheAppendReq>

/**
 * App reads the cached state for a document
 * Direction: app -> shell
 */
export const tCrdtCacheReadReq = msg('crdt:cache.read.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		docId: T.string
	})
})
export type CrdtCacheReadReq = T.TypeOf<typeof tCrdtCacheReadReq>

/**
 * App compacts the cache for a document
 * Direction: app -> shell
 */
export const tCrdtCacheCompactReq = msg('crdt:cache.compact.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		docId: T.string,
		state: T.unknown, // Uint8Array (structured clone)
		clearDirty: T.optional(T.boolean) // Clear dirty flag after post-sync recompact
	})
})
export type CrdtCacheCompactReq = T.TypeOf<typeof tCrdtCacheCompactReq>

/**
 * Generic CRDT cache response
 * Direction: shell -> app
 */
export const tCrdtCacheRes = msg('crdt:cache.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(T.unknown),
	error: T.optional(T.string)
})
export type CrdtCacheRes = T.TypeOf<typeof tCrdtCacheRes>

// ============================================
// SENSOR MESSAGES
// ============================================

/**
 * App requests to subscribe/unsubscribe to compass heading updates
 * Direction: app -> shell
 */
export const tSensorCompassSub = msg('sensor:compass.sub', {
	id: T.number,
	payload: T.struct({
		/** true = subscribe, false = unsubscribe */
		enabled: T.boolean
	})
})
export type SensorCompassSub = T.TypeOf<typeof tSensorCompassSub>

/**
 * Shell responds to compass subscription request
 * Direction: shell -> app
 */
export const tSensorCompassSubRes = msg('sensor:compass.sub.res', {
	replyTo: T.number,
	ok: T.boolean,
	error: T.optional(T.string)
})
export type SensorCompassSubRes = T.TypeOf<typeof tSensorCompassSubRes>

/**
 * Shell pushes compass heading to subscribed app
 * Direction: shell -> app (notification, no response expected)
 */
export const tSensorCompassPush = msg('sensor:compass.push', {
	payload: T.struct({
		/** Compass heading in degrees (0=N, 90=E, 180=S, 270=W) */
		heading: T.number,
		/** Whether the heading is from an absolute sensor */
		absolute: T.boolean
	})
})
export type SensorCompassPush = T.TypeOf<typeof tSensorCompassPush>

// ============================================
// CAMERA CAPTURE MESSAGES
// ============================================

/**
 * App requests camera capture from shell
 * Direction: app -> shell
 */
export const tCameraCaptureReq = msg('camera:capture.req', {
	id: T.number,
	payload: T.struct({
		sessionId: T.string,
		facing: T.optional(T.literal('user', 'environment')),
		maxResolution: T.optional(T.number)
	})
})
export type CameraCaptureReq = T.TypeOf<typeof tCameraCaptureReq>

/**
 * Shell acknowledges camera capture request (camera is opening)
 * Direction: shell -> app
 */
export const tCameraCaptureAck = msg('camera:capture.ack', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			sessionId: T.string
		})
	),
	error: T.optional(T.string)
})
export type CameraCaptureAck = T.TypeOf<typeof tCameraCaptureAck>

/**
 * Shell pushes camera capture result to app
 * Direction: shell -> app (notification, no response expected)
 */
export const tCameraCaptureResultPush = msg('camera:capture.result', {
	payload: T.struct({
		sessionId: T.string,
		captured: T.boolean,
		imageData: T.optional(T.string),
		width: T.optional(T.number),
		height: T.optional(T.number)
	})
})
export type CameraCaptureResultPush = T.TypeOf<typeof tCameraCaptureResultPush>

// ============================================
// CAMERA PREVIEW MESSAGES
// ============================================

/**
 * App requests to start receiving preview frames from the active camera
 * Direction: app -> shell (notification, no response expected)
 */
export const tCameraPreviewStart = msg('camera:preview.start', {
	payload: T.struct({
		sessionId: T.string,
		width: T.optional(T.number),
		height: T.optional(T.number),
		fps: T.optional(T.number)
	})
})
export type CameraPreviewStart = T.TypeOf<typeof tCameraPreviewStart>

/**
 * App requests to stop receiving preview frames
 * Direction: app -> shell (notification, no response expected)
 */
export const tCameraPreviewStop = msg('camera:preview.stop', {
	payload: T.struct({
		sessionId: T.string
	})
})
export type CameraPreviewStop = T.TypeOf<typeof tCameraPreviewStop>

/**
 * Shell pushes a low-res preview frame to the app
 * Direction: shell -> app (notification, no response expected)
 */
export const tCameraPreviewFrame = msg('camera:preview.frame', {
	payload: T.struct({
		sessionId: T.string,
		seq: T.number,
		imageData: T.string,
		width: T.number,
		height: T.number
	})
})
export type CameraPreviewFrame = T.TypeOf<typeof tCameraPreviewFrame>

/**
 * Overlay shape item for rendering on camera preview
 */
export const tOverlayItem = T.struct({
	type: T.literal('polygon', 'polyline', 'rect', 'circle', 'text'),
	points: T.optional(T.array(T.tuple(T.number, T.number))),
	stroke: T.optional(T.string),
	strokeWidth: T.optional(T.number),
	fill: T.optional(T.string),
	confidence: T.optional(T.number)
})
export type OverlayItem = T.TypeOf<typeof tOverlayItem>

/**
 * App sends overlay shapes to render on camera preview
 * Direction: app -> shell (notification, no response expected)
 */
export const tCameraOverlayUpdate = msg('camera:overlay.update', {
	payload: T.struct({
		sessionId: T.string,
		frameSeq: T.number,
		overlays: T.array(tOverlayItem)
	})
})
export type CameraOverlayUpdate = T.TypeOf<typeof tCameraOverlayUpdate>

// ============================================
// SHARE LINK CREATION MESSAGES
// ============================================

/**
 * App requests to create a share link
 * Direction: app -> shell
 *
 * Uses ACK + push pattern (same as media:pick):
 * 1. App sends request, shell sends ACK (dialog opening)
 * 2. User confirms in shell dialog, shell sends result push
 */
export const tShareCreateReq = msg('share:create.req', {
	id: T.number,
	payload: T.struct({
		sessionId: T.string,
		accessLevel: T.optional(T.literal('read', 'comment', 'write')),
		description: T.optional(T.string),
		expiresAt: T.optional(T.number),
		count: T.optional(T.number),
		params: T.optional(T.string),
		reuse: T.optional(T.boolean)
	})
})
export type ShareCreateReq = T.TypeOf<typeof tShareCreateReq>

/**
 * Shell acknowledges share link creation dialog is opening
 * Direction: shell -> app
 */
export const tShareCreateAck = msg('share:create.ack', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			sessionId: T.string
		})
	),
	error: T.optional(T.string)
})
export type ShareCreateAck = T.TypeOf<typeof tShareCreateAck>

/**
 * Shell pushes share link creation result
 * Direction: shell -> app (notification, no response expected)
 */
export const tShareCreateResultPush = msg('share:create.result', {
	payload: T.struct({
		sessionId: T.string,
		created: T.boolean,
		refId: T.optional(T.string),
		url: T.optional(T.string),
		error: T.optional(T.string)
	})
})
export type ShareCreateResultPush = T.TypeOf<typeof tShareCreateResultPush>

// ============================================
// SITE PUBLISH MESSAGES
// ============================================

/**
 * App hands the shell a finished site container to upload and commit
 * Direction: app -> shell
 *
 * The app owns the document format and the RTDB connection, so it builds the
 * container; its token is scoped `file:<fileId>` and cannot create a file or
 * write the site record, so the shell and the backend own the commit.
 *
 * Plain request/response rather than the ACK + push pattern `share:create` uses:
 * there is no dialog to open, only a wait. The wait can be long — an upload plus
 * a server-side commit — so the caller overrides the 10s default timeout.
 */
export const tSitePublishReq = msg('site:publish.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		// The container zip. `T.unknown` because a Blob survives the structured
		// clone unexamined, the same way `crdt:cache.append.req` carries a
		// Uint8Array. There is no encoding layer on this bus.
		blob: T.unknown, // Blob (structured clone)
		// The Notillo document the container was built from. The backend keys the
		// `site_doc` row on it.
		docFileId: T.string
	})
})
export type SitePublishReq = T.TypeOf<typeof tSitePublishReq>

/**
 * Shell reports the outcome of a publish
 * Direction: shell -> app
 */
export const tSitePublishRes = msg('site:publish.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			// The managed file the container was uploaded as.
			containerFileId: T.string
		})
	),
	error: T.optional(T.string)
})
export type SitePublishRes = T.TypeOf<typeof tSitePublishRes>

/**
 * App asks where its document is mounted on the site
 * Direction: app -> shell
 *
 * A container bakes absolute site paths at build time, so the publisher must know
 * its own mount path *before* it builds. It cannot read it: the mount
 * table is `/api/sites`, which is `require_leader`, and the app's token is scoped
 * `file:<fileId>`. So the shell answers, from the same site config the settings
 * page edits.
 *
 * A separate round trip rather than a field on `site:publish.res`, because the
 * answer is needed before the build and the publish response arrives after it.
 * The publish dialog reads it too, to tell the author where their links will
 * point.
 */
export const tSiteMountReq = msg('site:mount.req', {
	...tRelayed,
	id: T.number,
	payload: T.struct({
		// Checked against the connection's own `resId`, exactly as in
		// `site:publish.req` — an app may only ask about the document it was
		// opened on.
		docFileId: T.string
	})
})
export type SiteMountReq = T.TypeOf<typeof tSiteMountReq>

/**
 * Shell reports the document's configured mount path
 * Direction: shell -> app
 */
export const tSiteMountRes = msg('site:mount.res', {
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			// The **configured** path (`site_doc.mount_path`), not the one the
			// live container was built for. Publishing is what makes the two
			// agree, and this call is the first half of that.
			mountPath: T.string,
			// `false` when the document has no mount row at all. `mountPath` is
			// then the default `/`, which is what publishing it would claim.
			mounted: T.boolean
		})
	),
	error: T.optional(T.string)
})
export type SiteMountRes = T.TypeOf<typeof tSiteMountRes>

// ============================================
// IMPORT MESSAGES
// ============================================

/**
 * Shell pushes import data to app after CRDT sync
 * Direction: shell -> app (notification, no response expected)
 *
 * Sent when a document was created via file import/conversion.
 * The app should parse the data and populate the CRDT document.
 * Data is base64-encoded since postMessage can't transfer
 * ArrayBuffer to opaque-origin iframes.
 */
export const tImportDataPush = msg('import:data.push', {
	payload: T.struct({
		sourceMimeType: T.string,
		fileName: T.string,
		data: T.string
	})
})
export type ImportDataPush = T.TypeOf<typeof tImportDataPush>

/**
 * App notifies shell that import is complete
 * Direction: app -> shell (notification, no response expected)
 */
export const tImportCompleteNotify = msg('import:complete.notify', {
	payload: T.struct({
		success: T.boolean,
		error: T.optional(T.string)
	})
})
export type ImportCompleteNotify = T.TypeOf<typeof tImportCompleteNotify>

// ============================================
// FEED POST MESSAGES
// ============================================

/**
 * App asks the shell to share the document it is showing as a feed post
 * Direction: app -> shell
 *
 * Plain request/response rather than the ACK + push pattern `share:create` uses:
 * fulfilling this navigates the shell to the feed, which unmounts the requesting
 * iframe — there would be nobody left to receive a push.
 *
 * Deliberately carries NO fileId: the shell derives the document from the
 * connection's resId, the same rule `doc:rename.req` states. And deliberately no
 * `...tRelayed`, as `share:create.req`, so an embedded document cannot post on
 * its host's behalf.
 */
export const tFeedPostReq = msg('feed:post.req', {
	id: T.number
})
export type FeedPostReq = T.TypeOf<typeof tFeedPostReq>

/**
 * Shell reports whether the composer was opened
 * Direction: shell -> app
 */
export const tFeedPostRes = msg('feed:post.res', {
	replyTo: T.number,
	ok: T.boolean,
	error: T.optional(T.string)
})
export type FeedPostRes = T.TypeOf<typeof tFeedPostRes>

// ============================================
// UNION OF ALL MESSAGES
// ============================================

/**
 * Union of all message types for validation
 */
export const tCloudilloMessage = T.taggedUnion('type')({
	// Auth messages
	'auth:init.req': tAuthInitReq,
	'auth:init.res': tAuthInitRes,
	'auth:init.push': tAuthInitPush,
	'auth:token.refresh.req': tAuthTokenRefreshReq,
	'auth:token.refresh.res': tAuthTokenRefreshRes,
	'auth:token.push': tAuthTokenPush,

	// App lifecycle messages
	'app:ready.notify': tAppReadyNotify,
	'app:error.notify': tAppErrorNotify,
	'app:title.push': tAppTitlePush,

	// Storage messages
	'storage:op.req': tStorageOpReq,
	'storage:op.res': tStorageOpRes,

	// Media picker messages
	'media:pick.req': tMediaPickReq,
	'media:pick.ack': tMediaPickAck,
	'media:pick.result': tMediaPickResultPush,
	'media:pick.res': tMediaPickRes, // Deprecated
	'media:file.resolved': tMediaFileResolvedPush,

	// Document picker messages
	'doc:pick.req': tDocPickReq,
	'doc:pick.ack': tDocPickAck,
	'doc:pick.result': tDocPickResultPush,

	// Document info messages
	'doc:info.req': tDocInfoReq,
	'doc:info.res': tDocInfoRes,
	'doc:info.push': tDocInfoPush,
	'doc:rename.req': tDocRenameReq,
	'doc:rename.res': tDocRenameRes,

	// Theme messages
	'theme:update': tThemeUpdate,

	// Embed messages
	'embed:open.req': tEmbedOpenReq,
	'embed:open.res': tEmbedOpenRes,
	'embed:viewstate.push': tEmbedViewStatePush,
	'embed:viewstate.set': tEmbedViewStateSet,

	// Settings messages
	'settings:get.req': tSettingsGetReq,
	'settings:get.res': tSettingsGetRes,
	'settings:set.req': tSettingsSetReq,
	'settings:set.res': tSettingsSetRes,
	'settings:list.req': tSettingsListReq,
	'settings:list.res': tSettingsListRes,

	// CRDT messages
	'crdt:clientid.req': tCrdtClientIdReq,
	'crdt:clientid.res': tCrdtClientIdRes,
	'crdt:cache.append.req': tCrdtCacheAppendReq,
	'crdt:cache.read.req': tCrdtCacheReadReq,
	'crdt:cache.compact.req': tCrdtCacheCompactReq,
	'crdt:cache.res': tCrdtCacheRes,

	// Sensor messages
	'sensor:compass.sub': tSensorCompassSub,
	'sensor:compass.sub.res': tSensorCompassSubRes,
	'sensor:compass.push': tSensorCompassPush,

	// Camera capture messages
	'camera:capture.req': tCameraCaptureReq,
	'camera:capture.ack': tCameraCaptureAck,
	'camera:capture.result': tCameraCaptureResultPush,

	// Camera preview messages
	'camera:preview.start': tCameraPreviewStart,
	'camera:preview.stop': tCameraPreviewStop,
	'camera:preview.frame': tCameraPreviewFrame,
	'camera:overlay.update': tCameraOverlayUpdate,

	// Share link creation messages
	'share:create.req': tShareCreateReq,
	'share:create.ack': tShareCreateAck,
	'share:create.result': tShareCreateResultPush,

	// Site publish messages
	'site:publish.req': tSitePublishReq,
	'site:publish.res': tSitePublishRes,
	'site:mount.req': tSiteMountReq,
	'site:mount.res': tSiteMountRes,

	// Feed post messages
	'feed:post.req': tFeedPostReq,
	'feed:post.res': tFeedPostRes,

	// Import messages
	'import:data.push': tImportDataPush,
	'import:complete.notify': tImportCompleteNotify
})
export type CloudilloMessage = T.TypeOf<typeof tCloudilloMessage>

/**
 * All valid message type strings
 */
export type MessageType = CloudilloMessage['type']

// ============================================
// HELPER TYPES
// ============================================

/**
 * Extract request message types (those with id field)
 */
export type RequestMessage = Extract<CloudilloMessage, { id: number }>
export type RequestType = RequestMessage['type']

/**
 * Extract response message types (those with replyTo field)
 */
export type ResponseMessage = Extract<CloudilloMessage, { replyTo: number }>
export type ResponseType = ResponseMessage['type']

/**
 * Extract notification message types (those with payload but no id/replyTo)
 */
export type NotifyMessage = Exclude<CloudilloMessage, RequestMessage | ResponseMessage>
export type NotifyType = NotifyMessage['type']

/**
 * Request type -> the type of the message that answers it.
 *
 * Must NOT extend `Partial<Record<RequestType, ResponseType>>`: that would put
 * every request type into `keyof` and turn an unmapped one into
 * `ResponseType | undefined` instead of {@link ResponseFor}'s `never`.
 */
interface ResponseForMap {
	'auth:init.req': 'auth:init.res'
	'auth:token.refresh.req': 'auth:token.refresh.res'
	'storage:op.req': 'storage:op.res'
	'media:pick.req': 'media:pick.ack'
	'doc:pick.req': 'doc:pick.ack'
	'doc:info.req': 'doc:info.res'
	'doc:rename.req': 'doc:rename.res'
	'embed:open.req': 'embed:open.res'
	'settings:get.req': 'settings:get.res'
	'settings:set.req': 'settings:set.res'
	'settings:list.req': 'settings:list.res'
	'crdt:clientid.req': 'crdt:clientid.res'
	'sensor:compass.sub': 'sensor:compass.sub.res'
	'camera:capture.req': 'camera:capture.ack'
	'share:create.req': 'share:create.ack'
	'sw:apikey.get.req': 'sw:apikey.get.res'
}

/**
 * Message type to response type mapping
 */
export type ResponseFor<T extends RequestType> = T extends keyof ResponseForMap
	? ResponseForMap[T]
	: never

/**
 * Extract the data type from a response message
 */
export type ResponseData<T extends ResponseType> =
	Extract<CloudilloMessage, { type: T }> extends { data?: infer D } ? D : never

// vim: ts=4
