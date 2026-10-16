// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Paragraph-style listbox, modelled on `FontPicker` (libs/react): focus stays on the
 * trigger, ↑/↓/Home/End move the highlight, Enter/Space picks, Escape or an outside click
 * closes. Options preview each style in its own font and size; the foot holds the style
 * actions (Update / Clear / heading nudge), so the toolbar never changes width.
 */

import {
	IcDropdown,
	mergeClasses,
	overlayContainer,
	useAnchoredPosition,
	useEscapeKey
} from '@cloudillo/react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import type { StoredStyle } from '../crdt/stored-types'

export interface StyleSelectProps {
	/** Paragraph styles, template order */
	styles: [string, StoredStyle][]
	/** Preview CSS (font, clamped size) of a style */
	preview(id: string): React.CSSProperties
	value?: string
	overrides: boolean
	mixed: boolean
	/** `Cmd.headingNudge` applies: a dot on the trigger, the nudge in the foot */
	nudge: boolean
	disabled?: boolean
	onSelect(id: string): void
	onUpdate(): void
	onClear(): void
	onNudge(): void
	onDismissNudge(): void
}

interface Entry {
	key: string
	run(): void
}

export function StyleSelect({
	styles,
	preview,
	value,
	overrides,
	mixed,
	nudge,
	disabled,
	onSelect,
	onUpdate,
	onClear,
	onNudge,
	onDismissNudge
}: StyleSelectProps) {
	const { t } = useTranslation()
	const id = React.useId()
	const [open, setOpen] = React.useState(false)
	const [hi, setHi] = React.useState(-1)
	const [btn, setBtn] = React.useState<HTMLButtonElement | null>(null)
	const [menu, setMenu] = React.useState<HTMLDivElement | null>(null)
	const pos = useAnchoredPosition(btn, menu)

	const close = React.useCallback(() => {
		setOpen(false)
		setHi(-1)
	}, [])
	useEscapeKey(close, open)
	// Outside click; the trigger is excluded so its own click toggles instead of reopening.
	React.useEffect(() => {
		if (!open) return
		const down = (e: PointerEvent) => {
			const n = e.target as Node
			if (!menu?.contains(n) && !btn?.contains(n)) close()
		}
		document.addEventListener('pointerdown', down)
		return () => document.removeEventListener('pointerdown', down)
	}, [open, menu, btn, close])
	React.useEffect(() => {
		if (disabled) close()
	}, [disabled, close])

	const name = value ? styles.find(([sid]) => sid === value)?.[1].name : undefined
	const label = mixed ? t('Mixed') : name ? (overrides ? `${name} +` : name) : ''

	// Keyboard order: options, then the enabled foot actions.
	const pick = (fn: () => void) => () => {
		close()
		fn()
	}
	const entries: Entry[] = [
		...styles.map(([sid]) => ({ key: `o-${sid}`, run: pick(() => onSelect(sid)) })),
		...(name && overrides ? [{ key: 'update', run: pick(onUpdate) }] : []),
		...(overrides ? [{ key: 'clear', run: pick(onClear) }] : []),
		...(nudge
			? [
					{ key: 'nudge', run: pick(onNudge) },
					{ key: 'dismiss', run: pick(onDismissNudge) }
				]
			: [])
	]
	const idx = (key: string) => entries.findIndex((e) => e.key === key)
	const itemId = (key: string) => `${id}-${key}`

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (disabled) return
		if (!open) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
				e.preventDefault()
				setOpen(true)
				setHi(Math.max(0, idx(`o-${value}`)))
			}
			return
		}
		const last = entries.length - 1
		const to: Record<string, number> = {
			ArrowDown: Math.min(hi + 1, last),
			ArrowUp: Math.max(hi - 1, 0),
			Home: 0,
			End: last
		}
		if (e.key in to) setHi(to[e.key])
		else if (e.key === 'Enter' || e.key === ' ') entries[hi]?.run()
		else if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
		// Open: keys stay here, not with the toolbar's roving handler; ←/→ do nothing.
		e.preventDefault()
		e.stopPropagation()
	}

	const action = (key: string, text: string, run: () => void, title?: string) => (
		<button
			type="button"
			tabIndex={-1}
			id={itemId(key)}
			className={mergeClasses('pagillo-style-act', idx(key) === hi && 'highlighted')}
			title={title}
			disabled={idx(key) < 0}
			onClick={run}
			onMouseEnter={() => setHi(idx(key))}
		>
			{text}
		</button>
	)

	return (
		<>
			<button
				ref={setBtn}
				type="button"
				className="c-input pagillo-style-select"
				aria-label={t('Paragraph style')}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? `${id}-list` : undefined}
				aria-activedescendant={open && hi >= 0 ? itemId(entries[hi].key) : undefined}
				disabled={disabled}
				onClick={() => (open ? close() : setOpen(true))}
				onKeyDown={onKeyDown}
				// Space is handled on keydown; its keyup click would toggle the list shut again.
				onKeyUp={(e) => {
					if (e.key === ' ') e.preventDefault()
				}}
			>
				<span className="pagillo-style-label">{label}</span>
				{nudge && <span className="pagillo-style-dot" title={t('Make it Heading 2?')} />}
				<IcDropdown size={12} />
			</button>
			{open &&
				createPortal(
					<div
						ref={setMenu}
						className="pagillo-style-menu"
						style={pos.style}
						{...pos.attributes}
					>
						<div id={`${id}-list`} role="listbox" aria-label={t('Paragraph style')}>
							{styles.map(([sid, s]) => (
								<button
									key={sid}
									type="button"
									tabIndex={-1}
									id={itemId(`o-${sid}`)}
									role="option"
									aria-selected={sid === value}
									className={mergeClasses(
										'pagillo-style-item',
										sid === value && 'selected',
										idx(`o-${sid}`) === hi && 'highlighted'
									)}
									style={preview(sid)}
									onClick={entries[idx(`o-${sid}`)].run}
									onMouseEnter={() => setHi(idx(`o-${sid}`))}
								>
									{sid === value && overrides ? `${s.name} +` : s.name}
								</button>
							))}
						</div>
						<div className="pagillo-style-foot">
							{name &&
								overrides &&
								action(
									'update',
									t('Update {{name}} to match', { name }),
									pick(onUpdate),
									t('Redefine the style from this paragraph')
								)}
							{action(
								'clear',
								t('Clear formatting'),
								pick(onClear),
								overrides ? undefined : t('No direct formatting')
							)}
							{nudge && (
								<div className="pagillo-style-nudge">
									{action('nudge', t('Make it Heading 2?'), pick(onNudge))}
									{action('dismiss', t('Dismiss'), pick(onDismissNudge))}
								</div>
							)}
						</div>
					</div>,
					overlayContainer(btn)
				)}
		</>
	)
}

// vim: ts=4
