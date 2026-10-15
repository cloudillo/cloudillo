// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Right-panel "Format" tab, showing only the selection: a frame its Image, Placement, Size &
 * position and Fit sections; an inline image its position switch; text the Character and Paragraph
 * sections; nothing the page context. Publication settings are a dialog
 * (`PublicationSettings.tsx`); view preferences sit in the status-bar View popover.
 */

import {
	Button,
	ColorInput,
	Input,
	Menu,
	MenuItem,
	NativeSelect,
	NumberInput,
	PropertyField,
	PropertySection,
	Segmented,
	SegmentedItem,
	Toggle
} from '@cloudillo/react'
import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuMinus, LuPlus, LuTrash2, LuX } from 'react-icons/lu'
import type * as Y from 'yjs'

import {
	breakThreadAfter,
	chainOf,
	embedImgAt,
	linkFrame,
	linkTargets,
	setInlineImage,
	soleInlineImage,
	updateFrame
} from '../crdt/frame-ops'
import type {
	StoredFrame,
	StoredImageData,
	StoredTextFrameData,
	YPagilloDocument
} from '../crdt/stored-types'
import { frameOf, mastersOf, stylesOf } from '../crdt/entities'
import { masterItems } from '../crdt/type-converters'
import * as Cmd from '../editor/commands'
import { FRAME_LABELS, type FrameCtl } from '../editor/FrameOverlay'
import { effectiveDpi } from '../editor/frames'
import type { Editor } from '../editor/useEditor'
import { LengthInput } from '../ui/LengthInput'
import { useTextState } from '../toolbar/Toolbar'
import { type FieldDef, PARA_FIELDS, PropEditor, PropRow, ResetSlot } from './StylesPanel'
import { useDocVersion } from './useY'

export interface PanelProps {
	yDoc: Y.Doc
	doc: YPagilloDocument
}

export interface FormatPanelProps extends PanelProps {
	/** With a selection, the Text section is shown. */
	editor?: Editor
	/** Frame layer: with a frame selection, the Frame section is shown. */
	frames?: FrameCtl
	/** Current page for the empty state: 1-based page and section numbers. */
	page?: { n: number; sec: number; layoutName: string }
	/** "Edit layout…" on the current page's layout. */
	onEditLayout?(): void
	/** "Section settings…": open the section popover anchored to `el`. */
	onSectionSettings?(el: HTMLElement): void
}

export function FormatPanel({
	yDoc,
	doc,
	editor,
	frames,
	page,
	onEditLayout,
	onSectionSettings
}: FormatPanelProps) {
	const { t } = useTranslation()
	useDocVersion(doc)

	if (frames?.sel) return <FrameSection yDoc={yDoc} doc={doc} frames={frames} />
	if (editor?.sel)
		return (
			<>
				{frames && <InlineImageSection doc={doc} editor={editor} frames={frames} />}
				<TextSection yDoc={yDoc} doc={doc} editor={editor} />
			</>
		)
	return (
		<PropertySection title={t('Page')}>
			{page && (
				<>
					<p>{t('Page {{n}} · Section {{sec}}', { n: page.n, sec: page.sec })}</p>
					<PropertyField label={t('Layout')}>
						<span>{page.layoutName}</span>
					</PropertyField>
					{onEditLayout && (
						<Button variant="link" onClick={onEditLayout}>
							{t('Edit layout…')}
						</Button>
					)}
					{onSectionSettings && (
						<Button variant="link" onClick={(e) => onSectionSettings(e.currentTarget)}>
							{t('Section settings…')}
						</Button>
					)}
				</>
			)}
			<p className="small text-muted">
				{t('Click text to format it, or an image to change it.')}
			</p>
		</PropertySection>
	)
}

/** Colour with a clear button; empty = none. */
function OptColor({ value, onChange }: { value?: string; onChange(c?: string): void }) {
	const { t } = useTranslation()
	return (
		<div className="c-hbox g-1">
			<ColorInput value={value ?? '#ffffff'} showHex={false} onChange={onChange} />
			{value && (
				<Button
					variant="ghost"
					size="sm"
					icon={<LuX />}
					aria-label={t('None')}
					title={t('None')}
					onClick={() => onChange(undefined)}
				/>
			)}
		</div>
	)
}

