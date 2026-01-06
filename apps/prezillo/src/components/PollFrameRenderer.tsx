// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Renders poll frame objects on the canvas
 *
 * Features:
 * - Interactive voting element for presentations
 * - Rect or ellipse shape variants
 * - Vote counter badge
 * - Winner highlighting with glow effect
 * - User's vote indicator
 */

import * as React from 'react'
import type { PollFrameObject } from '../crdt/index.js'
import type { ResolvedShapeStyle, ResolvedTextStyle } from '../crdt/index.js'

export interface PollFrameRendererProps {
	object: PollFrameObject
	style: ResolvedShapeStyle
	textStyle: ResolvedTextStyle
	/** Bounds for rendering (x, y, width, height) */
	bounds?: {
		x: number
		y: number
		width: number
		height: number
	}
	/** Number of votes on this frame */
	voteCount: number
	/** Total votes across all poll frames (for percentage calculation) */
	totalVotes?: number
	/** Whether this frame is currently winning */
	isWinner: boolean
	/** Whether the current user has voted for this frame */
	hasMyVote: boolean
	/** Click handler for voting */
	onClick?: (e: React.MouseEvent) => void
	/** Whether voting is enabled (presentation mode) */
	isInteractive?: boolean
	/** Whether this frame is focused for keyboard navigation */
	isFocused?: boolean
	/** Edit mode - show guides (crown, fill bar) at reduced opacity for alignment */
	isEditMode?: boolean
}

