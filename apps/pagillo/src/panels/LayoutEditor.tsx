// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * "Page layouts" panel: replaces the right panel's Format/Styles tabs while Edit layout is
 * on. Layout list (switch, rename, duplicate, assign, delete, new) and the edited layout's
 * settings. Text areas are drawn on the canvas (`editor/FrameOverlay.tsx`). Every geometry write
 * runs `ensureRegions` first in the same transaction (`layoutTx`), so it is one undo step.
 */

import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	IcAdd,
	IcDragHandle,
	IcMore,
	IcMoveDown,
	IcMoveUp,
	IcRemove,
	Input,
	Menu,
	MenuItem,
	NativeSelect,
	NumberInput,
	PropertyField,
	PropertySection
} from '@cloudillo/react'
import { marginRegion, ptToFx, type Region } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { frameOf, masterOf, mastersOf, sectionOf } from '../crdt/entities'
import { deleteFrame } from '../crdt/frame-ops'
import {
	type AreaKey,
	addMaster,
	areasOf,
	assignMaster,
	deleteMaster,
	duplicateMaster,
	layoutTx,
	setMasterSide,
	updateMaster,
	withAreas
} from '../crdt/master-ops'
import type { StoredMaster } from '../crdt/stored-types'
import {
	byIds,
	flipRegion,
	flowOrder,
	isRtlLang,
	masterItemIndex,
	resolveSide
} from '../crdt/type-converters'
import { IMPLICIT_REGION } from '../editor/frames'
import { LengthInput } from '../ui/LengthInput'
import type { PanelProps } from './FormatPanel'
import { useDocVersion } from './useY'

const FRAME_LABELS = { img: 'Image', txt: 'Text box', shp: 'Shape', emb: 'Embed' } as const

/** Gutter given to a multi-column layout whose source had none (matches the '2 column' template). */
const DEFAULT_GUTTER = ptToFx(24)

type Side = 'mirror' | 'same' | 'different'

/** New / Duplicate / Use for section dialog request; `id` = the source or assigned layout. */
interface DialogReq {
	mode: 'new' | 'duplicate' | 'assign'
	id: string
}

export interface LayoutsPanelProps extends PanelProps {
	/** Edited page layout (master id). */
	masterId: string
	/** Laid-out page count per master id. */
	usage: Map<string, number>
	/** Current page's section and slot: the default "Use it for" target. */
	page?: { sec: string; which: 'first' | 'rest' }
	/** Switch the edited layout. */
	onSwitch(id: string): void
}

