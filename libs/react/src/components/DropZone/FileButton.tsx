// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { Button, type ButtonProps } from '../Button/Button.js'
import { createComponent } from '../utils.js'
import { useFilePicker } from './DropZone.js'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type FileButtonProps = DistributiveOmit<
	ButtonProps,
	'href' | 'target' | 'type' | 'immediate'
> & {
	accept?: string
	/** Defaults to false. */
	multiple?: boolean
	capture?: 'user' | 'environment'
	/** Called with the picked files (filtered by `accept`). */
	onFiles: (files: File[]) => void
}

/** Button that opens the native file picker. */
export const FileButton = createComponent<HTMLButtonElement, FileButtonProps>(
	'FileButton',
	({ accept, multiple = false, capture, onFiles, onClick, disabled, ...props }, ref) => {
		const picker = useFilePicker({ accept, multiple, capture, disabled, onFiles })
		return (
			<>
				<Button
					ref={ref}
					{...(props as ButtonProps)}
					disabled={disabled}
					immediate
					onClick={(e) => {
						onClick?.(e)
						picker.open()
					}}
				/>
				{picker.input}
			</>
		)
	}
)

// vim: ts=4
