// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Message Bus Module
 *
 * Unified message bus for inter-frame communication between
 * shell, apps, and service worker.
 *
 * @example App usage
 * ```typescript
 * import { getAppBus } from '@cloudillo/core'
 *
 * const bus = getAppBus()
 * const state = await bus.init('my-app')
 *
 * // Access auth state
 * console.log(bus.accessToken, bus.idTag)
 *
 * // Storage operations
 * await bus.storage.set('my-app', 'key', { data: 'value' })
 * const data = await bus.storage.get('my-app', 'key')
 *
 * // Listen for token updates
 * bus.on('auth:token.push', (msg) => {
 *   console.log('Token updated')
 * })
 * ```
 */

// App bus
export {
	// Class
	AppMessageBus,
	// Types
	type AppState,
	type CameraCaptureOptions,
	type CameraCaptureResult,
	type CameraPreviewFrameData,
	type CameraPreviewOptions,
	type CameraSession,
	type DocPickOptions,
	type DocPickResult,
	type EmbedOpenResult,
	// Singleton
	getAppBus,
	type MediaPickOptions,
	type MediaPickResult,
	type OverlayItemData,
	resetAppBus,
	type SettingsApi,
	type ShareCreateOptions,
	type ShareCreateResult,
	type StorageApi
} from './app-bus.js'
// Core
export {
	// Base class (for shell/sw implementations)
	MessageBusBase,
	type MessageBusConfig,
	type MessageHandler,
	// Types
	type PendingRequest
} from './core.js'
export type { EmbedRelayHandle, EmbedRelayOptions } from './embed-relay.js'

// Embed relay
export { setupEmbedRelay } from './embed-relay.js'
// Registry
export {
	isCloudilloMessage,
	MESSAGE_REGISTRY,
	type MessageAccessRule,
	type ValidatedMessage,
	validateMessage
} from './registry.js'
// Types
export {
	type AppErrorNotify,
	type AppReadyNotify,
	// App lifecycle messages
	type AppReadyStage,
	type AppTitlePush,
	type AuthInitPush,
	// Auth messages
	type AuthInitReq,
	type AuthInitRes,
	type AuthTokenPush,
	type AuthTokenRefreshReq,
	type AuthTokenRefreshRes,
	type CameraCaptureAck,
	// Camera capture messages
	type CameraCaptureReq,
	type CameraCaptureResultPush,
	type CameraOverlayUpdate,
	type CameraPreviewFrame,
	// Camera preview messages
	type CameraPreviewStart,
	type CameraPreviewStop,
	// Union types
	type CloudilloMessage,
	type CrdtCacheAppendReq,
	type CrdtCacheCompactReq,
	type CrdtCacheReadReq,
	type CrdtCacheRes,
	// CRDT messages
	type CrdtClientIdReq,
	type CrdtClientIdRes,
	type CropAspect,
	type DocPickAck,
	// Document picker messages
	type DocPickReq,
	type DocPickResultPush,
	// Embed messages
	type EmbedOpenReq,
	type EmbedOpenRes,
	type EmbedViewStatePush,
	type EmbedViewStateSet,
	type ImportCompleteNotify,
	// Import messages
	type ImportDataPush,
	type MediaFileResolvedPush,
	type MediaPickAck,
	type MediaPickReq,
	type MediaPickRes,
	type MediaPickResultPush,
	type MessageCategory,
	// Directions and categories
	type MessageDirection,
	// Message envelope
	type MessageEnvelope,
	type MessageType,
	type NotifyMessage,
	type NotifyType,
	type OverlayItem,
	// Protocol
	PROTOCOL_VERSION,
	type RequestMessage,
	type RequestType,
	type ResponseData,
	type ResponseFor,
	type ResponseMessage,
	type ResponseType,
	type SensorCompassPush,
	// Sensor messages
	type SensorCompassSub,
	type SensorCompassSubRes,
	// Settings messages
	type SettingsGetReq,
	type SettingsGetRes,
	type SettingsListReq,
	type SettingsListRes,
	type SettingsSetReq,
	type SettingsSetRes,
	type ShareCreateAck,
	// Share link creation messages
	type ShareCreateReq,
	type ShareCreateResultPush,
	// Storage messages
	type StorageOp,
	type StorageOpReq,
	type StorageOpRes,
	type SwApiKeyDel,
	type SwApiKeyGetReq,
	type SwApiKeyGetRes,
	type SwApiKeySet,
	type SwTokenClear,
	// Service worker messages
	type SwTokenSet,
	tAppErrorNotify,
	tAppReadyNotify,
	tAppReadyStage,
	tAppTitlePush,
	tAuthInitPush,
	tAuthInitReq,
	tAuthInitRes,
	tAuthTokenPush,
	tAuthTokenRefreshReq,
	tAuthTokenRefreshRes,
	tCameraCaptureAck,
	tCameraCaptureReq,
	tCameraCaptureResultPush,
	tCameraOverlayUpdate,
	tCameraPreviewFrame,
	tCameraPreviewStart,
	tCameraPreviewStop,
	tCloudilloMessage,
	tCrdtCacheAppendReq,
	tCrdtCacheCompactReq,
	tCrdtCacheReadReq,
	tCrdtCacheRes,
	tCrdtClientIdReq,
	tCrdtClientIdRes,
	tCropAspect,
	tDocPickAck,
	tDocPickReq,
	tDocPickResultPush,
	tEmbedOpenReq,
	tEmbedOpenRes,
	tEmbedViewStatePush,
	tEmbedViewStateSet,
	tImportCompleteNotify,
	tImportDataPush,
	tMediaPickAck,
	tMediaPickReq,
	tMediaPickRes,
	tMediaPickResultPush,
	// Runtype validators (for shell/sw use)
	tMessageEnvelope,
	tOverlayItem,
	tSensorCompassPush,
	tSensorCompassSub,
	tSensorCompassSubRes,
	tSettingsGetReq,
	tSettingsGetRes,
	tSettingsListReq,
	tSettingsListRes,
	tSettingsSetReq,
	tSettingsSetRes,
	tShareCreateAck,
	tShareCreateReq,
	tShareCreateResultPush,
	tStorageOp,
	tStorageOpReq,
	tStorageOpRes,
	tSwApiKeyDel,
	tSwApiKeyGetReq,
	tSwApiKeyGetRes,
	tSwApiKeySet,
	tSwTokenClear,
	tSwTokenSet,
	tVisibility,
	VISIBILITY_ORDER,
	// Media picker messages
	type Visibility
} from './types.js'

// vim: ts=4