/** Delete as a ghost icon at the top of a section (PropertySection has no header slot). */
function DeleteButton({ onClick }: { onClick(): void }) {
	const { t } = useTranslation()
	return (
		<div className="pagillo-section-actions">
			<Button
				variant="ghost"
				size="sm"
				icon={<LuTrash2 />}
				aria-label={t('Delete')}
				title={t('Delete')}
				onClick={onClick}
			/>
		</div>
	)
}

/** Page of the selection (global order, grouped per section); hidden unless it can move. */
function PageSelect({ frames }: { frames: FrameCtl }) {
	const { t } = useTranslation()
	const groups = frames.pageSections
	const sel = frames.sel
	const at = sel ? frames.pageOf(sel.ids[0]) : -1
	// Not laid out (yet): no option to show it as.
	if (!groups || at < 0) return null
	return (
		<PropertyField label={t('Page')}>
			<NativeSelect
				value={String(at)}
				onChange={(e) => frames.moveToPage(Number(e.target.value))}
			>
				{groups.map(
					(g, si) =>
						g.length > 0 && (
							<optgroup key={si} label={t('Section {{n}}', { n: si + 1 })}>
								{g.map(({ n, ready }) => (
									<option key={n} value={String(n)} disabled={!ready}>
										{t('Page {{n}}', { n: n + 1 })}
									</option>
								))}
							</optgroup>
						)
				)}
			</NativeSelect>
		</PropertyField>
	)
}

