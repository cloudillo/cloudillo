// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The Map view of `/~/communities/map`: `layoutPartnerMap` output drawn as SVG. Pan by
 * dragging, zoom with the wheel, a pinch or the buttons. Nodes are focusable, arrow keys move
 * between them in ring order, Enter/Space (or a click) opens the node's action menu.
 */

import {
	Button,
	HBox,
	MenuItem,
	PopoverSurface,
	ProfilePicture,
	useAuth,
	VBox,
	type VirtualAnchor
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuLogIn as IcEnter,
	LuSquareArrowOutUpRight as IcOpen,
	LuUser as IcProfile,
	LuScan as IcReset,
	LuZoomIn as IcZoomIn,
	LuZoomOut as IcZoomOut
} from 'react-icons/lu'

import { enterViaLabel } from '../context/hat-entry.js'
import '../ui/community-map.css'
import type { MapActions } from './CommunityMap.js'
import { displayName, type MapLayout, type MapNode, RING2_RADIUS } from './map-layout.js'

/** Half the side of the unzoomed viewBox: ring 2 plus room for a node and its label. */
const EXTENT = RING2_RADIUS + 70
const AVATAR = 40
const MIN_SCALE = 0.5
const MAX_SCALE = 4
const MORE_KEY = '\u0000more'

interface View {
	cx: number
	cy: number
	scale: number
}

const INITIAL_VIEW: View = { cx: 0, cy: 0, scale: 1 }

