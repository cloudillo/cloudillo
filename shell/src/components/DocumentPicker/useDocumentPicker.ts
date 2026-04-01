// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * useDocumentPicker Hook
 *
 * Internal API for shell components to open the document picker.
 */

import { useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'

import {
	docPickerAtom,
	openDocPickerAtom,
	type DocPickerOptions,
	type DocPickerResult
} from '../../context/doc-picker-atom.js'

export interface UseDocumentPickerReturn {
	/**
	 * Open the document picker and wait for selection
	 */
	pickDocument: (options?: DocPickerOptions) => Promise<DocPickerResult | null>

	/**
	 * Whether the document picker is currently open
	 */
	isOpen: boolean
}

/**
 * Hook for opening the document picker from shell components
 */
export function useDocumentPicker(): UseDocumentPickerReturn {
	const [state] = useAtom(docPickerAtom)
	const openPicker = useSetAtom(openDocPickerAtom)

	const pickDocument = useCallback(
		(options?: DocPickerOptions): Promise<DocPickerResult | null> => {
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
		pickDocument,
		isOpen: state.isOpen
	}
}

// vim: ts=4