export function LayoutsPanel({ yDoc, doc, masterId, usage, page, onSwitch }: LayoutsPanelProps) {
	const { t } = useTranslation()
	useDocVersion(doc)
	const [renaming, setRenaming] = React.useState<string>()
	const [req, setReq] = React.useState<DialogReq>()
	const m = masterOf(doc, masterId)
	if (!m) return null

	const facing = !!doc.m.get('facing')
	const secs = doc.secs.toArray()
	/** 1-based number of the first section using layout `id`, 0 if none. */
	const usedBy = (id: string) =>
		secs.findIndex((s) => {
			const x = sectionOf(doc, s)
			return x?.first === id || x?.rest === id
		}) + 1
	/** Geometry write: materialize the implicit area first, one transaction. */
	const write = (p: Partial<StoredMaster>) =>
		layoutTx(yDoc, doc, masterId, () => updateMaster(yDoc, doc, masterId, p))
	const rename = (id: string, name: string) => {
		setRenaming(undefined)
		const n = name.trim()
		if (n && n !== masterOf(doc, id)?.name) updateMaster(yDoc, doc, id, { name: n })
	}
	const remove = (id: string) => {
		const next = [...doc.ms.keys()].find((k) => k !== id)
		if (next && deleteMaster(yDoc, doc, id) && id === masterId) onSwitch(next)
	}
	const mg = m.margins
	const mi = masterItemIndex(doc).get(masterId)
	const items = !mi
		? []
		: resolveSide(m, facing) === 'different'
			? [...mi.both, ...mi.l, ...mi.r]
			: mi.both

	return (
		<div className="c-vbox g-2 p-2">
			<PropertySection title={t('Page layouts')}>
				<div className="c-vbox g-1">
					{mastersOf(doc).map(([id, x]) => {
						const n = usage.get(id) ?? 0
						const sec = usedBy(id)
						return (
							<div key={id} className="c-hbox g-1">
								{renaming === id ? (
									<Input
										className="flex-fill"
										aria-label={t('Name')}
										autoFocus
										defaultValue={x.name}
										onBlur={(e) => rename(id, e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') e.currentTarget.blur()
											else if (e.key === 'Escape') setRenaming(undefined)
										}}
									/>
								) : (
									<Button
										variant="ghost"
										className="flex-fill"
										pressed={id === masterId}
										onClick={() => onSwitch(id)}
									>
										<LayoutThumb m={x} />
										<span className="flex-fill">{x.name}</span>
										<span className="small text-muted">
											{n === 0
												? t('unused')
												: n === 1
													? t('1 page')
													: t('{{n}} pages', { n })}
										</span>
									</Button>
								)}
								<Menu
									trigger={
										<Button
											variant="ghost"
											size="sm"
											icon={<IcMore />}
											aria-label={t('Actions for {{name}}', { name: x.name })}
										/>
									}
								>
									<MenuItem label={t('Rename')} onClick={() => setRenaming(id)} />
									<MenuItem
										label={t('Duplicate')}
										onClick={() => setReq({ mode: 'duplicate', id })}
									/>
									<MenuItem
										label={t('Use for section…')}
										onClick={() => setReq({ mode: 'assign', id })}
									/>
									<MenuItem
										label={t('Delete')}
										color="error"
										disabled={!!sec || doc.ms.size < 2}
										description={
											sec ? t('Used by section {{n}}', { n: sec }) : undefined
										}
										onClick={() => remove(id)}
									/>
								</Menu>
							</div>
						)
					})}
					<div>
						<Button
							variant="link"
							icon={<IcAdd />}
							onClick={() => setReq({ mode: 'new', id: masterId })}
						>
							{t('New')}
						</Button>
					</div>
				</div>
				{!usage.get(masterId) && (
					<Alert compact>
						{t('Not used by any page')}
						{' · '}
						<Button
							variant="link"
							onClick={() => setReq({ mode: 'assign', id: masterId })}
						>
							{t('Use for section…')}
						</Button>
					</Alert>
				)}
			</PropertySection>
			<PropertySection title={t('Margins')}>
				<PropertyField label={t('Top')}>
					<LengthInput
						value={mg.t}
						min={0}
						onChange={(x) => write({ margins: { ...mg, t: x } })}
					/>
				</PropertyField>
				<PropertyField label={t('Bottom')}>
					<LengthInput
						value={mg.b}
						min={0}
						onChange={(x) => write({ margins: { ...mg, b: x } })}
					/>
				</PropertyField>
				<PropertyField label={t('Inside')}>
					<LengthInput
						value={mg.in}
						min={0}
						onChange={(x) => write({ margins: { ...mg, in: x } })}
					/>
				</PropertyField>
				<PropertyField label={t('Outside')}>
					<LengthInput
						value={mg.out}
						min={0}
						onChange={(x) => write({ margins: { ...mg, out: x } })}
					/>
				</PropertyField>
			</PropertySection>
			<PropertySection title={t('Column grid')}>
				<PropertyField label={t('Columns')}>
					<NumberInput
						value={m.cols}
						min={1}
						max={12}
						onChange={(n) => {
							const cols = Math.round(n)
							write(
								cols > 1 && !m.gutter ? { cols, gutter: DEFAULT_GUTTER } : { cols }
							)
						}}
					/>
				</PropertyField>
				<PropertyField label={t('Gutter')}>
					<LengthInput value={m.gutter} min={0} onChange={(x) => write({ gutter: x })} />
				</PropertyField>
			</PropertySection>
			<PropertySection title={t('Rows')}>
				<PropertyField label={t('Rows')}>
					<NumberInput
						value={m.rows ?? 1}
						min={1}
						max={12}
						onChange={(n) => write({ rows: Math.round(n) })}
					/>
				</PropertyField>
				<PropertyField label={t('Row gutter')}>
					<LengthInput
						value={m.rowGutter ?? m.gutter}
						min={0}
						onChange={(x) => write({ rowGutter: x })}
					/>
				</PropertyField>
			</PropertySection>
			{facing && (
				<PropertySection title={t('Left and right pages')}>
					<NativeSelect
						aria-label={t('Left and right pages')}
						value={resolveSide(m, facing)}
						onChange={(e) => setMasterSide(yDoc, doc, masterId, e.target.value as Side)}
					>
						<option value="mirror">{t('Mirrored')}</option>
						<option value="same">{t('Same')}</option>
						<option value="different">{t('Different')}</option>
					</NativeSelect>
				</PropertySection>
			)}
			<TextAreas yDoc={yDoc} doc={doc} masterId={masterId} m={m} facing={facing} />
			<PropertySection title={t('Items on every page')}>
				{items.length === 0 && <p className="small text-muted">{t('None')}</p>}
				{items.map((fid) => {
					const f = frameOf(doc, fid)
					return (
						<div key={fid} className="c-hbox g-2">
							<span className="flex-fill">
								{t(f ? FRAME_LABELS[f.t] : 'Missing item')}
							</span>
							<Button
								variant="ghost"
								size="sm"
								icon={<IcRemove />}
								aria-label={t('Remove item')}
								onClick={() => deleteFrame(yDoc, doc, fid)}
							/>
						</div>
					)
				})}
			</PropertySection>
			{req && (
				<LayoutDialog
					yDoc={yDoc}
					doc={doc}
					req={req}
					page={page}
					onClose={() => setReq(undefined)}
					onDone={(id) => {
						setReq(undefined)
						onSwitch(id)
					}}
				/>
			)}
		</div>
	)
}

