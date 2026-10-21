// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

/**
 * Export to PDF dialog: scope (used range of the current sheet / selection / a named range),
 * paper, orientation, fit-to-width and repeated first row.
 */

import {
	ActionBar,
	Button,
	Checkbox,
	Dialog,
	Field,
	NativeSelect,
	RadioGroup,
	useToast
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type * as Y from 'yjs'

import { resolveEmbedNav, sheetName, usedRange } from './embed-view'
import { exportRangePdf, type PdfOrientation, type PdfPaper } from './export-pdf'
import { formatNameNav, listNamedRanges, type ResolvedRange } from './named-ranges'
import type { SheetId } from './yjs-types'

export interface PdfExportDialogProps {
	yDoc: Y.Doc
	/** Active sheet when the dialog was opened */
	sheetId?: SheetId
	/** Current selection when the dialog was opened, if any */
	selection?: ResolvedRange | null
	onClose: () => void
}

/** Scope select value: 'sheet', 'selection' or 'name:<id>' */
type Scope = string

export function PdfExportDialog({ yDoc, sheetId, selection, onClose }: PdfExportDialogProps) {
	const { t } = useTranslation()
	const toast = useToast()
	const names = React.useMemo(() => listNamedRanges(yDoc), [yDoc])
	const [scope, setScope] = React.useState<Scope>(() => {
		if (sheetId) return 'sheet'
		return names[0] ? formatNameNav(names[0].id) : ''
	})
	const [paper, setPaper] = React.useState<PdfPaper>('a4')
	const [orientation, setOrientation] = React.useState<PdfOrientation>('portrait')
	const [fitWidth, setFitWidth] = React.useState(true)
	const [repeatHead, setRepeatHead] = React.useState(false)
	const [busy, setBusy] = React.useState(false)

	function resolveScope(): { range: ResolvedRange; fileName: string } | null {
		if (scope === 'sheet') {
			const range = sheetId && usedRange(yDoc, sheetId)
			return range ? { range, fileName: sheetName(yDoc, range.sheetId) } : null
		}
		if (scope === 'selection') {
			return selection
				? { range: selection, fileName: sheetName(yDoc, selection.sheetId) }
				: null
		}
		const target = resolveEmbedNav(yDoc, scope)
		return target ? { range: target.range, fileName: target.name ?? '' } : null
	}

	async function handleSubmit(evt: React.FormEvent<HTMLFormElement>) {
		evt.preventDefault()
		const target = resolveScope()
		if (!target) {
			toast.error(t('The selected range no longer exists'))
			return
		}
		setBusy(true)
		try {
			await exportRangePdf(yDoc, { ...target, paper, orientation, fitWidth, repeatHead })
			onClose()
		} catch (err) {
			console.error('PDF export failed', err)
			toast.error(t('PDF export failed'))
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog
			open
			size="sm"
			title={t('Export to PDF')}
			dismissable={!busy}
			onClose={onClose}
			onSubmit={handleSubmit}
			footer={
				<ActionBar>
					<Button onClick={onClose} disabled={busy}>
						{t('Cancel')}
					</Button>
					<Button type="submit" color="primary" disabled={busy || !scope}>
						{busy ? t('Exporting…') : t('Export')}
					</Button>
				</ActionBar>
			}
		>
			<div className="c-vbox g-3">
				<Field label={t('Range')}>
					<NativeSelect value={scope} onChange={(e) => setScope(e.target.value)}>
						{sheetId && (
							<option value="sheet">{t('Used range of current sheet')}</option>
						)}
						{selection && <option value="selection">{t('Current selection')}</option>}
						{names.map((n) => (
							<option key={n.id} value={formatNameNav(n.id)}>
								{n.name}
							</option>
						))}
					</NativeSelect>
				</Field>
				<Field label={t('Paper')}>
					<NativeSelect
						value={paper}
						onChange={(e) => setPaper(e.target.value as PdfPaper)}
					>
						<option value="a4">A4</option>
						<option value="letter">Letter</option>
					</NativeSelect>
				</Field>
				<Field label={t('Orientation')}>
					<RadioGroup<PdfOrientation>
						orientation="horizontal"
						value={orientation}
						onChange={setOrientation}
						options={[
							{ value: 'portrait', label: t('Portrait') },
							{ value: 'landscape', label: t('Landscape') }
						]}
					/>
				</Field>
				<Checkbox
					label={t('Fit to page width')}
					checked={fitWidth}
					onChange={(e) => setFitWidth(e.target.checked)}
				/>
				<Checkbox
					label={t('Repeat first row')}
					checked={repeatHead}
					onChange={(e) => setRepeatHead(e.target.checked)}
				/>
			</div>
		</Dialog>
	)
}

// vim: ts=4