function clampScale(s: number) {
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

/** Zoom by `factor` keeping the SVG point (px, py) where it is on screen. */
function zoomAt(v: View, factor: number, px: number, py: number): View {
	const scale = clampScale(v.scale * factor)
	const f = scale / v.scale
	return { scale, cx: px + (v.cx - px) / f, cy: py + (v.cy - py) / f }
}

interface OpenMenu {
	node: MapNode
	anchor: VirtualAnchor
}

export interface MapGraphProps {
	layout: MapLayout
	actions: MapActions
	onShowList: () => void
}

export function MapGraph({ layout, actions, onShowList }: MapGraphProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const [view, setView] = React.useState<View>(INITIAL_VIEW)
	const [active, setActive] = React.useState<string | undefined>()
	const [menu, setMenu] = React.useState<OpenMenu | undefined>()
	const svgRef = React.useRef<SVGSVGElement>(null)
	const nodeRefs = React.useRef(new Map<string, SVGGElement>())
	const pointers = React.useRef(new Map<number, { x: number; y: number }>())

	const ring1ByTag = React.useMemo(() => new Map(layout.ring1.map((n) => [n.idTag, n])), [layout])
	/** Ring-1 nodes on the path from me to `active`: itself on ring 1, its parents on ring 2. */
	const pathVia = React.useMemo(() => {
		if (!active) return new Set<string>()
		if (ring1ByTag.has(active)) return new Set([active])
		return new Set(layout.ring2.find((n) => n.idTag === active)?.parents ?? [])
	}, [active, ring1ByTag, layout])
	const pos = React.useMemo(() => {
		const m = new Map<string, { x: number; y: number }>()
		for (const n of [...layout.ring1, ...layout.ring2]) m.set(n.idTag, n)
		return m
	}, [layout])
	/** Focus / arrow-key order: ring 1 then ring 2, each in angle order, then "+N more". */
	const order = React.useMemo(
		() => [
			...layout.ring1.map((n) => n.idTag),
			...layout.ring2.map((n) => n.idTag),
			...(layout.more ? [MORE_KEY] : [])
		],
		[layout]
	)

	const size = (2 * EXTENT) / view.scale
	const viewBox = `${view.cx - size / 2} ${view.cy - size / 2} ${size} ${size}`

	/** Client (px) → SVG user coordinates. */
	function toSvg(clientX: number, clientY: number) {
		const ctm = svgRef.current?.getScreenCTM()
		if (!ctm) return { x: view.cx, y: view.cy }
		const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
		return { x: p.x, y: p.y }
	}

	// Wheel zoom needs a non-passive listener to stop the page scrolling.
	React.useEffect(function wheelZoom() {
		const svg = svgRef.current
		if (!svg) return
		function onWheel(evt: WheelEvent) {
			evt.preventDefault()
			const ctm = svg!.getScreenCTM()
			if (!ctm) return
			const p = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse())
			const factor = Math.exp(-evt.deltaY * 0.0015)
			setView((v) => zoomAt(v, factor, p.x, p.y))
		}
		svg.addEventListener('wheel', onWheel, { passive: false })
		return () => svg.removeEventListener('wheel', onWheel)
	}, [])

	function onPointerDown(evt: React.PointerEvent<SVGSVGElement>) {
		// Drags start on the background only: a press on a node is a click.
		if ((evt.target as Element).closest('.c-community-map-node')) return
		evt.currentTarget.setPointerCapture(evt.pointerId)
		pointers.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY })
	}

	function onPointerMove(evt: React.PointerEvent<SVGSVGElement>) {
		const ps = pointers.current
		const prev = ps.get(evt.pointerId)
		if (!prev) return
		const ctm = svgRef.current?.getScreenCTM()
		if (!ctm) return
		if (ps.size === 1) {
			const dx = (evt.clientX - prev.x) / ctm.a
			const dy = (evt.clientY - prev.y) / ctm.d
			setView((v) => ({ ...v, cx: v.cx - dx, cy: v.cy - dy }))
		} else if (ps.size === 2) {
			const other = [...ps.entries()].find(([id]) => id !== evt.pointerId)![1]
			const before = Math.hypot(prev.x - other.x, prev.y - other.y)
			const after = Math.hypot(evt.clientX - other.x, evt.clientY - other.y)
			if (before > 0) {
				const mid = toSvg((evt.clientX + other.x) / 2, (evt.clientY + other.y) / 2)
				setView((v) => zoomAt(v, after / before, mid.x, mid.y))
			}
		}
		ps.set(evt.pointerId, { x: evt.clientX, y: evt.clientY })
	}

	function onPointerUp(evt: React.PointerEvent<SVGSVGElement>) {
		pointers.current.delete(evt.pointerId)
	}

	function zoomButton(factor: number) {
		setView((v) => zoomAt(v, factor, v.cx, v.cy))
	}

	function openMenu(node: MapNode) {
		const el = nodeRefs.current.get(node.idTag)
		if (!el) return
		setMenu({ node, anchor: { getBoundingClientRect: () => el.getBoundingClientRect() } })
	}

	function activate(key: string) {
		if (key === MORE_KEY) {
			onShowList()
			return
		}
		const node = ring1ByTag.get(key) ?? layout.ring2.find((n) => n.idTag === key)
		if (node) openMenu(node)
	}

	function onNodeKeyDown(evt: React.KeyboardEvent, key: string) {
		const i = order.indexOf(key)
		let next: number | undefined
		switch (evt.key) {
			case 'Enter':
			case ' ':
				evt.preventDefault()
				activate(key)
				return
			case 'ArrowRight':
			case 'ArrowDown':
				next = (i + 1) % order.length
				break
			case 'ArrowLeft':
			case 'ArrowUp':
				next = (i - 1 + order.length) % order.length
				break
			case 'Home':
				next = 0
				break
			case 'End':
				next = order.length - 1
				break
			default:
				return
		}
		evt.preventDefault()
		nodeRefs.current.get(order[next])?.focus()
	}

	function nodeLabel(n: MapNode) {
		if (n.ring === 1) return t('{{name}}, member community', { name: displayName(n.profile) })
		return t('{{name}}, partner of {{parents}}', {
			name: displayName(n.profile),
			parents: n.parents
				.map((p) => {
					const parent = ring1ByTag.get(p)
					return parent ? displayName(parent.profile) : p
				})
				.join(', ')
		})
	}

	function nodeProps(key: string, label: string) {
		return {
			ref: (el: SVGGElement | null) => {
				if (el) nodeRefs.current.set(key, el)
				else nodeRefs.current.delete(key)
			},
			className: 'c-community-map-node',
			role: 'button',
			tabIndex: key === order[0] ? 0 : -1,
			'aria-label': label,
			'aria-haspopup': key === MORE_KEY ? undefined : ('menu' as const),
			onClick: () => activate(key),
			onKeyDown: (evt: React.KeyboardEvent) => onNodeKeyDown(evt, key),
			onPointerEnter: () => setActive(key),
			onPointerLeave: () => setActive((a) => (a === key ? undefined : a)),
			onFocus: () => setActive(key),
			onBlur: () => setActive((a) => (a === key ? undefined : a))
		}
	}

	function line(from: { x: number; y: number }, to: { x: number; y: number }, lit: boolean) {
		return (
			<line
				x1={from.x}
				y1={from.y}
				x2={to.x}
				y2={to.y}
				className={lit ? 'c-community-map-edge active' : 'c-community-map-edge'}
			/>
		)
	}

	function renderNode(n: MapNode) {
		const name = displayName(n.profile)
		return (
			<g
				key={n.idTag}
				transform={`translate(${n.x} ${n.y})`}
				{...nodeProps(n.idTag, nodeLabel(n))}
				data-ring={n.ring}
				data-active={active === n.idTag || undefined}
			>
				<circle r={AVATAR / 2 + 4} className="c-community-map-halo" />
				<foreignObject x={-AVATAR / 2} y={-AVATAR / 2} width={AVATAR} height={AVATAR}>
					<ProfilePicture profile={n.profile} size="sm" />
				</foreignObject>
				<text y={AVATAR / 2 + 16} textAnchor="middle" className="c-community-map-label">
					{name.length > 18 ? `${name.slice(0, 17)}…` : name}
				</text>
			</g>
		)
	}

	const center = layout.center
	const menuNode = menu?.node

	return (
		<VBox className="c-community-map">
			{/* biome-ignore lint/plugin/no-raw-intrinsic: ds-allow: the map is hand-drawn SVG */}
			<svg
				ref={svgRef}
				className="c-community-map-svg"
				viewBox={viewBox}
				role="group"
				aria-label={t('Community map')}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				<g aria-hidden="true">
					{layout.ring1.map((n) => (
						<React.Fragment key={`c:${n.idTag}`}>
							{line(center, n, pathVia.has(n.idTag))}
						</React.Fragment>
					))}
					{layout.chords.map((c) => (
						<React.Fragment key={`h:${c.from}:${c.to}`}>
							{pos.get(c.from) &&
								pos.get(c.to) &&
								line(pos.get(c.from)!, pos.get(c.to)!, false)}
						</React.Fragment>
					))}
					{layout.edges.map((e) => (
						<React.Fragment key={`e:${e.from}:${e.to}`}>
							{pos.get(e.from) &&
								pos.get(e.to) &&
								line(pos.get(e.from)!, pos.get(e.to)!, active === e.to)}
						</React.Fragment>
					))}
				</g>

				<g className="c-community-map-me" aria-hidden="true">
					<circle r={AVATAR / 2 + 6} className="c-community-map-halo" />
					<foreignObject x={-AVATAR / 2} y={-AVATAR / 2} width={AVATAR} height={AVATAR}>
						<ProfilePicture
							profile={{
								idTag: auth?.idTag,
								name: auth?.name,
								profilePic: auth?.profilePic
							}}
							size="sm"
						/>
					</foreignObject>
				</g>

				{layout.ring1.map(renderNode)}
				{layout.ring2.map(renderNode)}

				{!!layout.more && (
					<g
						transform={`translate(${EXTENT - 50} ${EXTENT - 24})`}
						{...nodeProps(MORE_KEY, t('+{{count}} more', { count: layout.more }))}
						data-active={active === MORE_KEY || undefined}
					>
						<rect
							x={-44}
							y={-16}
							width={88}
							height={32}
							rx={16}
							className="c-community-map-halo"
						/>
						<text y={5} textAnchor="middle" className="c-community-map-label">
							{t('+{{count}} more', { count: layout.more })}
						</text>
					</g>
				)}
			</svg>

			<HBox className="c-community-map-zoom" gap={1}>
				<Button
					size="sm"
					icon={<IcZoomOut />}
					aria-label={t('Zoom out')}
					onClick={() => zoomButton(1 / 1.4)}
				/>
				<Button
					size="sm"
					icon={<IcReset />}
					aria-label={t('Reset view')}
					onClick={() => setView(INITIAL_VIEW)}
				/>
				<Button
					size="sm"
					icon={<IcZoomIn />}
					aria-label={t('Zoom in')}
					onClick={() => zoomButton(1.4)}
				/>
			</HBox>

			{menu && menuNode && (
				<PopoverSurface
					anchor={menu.anchor}
					placement="bottom"
					role="menu"
					width="md"
					aria-label={displayName(menuNode.profile)}
					onClose={() => setMenu(undefined)}
				>
					{menuNode.ring === 1 && (
						<MenuItem
							icon={<IcOpen />}
							label={t('Open')}
							onClick={() => {
								setMenu(undefined)
								actions.open(menuNode.idTag)
							}}
						/>
					)}
					<MenuItem
						icon={<IcProfile />}
						label={t('Profile')}
						onClick={() => {
							setMenu(undefined)
							actions.profile(menuNode.idTag)
						}}
					/>
					{menuNode.ring === 2 &&
						menuNode.parents.map((hat) => {
							const parent = ring1ByTag.get(hat)
							return (
								<MenuItem
									key={hat}
									icon={<IcEnter />}
									label={enterViaLabel(
										t,
										displayName(menuNode.profile),
										parent ? displayName(parent.profile) : hat
									)}
									onClick={() => {
										setMenu(undefined)
										actions.enterVia(menuNode.idTag, hat)
									}}
								/>
							)
						})}
				</PopoverSurface>
			)}
		</VBox>
	)
}

// vim: ts=4
