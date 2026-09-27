// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { CopyButton } from '../CopyButton/index.js'
import { mergeClasses } from '../utils.js'

interface CodeBlockBaseProps {
	children: string
	className?: string
}

export type CodeBlockProps = CodeBlockBaseProps &
	(
		| { /** Inline `<code>` within text. */ inline: true; copyable?: never }
		| { inline?: false /** Copy button in the corner. */; copyable?: boolean }
	)

/** Monospace code: inline `<code>`, or a scrolling `<pre>` block with an optional copy button. */
export function CodeBlock({ children, className, inline, copyable }: CodeBlockProps) {
	const { t } = useLibTranslation()

	if (inline) {
		return <code className={mergeClasses('c-code font-mono', className)}>{children}</code>
	}

	return (
		<div className={mergeClasses('c-code-block', className)}>
			<pre className="font-mono">
				<code>{children}</code>
			</pre>
			{copyable && (
				<CopyButton text={children} label={t('code')} className="c-code-block-copy" />
			)}
		</div>
	)
}

// vim: ts=4
