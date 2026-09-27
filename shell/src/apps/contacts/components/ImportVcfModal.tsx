// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { AddressBookOutput, ImportConflictMode, ImportContactsResult } from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	Disclosure,
	DropZone,
	Field,
	Fieldset,
	FileButton,
	HBox,
	Icon,
	List,
	ListItem,
	NativeSelect,
	RadioGroup,
	Text,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose, LuFileText as IcFile, LuFileUp as IcUpload } from 'react-icons/lu'

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
const VCF_ACCEPT = '.vcf,text/vcard,text/x-vcard,text/directory'

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

	const [abId, setAbId] = React.useState<number | undefined>(defaultAddressBookId)
	const [conflict, setConflict] = React.useState<ImportConflictMode>('skip')
	const [file, setFile] = React.useState<File | undefined>()
	const [vcardText, setVcardText] = React.useState<string>('')
	const [previewCount, setPreviewCount] = React.useState(0)
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const [result, setResult] = React.useState<ImportContactsResult | undefined>()

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

	function onFiles(files: File[]) {
		if (files[0]) void handleFile(files[0])
	}

	function clearFile() {
		setFile(undefined)
		setVcardText('')
		setPreviewCount(0)
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
		<Dialog
			open={open}
			onClose={onClose}
			title={t('Import contacts (VCF)')}
			size="md"
			onSubmit={handleImport}
			footer={
				result ? (
					<ActionBar>
						<Button type="button" color="primary" onClick={onClose}>
							{t('Done')}
						</Button>
					</ActionBar>
				) : (
					<ActionBar>
						<Button type="button" onClick={onClose}>
							{t('Cancel')}
						</Button>
						<Button
							type="submit"
							color="primary"
							disabled={!ready}
							loading={submitting}
							icon={<IcUpload />}
						>
							{t('Import')}
						</Button>
					</ActionBar>
				)
			}
		>
			<VBox gap={3}>
				{error && (
					<Alert color="error" compact>
						{error}
					</Alert>
				)}

				{result ? (
					<ImportResultView result={result} />
				) : (
					<>
						{!file ? (
							<DropZone
								variant="area"
								accept={VCF_ACCEPT}
								multiple={false}
								onFiles={onFiles}
								title={t('Drop a .vcf file here, or click to browse')}
								hint={t('Exported from Apple Contacts, Google Contacts, etc.')}
							/>
						) : (
							<List variant="bordered">
								<ListItem
									leading={<Icon as={IcFile} color="primary" size="lg" />}
									title={<Text truncate>{file.name}</Text>}
									subtitle={
										<>
											{fmtBytes(file.size)} ·{' '}
											{previewCount === 0 ? (
												<Text color="warning">
													{t('No vCard blocks detected')}
												</Text>
											) : (
												t('{{count}} contacts found', {
													count: previewCount
												})
											)}
										</>
									}
									trailing={
										<HBox gap={1} align="center">
											<FileButton
												variant="ghost"
												size="sm"
												accept={VCF_ACCEPT}
												onFiles={onFiles}
												aria-label={t('Replace file')}
											>
												{t('Replace')}
											</FileButton>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={clearFile}
												aria-label={t('Remove file')}
												icon={<IcClose />}
											/>
										</HBox>
									}
								/>
							</List>
						)}

						<Field label={t('Address book')}>
							<NativeSelect
								value={abId ?? ''}
								disabled={noBooks}
								onChange={(e) => setAbId(Number(e.target.value))}
							>
								{addressBooks.map((book) => (
									<option key={book.abId} value={book.abId}>
										{book.name}
									</option>
								))}
							</NativeSelect>
						</Field>

						<Fieldset legend={t('If a contact already exists')}>
							<RadioGroup<ImportConflictMode>
								variant="card"
								value={conflict}
								onChange={setConflict}
								options={[
									{
										value: 'skip',
										label: t('Skip duplicates'),
										description: t(
											'Keep existing contacts unchanged. New ones are added.'
										)
									},
									{
										value: 'replace',
										label: t('Replace duplicates'),
										description: t(
											'Overwrite existing contacts with the imported version.'
										)
									},
									{
										value: 'add',
										label: t('Add as new'),
										description: t(
											'Always create a new contact, even if one with the same UID exists.'
										)
									}
								]}
							/>
						</Fieldset>
					</>
				)}
			</VBox>
		</Dialog>
	)
}

function ImportResultView({ result }: { result: ImportContactsResult }) {
	const { t } = useTranslation()
	const ok = result.errors.length === 0
	return (
		<VBox gap={3}>
			<Alert
				color={ok ? 'success' : 'warning'}
				title={ok ? t('Import complete') : t('Import finished with errors')}
			>
				{t(
					'{{imported}} added · {{updated}} updated · {{skipped}} skipped · {{errors}} failed',
					{
						imported: result.imported,
						updated: result.updated,
						skipped: result.skipped,
						errors: result.errors.length
					}
				)}
			</Alert>

			{!ok && (
				<Disclosure summary={t('Show error details')}>
					<List marker="bullet">
						{result.errors.map((e) => (
							<ListItem
								key={`${e.index}-${e.uid ?? 'no-uid'}`}
								title={
									<Text size="sm">
										<Text weight="bold">#{e.index + 1}</Text>
										{e.uid ? ` (${e.uid})` : ''} — {e.message}
									</Text>
								}
							/>
						))}
					</List>
				</Disclosure>
			)}
		</VBox>
	)
}

// vim: ts=4
