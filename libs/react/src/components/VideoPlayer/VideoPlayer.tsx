// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { LuVideoOff as IcVideoOff } from 'react-icons/lu'

import { useLibTranslation } from '../../i18n.js'
import { EmptyState } from '../EmptyState/index.js'
import { LoadingSpinner } from '../Loading/index.js'
import { createComponent, mergeClasses } from '../utils.js'

export interface VideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
	/** Server is still transcoding: shows a placeholder instead of the player */
	processing?: boolean
	/** Light-on-dark placeholder colours, for use over media / dark overlays */
	inverse?: boolean
	/** CSS `aspect-ratio` of the placeholders (default `16 / 9`) */
	aspect?: number | string
}

/**
 * The one place `<video>` renders: native controls, `preload="none"` unless
 * overridden, a processing placeholder and an error state. The ref is the `<video>`.
 */
export const VideoPlayer = createComponent<HTMLVideoElement, VideoPlayerProps>(
	'VideoPlayer',
	({ processing, inverse, aspect = '16 / 9', className, style, onError, src, ...props }, ref) => {
		const { t } = useLibTranslation()
		const [failed, setFailed] = React.useState(false)
		React.useEffect(() => setFailed(false), [src])

		if (processing || failed) {
			return (
				<div
					className={mergeClasses(
						'c-video-player',
						'placeholder',
						inverse && 'inverse',
						className
					)}
					style={{ aspectRatio: aspect, ...style }}
					role={processing ? 'status' : undefined}
					aria-live={processing ? 'polite' : undefined}
				>
					{processing ? (
						<LoadingSpinner
							size="sm"
							inverse={inverse}
							label={t('Processing video…')}
						/>
					) : (
						<EmptyState
							size="sm"
							color="error"
							inverse={inverse}
							icon={<IcVideoOff />}
							title={t('Video failed to load')}
						/>
					)}
				</div>
			)
		}

		return (
			<video
				ref={ref}
				controls
				preload="none"
				{...props}
				src={src}
				className={mergeClasses('c-video-player', className)}
				style={style}
				onError={(evt) => {
					setFailed(true)
					onError?.(evt)
				}}
			/>
		)
	}
)

// vim: ts=4
