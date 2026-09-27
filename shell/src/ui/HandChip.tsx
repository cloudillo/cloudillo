// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, HBox, List, ListItem, Popover, Tag, Text, VBox } from '@cloudillo/react'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuHand as IcHand, LuX as IcX } from 'react-icons/lu'

import { drop, empty, forget, handAtom, pickUpAgain } from '../state/hand.js'
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
		// Bare `<li>`: the parent is the header's `<ul className="c-nav-group">`.
		return (
			<li>
				<HBox gap={1} align="center">
					<Tag
						className="c-hand-chip-dormant"
						icon={
							<span ref={iconRef} className="c-hand-chip-icon">
								<IcHand />
							</span>
						}
						count={count}
						aria-label={t('Hand set down — click to pick up again.')}
						title={t('Hand set down — click to pick up again.')}
						onClick={() => pickUpAgain(store.get, store.set)}
					/>
					<Button
						variant="ghost"
						size="xs"
						icon={<IcX />}
						aria-label={t('Forget')}
						onClick={() => forget(store.get, store.set)}
					/>
				</HBox>
			</li>
		)
	}

	return (
		<li>
			<Popover
				width="sm"
				placement="bottom-end"
				trigger={
					<Tag
						caret
						color="primary"
						icon={
							<span ref={iconRef} className="c-hand-chip-icon">
								<IcHand />
							</span>
						}
						count={count}
						aria-label={t('{{count}} file in hand', { count })}
					/>
				}
			>
				<VBox gap={1} padding={2}>
					<Text weight="semibold">{t('Hand ({{count}})', { count })}</Text>
					<List scroll>
						{hand.items.map((it, i) => (
							<ListItem
								key={rowKeys[i] ?? `${it.sourceContext}:${it.id}`}
								className="c-hand-row"
								style={{ ['--row-i' as string]: i } as React.CSSProperties}
								data-anim-version={animVersion}
								title={it.label}
								subtitle={`@${it.idTag}`}
								trailing={
									<Button
										variant="ghost"
										size="sm"
										icon={<IcX />}
										aria-label={t('Drop')}
										onClick={() =>
											drop(store.get, store.set, it.id, it.sourceContext)
										}
									/>
								}
							/>
						))}
					</List>
					<HBox justify="end">
						<Button variant="ghost" onClick={() => empty(store.get, store.set)}>
							{t('Empty hand')}
						</Button>
					</HBox>
				</VBox>
			</Popover>
		</li>
	)
}

// vim: ts=4
