// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import ReactQuill, { Quill } from 'react-quill-new'
import QuillMarkdown from 'quilljs-markdown'

import type { SectionWithContent } from '../types.js'
import { mdToHtml } from '../../../lib/markdown.js'

Quill.register('modules/QuillMarkdown', QuillMarkdown, true)

interface AboutSectionViewProps {
	section: SectionWithContent
}

export function AboutSectionView({ section }: AboutSectionViewProps) {
	if (!section.content) return null

	return (
		<div>
			<Markdown>{section.content}</Markdown>
		</div>
	)
}

interface AboutSectionEditProps {
	section: SectionWithContent
	onChange: (content: string) => void
}

export function AboutSectionEdit({ section, onChange }: AboutSectionEditProps) {
	const { t } = useTranslation()
	const [html, setHtml] = React.useState<string>(() => mdToHtml(section.content))
	const [boundsEl, setBoundsEl] = React.useState<HTMLDivElement | null>(null)

	function handleChange(value: string) {
		setHtml(value)
		onChange(value)
	}

	return (
		<div ref={setBoundsEl}>
			{boundsEl && (
				<ReactQuill
					theme="bubble"
					bounds={boundsEl}
					placeholder={
						section.type === 'rules'
							? t('Write community rules and guidelines...')
							: t('Write something...')
					}
					value={html}
					onChange={handleChange}
					tabIndex={0}
					modules={{
						QuillMarkdown: {
							ignoreTags: ['strikethrough', 'h3', 'h4', 'h5', 'h6']
						},
						toolbar: [
							[{ header: 1 }, { header: 2 }],
							['bold', 'italic', 'underline', 'blockquote'],
							[{ list: 'ordered' }, { list: 'bullet' }],
							['link'],
							['clean']
						]
					}}
				/>
			)}
		</div>
	)
}

// vim: ts=4