export function PollFrameRenderer({
	object,
	style,
	textStyle,
	bounds,
	voteCount,
	totalVotes = 0,
	isWinner,
	hasMyVote,
	onClick,
	isInteractive = false,
	isFocused = false,
	isEditMode = false
}: PollFrameRendererProps) {
	// Use bounds if provided, otherwise use object properties
	const x = bounds?.x ?? object.x
	const y = bounds?.y ?? object.y
	const width = bounds?.width ?? object.width
	const height = bounds?.height ?? object.height

	const shape = object.shape ?? 'rect'

	// Calculate percentage
	const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0

	// Vote ripple animation state
	const [showRipple, setShowRipple] = React.useState(false)
	const prevVoteCount = React.useRef(voteCount)

	React.useEffect(() => {
		if (voteCount > prevVoteCount.current) {
			setShowRipple(true)
			const timer = setTimeout(() => setShowRipple(false), 600)
			return () => clearTimeout(timer)
		}
		prevVoteCount.current = voteCount
	}, [voteCount])

	// Dynamic styling based on state
	const strokeDasharray = hasMyVote || isWinner ? 'none' : '8 4'
	const strokeWidth = isWinner ? 4 : hasMyVote ? 3 : 2
	const strokeColor = isWinner
		? '#22c55e' // Green for winner
		: hasMyVote
			? '#3b82f6' // Blue for user's vote
			: isFocused
				? '#8b5cf6' // Purple for keyboard focus
				: style.stroke || '#6366f1' // Default indigo

	// Fill bar color matches stroke state
	const fillBarColor = isWinner ? '#22c55e' : hasMyVote ? '#3b82f6' : '#6366f1'

	// Fill color - use style fill or a light indigo
	const fillColor = style.fill || 'rgba(99, 102, 241, 0.1)'
	const fillOpacity = style.fillOpacity ?? 1

	// Glow effect for winner
	const filterId = `poll-glow-${object.id}`

	// Fill bar dimensions
	const fillBarHeight = 24
	const fillBarY = y + height - fillBarHeight - 8 // 8px padding from bottom
	const fillBarPadding = 8
	const fillBarWidth = width - fillBarPadding * 2

	// Badge positioning (top-right corner) - larger for mobile visibility
	const badgeRadius = 22
	const badgeX = x + width - badgeRadius
	const badgeY = y + badgeRadius

	// "Your vote" indicator positioning (top-left corner) - larger for mobile visibility
	const myVoteRadius = 18
	const myVoteX = x + myVoteRadius
	const myVoteY = y + myVoteRadius

	// Crown positioning (centered at top inside frame)
	const crownX = x + width / 2
	const crownY = y + 30

	return (
		<g
			className={`prezillo-pollframe ${isInteractive ? 'interactive' : ''}`}
			onClick={isInteractive ? onClick : undefined}
			style={{ cursor: isInteractive ? 'pointer' : 'default' }}
		>
			{/* Glow filter definition for winner state */}
			<defs>
				<filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
					<feDropShadow
						dx="0"
						dy="0"
						stdDeviation={isWinner ? 6 : 0}
						floodColor="#22c55e"
						floodOpacity={isWinner ? 0.6 : 0}
					/>
				</filter>
			</defs>

			{/* Shape (rect or ellipse) */}
			{shape === 'rect' ? (
				<rect
					x={x}
					y={y}
					width={width}
					height={height}
					rx={8}
					ry={8}
					fill={fillColor}
					fillOpacity={fillOpacity}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					strokeDasharray={strokeDasharray}
					filter={isWinner ? `url(#${filterId})` : undefined}
				/>
			) : (
				<ellipse
					cx={x + width / 2}
					cy={y + height / 2}
					rx={width / 2}
					ry={height / 2}
					fill={fillColor}
					fillOpacity={fillOpacity}
					stroke={strokeColor}
					strokeWidth={strokeWidth}
					strokeDasharray={strokeDasharray}
					filter={isWinner ? `url(#${filterId})` : undefined}
				/>
			)}

			{/* Focus ring for keyboard navigation */}
			{isFocused && (
				<>
					{shape === 'rect' ? (
						<rect
							x={x - 3}
							y={y - 3}
							width={width + 6}
							height={height + 6}
							rx={10}
							ry={10}
							fill="none"
							stroke="#8b5cf6"
							strokeWidth={2}
							strokeDasharray="4 2"
						/>
					) : (
						<ellipse
							cx={x + width / 2}
							cy={y + height / 2}
							rx={width / 2 + 3}
							ry={height / 2 + 3}
							fill="none"
							stroke="#8b5cf6"
							strokeWidth={2}
							strokeDasharray="4 2"
						/>
					)}
				</>
			)}

			{/* Vote ripple animation */}
			{showRipple && (
				<rect
					x={x - 4}
					y={y - 4}
					width={width + 8}
					height={height + 8}
					rx={12}
					fill="none"
					stroke="#3b82f6"
					strokeWidth={3}
					className="poll-vote-ripple"
				/>
			)}

			{/* Label text - position higher to make room for fill bar */}
			{object.label && (
				<text
					x={x + width / 2}
					y={y + height / 2 - (totalVotes > 0 || isEditMode ? 16 : 0)}
					textAnchor="middle"
					dominantBaseline="middle"
					fontFamily={textStyle.fontFamily}
					fontSize={textStyle.fontSize}
					fontWeight={textStyle.fontWeight}
					fill={textStyle.fill}
				>
					{object.label}
				</text>
			)}

			{/* Percentage fill bar - show when there are votes OR in edit mode as guide */}
			{(totalVotes > 0 || isEditMode) && (
				<g
					className="poll-fill-bar-group"
					opacity={isEditMode && totalVotes === 0 ? 0.5 : 1}
				>
					{/* Background bar */}
					<rect
						x={x + fillBarPadding}
						y={fillBarY}
						width={fillBarWidth}
						height={fillBarHeight}
						rx={4}
						fill="rgba(0, 0, 0, 0.15)"
					/>
					{/* Progress bar - show 50% placeholder in edit mode */}
					<rect
						x={x + fillBarPadding}
						y={fillBarY}
						width={
							fillBarWidth * (isEditMode && totalVotes === 0 ? 0.5 : percentage / 100)
						}
						height={fillBarHeight}
						rx={4}
						fill={fillBarColor}
						className="poll-fill-bar"
					/>
					{/* Percentage text */}
					<text
						x={x + width / 2}
						y={fillBarY + fillBarHeight / 2}
						textAnchor="middle"
						dominantBaseline="middle"
						fill="white"
						fontSize={14}
						fontWeight="bold"
						fontFamily="system-ui, sans-serif"
						style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
					>
						{isEditMode && totalVotes === 0 ? '50%' : `${percentage}%`}
					</text>
				</g>
			)}

			{/* Vote counter badge */}
			{voteCount > 0 && (
				<g className="poll-badge">
					<circle
						cx={badgeX}
						cy={badgeY}
						r={badgeRadius}
						fill={isWinner ? '#22c55e' : '#3b82f6'}
					/>
					<text
						x={badgeX}
						y={badgeY}
						textAnchor="middle"
						dominantBaseline="middle"
						fill="white"
						fontSize={16}
						fontWeight="bold"
						fontFamily="system-ui, sans-serif"
					>
						{voteCount}
					</text>
				</g>
			)}

			{/* "Your vote" indicator */}
			{hasMyVote && (
				<g className="poll-my-vote">
					<circle cx={myVoteX} cy={myVoteY} r={myVoteRadius} fill="#3b82f6" />
					<text
						x={myVoteX}
						y={myVoteY}
						textAnchor="middle"
						dominantBaseline="middle"
						fill="white"
						fontSize={18}
						fontWeight="bold"
						fontFamily="system-ui, sans-serif"
					>
						✓
					</text>
				</g>
			)}

			{/* Winner crown icon - show when winning OR in edit mode as guide */}
			{(isWinner || isEditMode) && (
				<g
					transform={`translate(${crownX}, ${crownY})`}
					opacity={isEditMode && !isWinner ? 0.5 : 1}
				>
					{/* Inner group for animation (CSS transform won't affect outer positioning) */}
					<g className={isWinner ? 'poll-winner-crown' : ''} transform="scale(2.5)">
						{/* Crown shape */}
						<path
							d="M-16 10 L-12 -2 L-4 4 L0 -6 L4 4 L12 -2 L16 10 Z"
							fill="#fbbf24"
							stroke="#f59e0b"
							strokeWidth={1.5}
						/>
						{/* Jewels */}
						<circle cx={-8} cy={2} r={2.5} fill="#ef4444" />
						<circle cx={0} cy={-2} r={2.5} fill="#3b82f6" />
						<circle cx={8} cy={2} r={2.5} fill="#22c55e" />
					</g>
				</g>
			)}
		</g>
	)
}

// vim: ts=4
