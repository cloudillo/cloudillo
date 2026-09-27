// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuImageOff as IcBroken, LuRotateCw as IcRetry } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { Button } from '../Button/index.js'
import { Skeleton } from '../Loading/index.js'
import { mergeClasses } from '../utils.js'

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
			const next = new window.Image()
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

export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
	/** Undefined is the error state, not the loading one: it never resolves by waiting */
	src: string | undefined
	/** Required; `""` marks the image decorative */
	alt: string
	/** CSS `aspect-ratio` (e.g. `1`, `'16 / 9'`); also reserves the box while loading */
	aspect?: number | string
	/** CSS `object-fit` */
	fit?: 'cover' | 'contain'
	/** Replaces the default broken-image + retry state */
	fallback?: React.ReactNode
	/** Load attempts before giving up (default 5) */
	maxAttempts?: number
	/** @deprecated pass `className` — it applies to the loading and error states too */
	skeletonClassName?: string
	/** @deprecated pass `style` / `aspect` — they apply to the loading and error states too */
	skeletonStyle?: React.CSSProperties
}

/**
 * `<img>` with preload + retry (`useRetriedImageUrl`): a Skeleton of the same box
 * while loading, a broken-image state with a manual retry once attempts run out.
 */
export function Image({
	src,
	alt,
	aspect,
	fit,
	fallback,
	maxAttempts,
	skeletonClassName,
	skeletonStyle,
	className,
	style,
	...imgProps
}: ImageProps) {
	const { t } = useLibTranslation()
	const { activeSrc, errored, retry } = useRetriedImageUrl(src, { maxAttempts })
	const boxStyle: React.CSSProperties = { aspectRatio: aspect, ...style }
	// Legacy callers size the placeholder separately from the <img>
	const legacy = skeletonClassName !== undefined || skeletonStyle !== undefined
	const placeholderClass = legacy ? skeletonClassName : className
	const placeholderStyle = legacy ? { aspectRatio: aspect, ...skeletonStyle } : boxStyle

	if (errored || !src) {
		if (fallback !== undefined) return <>{fallback}</>
		const retryLabel = t('Retry')
		return (
			<span
				className={mergeClasses('c-image-fallback', placeholderClass)}
				style={placeholderStyle}
			>
				<IcBroken size={24} role="img" aria-label={alt || t('Image failed to load')} />
				{/* Nothing to retry when there was never a URL. */}
				{errored && (
					<Button
						variant="ghost"
						size="sm"
						icon={<IcRetry size={16} />}
						aria-label={retryLabel}
						onClick={retry}
					/>
				)}
			</span>
		)
	}

	if (!activeSrc) {
		return <Skeleton variant="rect" className={placeholderClass} style={placeholderStyle} />
	}

	return (
		<img
			{...imgProps}
			src={activeSrc}
			alt={alt}
			className={mergeClasses('c-image', className)}
			style={fit ? { ...boxStyle, objectFit: fit } : boxStyle}
		/>
	)
}

// vim: ts=4