interface AreaGroup {
	key: AreaKey
	label?: string
	regions: Region[]
	/** Mirrored left pages, manual flow: only the order is edited (`leftOrder`). */
	orderOnly?: boolean
}

interface TextAreasProps extends PanelProps {
	masterId: string
	m: StoredMaster
	facing: boolean
}

/**
 * Text areas section: name, columns and geometry per area, flow order (automatic, or manual with
 * drag handle + Move up/down), the left-page order nudge. Rows are numbered in text-flow order.
 */
function TextAreas({ yDoc, doc, masterId, m, facing }: TextAreasProps) {
	const { t } = useTranslation()
	const [open, setOpen] = React.useState<string>()
	const [drag, setDrag] = React.useState<{ key: AreaKey; i: number }>()
	const rtl = isRtlLang(String(doc.m.get('lang') || 'en'))
	const mode = resolveSide(m, facing)
	const manual = m.flow === 'manual'
	const order = (rs: Region[]) => (manual ? rs : flowOrder(rs, rtl))
	const flipped = m.regions.map((r) => flipRegion(r, m.w))

	const groups: AreaGroup[] =
		mode === 'different'
			? [
					{
						key: 'right',
						label: t('Right-hand pages'),
						regions: order(areasOf(m, 'right'))
					},
					{ key: 'left', label: t('Left-hand pages'), regions: order(areasOf(m, 'left')) }
				]
			: mode === 'mirror' && manual && m.regions.length > 1
				? [
						{ key: 'base', label: t('Right-hand pages'), regions: m.regions },
						{
							key: 'left',
							label: t('Left-hand pages'),
							regions: byIds(flipped, m.leftOrder),
							orderOnly: true
						}
					]
				: [{ key: 'base', regions: order(m.regions) }]
	const ids = (rs: Region[]) => rs.map((r) => r.id).join()
	const nudge =
		mode === 'mirror' &&
		!manual &&
		ids(flowOrder(m.regions, rtl)) !== ids(flowOrder(flipped, rtl))

	/** One undoable write: materialize the implicit area (`made` = its id), then patch. */
	const edit = (fn: (cur: StoredMaster, made: string | undefined) => Partial<StoredMaster>) =>
		layoutTx(yDoc, doc, masterId, (made) => {
			const cur = masterOf(doc, masterId)
			if (cur) updateMaster(yDoc, doc, masterId, fn(cur, made))
		})
	const real = (id: string, made: string | undefined) => (id === IMPLICIT_REGION ? made : id)
	const patch = (key: AreaKey, id: string, p: Partial<Region>) =>
		edit((cur, made) => {
			const rid = real(id, made)
			return withAreas(
				cur,
				key,
				areasOf(cur, key).map((r) => (r.id === rid ? { ...r, ...p } : r))
			)
		})
	const rename = (id: string, name: string) => {
		if ((m.regionNames?.[id] ?? '') === name) return
		edit((cur, made) => {
			const rid = real(id, made)
			if (!rid) return {}
			const names = { ...cur.regionNames }
			if (name) names[rid] = name
			else delete names[rid]
			return { regionNames: Object.keys(names).length ? names : undefined }
		})
	}
	const remove = (key: AreaKey, id: string) =>
		edit((cur) => {
			const p = withAreas(
				cur,
				key,
				areasOf(cur, key).filter((r) => r.id !== id)
			)
			if (cur.leftOrder) p.leftOrder = cur.leftOrder.filter((x) => x !== id)
			const rn = cur.regionNames
			if (mode !== 'different' && rn && id in rn) {
				const { [id]: _gone, ...names } = rn
				p.regionNames = Object.keys(names).length ? names : undefined
			}
			return p
		})
	/** Manual order: move the area at `from` to `to` within list `g`. */
	const move = (g: AreaGroup, from: number, to: number) => {
		if (to < 0 || to >= g.regions.length || from === to) return
		edit((cur) => {
			const rs = g.orderOnly ? byIds(cur.regions, cur.leftOrder) : areasOf(cur, g.key)
			const next = [...rs]
			const [r] = next.splice(from, 1)
			next.splice(to, 0, r)
			return g.orderOnly ? { leftOrder: next.map((x) => x.id) } : withAreas(cur, g.key, next)
		})
	}
	/** Switching to manual keeps the order the reader sees (the automatic one). */
	const setFlow = (v: string) =>
		edit((cur) => {
			if (v !== 'manual') return { flow: undefined, leftOrder: undefined }
			const p: Partial<StoredMaster> = {
				flow: 'manual',
				regions: flowOrder(cur.regions, rtl)
			}
			if (mode === 'mirror')
				p.leftOrder = flowOrder(
					cur.regions.map((r) => flipRegion(r, cur.w)),
					rtl
				).map((r) => r.id)
			for (const k of ['left', 'right'] as const) {
				const x = cur[k]
				if (mode === 'different' && x?.regions)
					p[k] = { ...x, regions: flowOrder(x.regions, rtl) }
			}
			return p
		})

	return (
		<PropertySection title={t('Text areas')}>
			<div className="c-vbox g-2">
				{(manual || groups.some((g) => g.regions.length > 1)) && (
					<PropertyField label={t('Order')}>
						<NativeSelect
							value={manual ? 'manual' : 'auto'}
							onChange={(e) => setFlow(e.target.value)}
						>
							<option value="auto">{t('Automatic')}</option>
							<option value="manual">{t('Manual')}</option>
						</NativeSelect>
					</PropertyField>
				)}
				{nudge && (
					<Alert compact>
						{t('Text flows in a different order on left-hand pages')}
						{' · '}
						<Button variant="link" onClick={() => setFlow('manual')}>
							{t('Set order manually')}
						</Button>
					</Alert>
				)}
				{groups.map((g) => {
					const implicit = g.regions.length === 0
					const rs = implicit
						? [
								{
									...marginRegion(
										g.key === 'base' ? m : { ...m, ...m[g.key] },
										g.key === 'left'
									),
									id: IMPLICIT_REGION
								}
							]
						: g.regions
					const canMove = manual && rs.length > 1
					return (
						<div key={g.key} className="c-vbox g-1">
							{g.label && <span className="small text-muted">{g.label}</span>}
							{rs.map((r, i) => {
								const dflt = implicit
									? t('Main text area')
									: t('Text area {{n}}', { n: i + 1 })
								const name = m.regionNames?.[r.id] ?? ''
								const rowKey = `${g.key}:${r.id}`
								return (
									<div key={r.id} className="c-vbox g-1">
										<div
											className="c-hbox g-1"
											onDragOver={
												drag?.key === g.key
													? (e) => e.preventDefault()
													: undefined
											}
											onDrop={() => {
												if (drag?.key === g.key) move(g, drag.i, i)
												setDrag(undefined)
											}}
										>
											{canMove && (
												<span
													draggable
													className="text-muted"
													style={{ cursor: 'grab' }}
													title={t('Drag to reorder')}
													onDragStart={(e) => {
														e.dataTransfer.effectAllowed = 'move'
														setDrag({ key: g.key, i })
													}}
													onDragEnd={() => setDrag(undefined)}
												>
													<IcDragHandle aria-hidden="true" />
												</span>
											)}
											<span className="small text-muted">{i + 1}</span>
											{g.orderOnly ? (
												<span className="flex-fill">{name || dflt}</span>
											) : (
												<Input
													key={name}
													className="flex-fill"
													aria-label={t('Name of {{area}}', {
														area: dflt
													})}
													placeholder={dflt}
													defaultValue={name}
													onBlur={(e) =>
														rename(r.id, e.target.value.trim())
													}
													onKeyDown={(e) => {
														if (e.key === 'Enter')
															e.currentTarget.blur()
													}}
												/>
											)}
											<span className="small text-muted">
												{t('{{n}} col', { n: r.cols })}
											</span>
											{canMove && (
												<>
													<Button
														variant="ghost"
														size="sm"
														icon={<IcMoveUp />}
														aria-label={t('Move {{area}} up', {
															area: name || dflt
														})}
														disabled={i === 0}
														onClick={() => move(g, i, i - 1)}
													/>
													<Button
														variant="ghost"
														size="sm"
														icon={<IcMoveDown />}
														aria-label={t('Move {{area}} down', {
															area: name || dflt
														})}
														disabled={i === rs.length - 1}
														onClick={() => move(g, i, i + 1)}
													/>
												</>
											)}
											{!g.orderOnly && (
												<Menu
													trigger={
														<Button
															variant="ghost"
															size="sm"
															icon={<IcMore />}
															aria-label={t('Actions for {{name}}', {
																name: name || dflt
															})}
														/>
													}
												>
													<MenuItem
														label={
															open === rowKey
																? t('Hide columns and position')
																: t('Columns and position')
														}
														onClick={() =>
															setOpen(
																open === rowKey ? undefined : rowKey
															)
														}
													/>
													<MenuItem
														label={t('Remove')}
														color="error"
														disabled={implicit}
														onClick={() => remove(g.key, r.id)}
													/>
												</Menu>
											)}
										</div>
										{open === rowKey && !g.orderOnly && (
											<div className="c-vbox g-1">
												<PropertyField label={t('Columns')}>
													<NumberInput
														value={r.cols}
														min={1}
														max={12}
														onChange={(n) =>
															patch(g.key, r.id, {
																cols: Math.round(n)
															})
														}
													/>
												</PropertyField>
												<PropertyField label={t('Gutter')}>
													<LengthInput
														value={r.gutter}
														min={0}
														onChange={(x) =>
															patch(g.key, r.id, { gutter: x })
														}
													/>
												</PropertyField>
												<PropertyField label={t('X')}>
													<LengthInput
														value={r.x}
														onChange={(x) => patch(g.key, r.id, { x })}
													/>
												</PropertyField>
												<PropertyField label={t('Y')}>
													<LengthInput
														value={r.y}
														onChange={(y) => patch(g.key, r.id, { y })}
													/>
												</PropertyField>
												<PropertyField label={t('Width')}>
													<LengthInput
														value={r.w}
														min={0}
														onChange={(w) => patch(g.key, r.id, { w })}
													/>
												</PropertyField>
												<PropertyField label={t('Height')}>
													<LengthInput
														value={r.h}
														min={0}
														onChange={(h) => patch(g.key, r.id, { h })}
													/>
												</PropertyField>
											</div>
										)}
									</div>
								)
							})}
						</div>
					)
				})}
			</div>
		</PropertySection>
	)
}

