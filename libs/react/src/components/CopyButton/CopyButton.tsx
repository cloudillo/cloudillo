// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuCheck as IcCheck, LuCopy as IcCopy } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'

export interface CopyButtonProps {
	/** The text to copy to the clipboard. */
	text: string
	/** i18n label for the tooltip/aria-label, e.g. 'Identity tag'. */
	label: string
	className?: string
}

/** Copies `text` on click, showing a check icon for 2s. */
export function CopyButton({ text, label, className }: CopyButtonProps) {
	const { t } = useLibTranslation()
	const [copied, setCopied] = React.useState(false)
	const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)

	React.useEffect(() => () => clearTimeout(timerRef.current), [])

	async function doCopy() {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			clearTimeout(timerRef.current)
			timerRef.current = setTimeout(() => setCopied(false), 2000)
		} catch (err) {
			console.error('Failed to copy:', err)
		}
	}

	// Screen readers only see the label, so it has to carry the confirmation the
	// icon swap gives sighted users.
	const shownLabel = copied ? t('Copied') : t('Copy {{label}}', { label })

	return (
		// `immediate`: the clipboard write must stay inside the click's user-activation window.
		<Button
			immediate
			onClick={doCopy}
			title={shownLabel}
			aria-label={shownLabel}
			className={className}
		>
			{copied ? <IcCheck /> : <IcCopy />}
		</Button>
	)
}

// vim: ts=4
