// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Presentational media + text helpers shared by the feed's first-class posts
 * (feed.tsx Post) and the reposted-original inset (EmbeddedPostCard). Kept as a
 * leaf module with no dependency back on feed.tsx so the import graph stays
 * acyclic.
 */

import { getFileUrl, getOptimalImageVariant, getOptimalVideoVariant } from '@cloudillo/core'
import { generateFragments, LoadingSpinner } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileText as IcDocument, LuPlay as IcPlay } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Slideshow from 'yet-another-react-lightbox/plugins/slideshow'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import 'react-photo-album/rows.css'

import { ImageWithRetry, useRetriedImageUrl } from '../../components/ImageWithRetry.js'

//////////////////////
// Image formatting //
//////////////////////

function thumbSkeletonStyle(
	att: { dim?: readonly [number, number] | number[] | null },
	base: React.CSSProperties
): React.CSSProperties {
	const dim = att.dim && att.dim.length >= 2 ? att.dim : [100, 100]
	const [w, h] = dim
	// Caller-supplied aspectRatio (if any) wins over the dim-derived default.
	return { aspectRatio: `${w} / ${h}`, ...base }
}

interface ImagesProps {
	width: number
	attachments: ActionView['attachments']
	idTag: string | undefined
}
export function Images({ width, attachments, idTag }: ImagesProps) {
	const { t } = useTranslation()
	const [lbIndex, setLbIndex] = React.useState<number | undefined>()
	const gap = 8
	const [img1, img2, img3] = attachments || []

	// Lightbox: best available local variant for fullscreen
	const photos = React.useMemo(
		() =>
			idTag
				? attachments?.map((im) => ({
						src: getFileUrl(
							idTag,
							im.fileId,
							getOptimalImageVariant('fullscreen', im.localVariants)
						),
						width: im.dim?.[0] || 100,
						height: im.dim?.[1] || 100
					}))
				: undefined,
		[attachments, idTag]
	)

	if (!idTag || !attachments?.length) return null

	// Inline images: always local, preferred variant for preview
	const getInlineUrl = (att: NonNullable<typeof attachments>[0]) =>
		getFileUrl(idTag, att.fileId, getOptimalImageVariant('preview', att.localVariants))

	let imgNode: React.ReactNode

	switch (attachments?.length) {
		case 0:
			return null
		case 1:
			imgNode = (
				<ImageWithRetry
					alt={t('Image {{n}}', { n: 1 })}
					className="cursor-pointer"
					onClick={() => setLbIndex(0)}
					src={getInlineUrl(img1)}
					style={{ maxWidth: '100%', maxHeight: '30rem', margin: '0 auto' }}
					skeletonStyle={thumbSkeletonStyle(img1, {
						maxWidth: '100%',
						maxHeight: '30rem',
						margin: '0 auto',
						width: '100%'
					})}
				/>
			)
			break
		case 2: {
			const aspect12 =
				(img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) +
				(img2.dim?.[0] ?? 100) / (img2.dim?.[1] ?? 100)
			const height = (width - gap) / aspect12

			imgNode = (
				<div className="c-hbox g-2">
					<ImageWithRetry
						alt={t('Image {{n}}', { n: 1 })}
						className="cursor-pointer"
						onClick={() => setLbIndex(0)}
						src={getInlineUrl(img1)}
						style={{ height, margin: '0 auto' }}
						skeletonStyle={thumbSkeletonStyle(img1, { height, margin: '0 auto' })}
					/>
					<ImageWithRetry
						alt={t('Image {{n}}', { n: 2 })}
						className="cursor-pointer"
						onClick={() => setLbIndex(1)}
						src={getInlineUrl(img2)}
						style={{ height, margin: '0 auto' }}
						skeletonStyle={thumbSkeletonStyle(img2, { height, margin: '0 auto' })}
					/>
				</div>
			)
			break
		}
		default: {
			// Adding the reciprocals of the aspect ratios of img2 and img3
			const aspect23 =
				1 /
				((img2.dim?.[1] ?? 100) / (img2.dim?.[0] ?? 100) +
					(img3.dim?.[1] ?? 100) / (img3.dim?.[0] ?? 100))
			// Adding the aspect ratios of img1 and the right column (img2 and img3)
			const aspect123 = (img1.dim?.[0] ?? 100) / (img1.dim?.[1] ?? 100) + aspect23
			const height = (width - gap) / aspect123
			const width23 = (height - gap) * aspect23

			imgNode = (
				<div className="c-hbox g-2">
					<ImageWithRetry
						alt={t('Image {{n}}', { n: 1 })}
						className="cursor-pointer"
						onClick={() => setLbIndex(0)}
						src={getInlineUrl(img1)}
						style={{ height, margin: '0 auto' }}
						skeletonStyle={thumbSkeletonStyle(img1, { height, margin: '0 auto' })}
					/>
					<div className="c-vbox">
						<ImageWithRetry
							alt={t('Image {{n}}', { n: 2 })}
							className="cursor-pointer"
							onClick={() => setLbIndex(1)}
							src={getInlineUrl(img2)}
							style={{ width: width23, margin: '0 auto' }}
							skeletonStyle={thumbSkeletonStyle(img2, {
								width: width23,
								margin: '0 auto'
							})}
						/>
						{attachments.length == 3 ? (
							<ImageWithRetry
								alt={t('Image {{n}}', { n: 3 })}
								className="cursor-pointer"
								onClick={() => setLbIndex(2)}
								src={getInlineUrl(img3)}
								style={{ width: width23, margin: '0 auto' }}
								skeletonStyle={thumbSkeletonStyle(img3, {
									width: width23,
									margin: '0 auto'
								})}
							/>
						) : (
							<div
								className="pos-relative"
								style={{ width: width23, margin: '0 auto' }}
							>
								<ImageWithRetry
									alt={t('Image {{n}}', { n: 3 })}
									className="w-100"
									src={getInlineUrl(img3)}
									skeletonStyle={thumbSkeletonStyle(img3, { width: '100%' })}
								/>
								<div
									onClick={() => setLbIndex(2)}
									className="c-image-overlay-counter cursor-pointer"
								>
									+{attachments.length - 3}
								</div>
							</div>
						)}
					</div>
				</div>
			)
		}
	}

	return (
		<>
			{imgNode}
			<Lightbox
				slides={photos}
				open={lbIndex !== undefined}
				index={lbIndex}
				close={() => setLbIndex(undefined)}
				plugins={[Fullscreen, Slideshow, Thumbnails, Zoom]}
			/>
		</>
	)
}

