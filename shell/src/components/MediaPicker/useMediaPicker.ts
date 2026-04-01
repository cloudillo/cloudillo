// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

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