function FrameSection({ yDoc, doc, frames }: PanelProps & { frames: FrameCtl }) {
	const { t } = useTranslation()
	const altBox = React.useRef<HTMLDivElement>(null)
	const [threadMenu, setThreadMenu] = React.useState(false)
	// After an image insert, focus moves to Alt text.
	React.useEffect(() => {
		if (frames.focusAlt) altBox.current?.querySelector('input')?.focus()
	}, [frames.focusAlt])
	const ids = frames.sel?.ids ?? []
	const id = ids.length === 1 ? ids[0] : undefined
	const f = id ? frameOf(doc, id) : undefined
	if (!id || !f) {
		return (
			<PropertySection title={t('Selection')}>
				<DeleteButton onClick={frames.remove} />
				<p className="small text-muted">
					{ids.length > 1
						? t('{{n}} items selected', { n: ids.length })
						: t('Text area of the page layout')}
				</p>
				{ids.length > 1 && <PageSelect frames={frames} />}
			</PropertySection>
		)
	}
	const set = (p: Partial<StoredFrame>) => updateFrame(yDoc, doc, id, p)
	const d = f.data as StoredImageData
	const setData = (p: Partial<StoredImageData> | Partial<StoredTextFrameData>) => set({ data: p })
	const td = f.data as StoredTextFrameData
	const master = masterItems(doc).has(id)
	const img = f.t === 'img'
	const thread = f.t === 'txt' && !master
	const chain = thread ? chainOf(doc, id) : undefined
	const ci = chain ? chain.frames.indexOf(id) : 0
	const dpi = img && d.px ? Math.round(effectiveDpi(d.px[0], f.w)) : undefined

	return (
		<>
			<PropertySection title={t(FRAME_LABELS[f.t])}>
				<DeleteButton onClick={frames.remove} />
				{img && (
					<>
						<Button
							variant={d.fileId ? 'link' : undefined}
							onClick={() => frames.pick(id)}
						>
							{d.fileId ? t('Replace image…') : t('Choose image…')}
						</Button>
						<div ref={altBox}>
							<PropertyField label={t('Alt text')}>
								<Input
									key={`${id}:${d.alt}`}
									defaultValue={d.alt}
									disabled={!!d.deco}
									placeholder={t('Describe the image')}
									onBlur={(e) => {
										const v = e.target.value.trim()
										if (v !== d.alt) setData({ alt: v })
									}}
								/>
							</PropertyField>
						</div>
						<Toggle
							label={t('Decorative')}
							checked={!!d.deco}
							onChange={(e) => setData({ deco: e.target.checked || undefined })}
						/>
						{d.fileId && !d.alt && !d.deco && (
							<p className="small text-warning">{t('Missing alt text')}</p>
						)}
						{dpi !== undefined && dpi < 150 && (
							<p className="small text-warning">
								{t('Low resolution for print: {{dpi}} dpi (150 recommended)', {
									dpi
								})}
							</p>
						)}
					</>
				)}
			</PropertySection>
			{f.t === 'txt' && (
				<PropertySection title={t('Box')}>
					<PropertyField label={t('Inset')}>
						<LengthInput
							value={td.inset ?? 0}
							min={0}
							onChange={(inset) => setData({ inset })}
						/>
					</PropertyField>
					<PropertyField label={t('Background')}>
						<OptColor value={td.fill} onChange={(fill) => setData({ fill })} />
					</PropertyField>
					<PropertyField label={t('Border')}>
						<OptColor
							value={td.stroke}
							onChange={(stroke) =>
								setData({
									stroke,
									strokeW: stroke ? (td.strokeW ?? FX) : undefined
								})
							}
						/>
					</PropertyField>
					{td.stroke && (
						<PropertyField label={t('Border width')}>
							<LengthInput
								value={td.strokeW ?? FX}
								min={0}
								onChange={(strokeW) => setData({ strokeW })}
							/>
						</PropertyField>
					)}
				</PropertySection>
			)}
			<PropertySection title={t('Placement')}>
				{!master && img && d.fileId && (
					<PropertyField label={t('Position')}>
						<Segmented
							value="page"
							onChange={(v) => v === 'text' && frames.toInline(id)}
						>
							<SegmentedItem value="page">{t('On this page')}</SegmentedItem>
							<SegmentedItem value="text">{t('Moves with text')}</SegmentedItem>
						</Segmented>
					</PropertyField>
				)}
				{!master && (
					<>
						<PageSelect frames={frames} />
						<PropertyField label={t('Text wrap')}>
							<NativeSelect
								value={f.wrap.mode}
								onChange={(e) =>
									set({
										wrap: {
											...f.wrap,
											mode: e.target.value as StoredFrame['wrap']['mode']
										}
									})
								}
							>
								<option value="none">{t('None')}</option>
								<option value="box">{t('Around')}</option>
								<option value="tb">{t('Above and below')}</option>
							</NativeSelect>
						</PropertyField>
						{f.wrap.mode !== 'none' && (
							<PropertyField label={t('Wrap offset')}>
								<LengthInput
									value={f.wrap.off}
									min={0}
									onChange={(off) => set({ wrap: { ...f.wrap, off } })}
								/>
							</PropertyField>
						)}
					</>
				)}
				<Toggle
					label={t('Behind text')}
					checked={f.z < 0}
					onChange={(e) => set({ z: e.target.checked ? -1 : 1 })}
				/>
			</PropertySection>
			<PropertySection title={t('Size & position')}>
				<div className="pagillo-grid2">
					{(['x', 'y', 'w', 'h'] as const).map((k) => (
						<PropertyField
							key={k}
							labelWidth={16}
							label={{ x: t('X'), y: t('Y'), w: t('W'), h: t('H') }[k]}
							title={{ x: t('Left'), y: t('Top'), w: t('Width'), h: t('Height') }[k]}
						>
							<LengthInput
								value={f[k]}
								min={k === 'w' || k === 'h' ? FX : undefined}
								aria-label={
									{ x: t('Left'), y: t('Top'), w: t('Width'), h: t('Height') }[k]
								}
								onChange={(v) => set({ [k]: v } as Partial<StoredFrame>)}
							/>
						</PropertyField>
					))}
				</div>
				<PropertyField label={t('Rotation (°)')}>
					<NumberInput
						value={f.rot}
						min={-180}
						max={180}
						onChange={(rot) => set({ rot })}
					/>
				</PropertyField>
			</PropertySection>
			{thread && (
				<PropertySection title={t('Thread')}>
					{chain && (
						<p className="small text-muted">
							{t('Frame {{n}} of {{m}}', { n: ci + 1, m: chain.frames.length })}
						</p>
					)}
					<Menu
						trigger={<Button variant="link">{t('Continue in frame…')}</Button>}
						open={threadMenu}
						onOpenChange={setThreadMenu}
					>
						<MenuItem
							label={t('New linked text box')}
							onClick={() => frames.newLinked(id)}
						/>
						{threadMenu &&
							linkTargets(doc, id)
								.map((tid) => ({ tid, n: frames.pageOf(tid) }))
								.filter(({ n }) => n >= 0)
								.map(({ tid, n }) => (
									<MenuItem
										key={tid}
										label={t('Page {{n}} · Text box', { n: n + 1 })}
										onClick={() => linkFrame(yDoc, doc, id, tid)}
									/>
								))}
						<MenuItem label={t('Pick on page…')} onClick={() => frames.startLink(id)} />
					</Menu>
					{chain && ci < chain.frames.length - 1 && (
						<Button variant="link" onClick={() => breakThreadAfter(yDoc, doc, id)}>
							{t('Stop text after this frame')}
						</Button>
					)}
				</PropertySection>
			)}
			{img && (
				<PropertySection title={t('Fit')}>
					<PropertyField label={t('Fit')}>
						<Segmented
							value={d.fit}
							onChange={(v) => setData({ fit: v as StoredImageData['fit'] })}
						>
							<SegmentedItem value="contain">{t('Fit')}</SegmentedItem>
							<SegmentedItem value="cover">{t('Fill')}</SegmentedItem>
							<SegmentedItem value="fill">{t('Stretch')}</SegmentedItem>
						</Segmented>
					</PropertyField>
					{d.fileId && (
						<Button
							variant="link"
							aria-pressed={frames.crop?.id === id}
							onClick={() =>
								frames.crop?.id === id ? frames.endCrop() : frames.startCrop(id)
							}
						>
							{frames.crop?.id === id ? t('Done cropping') : t('Crop')}
						</Button>
					)}
					{d.px && (
						<Button variant="link" onClick={() => frames.sizeToImage(id)}>
							{t('Size frame to image')}
						</Button>
					)}
				</PropertySection>
			)}
		</>
	)
}

