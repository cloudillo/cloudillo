// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Right-panel "Styles" tab: paragraph and character styles, the based-on chain and a
 * props editor. A field shows the inherited value until the style sets its own; the reset
 * button drops the own value. "Update <style> to match" / "Clear formatting" live in the
 * toolbar (`editor/commands.ts`); `PropEditor` is shared with the Format tab's text section.
 */

import {
	Button,
	Checkbox,
	ColorInput,
	FontPicker,
	IcAdd,
	IcAlignCenter,
	IcAlignJustify,
	IcAlignLeft,
	IcAlignRight,
	IcDelete,
	IcUndo,
	Input,
	NativeSelect,
	NumberInput,
	PropertyField,
	PropertySection,
	Segmented,
	SegmentedItem,
	useDialog
} from '@cloudillo/react'
import { FX } from '@cloudillo/typeset'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { styleOf, stylesOf } from '../crdt/entities'
import type { StyleId } from '../crdt/ids'
import type { StoredStyle, YPagilloDocument } from '../crdt/stored-types'
import { addStyle, deleteStyle, updateStyle } from '../crdt/style-ops'
import { inheritedProps } from '../editor/commands'
import { LengthInput } from '../ui/LengthInput'
import type { PanelProps } from './FormatPanel'
import { useDocVersion } from './useY'

export type Kind =
	| 'len'
	| 'pt'
	| 'num'
	| 'bool'
	| 'font'
	| 'color'
	| 'weight'
	| 'align'
	| 'break'
	| 'toc'
	| 'text'

/** [prop, English label (i18n key), editor, min (Fx for `len`/`pt`)] */
export type FieldDef = [string, string, Kind, number?]

export const CHAR_FIELDS: FieldDef[] = [
	['font', 'Font', 'font'],
	['size', 'Size', 'pt', FX],
	['weight', 'Weight', 'weight'],
	['italic', 'Italic', 'bool'],
	['color', 'Color', 'color'],
	['underline', 'Underline', 'bool'],
	['strike', 'Strikethrough', 'bool'],
	['tracking', 'Letter spacing', 'num'],
	['baselineShift', 'Baseline shift', 'pt']
]

export const PARA_FIELDS: FieldDef[] = [
	['leading', 'Line height', 'pt', FX],
	['spaceBefore', 'Space before', 'len', 0],
	['spaceAfter', 'Space after', 'len', 0],
	['indentStart', 'Indent start', 'len', 0],
	['indentEnd', 'Indent end', 'len', 0],
	['indentFirst', 'First line indent', 'len'],
	['align', 'Alignment', 'align'],
	['hyphenate', 'Hyphenate', 'bool'],
	['lang', 'Language', 'text'],
	['keepNext', 'Keep with next', 'bool'],
	['keepTogether', 'Keep lines together', 'bool'],
	['widows', 'Widows', 'num', 1],
	['orphans', 'Orphans', 'num', 1],
	['breakBefore', 'Start on', 'break'],
	['spanColumns', 'Span all columns', 'bool'],
	['dropCap', 'Drop cap lines', 'num', 0],
	['tocLevel', 'Heading level', 'toc']
]

/** True if `id` is on `cand`'s based-on chain (incl. `cand`): basing `id` on `cand` would loop. */
function dependsOn(doc: YPagilloDocument, cand: StyleId, id: StyleId): boolean {
	const seen = new Set<string>()
	for (
		let cur: string | undefined = cand;
		cur && !seen.has(cur);
		cur = styleOf(doc, cur)?.basedOn
	) {
		if (cur === id) return true
		seen.add(cur)
	}
	return false
}