/** Page outline with its text areas split into columns (implicit area when there are none). */
function LayoutThumb({ m }: { m: StoredMaster }) {
	const s = 24 / Math.max(m.w, m.h)
	const areas = m.regions.length ? m.regions : [marginRegion(m)]
	return (
		<svg width={m.w * s} height={m.h * s} viewBox={`0 0 ${m.w} ${m.h}`} aria-hidden="true">
			<rect
				width={m.w}
				height={m.h}
				fill="var(--col-surface)"
				stroke="currentColor"
				strokeWidth={1}
				vectorEffect="non-scaling-stroke"
			/>
			{areas.flatMap((g) => {
				const cw = (g.w - (g.cols - 1) * g.gutter) / g.cols
				return Array.from({ length: g.cols }, (_, c) => (
					<rect
						key={`${g.id}-${c}`}
						x={g.x + c * (cw + g.gutter)}
						y={g.y}
						width={cw}
						height={g.h}
						fill="currentColor"
						opacity={0.35}
					/>
				))
			})}
		</svg>
	)
}

interface LayoutDialogProps extends PanelProps {
	req: DialogReq
	page?: { sec: string; which: 'first' | 'rest' }
	onClose(): void
	/** Layout created or assigned. */
	onDone(id: string): void
}

/** New / Duplicate ("Start from", "Use it for") and Use for section ("Use it for" only). */
function LayoutDialog({ yDoc, doc, req, page, onClose, onDone }: LayoutDialogProps) {
	const { t } = useTranslation()
	const assign = req.mode === 'assign'
	const secs = doc.secs.toArray()
	const [from, setFrom] = React.useState(req.mode === 'new' ? '1' : 'copy')
	const [target, setTarget] = React.useState(() => {
		if (page) return `${page.which}:${page.sec}`
		return assign && secs[0] ? `rest:${secs[0]}` : ''
	})
	const [name, setName] = React.useState('')
	const src = masterOf(doc, req.id)
	if (!src) return null
	const defName =
		from === 'copy'
			? t('{{name}} copy', { name: src.name })
			: t('Layout {{n}}', { n: doc.ms.size + 1 })

	const submit = (e: React.FormEvent) => {
		e.preventDefault()
		let id: string | undefined = req.id
		yDoc.transact(() => {
			const nm = name.trim() || defName
			if (from === 'copy' && !assign) id = duplicateMaster(yDoc, doc, req.id, nm)
			else if (!assign) {
				const cols = Number(from)
				id = addMaster(yDoc, doc, {
					name: nm,
					w: src.w,
					h: src.h,
					margins: src.margins,
					cols,
					gutter: cols > 1 && !src.gutter ? DEFAULT_GUTTER : src.gutter,
					regions: []
				})
			}
			const i = target.indexOf(':')
			if (id && i > 0) {
				const which = target.slice(0, i) === 'first' ? 'first' : 'rest'
				assignMaster(yDoc, doc, id, target.slice(i + 1), which)
			}
		}, yDoc.clientID)
		if (id) onDone(id)
	}

	return (
		<Dialog
			open
			size="sm"
			title={
				assign
					? t("Use '{{name}}' for", { name: src.name })
					: req.mode === 'new'
						? t('New page layout')
						: t('Duplicate page layout')
			}
			onClose={onClose}
			onSubmit={submit}
			footer={
				<ActionBar>
					<Button onClick={onClose}>{t('Cancel')}</Button>
					<Button type="submit" color="primary" disabled={assign && !target}>
						{assign ? t('Apply') : t('Create')}
					</Button>
				</ActionBar>
			}
		>
			<div className="c-vbox g-2">
				{!assign && (
					<>
						<PropertyField label={t('Name')}>
							<Input
								value={name}
								placeholder={defName}
								onChange={(e) => setName(e.target.value)}
							/>
						</PropertyField>
						<PropertyField label={t('Start from')}>
							<NativeSelect value={from} onChange={(e) => setFrom(e.target.value)}>
								<option value="copy">
									{t("Copy of '{{name}}'", { name: src.name })}
								</option>
								<option value="1">{t('1 column')}</option>
								<option value="2">{t('2 columns')}</option>
								<option value="3">{t('3 columns')}</option>
							</NativeSelect>
						</PropertyField>
					</>
				)}
				<PropertyField label={t('Use it for')}>
					<NativeSelect value={target} onChange={(e) => setTarget(e.target.value)}>
						{secs.map((s, i) => (
							<React.Fragment key={s}>
								<option value={`rest:${s}`}>
									{t('Section {{n}} · following pages', { n: i + 1 })}
								</option>
								<option value={`first:${s}`}>
									{t('Section {{n}} · first page', { n: i + 1 })}
								</option>
							</React.Fragment>
						))}
						{!assign && <option value="">{t("Don't use yet")}</option>}
					</NativeSelect>
				</PropertyField>
			</div>
		</Dialog>
	)
}

