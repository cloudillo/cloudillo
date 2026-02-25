// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
export const tAuthInitReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('auth:init.req'),
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
export const tAuthInitRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('auth:init.res'),
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			idTag: T.optional(T.string),
			tnId: T.optional(T.id),
			roles: T.optional(T.array(T.string)),
			theme: T.string,
			darkMode: T.optional(T.boolean),
			token: T.optional(T.string),
			access: T.optional(T.literal('read', 'write')),
			tokenLifetime: T.optional(T.number),
			displayName: T.optional(T.string)
		})
	),
	error: T.optional(T.string)
})
export type AuthInitRes = T.TypeOf<typeof tAuthInitRes>

/**
 * App requests token refresh
 * Direction: app -> shell
 */
export const tAuthTokenRefreshReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('auth:token.refresh.req'),
	id: T.number
})
export type AuthTokenRefreshReq = T.TypeOf<typeof tAuthTokenRefreshReq>

/**
 * Shell responds with new token
 * Direction: shell -> app
 */
export const tAuthTokenRefreshRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('auth:token.refresh.res'),
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
export const tAuthTokenPush = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('auth:token.push'),
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
export const tAuthInitPush = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('auth:init.push'),
	payload: T.struct({
		idTag: T.optional(T.string),
		tnId: T.optional(T.id),
		roles: T.optional(T.array(T.string)),
		theme: T.string,
		darkMode: T.optional(T.boolean),
		token: T.optional(T.string),
		access: T.optional(T.literal('read', 'write')),
		tokenLifetime: T.optional(T.number),
		displayName: T.optional(T.string)
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
export const tAppReadyNotify = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('app:ready.notify'),
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
export const tAppErrorNotify = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('app:error.notify'),
	payload: T.struct({
		code: T.number,
		message: T.string
	})
})
export type AppErrorNotify = T.TypeOf<typeof tAppErrorNotify>

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
export const tStorageOpReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('storage:op.req'),
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
export const tStorageOpRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('storage:op.res'),
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(T.unknown),
	error: T.optional(T.string)
})
export type StorageOpRes = T.TypeOf<typeof tStorageOpRes>

// ============================================
// SERVICE WORKER MESSAGES
// ============================================

/**
 * Shell sets auth token in service worker
 * Direction: shell -> sw
 */
export const tSwTokenSet = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sw:token.set'),
	payload: T.struct({
		token: T.string
	})
})
export type SwTokenSet = T.TypeOf<typeof tSwTokenSet>

/**
 * Shell clears auth token in service worker (logout)
 * Direction: shell -> sw
 */
export const tSwTokenClear = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sw:token.clear')
})
export type SwTokenClear = T.TypeOf<typeof tSwTokenClear>

/**
 * Shell stores API key in service worker
 * Direction: shell -> sw
 */
export const tSwApiKeySet = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sw:apikey.set'),
	payload: T.struct({
		apiKey: T.string
	})
})
export type SwApiKeySet = T.TypeOf<typeof tSwApiKeySet>

/**
 * Shell requests API key from service worker
 * Direction: shell -> sw
 */
export const tSwApiKeyGetReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sw:apikey.get.req'),
	id: T.number
})
export type SwApiKeyGetReq = T.TypeOf<typeof tSwApiKeyGetReq>

/**
 * Service worker responds with API key
 * Direction: sw -> shell
 */
export const tSwApiKeyGetRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sw:apikey.get.res'),
	replyTo: T.number,
	ok: T.boolean,
	data: T.optional(
		T.struct({
			apiKey: T.optional(T.string)
		})
	),
	error: T.optional(T.string)
})
export type SwApiKeyGetRes = T.TypeOf<typeof tSwApiKeyGetRes>

/**
 * Shell deletes API key from service worker
 * Direction: shell -> sw
 */
export const tSwApiKeyDel = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sw:apikey.del')
})
export type SwApiKeyDel = T.TypeOf<typeof tSwApiKeyDel>

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
export const tMediaPickReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('media:pick.req'),
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
export const tMediaPickAck = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('media:pick.ack'),
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
export const tMediaPickResultPush = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('media:pick.result'),
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
export const tMediaFileResolvedPush = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('media:file.resolved'),
	payload: T.struct({
		// The temporary file ID (e.g., @123)
		tempId: T.string,
		// The final content-addressed file ID (e.g., f1~abc123...)
		finalId: T.string
	})
})
export type MediaFileResolvedPush = T.TypeOf<typeof tMediaFileResolvedPush>