/** A selection holding one inline image: alt text, "Position" switch to a page-anchored frame. */
function InlineImageSection({
	doc,
	editor,
	frames
}: Pick<PanelProps, 'doc'> & { editor: Editor; frames: FrameCtl }) {
	const { t } = useTranslation()
	const s = editor.sel
	if (!s) return null
	const tx = doc.tx.get(s.story)
	const at = tx && soleInlineImage(tx, Math.min(s.anchor, s.head), Math.max(s.anchor, s.head))
	const img = tx && at !== undefined ? embedImgAt(tx, at) : undefined
	if (at === undefined || !img) return null
	return (
		<PropertySection title={t('Image')}>
			<PropertyField label={t('Alt text')}>
				<Input
					key={img.alt}
					defaultValue={img.alt}
					onBlur={(e) => {
						const alt = e.target.value.trim()
						if (alt !== img.alt)
							editor.run((yt) => {
								setInlineImage(yt, at, { ...img, alt })
								return undefined
							})
					}}
				/>
			</PropertyField>
			<PropertyField label={t('Position')}>
				<Segmented
					value="text"
					onChange={(v) => v === 'page' && frames.toFrame(s.story, at)}
				>
					<SegmentedItem value="page">{t('On this page')}</SegmentedItem>
					<SegmentedItem value="text">{t('Moves with text')}</SegmentedItem>
				</Segmented>
			</PropertyField>
			<PropertyField label={t('Wrap')}>
				{/* Full width and Centred both store no float (the EmbedBlock centres a
				    full-width box), so Centred reads back as Full width. */}
				<NativeSelect
					value={img.float ? `${img.float.side}${img.float.w < 0.4 ? 3 : 2}` : 'full'}
					onChange={(e) => {
						const v = e.target.value
						const float =
							v[0] === 'l' || v[0] === 'r'
								? { side: v[0] as 'l' | 'r', w: v[1] === '3' ? 0.333 : 0.5 }
								: undefined
						editor.run((yt) => {
							const { float: _old, ...rest } = img
							setInlineImage(yt, at, float ? { ...rest, float } : rest)
							return undefined
						})
					}}
				>
					<option value="full">{t('Full width')}</option>
					<option value="center">{t('Centred')}</option>
					<option value="l2">{t('Float left ½')}</option>
					<option value="l3">{t('Float left ⅓')}</option>
					<option value="r2">{t('Float right ½')}</option>
					<option value="r3">{t('Float right ⅓')}</option>
				</NativeSelect>
			</PropertyField>
		</PropertySection>
	)
}