export const StylesPanel = React.memo(function StylesPanel({ yDoc, doc }: PanelProps) {
	const { t } = useTranslation()
	useDocVersion(doc)
	const [sel, setSel] = React.useState<StyleId>()
	const styles = stylesOf(doc).sort(([, a], [, b]) => a.name.localeCompare(b.name))
	const style = sel ? styleOf(doc, sel) : undefined

	return (
		<>
			{(['p', 'c'] as const).map((k) => (
				<PropertySection
					key={k}
					title={k === 'p' ? t('Paragraph styles') : t('Character styles')}
				>
					<div className="c-vbox">
						{styles
							.filter(([, s]) => s.k === k)
							.map(([id, s]) => (
								<Button
									key={id}
									variant="ghost"
									size="sm"
									className="pagillo-style-entry"
									active={id === sel}
									onClick={() => setSel(id)}
								>
									{s.name}
								</Button>
							))}
						<Button
							variant="link"
							size="sm"
							icon={<IcAdd />}
							onClick={() =>
								setSel(
									addStyle(yDoc, doc, {
										k,
										name:
											k === 'p'
												? t('New paragraph style')
												: t('New character style'),
										props: {}
									})
								)
							}
						>
							{t('New style')}
						</Button>
					</div>
				</PropertySection>
			))}
			{sel && style && (
				<StyleEditor
					key={sel}
					{...{ yDoc, doc }}
					id={sel}
					style={style}
					onDeleted={() => setSel(undefined)}
				/>
			)}
		</>
	)
})

interface StyleEditorProps extends PanelProps {
	id: StyleId
	style: StoredStyle
	onDeleted(): void
}

function StyleEditor({ yDoc, doc, id, style, onDeleted }: StyleEditorProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const own = style.props as Record<string, unknown>
	const eff = { ...inheritedProps(doc, style.basedOn), ...own }
	const set = (k: string, v: unknown) =>
		updateStyle(yDoc, doc, id, { props: { [k]: v } } as Partial<Omit<StoredStyle, 'k'>>)
	const parents = stylesOf(doc).filter(([pid, s]) => s.k === style.k && !dependsOn(doc, pid, id))

	const row = ([k, label, kind, min]: FieldDef) => (
		<PropRow
			key={k}
			label={t(label)}
			resetLabel={t('Reset to inherited')}
			onReset={Object.hasOwn(own, k) ? () => set(k, undefined) : undefined}
		>
			<PropEditor kind={kind} min={min} value={eff[k]} onChange={(x) => set(k, x)} />
		</PropRow>
	)

	const remove = async () => {
		const ok = await dialog.confirm(
			t('Delete style'),
			t('Text using this style loses its formatting.')
		)
		if (!ok) return
		deleteStyle(yDoc, doc, id)
		onDeleted()
	}

	return (
		<>
			<PropertySection title={style.name}>
				<PropertyField label={t('Name')} labelWidth={LABEL_WIDTH}>
					<Input
						key={style.name}
						defaultValue={style.name}
						onBlur={(e) => {
							const name = e.target.value.trim()
							if (name && name !== style.name) updateStyle(yDoc, doc, id, { name })
						}}
					/>
				</PropertyField>
				<PropertyField label={t('Based on')} labelWidth={LABEL_WIDTH}>
					<NativeSelect
						value={style.basedOn ?? ''}
						onChange={(e) =>
							updateStyle(yDoc, doc, id, { basedOn: e.target.value || undefined })
						}
					>
						<option value="">{t('None')}</option>
						{parents.map(([pid, s]) => (
							<option key={pid} value={pid}>
								{s.name}
							</option>
						))}
					</NativeSelect>
				</PropertyField>
				<div className="pagillo-section-actions">
					<Button
						variant="link"
						size="sm"
						color="error"
						icon={<IcDelete />}
						onClick={remove}
					>
						{t('Delete style')}
					</Button>
				</div>
			</PropertySection>
			<PropertySection title={t('Character')}>{CHAR_FIELDS.map(row)}</PropertySection>
			{style.k === 'p' && (
				<PropertySection title={t('Paragraph')}>{PARA_FIELDS.map(row)}</PropertySection>
			)}
		</>
	)
}

