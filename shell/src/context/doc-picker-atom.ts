/**
 * Document Picker - Jotai Atoms
 *
 * State management atoms for the document picker modal.
 */

import { atom } from 'jotai'

/**
 * Options for opening the document picker
 */
export interface DocPickerOptions {
	/** Filter by file type (CRDT, RTDB) */
	fileTp?: string
	/** Filter by content type (e.g. 'cloudillo/quillo') */
	contentType?: string
	/** Source file ID (for creating share entries) */
	sourceFileId?: string
	/** Custom dialog title */
	title?: string
	/** True when opened from external app via bus protocol */
	isExternalContext?: boolean
}

/**
 * Result from the document picker
 */
export interface DocPickerResult {
	/** Selected file ID */
	fileId: string
	/** File name */
	fileName: string
	/** MIME content type */
	contentType: string
	/** File type (CRDT, RTDB) */
	fileTp?: string
	/** App ID resolved from content type */
	appId?: string
}

/**
 * Document picker state
 */
export interface DocPickerState {
	/** Whether the picker is open */
	isOpen: boolean
	/** Options passed when opening */
	options: DocPickerOptions | null
	/** Callback when selection is complete or cancelled */
	onResult: ((result: DocPickerResult | null) => void) | null
}

/**
 * Document picker state atom
 */
export const docPickerAtom = atom<DocPickerState>({
	isOpen: false,
	options: null,
	onResult: null
})

/**
 * Helper atom to open the document picker
 */
export const openDocPickerAtom = atom(
	null,
	(
		_get,
		set,
		params: {
			options?: DocPickerOptions
			onResult: (result: DocPickerResult | null) => void
		}
	) => {
		set(docPickerAtom, {
			isOpen: true,
			options: params.options || null,
			onResult: params.onResult
		})
	}
)

/**
 * Helper atom to close the document picker
 */
export const closeDocPickerAtom = atom(null, (get, set, result: DocPickerResult | null) => {
	const state = get(docPickerAtom)
	if (state.onResult) {
		state.onResult(result)
	}
	set(docPickerAtom, {
		isOpen: false,
		options: null,
		onResult: null
	})
})

// vim: ts=4
