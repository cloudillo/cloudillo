// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import * as React from 'react'
import { useTranslation } from 'react-i18next'

interface PageTitleProps {
	pageId: string
	title: string
	readOnly: boolean
	/** Filled by page creation; taken here, once, to focus the title with the name selected. */
	justCreatedRef: React.RefObject<string | undefined>
	/** Resolves to whether the write went through. */
	onRename: (title: string) => Promise<boolean>
	/** Enter hands the caret over to the page body. */
	onEnter: () => void
}

/**
 * The page's name above the editor.
 *
 * A plain field, not `InlineEditForm`: that form treats Enter on an unchanged name as
 * `onCancel`, the same callback as Esc, and a new page must hand over on Enter with its
 * default name kept. Unlike that form it has no buttons, so it saves on blur: only a
 * changed, non-empty, trimmed value, and Esc never saves. Going to another page unmounts
 * the field with no blur, so an unmount saves the draft by the same rules.
 */
export function PageTitle({
	pageId,
	title,
	readOnly,
	justCreatedRef,
	onRename,
	onEnter
}: PageTitleProps) {
	const { t } = useTranslation()
	const inputRef = React.useRef<HTMLTextAreaElement>(null)
	// `null` while not editing, so a rename from elsewhere shows through.
	const [draft, setDraft] = React.useState<string | null>(null)
	/** Latest render's values, for the unmount; its `onRename` still names this page. */
	const latest = React.useRef({ draft, title, onRename })
	latest.current = { draft, title, onRename }
	/** The name last sent, until `title` catches up: what the page is about to be named. */
	const savedRef = React.useRef<string | undefined>(undefined)

	// A new page can render before its title arrives: wait, so the name gets selected.
	React.useEffect(() => {
		if (justCreatedRef.current !== pageId || !title) return
		justCreatedRef.current = undefined
		inputRef.current?.focus()
		inputRef.current?.select()
	}, [justCreatedRef, pageId, title])

	// A new `title` ends a held draft, whoever wrote it; only a field being typed in keeps it.
	React.useEffect(() => {
		savedRef.current = undefined
		setDraft((current) =>
			current?.trim() === title || document.activeElement !== inputRef.current
				? null
				: current
		)
	}, [title])

	React.useEffect(
		() => () => {
			const { draft, title, onRename } = latest.current
			const next = draft?.trim()
			if (next && next !== (savedRef.current ?? title)) void onRename(next)
		},
		[]
	)

	function save() {
		const next = draft?.trim()
		if (next && next === savedRef.current) return
		if (!next || (next === title && savedRef.current === undefined)) {
			setDraft(null)
			return
		}
		savedRef.current = next
		// Held until the snapshot brings the new `title`, which can be after the write
		// settles, so the old name does not flash back; a refused write falls back at once.
		void onRename(next).then((saved) => {
			if (saved) return
			if (savedRef.current === next) savedRef.current = undefined
			setDraft((current) => (current === draft ? null : current))
		})
	}

	if (readOnly) return <h1 className="notillo-page-title">{title || t('Untitled')}</h1>

	return (
		<textarea
			ref={inputRef}
			className="notillo-page-title"
			rows={1}
			aria-label={t('Title')}
			placeholder={t('Untitled')}
			value={draft ?? title}
			onChange={(e) => setDraft(e.target.value.replace(/\s*\n\s*/g, ' '))}
			onBlur={save}
			onKeyDown={(e) => {
				if (e.nativeEvent.isComposing) return
				if (e.key === 'Escape') setDraft(null)
				if (e.key === 'Enter') {
					e.preventDefault()
					// Blur is the one save path; it runs before the caret moves.
					e.currentTarget.blur()
					onEnter()
				}
			}}
		/>
	)
}

// vim: ts=4
