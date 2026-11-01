// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * "Enter <B> as…": B's remembered hats, "As yourself", and "Another community…" listing my
 * other communities. Driven by `hatPickerAtom` (see `hat-entry.ts`); mounted once, in
 * `CtxProvider`. Picking a row resolves the request; × forgets a hat on the spot.
 */

import {
	Button,
	Dialog,
	hatRingClass,
	IcRemove,
	List,
	ListItem,
	ProfilePicture,
	useApi,
	useAuth
} from '@cloudillo/react'
import { useAtomValue, useStore } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useMatch, useNavigate } from 'react-router-dom'

import { CTX_MATCH, feedPath, HOME_BASE, isContextSegment } from '../routes.js'
import { activeContextAtom, communitiesAtom } from './atoms'
import { HOME_CONTEXT } from './constants.js'
import { hatPickerAtom } from './hat-entry.js'

export function HatPicker() {
	const { t } = useTranslation()
	const request = useAtomValue(hatPickerAtom)
	const communities = useAtomValue(communitiesAtom)
	const [auth] = useAuth()
	const { api } = useApi()
	const [entries, setEntries] = React.useState<string[]>([])
	const [showOthers, setShowOthers] = React.useState(false)
	const store = useStore()
	const navigate = useNavigate()
	// Not `useCtx()`: the picker can render outside `CtxProvider`.
	const segment = useMatch(CTX_MATCH)?.params.contextIdTag
	const urlIdTag =
		isContextSegment(segment) && segment !== HOME_CONTEXT ? segment?.slice(1) : undefined

	React.useEffect(() => {
		setEntries(request?.entries ?? [])
		setShowOthers(false)
	}, [request])

	if (!request) return null

	const community = communities.find((c) => c.idTag === request.community)
	const communityName = community?.name ?? request.community
	const choose = (hat: string | null) => request.resolve(hat, entries)

	/** Enters nothing; leaves B's URL when it was opened by entering B (not by `changeHat`). */
	function dismiss() {
		const target = request!.community
		choose(null)
		if (store.get(activeContextAtom)?.idTag === target || urlIdTag !== target) return
		if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
		else navigate(feedPath(HOME_BASE), { replace: true })
	}

	function forget(hat: string) {
		const next = entries.filter((h) => h !== hat)
		setEntries(next)
		api?.profiles.setHats(request!.community, next).catch((err) => {
			console.error(`[HatPicker] Failed to forget ${hat}:`, err)
		})
	}

	function row(hat: string, selected: boolean, removable: boolean) {
		const c = hat ? communities.find((c) => c.idTag === hat) : undefined
		const profile = hat
			? { idTag: hat, name: c?.name ?? hat, profilePic: c?.profilePic }
			: { idTag: auth?.idTag, name: auth?.name, profilePic: auth?.profilePic }
		return (
			<ListItem
				key={hat || '-'}
				leading={
					<ProfilePicture
						className={hatRingClass(hat)}
						profile={profile}
						srcTag={profile.idTag}
					/>
				}
				title={hat ? t('Via {{name}}', { name: profile.name }) : t('As yourself')}
				subtitle={hat || t('Shows your own identity')}
				selected={selected}
				onClick={() => choose(hat)}
				actions={
					removable && (
						<Button
							variant="ghost"
							size="sm"
							icon={<IcRemove />}
							aria-label={t('Forget {{name}}', { name: profile.name })}
							onClick={() => forget(hat)}
						/>
					)
				}
			/>
		)
	}

	const others = communities.filter(
		(c) => c.idTag !== request.community && !entries.includes(c.idTag)
	)

	return (
		<Dialog
			open
			size="sm"
			title={t('Enter {{name}} as…', { name: communityName })}
			description={t(
				'Choose who {{name}} sees you as. "As yourself" shows your own identity to its server.',
				{ name: communityName }
			)}
			onClose={dismiss}
		>
			<List>
				{entries.map((hat, i) => row(hat, i === 0, !!hat))}
				{!entries.includes('') && row('', false, false)}
				{showOthers && others.map((c) => row(c.idTag, false, false))}
			</List>
			{!showOthers && others.length > 0 && (
				<Button variant="ghost" onClick={() => setShowOthers(true)}>
					{t('Another community…')}
				</Button>
			)}
		</Dialog>
	)
}

// vim: ts=4