/////////////////////
// Video component //
/////////////////////
const PLAYABLE_VARIANTS = ['vid.xd', 'vid.hd', 'vid.md', 'vid.sd']
const POSTER_VARIANTS = ['vis.md', 'vis.sd', 'vis.tn']

export function hasPlayableVariant(variants: readonly string[] | undefined): boolean {
	if (!variants) return false
	return PLAYABLE_VARIANTS.some((v) => variants.includes(v))
}

function hasPosterVariant(variants: readonly string[] | undefined): boolean {
	if (!variants) return false
	return POSTER_VARIANTS.some((v) => variants.includes(v))
}

interface VideoProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
}

export function Video({ attachments, idTag }: VideoProps) {
	const { t } = useTranslation()
	const videoAtt = attachments?.[0]
	const variants = videoAtt?.localVariants
	const playable = hasPlayableVariant(variants)
	const hasPoster = hasPosterVariant(variants)

	const posterUrl =
		idTag && videoAtt && hasPoster
			? getFileUrl(idTag, videoAtt.fileId, getOptimalVideoVariant('preview', variants))
			: undefined

	const { activeSrc: activePoster } = useRetriedImageUrl(posterUrl)
	const [activated, setActivated] = React.useState(false)

	if (!idTag || !videoAtt) return null

	if (!playable) {
		return (
			<div
				className="c-skeleton c-skeleton--rect c-skeleton--rounded c-skeleton--animate pos-relative"
				style={{
					aspectRatio: '16 / 9',
					maxHeight: '30rem',
					backgroundImage: activePoster ? `url(${activePoster})` : undefined,
					backgroundSize: 'cover',
					backgroundPosition: 'center'
				}}
				role="status"
				aria-live="polite"
				aria-label={t('Processing video')}
			>
				<div
					className="c-vbox g-2 align-items-center justify-content-center pos-absolute"
					style={{
						inset: 0,
						background: 'rgba(0, 0, 0, 0.25)',
						color: 'var(--col-on-container)'
					}}
				>
					<LoadingSpinner size="sm" />
					<span>{t('Processing video…')}</span>
				</div>
			</div>
		)
	}

	const videoUrl = getFileUrl(
		idTag,
		videoAtt.fileId,
		getOptimalVideoVariant('fullscreen', variants)
	)

	const aspectRatio = videoAtt.dim ? `${videoAtt.dim[0]} / ${videoAtt.dim[1]}` : '16 / 9'

	if (activated) {
		return (
			<video
				controls
				autoPlay
				preload="auto"
				poster={activePoster}
				className="c-feed-video"
				style={{ aspectRatio }}
			>
				<source src={videoUrl} />
			</video>
		)
	}

	return (
		<button
			type="button"
			className="c-feed-video-facade"
			style={{
				aspectRatio,
				backgroundImage: activePoster ? `url(${activePoster})` : undefined
			}}
			onClick={() => setActivated(true)}
			aria-label={t('Play video')}
		>
			<span className="c-feed-video-facade__play" aria-hidden="true">
				<IcPlay />
			</span>
		</button>
	)
}