/** Label column of the props rows, wide enough for "Strikethrough" in the 300px panel */
export const LABEL_WIDTH = 88

/** A props row: the editor plus a trailing reset slot that is reserved even when empty */
export function PropRow({
	label,
	resetLabel,
	onReset,
	children
}: {
	label: string
	resetLabel: string
	onReset?: () => void
	children: React.ReactNode
}) {
	return (
		<PropertyField label={label} labelWidth={LABEL_WIDTH}>
			<div className="pagillo-prop-row">
				{children}
				<ResetSlot label={resetLabel} onReset={onReset} />
			</div>
		</PropertyField>
	)
}

/** The reset button, or an empty placeholder keeping its column */
export function ResetSlot({ label, onReset }: { label: string; onReset?: () => void }) {
	return onReset ? (
		<Button variant="ghost" size="sm" icon={<IcUndo />} aria-label={label} onClick={onReset} />
	) : (
		<span aria-hidden="true" />
	)
}

/** Editor for one style / paragraph prop (`value` is the effective value). */
export function PropEditor({
	kind,
	value: v,
	min,
	onChange
}: {
	kind: Kind
	min?: number
	value: unknown
	onChange(v: unknown): void
}): React.ReactNode {
	const { t } = useTranslation()
	switch (kind) {
		case 'len':
		case 'pt':
			return (
				<LengthInput
					value={v as number | undefined}
					unit={kind === 'pt' ? 'pt' : undefined}
					min={min}
					onChange={(x) => onChange(x)}
				/>
			)
		case 'num':
			return (
				<NumberInput
					value={v as number | undefined}
					step={1}
					min={min}
					onChange={(x) => onChange(Math.round(x))}
				/>
			)
		case 'bool':
			return <Checkbox checked={!!v} onChange={(e) => onChange(e.target.checked)} />
		case 'font':
			return (
				<FontPicker value={(v as string | undefined) ?? ''} onChange={(f) => onChange(f)} />
			)
		case 'color':
			return (
				<ColorInput
					value={(v as string | undefined) ?? '#000000'}
					onChange={(c) => onChange(c)}
				/>
			)
		case 'weight':
			return (
				<NativeSelect
					value={String(v ?? '')}
					onChange={(e) => onChange(Number(e.target.value))}
				>
					<option value="" disabled>
						{t('Default')}
					</option>
					{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
						<option key={w} value={w}>
							{w}
						</option>
					))}
				</NativeSelect>
			)
		case 'align':
			return (
				<Segmented value={v as string | undefined} onChange={(a) => onChange(a)}>
					<SegmentedItem value="left" icon={IcAlignLeft} label={t('Left')} />
					<SegmentedItem value="center" icon={IcAlignCenter} label={t('Center')} />
					<SegmentedItem value="right" icon={IcAlignRight} label={t('Right')} />
					<SegmentedItem value="justify" icon={IcAlignJustify} label={t('Justify')} />
				</Segmented>
			)
		case 'break':
			return (
				<NativeSelect
					value={(v as string | undefined) ?? 'none'}
					onChange={(e) => onChange(e.target.value)}
				>
					<option value="none">{t('Anywhere')}</option>
					<option value="column">{t('New column')}</option>
					<option value="page">{t('New page')}</option>
				</NativeSelect>
			)
		case 'toc':
			return (
				<NativeSelect
					value={String(v ?? '')}
					onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
				>
					<option value="">{t('Not a heading')}</option>
					{[1, 2, 3, 4, 5, 6].map((n) => (
						<option key={n} value={n}>
							{n}
						</option>
					))}
				</NativeSelect>
			)
		case 'text':
			return (
				<Input
					key={String(v ?? '')}
					defaultValue={(v as string | undefined) ?? ''}
					onBlur={(e) => {
						const x = e.target.value.trim()
						if (x !== (v ?? '')) onChange(x || undefined)
					}}
				/>
			)
	}
}

// vim: ts=4