/**
 * Shell responds with selected media (DEPRECATED - kept for backwards compatibility)
 * Direction: shell -> app
 *
 * @deprecated Use media:pick.ack + media:pick.result pattern instead.
 * This response type had a fixed timeout which caused issues with
 * user-interactive dialogs. The new pattern separates the "dialog opened"
 * acknowledgment from the "user made a choice" result.
 */
export const tMediaPickRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('media:pick.res'),
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
export const tSettingsGetReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('settings:get.req'),
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
export const tSettingsGetRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('settings:get.res'),
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
export const tSettingsSetReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('settings:set.req'),
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
export const tSettingsSetRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('settings:set.res'),
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
export const tSettingsListReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('settings:list.req'),
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
export const tSettingsListRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('settings:list.res'),
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
export const tCrdtClientIdReq = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('crdt:clientid.req'),
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
export const tCrdtClientIdRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('crdt:clientid.res'),
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

// ============================================
// SENSOR MESSAGES
// ============================================

/**
 * App requests to subscribe/unsubscribe to compass heading updates
 * Direction: app -> shell
 */
export const tSensorCompassSub = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sensor:compass.sub'),
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
export const tSensorCompassSubRes = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sensor:compass.sub.res'),
	replyTo: T.number,
	ok: T.boolean,
	error: T.optional(T.string)
})
export type SensorCompassSubRes = T.TypeOf<typeof tSensorCompassSubRes>

/**
 * Shell pushes compass heading to subscribed app
 * Direction: shell -> app (notification, no response expected)
 */
export const tSensorCompassPush = T.struct({
	cloudillo: T.trueValue,
	v: T.literal(PROTOCOL_VERSION),
	type: T.literal('sensor:compass.push'),
	payload: T.struct({
		/** Compass heading in degrees (0=N, 90=E, 180=S, 270=W) */
		heading: T.number,
		/** Whether the heading is from an absolute sensor */
		absolute: T.boolean
	})
})
export type SensorCompassPush = T.TypeOf<typeof tSensorCompassPush>

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

	// Storage messages
	'storage:op.req': tStorageOpReq,
	'storage:op.res': tStorageOpRes,

	// Media picker messages
	'media:pick.req': tMediaPickReq,
	'media:pick.ack': tMediaPickAck,
	'media:pick.result': tMediaPickResultPush,
	'media:pick.res': tMediaPickRes, // Deprecated
	'media:file.resolved': tMediaFileResolvedPush,

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

	// Sensor messages
	'sensor:compass.sub': tSensorCompassSub,
	'sensor:compass.sub.res': tSensorCompassSubRes,
	'sensor:compass.push': tSensorCompassPush,

	// Service worker messages
	'sw:token.set': tSwTokenSet,
	'sw:token.clear': tSwTokenClear,
	'sw:apikey.set': tSwApiKeySet,
	'sw:apikey.get.req': tSwApiKeyGetReq,
	'sw:apikey.get.res': tSwApiKeyGetRes,
	'sw:apikey.del': tSwApiKeyDel
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
 * Message type to response type mapping
 */
export type ResponseFor<T extends RequestType> = T extends 'auth:init.req'
	? 'auth:init.res'
	: T extends 'auth:token.refresh.req'
		? 'auth:token.refresh.res'
		: T extends 'storage:op.req'
			? 'storage:op.res'
			: T extends 'media:pick.req'
				? 'media:pick.res'
				: T extends 'settings:get.req'
					? 'settings:get.res'
					: T extends 'settings:set.req'
						? 'settings:set.res'
						: T extends 'settings:list.req'
							? 'settings:list.res'
							: T extends 'crdt:clientid.req'
								? 'crdt:clientid.res'
								: T extends 'sensor:compass.sub'
									? 'sensor:compass.sub.res'
									: T extends 'sw:apikey.get.req'
										? 'sw:apikey.get.res'
										: never

/**
 * Extract the data type from a response message
 */
export type ResponseData<T extends ResponseType> =
	Extract<CloudilloMessage, { type: T }> extends { data?: infer D } ? D : never

// vim: ts=4
