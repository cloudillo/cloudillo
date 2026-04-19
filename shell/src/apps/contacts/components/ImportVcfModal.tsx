// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcClose,
	LuFileUp as IcUpload,
	LuFileText as IcFile,
	LuCircleCheck as IcSuccess,
	LuTriangleAlert as IcWarn
} from 'react-icons/lu'

import { Button, Modal, mergeClasses } from '@cloudillo/react'
import type { AddressBookOutput, ImportConflictMode, ImportContactsResult } from '@cloudillo/core'

import { useContextAwareApi } from '../../../context/index.js'

export interface ImportVcfModalProps {
	open: boolean
	onClose: () => void
	addressBooks: AddressBookOutput[]
	defaultAddressBookId?: number
	/** Called after a successful import so the parent can refresh the contact list. */
	onImported: (result: ImportContactsResult) => void
}

const VCARD_BEGIN_RE = /^BEGIN:VCARD\b/gim

function countCards(text: string): number {
	return (text.match(VCARD_BEGIN_RE) ?? []).length
}

function fmtBytes(n: number): string {
	if (n < 1024) return `${n} B`
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
	return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function ImportVcfModal({
	open,
	onClose,
	addressBooks,
	defaultAddressBookId,
	onImported
}: ImportVcfModalProps) {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const fileInputRef = React.useRef<HTMLInputElement>(null)

	const [abId, setAbId] = React.useState<number | undefined>(defaultAddressBookId)
	const [conflict, setConflict] = React.useState<ImportConflictMode>('skip')
	const [file, setFile] = React.useState<File | undefined>()
	const [vcardText, setVcardText] = React.useState<string>('')
	const [previewCount, setPreviewCount] = React.useState(0)
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [result, setResult] = React.useState<ImportContactsResult | undefined>()
	const [dragOver, setDragOver] = React.useState(false)

	// Reset only on open→true transition; read fresh props via ref so later
	// prop changes don't wipe the picked file mid-flight.
	const openResetRef = React.useRef({ defaultAddressBookId, addressBooks })
	openResetRef.current = { defaultAddressBookId, addressBooks }
	React.useEffect(() => {
		if (!open) return
		const { defaultAddressBookId: defId, addressBooks: books } = openResetRef.current
		setAbId(defId ?? books[0]?.abId)
		setConflict('skip')
		setFile(undefined)
		setVcardText('')
		setPreviewCount(0)
		setError(undefined)
		setResult(undefined)
		setSubmitting(false)
		setDragOver(false)
		if (fileInputRef.current) fileInputRef.current.value = ''
	}, [open])

	async function handleFile(f: File) {
		setError(undefined)
		setResult(undefined)
		setFile(f)
		try {
			const text = await f.text()
			setVcardText(text)
			setPreviewCount(countCards(text))
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Could not read file'))
			setVcardText('')
			setPreviewCount(0)
		}
	}

	function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0]
		if (f) void handleFile(f)
	}

	function onDrop(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault()
		setDragOver(false)
		const f = e.dataTransfer.files?.[0]
		if (f) void handleFile(f)
	}

	function onDragOver(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault()
		setDragOver(true)
	}

	function onDragLeave() {
		setDragOver(false)
	}

	function openPicker() {
		fileInputRef.current?.click()
	}

	function clearFile() {
		setFile(undefined)
		setVcardText('')
		setPreviewCount(0)
		if (fileInputRef.current) fileInputRef.current.value = ''
	}

	async function handleImport(e?: React.FormEvent) {
		e?.preventDefault()
		if (!api || !abId || !vcardText) return
		setSubmitting(true)
		setError(undefined)
		try {
			const res = await api.contacts.importContacts(abId, vcardText, conflict)
			setResult(res)
			onImported(res)
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Import failed'))
		} finally {
			setSubmitting(false)
		}
	}

	const noBooks = addressBooks.length === 0
	const ready = !!api && !!file && previewCount > 0 && !!abId && !submitting

	return (
		<Modal open={open} onClose={onClose}>
			<form
				className="c-dialog c-panel emph p-4"
				style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
				onSubmit={handleImport}
			>
				<div className="d-flex align-items-center justify-content-between mb-3">
					<h3 className="m-0">{t('Import contacts (VCF)')}</h3>
					<button
						type="button"
						className="c-link"
						onClick={onClose}
						aria-label={t('Close')}
					>
						<IcClose />
					</button>
				</div>

				{error && (
					<div
						className="c-panel bg-container-error p-2 mb-3"
						role="alert"
						aria-live="polite"
					>
						<span className="text-error">{error}</span>
					</div>
				)}

				{result ? (
					<ImportResultView result={result} onClose={onClose} />
				) : (
					<>
						{/* Hidden native input — triggered by the drop zone / "Replace" button */}
						<input
							ref={fileInputRef}
							type="file"
							accept=".vcf,text/vcard,text/x-vcard,text/directory"
							onChange={onFileChange}
							className="c-visually-hidden"
							tabIndex={-1}
						/>

						{!file ? (
							<div
								role="button"
								tabIndex={0}
								className={mergeClasses(
									'c-import-drop mb-3',
									dragOver && 'is-dragover'
								)}
								onClick={openPicker}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault()
										openPicker()
									}
								}}
								onDragOver={onDragOver}
								onDragEnter={onDragOver}
								onDragLeave={onDragLeave}
								onDrop={onDrop}
							>
								<IcUpload className="c-import-drop__icon" />
								<div className="c-import-drop__primary">
									{t('Drop a .vcf file here, or click to browse')}
								</div>
								<div className="c-import-drop__hint">
									{t('Exported from Apple Contacts, Google Contacts, etc.')}
								</div>
							</div>
						) : (
							<div className="c-import-file-card mb-3">
								<IcFile className="c-import-file-card__icon" aria-hidden="true" />
								<div className="c-import-file-card__body">
									<div className="c-import-file-card__name" title={file.name}>
										{file.name}
									</div>
									<div className="c-import-file-card__meta">
										{fmtBytes(file.size)} ·{' '}
										{previewCount === 0 ? (
											<span className="text-warning">
												{t('No vCard blocks detected')}
											</span>
										) : (
											t('{{count}} contacts found', {
												count: previewCount
											})
										)}
									</div>
								</div>
								<button
									type="button"
									className="c-link"
									onClick={openPicker}
									aria-label={t('Replace file')}
								>
									{t('Replace')}
								</button>
								<button
									type="button"
									className="c-link"
									onClick={clearFile}
									aria-label={t('Remove file')}
								>
									<IcClose />
								</button>
							</div>
						)}

						<div className="mb-3">
							<label className="c-contact-field-label">{t('Address book')}</label>
							<select
								className="c-input"
								value={abId ?? ''}
								disabled={noBooks}
								onChange={(e) => setAbId(Number(e.target.value))}
							>
								{addressBooks.map((book) => (
									<option key={book.abId} value={book.abId}>
										{book.name}
									</option>
								))}
							</select>
						</div>

						<fieldset
							className="mb-3"
							style={{ border: 'none', padding: 0, margin: 0 }}
						>
							<legend className="c-contact-field-label" style={{ padding: 0 }}>
								{t('If a contact already exists')}
							</legend>
							<div className="c-vbox g-2">
								<ConflictRadio
									value="skip"
									current={conflict}
									onChange={setConflict}
									label={t('Skip duplicates')}
									description={t(
										'Keep existing contacts unchanged. New ones are added.'
									)}
								/>
								<ConflictRadio
									value="replace"
									current={conflict}
									onChange={setConflict}
									label={t('Replace duplicates')}
									description={t(
										'Overwrite existing contacts with the imported version.'
									)}
								/>
								<ConflictRadio
									value="add"
									current={conflict}
									onChange={setConflict}
									label={t('Add as new')}
									description={t(
										'Always create a new contact, even if one with the same UID exists.'
									)}
								/>
							</div>
						</fieldset>

						<div className="d-flex justify-content-end g-2">
							<Button type="button" onClick={onClose}>
								{t('Cancel')}
							</Button>
							<Button type="submit" primary disabled={!ready}>
								<IcUpload className="me-1" />
								{submitting ? t('Importing...') : t('Import')}
							</Button>
						</div>
					</>
				)}
			</form>
		</Modal>
	)
}

