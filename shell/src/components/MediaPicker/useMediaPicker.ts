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
 * useMediaPicker Hook
 *
 * Internal API for shell components to open the media picker.
 * Use this in posting, messaging, and other shell components.
 *
 * @example
 * ```typescript
 * const { pickMedia, isOpen } = useMediaPicker()
 *
 * async function handleInsertImage() {
 *   const result = await pickMedia({
 *     mediaType: 'image/*',
 *     documentFileId: currentDocument.fileId
 *   })
 *   if (result) {
 *     insertImage(result.fileId)
 *   }
 * }
 * ```
 */

import { useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'

import {
	mediaPickerAtom,
	openMediaPickerAtom,
	type MediaPickerOptions,
	type MediaPickerResult
} from '../../context/media-picker-atom.js'

export interface UseMediaPickerReturn {
	/**
	 * Open the media picker and wait for selection
	 *
	 * @param options - Media picker configuration
	 * @returns Promise resolving to selected media or null if cancelled
	 */
	pickMedia: (options?: MediaPickerOptions) => Promise<MediaPickerResult | null>

	/**
	 * Whether the media picker is currently open
	 */
	isOpen: boolean
}

/**
 * Hook for opening the media picker from shell components
 *
 * Returns an async function that opens the picker and resolves
 * when the user selects a file or cancels.
 */
export function useMediaPicker(): UseMediaPickerReturn {
	const [state] = useAtom(mediaPickerAtom)
	const openPicker = useSetAtom(openMediaPickerAtom)

	const pickMedia = useCallback(
		(options?: MediaPickerOptions): Promise<MediaPickerResult | null> => {
			return new Promise((resolve) => {
				openPicker({
					options,
					onResult: (result) => {
						resolve(result)
					}
				})
			})
		},
		[openPicker]
	)

	return {
		pickMedia,
		isOpen: state.isOpen
	}
}

// vim: ts=4