/** Text-section paragraph overrides (style-only props stay in Styles, `align` on the toolbar). */
const SPACING = ['leading', 'spaceBefore', 'spaceAfter']
const INDENTS = ['indentStart', 'indentEnd', 'indentFirst'] as const
const NOT_DIRECT = [...SPACING, ...INDENTS, 'align', 'spanColumns', 'dropCap', 'tocLevel']
const SPACING_FIELDS = PARA_FIELDS.filter(([k]) => SPACING.includes(k))
const FLOW_FIELDS = PARA_FIELDS.filter(([k]) => !NOT_DIRECT.includes(k))

const BORDERS: [Cmd.TableBorders, string][] = [
	['all', 'All'],
	['outer', 'Outer'],
	['header', 'Header only'],
	['none', 'None']
]

/** Format › Table, while the caret is in a table. */
function TableSection({
	ctx,
	table
}: {
	ctx: Cmd.CommandCtx
	table: NonNullable<Cmd.TextState['table']>
}) {
	const { t } = useTranslation()
	const count = (
		label: string,
		n: number,
		insLabel: string,
		ins: [string, () => void][],
		delLabel: string,
		del: () => void
	) => (
		<PropertyField label={label}>
			<div className="c-hbox g-1">
				<span className="flex-fill">{n}</span>
				<Menu
					trigger={
						<Button
							variant="ghost"
							size="sm"
							icon={<LuPlus />}
							aria-label={insLabel}
							title={insLabel}
						/>
					}
				>
					{ins.map(([l, fn]) => (
						<MenuItem key={l} label={l} onClick={fn} />
					))}
				</Menu>
				<Button
					variant="ghost"
					size="sm"
					icon={<LuMinus />}
					aria-label={delLabel}
					title={delLabel}
					onClick={del}
				/>
			</div>
		</PropertyField>
	)
	return (
		<PropertySection title={t('Table')}>
			{count(
				t('Rows'),
				table.rows,
				t('Insert row'),
				[
					[t('Insert row above'), () => Cmd.tableInsertRow(ctx, false)],
					[t('Insert row below'), () => Cmd.tableInsertRow(ctx, true)]
				],
				t('Delete row'),
				() => Cmd.tableDeleteRow(ctx)
			)}
			{count(
				t('Columns'),
				table.cols,
				t('Insert column'),
				[
					[t('Insert column left'), () => Cmd.tableInsertCol(ctx, false)],
					[t('Insert column right'), () => Cmd.tableInsertCol(ctx, true)]
				],
				t('Delete column'),
				() => Cmd.tableDeleteCol(ctx)
			)}
			<Toggle
				label={t('Header row')}
				checked={table.header}
				onChange={() => Cmd.toggleHeaderRow(ctx)}
			/>
			<PropertyField label={t('Borders')}>
				<NativeSelect
					value={table.borders}
					onChange={(e) => Cmd.setTableBorders(ctx, e.target.value as Cmd.TableBorders)}
				>
					{BORDERS.map(([v, l]) => (
						<option key={v} value={v}>
							{t(l)}
						</option>
					))}
				</NativeSelect>
			</PropertyField>
		</PropertySection>
	)
}

/**
 * Whether any layout has more than one column (base, either side, or a text area).
 * Not narrowed to the caret's page (FormatPanel has no page geometry); pass the
 * caret page's `pageMaster` if the checkbox shows where it does nothing.
 */
function multiColumn(doc: YPagilloDocument): boolean {
	return mastersOf(doc).some(([, m]) =>
		[m, m.left, m.right].some(
			(v) => !!v && ((v.cols ?? 1) > 1 || !!v.regions?.some((r) => r.cols > 1))
		)
	)
}

