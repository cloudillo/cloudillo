// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface ClampProps extends React.HTMLAttributes<HTMLDivElement> {
	/** Visible lines while collapsed. */
	lines: number
	children?: React.ReactNode
}

/** Line-clamped content with a "Show more / Show less" toggle, shown only on overflow. */
export const Clamp = createComponent<HTMLDivElement, ClampProps>(
	'Clamp',
	({ lines, className, style, children, ...props }, ref) => {
		const { t } = useLibTranslation()
		const contentId = React.useId()
		const contentRef = React.useRef<HTMLDivElement>(null)
		const [expanded, setExpanded] = React.useState(false)
		const [overflows, setOverflows] = React.useState(false)

		React.useLayoutEffect(
			function watchOverflow() {
				const el = contentRef.current
				// Expanded content cannot be measured against the clamp; keep the last result
				if (!el || expanded) return
				const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
				check()
				const ro = new ResizeObserver(check)
				ro.observe(el)
				return () => ro.disconnect()
			},
			[expanded, lines]
		)

		return (
			<div
				ref={ref}
				className={mergeClasses('c-clamp', !expanded && 'clamped', className)}
				style={{ ...style, '--clamp-lines': lines } as React.CSSProperties}
				{...props}
			>
				<div ref={contentRef} id={contentId}>
					{children}
				</div>
				{(overflows || expanded) && (
					<Button
						variant="link"
						aria-expanded={expanded}
						aria-controls={contentId}
						onClick={() => setExpanded(!expanded)}
					>
						{expanded ? t('Show less') : t('Show more')}
					</Button>
				)}
			</div>
		)
	}
)

// vim: ts=4
