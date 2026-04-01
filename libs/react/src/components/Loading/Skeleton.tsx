// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { mergeClasses, createComponent } from '../utils.js'

export type SkeletonVariant = 'text' | 'circle' | 'rect' | 'rounded'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: SkeletonVariant
	width?: string | number
	height?: string | number
	animate?: boolean
}

export const Skeleton = createComponent<HTMLDivElement, SkeletonProps>(
	'Skeleton',
	({ className, variant = 'text', width, height, animate = true, style, ...props }, ref) => {
		const combinedStyle: React.CSSProperties = {
			...style,
			width: typeof width === 'number' ? `${width}px` : width,
			height: typeof height === 'number' ? `${height}px` : height
		}

		return (
			<div
				ref={ref}
				className={mergeClasses(
					'c-skeleton',
					`c-skeleton--${variant}`,
					animate && 'c-skeleton--animate',
					className
				)}
				style={combinedStyle}
				aria-hidden="true"
				{...props}
			/>
		)
	}
)

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
	lines?: number
	animate?: boolean
}

export const SkeletonText = createComponent<HTMLDivElement, SkeletonTextProps>(
	'SkeletonText',
	({ className, lines = 3, animate = true, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-skeleton-text', className)} {...props}>
				{Array.from({ length: lines }).map((_, i) => (
					<Skeleton
						key={i}
						variant="text"
						animate={animate}
						style={{
							width: i === lines - 1 ? '60%' : '100%',
							animationDelay: `${i * 0.1}s`
						}}
					/>
				))}
			</div>
		)
	}
)

export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
	showAvatar?: boolean
	showImage?: boolean
	lines?: number
	animate?: boolean
}

export const SkeletonCard = createComponent<HTMLDivElement, SkeletonCardProps>(
	'SkeletonCard',
	(
		{ className, showAvatar = true, showImage = false, lines = 3, animate = true, ...props },
		ref
	) => {
		return (
			<div
				ref={ref}
				className={mergeClasses('c-skeleton-card', 'c-panel', className)}
				{...props}
			>
				{showAvatar && (
					<div className="c-skeleton-card-header">
						<Skeleton variant="circle" width={40} height={40} animate={animate} />
						<div className="c-skeleton-card-header-text">
							<Skeleton variant="text" width="40%" animate={animate} />
							<Skeleton
								variant="text"
								width="25%"
								animate={animate}
								style={{ animationDelay: '0.1s' }}
							/>
						</div>
					</div>
				)}
				{showImage && (
					<Skeleton
						variant="rect"
						width="100%"
						height={200}
						animate={animate}
						style={{ animationDelay: '0.2s' }}
					/>
				)}
				<SkeletonText lines={lines} animate={animate} />
			</div>
		)
	}
)

export interface SkeletonListProps extends React.HTMLAttributes<HTMLDivElement> {
	count?: number
	showAvatar?: boolean
	animate?: boolean
}

export const SkeletonList = createComponent<HTMLDivElement, SkeletonListProps>(
	'SkeletonList',
	({ className, count = 3, showAvatar = true, animate = true, ...props }, ref) => {
		return (
			<div ref={ref} className={mergeClasses('c-skeleton-list', className)} {...props}>
				{Array.from({ length: count }).map((_, i) => (
					<div
						key={i}
						className="c-skeleton-list-item"
						style={{ animationDelay: `${i * 0.1}s` }}
					>
						{showAvatar && (
							<Skeleton variant="circle" width={32} height={32} animate={animate} />
						)}
						<div className="c-skeleton-list-item-content">
							<Skeleton variant="text" width="70%" animate={animate} />
							<Skeleton
								variant="text"
								width="40%"
								animate={animate}
								style={{ animationDelay: '0.05s' }}
							/>
						</div>
					</div>
				))}
			</div>
		)
	}
)

// vim: ts=4
