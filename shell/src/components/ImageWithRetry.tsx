// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuImageOff as IcBroken, LuRotateCw as IcRetry } from 'react-icons/lu'
import { Skeleton } from '@cloudillo/react'

/**
 * Preload `src` via `new Image()` and retry transient failures with exponential
 * backoff: `1000 * 1.5 ** attempt` ms, up to `maxAttempts` (default 5). Each
 * retry appends a `_={Date.now()}` cachebuster so a browser-cached 404 cannot
 * defeat the loop. Returns the URL that actually loaded (`activeSrc`), an
 * `errored` flag once the attempt budget is exhausted, and a `retry()`
 * callback to restart the loop on demand.
 */
export function useRetriedImageUrl(
	src: string | undefined,
	opts?: { maxAttempts?: number }
): { activeSrc: string | undefined; errored: boolean; retry: () => void } {
	const maxAttempts = opts?.maxAttempts ?? 5
	const [activeSrc, setActiveSrc] = React.useState<string | undefined>(undefined)
	const [errored, setErrored] = React.useState(false)
	const [retryNonce, setRetryNonce] = React.useState(0)

	React.useEffect(() => {
		setActiveSrc(undefined)
		setErrored(false)
		if (!src) return

		let cancelled = false
		let attempt = 0
		let timer: ReturnType<typeof setTimeout> | undefined
		let img: HTMLImageElement | null = null

		function tryLoad() {
			const next = new Image()
			img = next
			const url =
				attempt === 0 ? src! : `${src}${src!.includes('?') ? '&' : '?'}_=${Date.now()}`
			next.onload = () => {
				if (cancelled) return
				img = null
				setActiveSrc(url)
			}
			next.onerror = () => {
				if (cancelled) return
				img = null
				attempt++
				if (attempt >= maxAttempts) {
					setErrored(true)
					return
				}
				timer = setTimeout(tryLoad, 1000 * 1.5 ** attempt)
			}
			next.src = url
		}
		tryLoad()

		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
			if (img) {
				img.onload = null
				img.onerror = null
			}
		}
	}, [src, maxAttempts, retryNonce])

	const retry = React.useCallback(() => setRetryNonce((n) => n + 1), [])
	return { activeSrc, errored, retry }
}

/**
 * Drop-in replacement for `<img>` that uses `useRetriedImageUrl` to preload and
 * retry, renders an OpalUI skeleton (sized via `skeletonStyle` so the
 * surrounding layout doesn't shift) while loading, and falls back to an error
 * state with a manual retry button once `maxAttempts` is exceeded.
 */
export interface ImageWithRetryProps
	extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
	src: string
	maxAttempts?: number
	skeletonClassName?: string
	skeletonStyle?: React.CSSProperties
}

export function ImageWithRetry({
	src,
	maxAttempts,
	skeletonClassName,
	skeletonStyle,
	...imgProps
}: ImageWithRetryProps) {
	const { t } = useTranslation()
	const { activeSrc, errored, retry } = useRetriedImageUrl(src, { maxAttempts })

	if (errored) {
		const retryLabel = t('Retry')
		return (
			<div
				className={`c-vbox g-1${skeletonClassName ? ` ${skeletonClassName}` : ''}`}
				style={{
					...skeletonStyle,
					alignItems: 'center',
					justifyContent: 'center',
					color: 'var(--col-on-container)',
					opacity: 0.7
				}}
			>
				<IcBroken
					size={24}
					role="img"
					aria-label={imgProps.alt || t('Image failed to load')}
				/>
				<button
					type="button"
					className="c-button link sm"
					onClick={retry}
					aria-label={retryLabel}
					title={retryLabel}
				>
					<IcRetry size={16} aria-hidden="true" />
				</button>
			</div>
		)
	}

	if (!activeSrc) {
		return <Skeleton variant="rect" className={skeletonClassName} style={skeletonStyle} />
	}

	return <img {...imgProps} src={activeSrc} />
}

// vim: ts=4