function ConflictRadio({
	value,
	current,
	onChange,
	label,
	description
}: {
	value: ImportConflictMode
	current: ImportConflictMode
	onChange: (v: ImportConflictMode) => void
	label: string
	description: string
}) {
	const id = `import-conflict-${value}`
	const checked = current === value
	return (
		<label htmlFor={id} className={mergeClasses('c-conflict-card', checked && 'is-selected')}>
			<input
				id={id}
				type="radio"
				name="import-conflict"
				value={value}
				checked={checked}
				onChange={() => onChange(value)}
				className="c-conflict-card__radio"
			/>
			<div className="c-conflict-card__body">
				<div className="c-conflict-card__title">{label}</div>
				<div className="c-conflict-card__desc">{description}</div>
			</div>
		</label>
	)
}

function ImportResultView({
	result,
	onClose
}: {
	result: ImportContactsResult
	onClose: () => void
}) {
	const { t } = useTranslation()
	const ok = result.errors.length === 0
	return (
		<div className="c-vbox g-3">
			<div
				className={mergeClasses(
					'c-import-result-banner',
					ok ? 'bg-container-success' : 'bg-container-warning'
				)}
				role="status"
				aria-live="polite"
			>
				{ok ? (
					<IcSuccess className="c-import-result-banner__icon text-success" />
				) : (
					<IcWarn className="c-import-result-banner__icon text-warning" />
				)}
				<div className="flex-fill">
					<div className="font-medium">
						{ok ? t('Import complete') : t('Import finished with errors')}
					</div>
					<div className="c-contact-field-hint">
						{t(
							'{{imported}} added · {{updated}} updated · {{skipped}} skipped · {{errors}} failed',
							{
								imported: result.imported,
								updated: result.updated,
								skipped: result.skipped,
								errors: result.errors.length
							}
						)}
					</div>
				</div>
			</div>

			{!ok && (
				<details>
					<summary className="cursor-pointer">{t('Show error details')}</summary>
					<ul style={{ margin: '0.5rem 0 0', padding: '0 0 0 1.25rem' }}>
						{result.errors.map((e) => (
							<li key={`${e.index}-${e.uid ?? 'no-uid'}`} className="text-sm">
								<strong>#{e.index + 1}</strong>
								{e.uid ? ` (${e.uid})` : ''} — {e.message}
							</li>
						))}
					</ul>
				</details>
			)}

			<div className="d-flex justify-content-end">
				<Button primary onClick={onClose}>
					{t('Done')}
				</Button>
			</div>
		</div>
	)
}

// vim: ts=4
