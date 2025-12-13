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
 * Message Bus Module
 *
 * Unified message bus for inter-frame communication between
 * shell, apps, and service worker.
 *
 * @example App usage
 * ```typescript
 * import { getAppBus } from '@cloudillo/base'
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

// Types
export {
	// Protocol
	PROTOCOL_VERSION,
	// Message envelope
	type MessageEnvelope,
	// Directions and categories
	type MessageDirection,
	type MessageCategory,
	// Auth messages
	type AuthInitReq,
	type AuthInitRes,
	type AuthInitPush,
	type AuthTokenRefreshReq,
	type AuthTokenRefreshRes,
	type AuthTokenPush,
	// Storage messages
	type StorageOp,
	type StorageOpReq,
	type StorageOpRes,
	// Service worker messages
	type SwTokenSet,
	type SwTokenClear,
	type SwApiKeySet,
	type SwApiKeyGetReq,
	type SwApiKeyGetRes,
	type SwApiKeyDel,
	// Union types
	type CloudilloMessage,
	type MessageType,
	type RequestMessage,
	type RequestType,
	type ResponseMessage,
	type ResponseType,
	type NotifyMessage,
	type NotifyType,
	type ResponseFor,
	type ResponseData,
	// Runtype validators (for shell/sw use)
	tMessageEnvelope,
	tAuthInitReq,
	tAuthInitRes,
	tAuthInitPush,
	tAuthTokenRefreshReq,
	tAuthTokenRefreshRes,
	tAuthTokenPush,
	tStorageOp,
	tStorageOpReq,
	tStorageOpRes,
	tSwTokenSet,
	tSwTokenClear,
	tSwApiKeySet,
	tSwApiKeyGetReq,
	tSwApiKeyGetRes,
	tSwApiKeyDel,
	tCloudilloMessage
} from './types.js'

// Registry
export {
	type MessageAccessRule,
	type ValidatedMessage,
	MESSAGE_REGISTRY,
	isCloudilloMessage,
	validateMessage
} from './registry.js'

// Core
export {
	// Types
	type PendingRequest,
	type MessageHandler,
	type MessageBusConfig,
	// Base class (for shell/sw implementations)
	MessageBusBase
} from './core.js'

// App bus
export {
	// Types
	type AppState,
	type StorageApi,
	// Class
	AppMessageBus,
	// Singleton
	getAppBus,
	resetAppBus
} from './app-bus.js'

// vim: ts=4
