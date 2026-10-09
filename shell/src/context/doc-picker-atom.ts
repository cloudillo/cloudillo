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
	/** Site source: only Public documents may be embedded, and the fix is "Make public" */
	requirePublic?: boolean
	/** Offer only documents some app can show as a view embed (plus folders) */
	embeddableOnly?: boolean
	/** Custom dialog title */
	title?: string
	/** True when opened from external app via bus protocol */
	isExternalContext?: boolean
	/** Document's context idTag (from app connection) */
	idTag?: string
}

/**
 * Result from the document picker
 */
export interface DocPickerResult {
	/** Selected file ID */
	fileId: string
	/** The selected entry — what writes (share creation) go by; `fileId` is the content id */
	entryId?: string
	/** File name */
	fileName: string
	/** MIME content type */
	contentType: string
	/** File type (CRDT, RTDB) */
	fileTp?: string
	/** App ID resolved from content type */
	appId?: string
	/** The node that holds the document: `upstream` for a mirrored row, else the browsed node.
	 *  What a resId's `<idTag>` half must be — NOT an owner profile. */
	srcIdTag?: string
	/** The viewer may write this row — what a live-document feed post requires
	 *  (`canPost` in shell/src/apps/doc-info.ts). Absent when the surface cannot decide. */
	canWrite?: boolean
	/** The file's visibility (`'P'` = public); drives the embed permission disclosure */
	visibility?: string | null
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