export interface LayoutBannerProps extends Pick<PanelProps, 'doc'> {
	masterId: string
	/** Pages using this layout. */
	pages: number
	/** 1-based numbers of the sections with pages using it. */
	sections: number[]
	/** Side variant edited on the current page ('different' layouts). */
	side?: 'left' | 'right'
	/** Local layout edits exist since entering the mode. */
	canDiscard: boolean
	onDiscard(): void
	onDone(): void
}

/**
 * Edit layout mode banner: the edited layout and its blast radius (pages, sections),
 * Discard changes (local undo back to the mode's entry depth) and Done. Text areas are drawn
 * and master items edited on the canvas; the settings are in the `LayoutsPanel`.
 */
export function LayoutBanner({
	doc,
	masterId,
	pages,
	sections,
	side,
	canDiscard,
	onDiscard,
	onDone
}: LayoutBannerProps) {
	const { t } = useTranslation()
	useDocVersion(doc)
	const name = masterOf(doc, masterId)?.name ?? ''
	const list = sections.join(', ')
	return (
		<Alert
			color="info"
			compact
			actions={
				<>
					<Button disabled={!canDiscard} onClick={onDiscard}>
						{t('Discard changes')}
					</Button>
					<Button onClick={onDone}>{t('Done')}</Button>
				</>
			}
		>
			{pages === 1
				? t("Editing layout '{{name}}' · applies to 1 page", { name })
				: t("Editing layout '{{name}}' · applies to {{n}} pages", { name, n: pages })}
			{sections.length > 0 &&
				` (${sections.length === 1 ? t('section {{list}}', { list }) : t('sections {{list}}', { list })})`}
			{side && ` · ${side === 'left' ? t('left-hand pages') : t('right-hand pages')}`}
		</Alert>
	)
}

// vim: ts=4