function TextSection({ yDoc, doc, editor }: PanelProps & { editor: Editor }) {
	const { t } = useTranslation()
	const st = useTextState(doc, editor)
	if (!st || !editor.sel) return null
	const ctx: Cmd.CommandCtx = { yDoc, doc, editor }
	const own = st.po as Record<string, unknown>
	const charStyles = stylesOf(doc).filter(([, s]) => s.k === 'c')
	const setProps = (p: Record<string, unknown>) =>
		Cmd.setParagraphProps(ctx, p as Cmd.ParagraphPatch)
	const reset = (keys: readonly string[]) => {
		const set = keys.filter((k) => Object.hasOwn(own, k))
		return set.length
			? () => setProps(Object.fromEntries(set.map((k) => [k, undefined])))
			: undefined
	}
	const row = ([k, label, kind, min]: FieldDef) => (
		<PropRow key={k} label={t(label)} resetLabel={t('Reset to style')} onReset={reset([k])}>
			<PropEditor
				kind={kind}
				min={min}
				value={st.eff[k]}
				onChange={(v) => setProps({ [k]: v })}
			/>
		</PropRow>
	)
	const indentLabels = [t('Start'), t('End'), t('First line')]

	return (
		<>
			<PropertySection title={t('Character')}>
				<PropertyField label={t('Character style')}>
					<NativeSelect
						value={st.marks.cs ?? ''}
						onChange={(e) => Cmd.setMark(ctx, 'cs', e.target.value || null)}
					>
						<option value="">{t('None')}</option>
						{charStyles.map(([id, s]) => (
							<option key={id} value={id}>
								{s.name}
							</option>
						))}
					</NativeSelect>
				</PropertyField>
				<PropertyField label={t('Link')}>
					<Input
						key={st.marks.link ?? ''}
						defaultValue={st.marks.link ?? ''}
						placeholder="https://"
						onBlur={(e) => {
							const v = e.target.value.trim()
							if (v !== (st.marks.link ?? '')) Cmd.setMark(ctx, 'link', v || null)
						}}
					/>
				</PropertyField>
			</PropertySection>
			{st.table && <TableSection ctx={ctx} table={st.table} />}
			<PropertySection title={t('Paragraph')}>
				<div className="pagillo-group-title">{t('Spacing')}</div>
				{SPACING_FIELDS.map(row)}
				<div className="pagillo-group-title">{t('Indents')}</div>
				<div className="pagillo-prop-row">
					<div className="pagillo-indents">
						{INDENTS.map((k, i) => (
							<LengthInput
								key={k}
								size="sm"
								min={k === 'indentFirst' ? undefined : 0}
								value={st.eff[k] as number | undefined}
								aria-label={indentLabels[i]}
								onChange={(v) => setProps({ [k]: v })}
							/>
						))}
						{indentLabels.map((l) => (
							<span key={l} className="small text-muted">
								{l}
							</span>
						))}
					</div>
					<ResetSlot label={t('Reset to style')} onReset={reset(INDENTS)} />
				</div>
				<PropRow
					label={t('Drop cap')}
					resetLabel={t('Reset to style')}
					onReset={reset(['dropCap'])}
				>
					<NativeSelect
						value={String(Number(st.eff.dropCap) >= 2 ? st.eff.dropCap : 0)}
						onChange={(e) => setProps({ dropCap: Number(e.target.value) })}
					>
						<option value="0">{t('None')}</option>
						{[2, 3, 4].map((n) => (
							<option key={n} value={n}>
								{t('{{n}} lines', { n })}
							</option>
						))}
					</NativeSelect>
				</PropRow>
				{(multiColumn(doc) || !!st.eff.spanColumns) && (
					<PropRow
						label={t('Span all columns')}
						resetLabel={t('Reset to style')}
						onReset={reset(['spanColumns'])}
					>
						<PropEditor
							kind="bool"
							value={st.eff.spanColumns}
							onChange={(v) => setProps({ spanColumns: v })}
						/>
					</PropRow>
				)}
			</PropertySection>
			<PropertySection title={t('Text flow')} defaultExpanded={false}>
				{FLOW_FIELDS.map(row)}
			</PropertySection>
		</>
	)
}

// vim: ts=4
