// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Named ranges side panel: list, rename, redefine from selection, delete, copy embed link.
 */

import { Button, Panel, useDialog, useToast } from '@cloudillo/react'
import type { TFunction } from 'i18next'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	PiXBold as IcClose,
	PiTrashBold as IcDelete,
	PiLinkBold as IcLink,
	PiArrowsInSimpleBold as IcRedefine,
	PiPencilBold as IcRename
} from 'react-icons/pi'
import type * as Y from 'yjs'

import {
	deleteNamedRange,
	formatA1,
	formatNameNav,
	getNamesMap,
	listNamedRanges,
	NAME_EMPTY,
	NAME_TAKEN,
	type RangeAnchor,
	type ResolvedRange,
	redefineNamedRange,
	renameNamedRange,
	resolveAnchor
} from './named-ranges'

/** Translated text for a create/rename error, `fallback` for anything unexpected */
export function nameErrorText(t: TFunction, err: unknown, fallback: string): string {
	const code = err instanceof Error ? err.message : undefined
	if (code === NAME_EMPTY) return t('Name must not be empty')
	if (code === NAME_TAKEN) return t('A named range with this name already exists')
	return fallback
}

export interface NamedRangesPanelProps {
	yDoc: Y.Doc
	readOnly: boolean
	/** Current selection as an anchor, or null when there is none */
	getSelectionAnchor: () => RangeAnchor | null
	/** Copies a `cl:` ref for the nav; must run synchronously inside the click */
	onCopyLink: (nav: string) => void
	/** Activates the range's sheet and selects it */
	onSelect: (r: ResolvedRange) => void
	onClose: () => void
}

export function NamedRangesPanel({
	yDoc,
	readOnly,
	getSelectionAnchor,
	onCopyLink,
	onSelect,
	onClose
}: NamedRangesPanelProps) {
	const { t } = useTranslation()
	const dialog = useDialog()
	const toast = useToast()
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)

	// Names change directly; A1 text also moves with row/column inserts and deletes
	React.useEffect(() => {
		const names = getNamesMap(yDoc)
		const sheets = yDoc.getMap('sheets')
		names.observe(rerender)
		sheets.observeDeep(rerender)
		return () => {
			names.unobserve(rerender)
			sheets.unobserveDeep(rerender)
		}
	}, [yDoc])

	const ranges = listNamedRanges(yDoc)

	async function rename(id: string, current: string) {
		const name = await dialog.askText(t('Rename range'), t('New name'), {
			defaultValue: current
		})
		if (!name || name === current) return
		try {
			renameNamedRange(yDoc, id, name.trim())
		} catch (err) {
			toast.error(nameErrorText(t, err, t('Failed to rename range')))
		}
	}

	function redefine(id: string) {
		const anchor = getSelectionAnchor()
		if (!anchor) {
			toast.error(t('Select a range first'))
			return
		}
		redefineNamedRange(yDoc, id, anchor)
	}

	async function remove(id: string, name: string) {
		if (
			await dialog.confirm(
				t('Delete range'),
				t('Delete named range "{{name}}"? Embeds that use it will show "View missing".', {
					name
				})
			)
		) {
			deleteNamedRange(yDoc, id)
		}
	}

	return (
		<Panel className="calcillo-names-panel" style={{ width: '16rem', flexShrink: 0 }}>
			<div className="c-vbox g-2 p-2 h-100" style={{ overflowY: 'auto' }}>
				<div className="c-hbox">
					<h3 className="flex-fill m-0">{t('Named ranges')}</h3>
					<Button
						variant="link"
						icon={<IcClose />}
						title={t('Close')}
						aria-label={t('Close')}
						onClick={onClose}
					/>
				</div>
				{ranges.length === 0 && (
					<p className="text-muted">
						{t('No named ranges yet. Select cells and use "Name selection…".')}
					</p>
				)}
				{ranges.map((r) => {
					const resolved = resolveAnchor(yDoc, r)
					return (
						<div key={r.id} className="c-hbox g-1">
							<div
								className="flex-fill"
								style={{ minWidth: 0, cursor: resolved ? 'pointer' : undefined }}
								role="button"
								tabIndex={resolved ? 0 : -1}
								aria-disabled={!resolved}
								title={resolved ? t('Select range') : undefined}
								onClick={() => resolved && onSelect(resolved)}
								onKeyDown={(e) => {
									if (resolved && (e.key === 'Enter' || e.key === ' ')) {
										e.preventDefault()
										onSelect(resolved)
									}
								}}
							>
								<div className="text-truncate">{r.name}</div>
								<small className={resolved ? 'text-muted' : 'text-error'}>
									{resolved ? formatA1(resolved) : t('Broken reference')}
								</small>
							</div>
							<Button
								variant="link"
								immediate
								icon={<IcLink />}
								title={t('Copy embed link')}
								aria-label={t('Copy embed link')}
								onClick={() => onCopyLink(formatNameNav(r.id))}
							/>
							{!readOnly && (
								<>
									<Button
										variant="link"
										icon={<IcRename />}
										title={t('Rename')}
										aria-label={t('Rename')}
										onClick={() => rename(r.id, r.name)}
									/>
									<Button
										variant="link"
										icon={<IcRedefine />}
										title={t('Redefine from selection')}
										aria-label={t('Redefine from selection')}
										onClick={() => redefine(r.id)}
									/>
									<Button
										variant="link"
										icon={<IcDelete />}
										title={t('Delete')}
										aria-label={t('Delete')}
										onClick={() => remove(r.id, r.name)}
									/>
								</>
							)}
						</div>
					)
				})}
			</div>
		</Panel>
	)
}

// vim: ts=4