///////////////////////
// Document component //
///////////////////////
interface DocumentProps {
	attachments: ActionView['attachments']
	idTag: string | undefined
	token?: string
}

export function Document({ attachments, idTag, token }: DocumentProps) {
	const { t } = useTranslation()
	const navigate = useNavigate()

	if (!idTag || !attachments?.length) return null

	const docAtt = attachments[0]
	const thumbnailUrl = getFileUrl(idTag, docAtt.fileId, 'vis.tn', { token })

	function handleClick() {
		navigate(`/app/${idTag}/view/${idTag}:${docAtt.fileId}`)
	}

	return (
		<div
			onClick={handleClick}
			className="pos-relative d-inline-block"
			style={{ maxWidth: '100%', cursor: 'pointer' }}
		>
			<ImageWithRetry
				alt={t('Document preview')}
				src={thumbnailUrl}
				style={{ maxWidth: '100%', maxHeight: '30rem', display: 'block' }}
				skeletonStyle={{
					maxWidth: '100%',
					maxHeight: '30rem',
					display: 'block',
					aspectRatio: '3 / 4',
					width: '12rem'
				}}
			/>
			<div
				className="pos-absolute d-flex align-items-center justify-content-center"
				style={{
					bottom: '0.5rem',
					right: '0.5rem',
					width: '2.5rem',
					height: '2.5rem',
					borderRadius: '50%',
					background: 'var(--col-feed-overlay, rgba(0, 0, 0, 0.6))',
					color: 'var(--col-on-primary, white)',
					fontSize: '1.25rem'
				}}
			>
				<IcDocument />
			</div>
		</div>
	)
}

// Render post body text: blank-line-separated paragraphs, single newlines as
// <br>, with rich fragments (links, mentions, …) per line. Shared by Post and
// EmbeddedPostCard so reposted originals render identically to first-class posts.
export function renderPostContent(content: string): React.ReactNode {
	return content.split('\n\n').map((paragraph, i) => (
		<p key={i}>
			{paragraph.split('\n').map((line, j, lines) => (
				<React.Fragment key={j}>
					{generateFragments(line).map((n, k) => (
						<React.Fragment key={k}>{n}</React.Fragment>
					))}
					{j < lines.length - 1 && <br />}
				</React.Fragment>
			))}
		</p>
	))
}

// vim: ts=4
