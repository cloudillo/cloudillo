// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, ChatBubble, RichText, RichTextInput, VBox } from '@cloudillo/react'
import * as React from 'react'
import { LuSend as IcSend } from 'react-icons/lu'

import { Story, Variant } from './storybook.js'

const SAMPLE =
	'Hello #cloudillo :)\nSee https://cloudillo.org for details.\n\nA second paragraph <3'

export function RichTextStory() {
	return (
		<Story
			name="RichText"
			description="User-written text: blank lines split paragraphs, newlines break lines; links, #hashtags and emoji shortcuts are rendered."
			props={[
				{ name: 'text', type: 'string', descr: 'Plain text' },
				{ name: 'size', type: 'TextSize', descr: 'Font size' },
				{ name: 'clamp', type: 'number', descr: 'Collapse to n lines with Show more' }
			]}
		>
			<Variant name="Plain">
				<RichText text={SAMPLE} />
			</Variant>
			<Variant name="Clamped">
				<RichText text={`${SAMPLE}\n\n${SAMPLE}\n\n${SAMPLE}`} clamp={3} />
			</Variant>
		</Story>
	)
}

export function RichTextInputStory() {
	const [value, setValue] = React.useState('')
	const [sent, setSent] = React.useState('')
	function send() {
		setSent(value)
		setValue('')
	}
	return (
		<Story
			name="RichTextInput"
			description="contentEditable composer with highlighting and the empty-editor paste fix; reads FieldContext."
			props={[
				{ name: 'value', type: 'string', descr: 'Controlled text' },
				{ name: 'onChange', type: '(value: string) => void', descr: 'Text changed' },
				{ name: 'placeholder', type: 'string', descr: 'Shown while empty' },
				{ name: 'actions', type: 'ReactNode', descr: 'Trailing slot' },
				{ name: 'onSubmit', type: '() => void', descr: 'Submit key pressed' },
				{
					name: 'submitKey',
					type: "'enter' | 'ctrl+enter'",
					descr: 'Default ctrl+enter; enter = Shift+Enter breaks the line'
				},
				{ name: 'minRows', type: 'number', descr: 'Minimum height in lines' },
				{ name: 'disabled', type: 'boolean', descr: 'Read-only' },
				{ name: 'autoFocus', type: 'boolean', descr: 'Focus on mount' }
			]}
		>
			<Variant name="Chat composer (Enter sends)">
				<RichTextInput
					aria-label="Message"
					placeholder="Write a message…"
					value={value}
					onChange={setValue}
					onSubmit={send}
					submitKey="enter"
					actions={
						<Button variant="link" color="primary" aria-label="Send" onClick={send}>
							<IcSend />
						</Button>
					}
				/>
				{sent && <RichText text={sent} className="mt-2" />}
			</Variant>
		</Story>
	)
}

export function ChatBubbleStory() {
	return (
		<Story
			name="ChatBubble"
			description="A message bubble aligned to its side; own messages at the end."
			props={[
				{ name: 'side', type: "'start' | 'end'", descr: 'end = own message' },
				{ name: 'color', type: 'ColorVariant', descr: 'Default primary / secondary' }
			]}
		>
			<Variant name="Conversation">
				<VBox gap={1}>
					<ChatBubble side="start">
						<RichText text="Hi! Did you see #cloudillo ?" />
					</ChatBubble>
					<ChatBubble side="end">
						<RichText text={'Yes :D\nLooks great.'} />
					</ChatBubble>
				</VBox>
			</Variant>
		</Story>
	)
}

// vim: ts=4
