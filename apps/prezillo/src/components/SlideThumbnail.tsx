// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import { dedupePresenceUsers, type PresenceEntry } from '@cloudillo/core'
import {
	AvatarGroup,
	Button,
	IcComment,
	IcHide,
	IcMore,
	PresenceAvatar,
	presenceDisplayName
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import type { ViewId, ViewNode, YPrezilloDocument } from '../crdt'
import type { TemplateWithUsage } from '../hooks/useTemplates'
import { IcPlay } from '../icons'
import { mergeClasses } from '../utils'
import { PresentationSlide } from './PresentationMode'

/** Other users on one slide, each list deduplicated per person */
export interface ViewOccupants {
	/** Presenting this slide */
	presenters: PresenceEntry[]
	/** Editing or following on this slide */
	others: PresenceEntry[]
}

const PRESENCE_MAX = 3

/**
 * Who is on which slide (self skipped). Peer state is unvalidated, so only string ids count;
 * `presenting.viewId` wins over `view`. Split before deduping (dedupePresenceUsers drops
 * `state`), then someone presenting from one tab and editing in another shows only as presenter.
 */
export function splitViewOccupants(entries: PresenceEntry[]): Map<ViewId, ViewOccupants> {
	const split = new Map<ViewId, ViewOccupants>()
	for (const entry of entries) {
		if (entry.self) continue
		const presenting = entry.state?.presenting as { viewId?: unknown } | undefined
		const presentingId = presenting?.viewId
		const viewId = typeof presentingId === 'string' ? presentingId : entry.state?.view
		if (typeof viewId !== 'string') continue
		let slot = split.get(viewId as ViewId)
		if (!slot) {
			slot = { presenters: [], others: [] }
			split.set(viewId as ViewId, slot)
		}
		;(typeof presentingId === 'string' ? slot.presenters : slot.others).push(entry)
	}
	const result = new Map<ViewId, ViewOccupants>()
	for (const [id, slot] of split) {
		const presenters = dedupePresenceUsers(slot.presenters)
		const presenterKeys = new Set(presenters.map((u) => u.idTag ?? u.connId))
		const others = dedupePresenceUsers(slot.others).filter(
			(u) => !presenterKeys.has(u.idTag ?? u.connId)
		)
		result.set(id, { presenters, others })
	}
	return result
}

/** Whether the slide has non-empty speaker notes; re-renders only when that flips */
function useHasNotes(doc: YPrezilloDocument, viewId: ViewId): boolean {
	const subscribe = React.useCallback(
		(cb: () => void) => {
			doc.vn.observeDeep(cb)
			return () => doc.vn.unobserveDeep(cb)
		},
		[doc]
	)
	return React.useSyncExternalStore(subscribe, () => (doc.vn.get(viewId)?.length ?? 0) > 0)
}

export interface SlideThumbnailProps {
	view: ViewNode
	/** 0-based position in the slide order */
	index: number
	doc: YPrezilloDocument
	/** All templates, in `useTemplates` order (the marker shows the 1-based index) */
	templates: TemplateWithUsage[]
	active: boolean
	/** Render the slide's objects (false = background only) */
	near: boolean
	ownerTag?: string
	token?: string
	onSelect: (id: ViewId) => void
	/** Roving tabindex (default: focusable) */
	tabIndex?: number
	onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
	onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void
	/** Shows the "⋯" button; called with it as the menu anchor */
	onMore?: (anchor: HTMLElement) => void
	/** Collaborators on this slide (avatars, bottom-left) */
	occupants?: ViewOccupants
}

export function SlideThumbnail({
	view,
	index,
	doc,
	templates,
	active,
	near,
	ownerTag,
	token,
	onSelect,
	tabIndex,
	onKeyDown,
	onContextMenu,
	onMore,
	occupants
}: SlideThumbnailProps) {
	const { t, i18n } = useTranslation()
	const tplIndex = view.templateId ? templates.findIndex((tp) => tp.id === view.templateId) : -1
	const hasNotes = useHasNotes(doc, view.id)

	const guestLabel = t('Guest')
	const presenters = occupants?.presenters ?? []
	const others = occupants?.others ?? []
	const names = [
		...presenters.map((u) =>
			t('{{name}} (presenting)', { name: presenceDisplayName(u, guestLabel) })
		),
		...others.map((u) => presenceDisplayName(u, guestLabel))
	]
	const slideLabel = view.hidden
		? t('Slide {{n}}, skipped in presentation', { n: index + 1 })
		: t('Slide {{n}}', { n: index + 1 })
	const baseLabel = hasNotes
		? t('{{label}}, has speaker notes', { label: slideLabel })
		: slideLabel
	const label = names.length
		? t('{{label}}, {{names}} here', {
				label: baseLabel,
				names: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(names)
			})
		: baseLabel

	return (
		<div className="c-slide-thumb-wrap">
			{/* Raw <button>: a composite tile, and Button's delayed onClick would lag slide switching */}
			<button
				type="button"
				className={mergeClasses(
					'c-slide-thumb',
					active && 'active',
					view.hidden && 'skipped'
				)}
				data-view-id={view.id}
				aria-current={active ? 'true' : undefined}
				aria-label={label}
				tabIndex={tabIndex}
				onClick={() => onSelect(view.id)}
				onKeyDown={onKeyDown}
				onContextMenu={onContextMenu}
			>
				<span className="c-slide-thumb__number">{index + 1}</span>
				<span
					className="c-slide-thumb__box"
					style={{ aspectRatio: `${view.width} / ${view.height}` }}
				>
					<PresentationSlide
						view={view}
						doc={doc}
						ownerTag={ownerTag}
						token={token}
						thumbnail
						isVisible
						renderContent={near}
					/>
					{tplIndex >= 0 && (
						<span className="c-slide-thumb__tpl" title={templates[tplIndex].name}>
							T{tplIndex + 1}
						</span>
					)}
					{view.hidden && (
						<span className="c-slide-thumb__skip" title={t('Skipped in presentation')}>
							<IcHide />
						</span>
					)}
					{hasNotes && (
						<span className="c-slide-thumb__notes" title={t('Has speaker notes')}>
							<IcComment />
						</span>
					)}
				</span>
			</button>
			{names.length > 0 && (
				// Beside the button (a <div> inside it is invalid); the button's label names them
				<span
					className="c-slide-thumb__presence"
					aria-hidden="true"
					title={names.join(', ')}
				>
					{presenters.length > 0 && <IcPlay className="c-slide-thumb__presenting" />}
					<AvatarGroup max={PRESENCE_MAX} size="xs">
						{presenters.map((u) => (
							<PresenceAvatar
								key={u.idTag ?? u.connId}
								className="presenting"
								user={u}
								size="xs"
								guestLabel={guestLabel}
							/>
						))}
						{others.map((u) => (
							<PresenceAvatar
								key={u.idTag ?? u.connId}
								user={u}
								size="xs"
								guestLabel={guestLabel}
							/>
						))}
					</AvatarGroup>
				</span>
			)}
			{onMore && (
				// Not a Tab stop: keyboard users open the same menu with Shift+F10
				<Button
					variant="ghost"
					size="sm"
					className="c-slide-thumb__more"
					icon={<IcMore />}
					tabIndex={-1}
					aria-label={t('Actions for slide {{n}}', { n: index + 1 })}
					onClick={(e) => onMore(e.currentTarget)}
				/>
			)}
		</div>
	)
}

// vim: ts=4
