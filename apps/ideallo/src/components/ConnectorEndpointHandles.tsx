// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Terminal handles on a selected connector, rendered in the fixed (screen-space) layer beside
 * the rotation and pivot handles so they stay a constant size at any zoom.
 *
 * FOUR STATES, FOUR GLYPHS. A free anchor is invisible in the UI unless it is drawn differently
 * from a pinned or auto one, before binding and after it alike.
 *
 * The distinction is by SHAPE, not colour, so it survives colour-vision deficiency; the
 * PropertyBar's Start/End readout is the redundant textual channel.
 */

import * as React from 'react'

import type { AnchorPoint } from '../crdt/index.js'
import type { Terminal } from '../hooks/useConnectorEndpointDrag.js'

type Pt = [number, number]

export type TerminalState = 'free' | 'bound-auto' | 'bound-pinned' | 'bound-free'

export function terminalState(
	objectId: string | undefined,
	anchor: AnchorPoint | undefined
): TerminalState {
	if (!objectId) return 'free'
	if (!anchor || anchor === 'auto') return 'bound-auto'
	if (typeof anchor === 'object') return 'bound-free'
	return 'bound-pinned'
}

export interface ConnectorEndpointHandlesProps {
	/** Terminal positions in SCREEN coordinates */
	start: Pt
	end: Pt
	/**
	 * Where the drawn connector attaches, in SCREEN coordinates, when that is not where the handle
	 * sits - a bound terminal's handle is on its anchor point, the line starts on the outline.
	 * A dashed leader spans the gap; null when there is none.
	 */
	startAttach?: Pt | null
	endAttach?: Pt | null
	startState: TerminalState
	endState: TerminalState
	draggingTerminal?: Terminal | null
	mobile?: boolean
	onPointerDown: (terminal: Terminal, event: React.PointerEvent) => void
}

const HANDLE_RADIUS = 5
const HIT_RADIUS_DESKTOP = 11
const HIT_RADIUS_MOBILE = 22

export function ConnectorEndpointHandles({
	start,
	end,
	startAttach,
	endAttach,
	startState,
	endState,
	draggingTerminal,
	mobile = false,
	onPointerDown
}: ConnectorEndpointHandlesProps) {
	const hitRadius = mobile ? HIT_RADIUS_MOBILE : HIT_RADIUS_DESKTOP

	/**
	 * Two 44px targets on a short connector would overlap and the wrong terminal would win.
	 * When they are closer than a hit diameter apart, only the nearer one is grabbable - which
	 * is decided per-pointer-event, so we shrink the radius to half the gap instead.
	 */
	const separation = Math.hypot(end[0] - start[0], end[1] - start[1])
	const effectiveHit =
		separation < hitRadius * 2 ? Math.max(separation / 2, HANDLE_RADIUS) : hitRadius

	return (
		<g className="connector-endpoint-handles">
			<Handle
				terminal="start"
				at={start}
				attach={startAttach}
				state={startState}
				hitRadius={effectiveHit}
				dragging={draggingTerminal === 'start'}
				onPointerDown={onPointerDown}
			/>
			<Handle
				terminal="end"
				at={end}
				attach={endAttach}
				state={endState}
				hitRadius={effectiveHit}
				dragging={draggingTerminal === 'end'}
				onPointerDown={onPointerDown}
			/>
		</g>
	)
}

interface HandleProps {
	terminal: Terminal
	at: Pt
	attach?: Pt | null
	state: TerminalState
	hitRadius: number
	dragging: boolean
	onPointerDown: (terminal: Terminal, event: React.PointerEvent) => void
}

/** Shorter than this and the leader would be hidden under the handle circle anyway */
const LEADER_MIN_SCREEN = 3

function Handle({ terminal, at, attach, state, hitRadius, dragging, onPointerDown }: HandleProps) {
	const [x, y] = at
	const handleDown = React.useCallback(
		(event: React.PointerEvent) => {
			onPointerDown(terminal, event)
		},
		[onPointerDown, terminal]
	)

	const bound = state !== 'free'
	const className = [
		'connector-endpoint-handle',
		bound ? 'bound' : '',
		dragging ? 'dragging' : ''
	]
		.filter(Boolean)
		.join(' ')

	const showLeader = !!attach && Math.hypot(attach[0] - x, attach[1] - y) > LEADER_MIN_SCREEN

	return (
		<g className="connector-endpoint-handle-group">
			{/* Drawn first so the handle circle paints over the end of it */}
			{showLeader && attach && (
				<line
					className="connector-endpoint-leader"
					x1={x}
					y1={y}
					x2={attach[0]}
					y2={attach[1]}
					pointerEvents="none"
				/>
			)}
			{/* A bound-auto terminal floats: the ring says "the router picks where this sits" */}
			{state === 'bound-auto' && (
				<circle className="connector-endpoint-ring" cx={x} cy={y} r={HANDLE_RADIUS + 3.5} />
			)}
			<circle className={className} cx={x} cy={y} r={HANDLE_RADIUS} strokeWidth={2} />
			{/* A pin tick marks an anchor at an arbitrary point rather than a named one */}
			{state === 'bound-free' && (
				<line
					className="connector-endpoint-pin"
					x1={x}
					y1={y - HANDLE_RADIUS - 5}
					x2={x}
					y2={y - HANDLE_RADIUS - 1}
					strokeWidth={2}
					strokeLinecap="round"
				/>
			)}
			<circle
				className={dragging ? 'connector-endpoint-hit dragging' : 'connector-endpoint-hit'}
				cx={x}
				cy={y}
				r={hitRadius}
				onPointerDown={handleDown}
			/>
		</g>
	)
}

// vim: ts=4
