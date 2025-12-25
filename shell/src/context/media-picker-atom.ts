/**
 * Media Picker - Jotai Atoms
 *
 * State management atoms for the media picker modal.
 */

import { atom } from 'jotai'

/**
 * Options for opening the media picker
 */
export interface MediaPickerOptions {
	/** Filter by media type (MIME pattern: 'image/*', 'video/*', etc.) */
	mediaType?: string
	/** Explicit visibility level for comparison */
	documentVisibility?: 'P' | 'C' | 'F'
	/** File ID to fetch visibility from */
	documentFileId?: string
	/** Enable image cropping */
	enableCrop?: boolean
	/** Allowed crop aspect ratios */
	cropAspects?: Array<'16:9' | '4:3' | '3:2' | '1:1' | 'circle' | 'free'>
	/** Custom dialog title */
	title?: string
}

/**
 * Result from the media picker
 */
export interface MediaPickerResult {
	/** Selected file ID */
	fileId: string
	/** File name */
	fileName: string
	/** MIME content type */
	contentType: string
	/** Visibility of the selected media */
	visibility?: 'P' | 'C' | 'F'
	/** Whether user acknowledged visibility warning */
	visibilityAcknowledged?: boolean
	/** Cropped variant ID if cropping was applied */
	croppedVariantId?: string
}

/**
 * Media picker state
 */
export interface MediaPickerState {
	/** Whether the picker is open */
	isOpen: boolean
	/** Options passed when opening */
	options: MediaPickerOptions | null
	/** Callback when selection is complete or cancelled */
	onResult: ((result: MediaPickerResult | null) => void) | null
}

/**
 * Media picker state atom
 *
 * Used by:
 * - MediaPicker component to show/hide and handle options
 * - useMediaPicker hook for internal API
 * - Shell message handler for external app requests
 */
export const mediaPickerAtom = atom<MediaPickerState>({
	isOpen: false,
	options: null,
	onResult: null
})

/**
 * Helper atom to open the media picker
 * Write-only atom that sets up the picker state
 */
export const openMediaPickerAtom = atom(
	null,
	(
		get,
		set,
		params: {
			options?: MediaPickerOptions
			onResult: (result: MediaPickerResult | null) => void
		}
	) => {
		set(mediaPickerAtom, {
			isOpen: true,
			options: params.options || null,
			onResult: params.onResult
		})
	}
)

/**
 * Helper atom to close the media picker
 * Write-only atom that resets the picker state
 */
export const closeMediaPickerAtom = atom(null, (get, set, result: MediaPickerResult | null) => {
	const state = get(mediaPickerAtom)
	// Call the result callback before closing
	if (state.onResult) {
		state.onResult(result)
	}
	// Reset state
	set(mediaPickerAtom, {
		isOpen: false,
		options: null,
		onResult: null
	})
})
