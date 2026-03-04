// This file is part of the Cloudillo Platform.
// Copyright (C) 2024-2026  Szilárd Hajba
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
