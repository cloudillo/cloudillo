// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Text input overlay for text tool
 */

import * as React from 'react'
import type { TextInputState } from '../tools/index.js'

export interface TextInputProps {
	textInput: TextInputState
	inputRef: React.RefObject<HTMLInputElement | null>
	onTextChange: (text: string) => void
	onCommit: () => void
	onCancel: () => void
}

export function TextInput({
	textInput,
	inputRef,
	onTextChange,
	onCommit,
	onCancel
}: TextInputProps) {
	const handleKeyDown = (evt: React.KeyboardEvent) => {
		if (evt.key === 'Enter') {
			evt.preventDefault()
			onCommit()
		} else if (evt.key === 'Escape') {
			evt.preventDefault()
			onCancel()
		}
	}

	return (
		<foreignObject
			x={textInput.x}
			y={textInput.y}
			width={textInput.width}
			height={textInput.height}
		>
			<input
				ref={inputRef}
				type="text"
				value={textInput.text}
				onChange={(e) => onTextChange(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={onCommit}
				style={{
					width: '100%',
					height: '100%',
					border: '2px solid #1971c2',
					borderRadius: '4px',
					padding: '4px 8px',
					fontSize: '16px',
					fontFamily: 'system-ui, sans-serif',
					outline: 'none',
					background: 'white'
				}}
				placeholder="Type here..."
			/>
		</foreignObject>
	)
}

// vim: ts=4
