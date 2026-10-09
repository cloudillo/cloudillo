// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Stand-in for an embedded view that is not live. Never shows content: glyph, title, a plain
 * reason, one action and (when the host allows it) Remove. Loading draws a skeleton at the last known size.
 */

import * as React from 'react'
import {
	LuCircleAlert as IcError,
	LuFileX as IcMissing,
	LuLayers as IcNested,
	LuLock as IcNoAccess,
	LuWifiOff as IcOffline,
	LuShieldAlert as IcUntrusted
} from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { AppIcon, isAppId } from '../AppIcon/index.js'
import { Button } from '../Button/index.js'
import { EmptyState } from '../EmptyState/index.js'
import { LoadingSpinner, Skeleton } from '../Loading/index.js'
import type { ColorVariant } from '../types.js'
import { mergeClasses } from '../utils.js'

export type EmbedStatus =
	| 'live'
	| 'loading'
	| 'offline'
	| 'no-access'
	| 'missing'
	| 'untrusted'
	| 'nested'
	| 'error'

export interface EmbedPlaceholderProps {
	status: EmbedStatus
	title?: string
	appId?: string
	/** `w: 0` = the full available width; `{ w: 0, h: 0 }` = fill the parent (CSS sized) */
	size: { w: number; h: number }
	onRetry?: () => void
	onRequestAccess?: () => void
	onLoadAnyway?: () => void
	onRemove?: () => void
	onOpenSource?: () => void
	className?: string
}

type Action = 'retry' | 'requestAccess' | 'loadAnyway' | 'remove' | 'openSource'

const STATUS: Record<
	Exclude<EmbedStatus, 'live' | 'loading'>,
	{ icon: React.ReactNode; color: ColorVariant; reason: string; actions: Action[] }
> = {
	offline: {
		icon: <IcOffline />,
		color: 'warning',
		reason: "You're offline. This embed loads when you reconnect.",
		actions: ['retry', 'openSource']
	},
	'no-access': {
		icon: <IcNoAccess />,
		color: 'warning',
		reason: "You don't have access to this document",
		actions: ['requestAccess', 'openSource', 'remove']
	},
	missing: {
		icon: <IcMissing />,
		color: 'neutral',
		reason: 'This view no longer exists',
		actions: ['openSource', 'remove']
	},
	untrusted: {
		icon: <IcUntrusted />,
		color: 'warning',
		reason: 'This embed comes from a source you have not trusted yet',
		actions: ['loadAnyway', 'remove']
	},
	nested: {
		icon: <IcNested />,
		color: 'neutral',
		reason: 'This embed is nested too deeply or embeds itself',
		actions: ['openSource', 'remove']
	},
	error: {
		icon: <IcError />,
		color: 'error',
		reason: "This embed couldn't be loaded",
		actions: ['retry', 'openSource', 'remove']
	}
}

const SPINNER_DELAY = 300

export function EmbedPlaceholder({
	status,
	title,
	appId,
	size,
	onRetry,
	onRequestAccess,
	onLoadAnyway,
	onRemove,
	onOpenSource,
	className
}: EmbedPlaceholderProps) {
	const { t } = useLibTranslation()
	const [showSpinner, setShowSpinner] = React.useState(false)

	React.useEffect(
		function delaySpinner() {
			if (status !== 'loading') return
			setShowSpinner(false)
			const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY)
			return () => clearTimeout(timer)
		},
		[status]
	)

	const style: React.CSSProperties | undefined = size.w
		? { width: size.w, aspectRatio: `${size.w} / ${size.h}` }
		: size.h
			? { height: size.h }
			: undefined

	if (status === 'live') return null

	if (status === 'loading') {
		return (
			<Skeleton
				variant="rounded"
				className={mergeClasses('cl-embed-placeholder', className)}
				style={style}
				aria-label={title ? t('Loading {{title}}', { title }) : t('Loading')}
			>
				{showSpinner && <LoadingSpinner size="sm" />}
			</Skeleton>
		)
	}

	const info = STATUS[status]
	const buttons: Record<Action, [string, (() => void) | undefined]> = {
		retry: [t('Retry'), onRetry],
		requestAccess: [t('Request access'), onRequestAccess],
		loadAnyway: [t('Load anyway'), onLoadAnyway],
		openSource: [t('Open source'), onOpenSource],
		remove: [t('Remove'), onRemove]
	}
	const action = info.actions.map((a) => buttons[a]).find(([, fn]) => fn)
	const secondaryRemove = onRemove && action?.[1] !== onRemove

	function onKeyDown(evt: React.KeyboardEvent<HTMLDivElement>) {
		if (evt.target !== evt.currentTarget || !onRemove) return
		if (evt.key !== 'Delete' && evt.key !== 'Backspace') return
		// Keep host editors (Quill's keyboard module) from also acting on the key
		evt.preventDefault()
		evt.stopPropagation()
		onRemove()
	}

	return (
		<div
			className={mergeClasses('cl-embed-placeholder', className)}
			style={style}
			role="group"
			aria-label={title}
			tabIndex={0}
			onKeyDown={onKeyDown}
		>
			<EmptyState
				size="sm"
				fill
				color={info.color}
				icon={info.icon}
				title={
					title && (
						<span className="cl-embed-placeholder-title">
							{isAppId(appId) && <AppIcon app={appId} size="sm" tile={false} />}
							{title}
						</span>
					)
				}
				description={<span role="status">{t(info.reason)}</span>}
				actions={
					(action || secondaryRemove) && (
						<>
							{action && (
								<Button size="sm" onClick={action[1]}>
									{action[0]}
								</Button>
							)}
							{secondaryRemove && (
								<Button size="sm" variant="ghost" onClick={onRemove}>
									{t('Remove')}
								</Button>
							)}
						</>
					)
				}
			/>
		</div>
	)
}

// vim: ts=4
