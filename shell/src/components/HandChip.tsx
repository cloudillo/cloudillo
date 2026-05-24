// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { LuHand as IcHand, LuX as IcX } from 'react-icons/lu'
import { Popper } from '@cloudillo/react'

import { handAtom, drop, empty, forget, pickUpAgain } from '../state/hand.js'
import { handTargetElAtom } from '../state/hand-fly.js'

export function HandChip() {
	const { t } = useTranslation()
	const hand = useAtomValue(handAtom)
	const store = useStore()
	const setHandTargetEl = useSetAtom(handTargetElAtom)

	// Persist the hand icon's DOM node into a Jotai atom so animation code
	// elsewhere can find it without prop-drilling refs.
	const iconRef = React.useCallback(
		(el: HTMLSpanElement | null) => setHandTargetEl(el),
		[setHandTargetEl]
	)

	// Track previously-seen item keys so newly-arrived rows replay the
	// entrance animation even when the popper is already mounted.
	const prevKeysRef = React.useRef<Set<string>>(new Set())
	const animCounterRef = React.useRef(0)
	const items = hand?.items ?? []
	const currentKeys = React.useMemo(
		() => items.map((it) => `${it.sourceContext}:${it.id}`),
		[items]
	)
	const { rowKeys, animVersion } = React.useMemo(() => {
		const prev = prevKeysRef.current
		let bumped = false
		const keys = currentKeys.map((k) => {
			// Re-mount only newly-added rows by suffixing a version. Existing
			// rows keep their stable key so React doesn't tear them down.
			if (!prev.has(k)) {
				bumped = true
				return `${k}#${animCounterRef.current + 1}`
			}
			return k
		})
		if (bumped) animCounterRef.current += 1
		return { rowKeys: keys, animVersion: animCounterRef.current }
	}, [currentKeys])

	React.useEffect(() => {
		prevKeysRef.current = new Set(currentKeys)
	}, [currentKeys])

	if (!hand) return null

	const count = hand.items.length

	const isDormant = hand.status === 'dormant'

	if (isDormant) {
		return (
			<li className="c-nav-item pos-relative">
				<button
					type="button"
					className="c-nav-item c-hbox align-items-center g-1 c-hand-chip-dormant"
					aria-label={t('Hand set down — click to pick up again.')}
					title={t('Hand set down — click to pick up again.')}
					onClick={() => pickUpAgain(store.get, store.set)}
				>
					<span ref={iconRef} className="c-hand-chip-icon">
						<IcHand />
					</span>
					<span className="c-badge br">{count}</span>
				</button>
				<button
					type="button"
					className="c-button c-hand-chip-forget"
					aria-label={t('Forget')}
					onClick={(e) => {
						e.stopPropagation()
						forget(store.get, store.set)
					}}
				>
					<IcX />
				</button>
			</li>
		)
	}

	return (
		<Popper
			className="c-nav-item pos-relative"
			aria-label={t('{{count}} file in hand', { count })}
			icon={
				<>
					<span ref={iconRef} className="c-hand-chip-icon">
						<IcHand />
					</span>
					<span className="c-badge br bg bg-primary">{count}</span>
				</>
			}
		>
			<div className="c-vbox c-hand-chip-popper">
				<div className="c-hbox justify-content-between align-items-center p-2">
					<h4 className="m-0">{t('Hand ({{count}})', { count })}</h4>
				</div>
				<div className="c-vbox" style={{ overflowY: 'auto', flex: 1 }}>
					{hand.items.map((it, i) => (
						<div
							key={rowKeys[i] ?? `${it.sourceContext}:${it.id}`}
							className="c-hbox align-items-center g-2 p-2 c-hand-row"
							style={{ ['--row-i' as string]: i } as React.CSSProperties}
							data-anim-version={animVersion}
						>
							<span className="flex-fill text-truncate">{it.label}</span>
							<span className="small text-muted text-truncate">@{it.idTag}</span>
							<button
								type="button"
								className="c-button"
								aria-label={t('Drop')}
								title={t('Drop')}
								onClick={() => drop(store.get, store.set, it.id, it.sourceContext)}
							>
								<IcX />
							</button>
						</div>
					))}
				</div>
				<div className="c-hbox justify-content-end p-2">
					<button
						type="button"
						className="c-button"
						onClick={() => empty(store.get, store.set)}
					>
						{t('Empty hand')}
					</button>
				</div>
			</div>
		</Popper>
	)
}

// vim: ts=4
