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
 * Service Worker Message Bus
 *
 * Provides message handling for shell→sw communication.
 *
 * @example Usage in service worker
 * ```typescript
 * import { handleSwMessage, type SwStorageFunctions } from './message-bus'
 *
 * const storage: SwStorageFunctions = {
 *   setSecureItem,
 *   getSecureItem,
 *   deleteSecureItem
 * }
 *
 * self.addEventListener('message', (evt) => {
 *   handleSwMessage(evt as ExtendableMessageEvent, storage, (token) => {
 *     authToken = token // Update in-memory cache
 *   })
 * })
 * ```
 */

// Types
export {
	PROTOCOL_VERSION,
	type MessageEnvelope,
	type SwTokenSet,
	type SwTokenClear,
	type SwApiKeySet,
	type SwApiKeyGetReq,
	type SwApiKeyGetRes,
	type SwApiKeyDel,
	type SwMessageFromShell,
	type SwMessageToShell,
	type SwMessageType,
	validateSwMessage
} from './types.js'

// Handlers
export {
	type SwStorageFunctions,
	type SwMessageHandler,
	onSwMessage,
	handleSwMessage,
	sendToShell
} from './handlers.js'

// vim: ts=4
