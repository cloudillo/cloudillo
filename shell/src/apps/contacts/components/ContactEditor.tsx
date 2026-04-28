// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuX as IcClose,
	LuPlus as IcAdd,
	LuTrash as IcDelete,
	LuLink as IcLinked
} from 'react-icons/lu'

import { Button, Modal } from '@cloudillo/react'
import type {
	ContactInput,
	ContactName,
	ContactOutput,
	TypedValue,
	AddressBookOutput
} from '@cloudillo/core'

export interface ContactEditorProps {
	open: boolean
	onClose: () => void
	addressBooks: AddressBookOutput[]
	defaultAddressBookId?: number
	contact?: ContactOutput
	onSave: (abId: number, data: ContactInput) => Promise<void>
}

interface DraftTypedValue extends TypedValue {
	uiKey: string
}

const EMAIL_TYPES = ['HOME', 'WORK', 'OTHER'] as const
const PHONE_TYPES = ['CELL', 'HOME', 'WORK', 'FAX', 'OTHER'] as const

function fromDraft(values: DraftTypedValue[]): TypedValue[] {
	return values
		.filter((v) => v.value.trim() !== '')
		.map(({ uiKey: _uiKey, ...rest }) => ({
			value: rest.value.trim(),
			type: rest.type && rest.type.length > 0 ? rest.type : undefined,
			pref: rest.pref
		}))
}

function emptyName(): ContactName {
	return { given: '', family: '' }
}

interface TypedValueRowsProps {
	fieldLabel: string
	values: DraftTypedValue[]
	setValues: React.Dispatch<React.SetStateAction<DraftTypedValue[]>>
	typeOptions: readonly string[]
	defaultType: string
	inputType: 'email' | 'tel'
	inputPlaceholder: string
	nextUiKey: () => string
	labels: { add: string; typeSelect: string; remove: string }
}

function TypedValueRows({
	fieldLabel,
	values,
	setValues,
	typeOptions,
	defaultType,
	inputType,
	inputPlaceholder,
	nextUiKey,
	labels
}: TypedValueRowsProps) {
	function handleAdd() {
		setValues((prev) => [...prev, { value: '', type: [defaultType], uiKey: nextUiKey() }])
	}
	return (
		<div className="mb-3">
			<div className="d-flex align-items-center mb-1">
				<label className="c-contact-field-label flex-fill mb-0">{fieldLabel}</label>
				<button
					type="button"
					className="c-link"
					onClick={handleAdd}
					aria-label={labels.add}
				>
					<IcAdd />
				</button>
			</div>
			{values.map((v, idx) => (
				<div key={v.uiKey} className="c-typed-row">
					<select
						className="c-input"
						value={v.type?.[0] ?? ''}
						aria-label={labels.typeSelect}
						onChange={(ev) =>
							setValues((prev) => {
								const next = [...prev]
								next[idx] = {
									...prev[idx],
									type: ev.target.value ? [ev.target.value] : []
								}
								return next
							})
						}
					>
						{typeOptions.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</select>
					<input
						className="c-input"
						type={inputType}
						placeholder={inputPlaceholder}
						value={v.value}
						onChange={(ev) =>
							setValues((prev) => {
								const next = [...prev]
								next[idx] = { ...prev[idx], value: ev.target.value }
								return next
							})
						}
					/>
					<button
						type="button"
						className="c-link text-error c-typed-row__remove"
						aria-label={labels.remove}
						onClick={() => setValues((prev) => prev.filter((_, i) => i !== idx))}
					>
						<IcDelete />
					</button>
				</div>
			))}
		</div>
	)
}

export function ContactEditor({
	open,
	onClose,
	addressBooks,
	defaultAddressBookId,
	contact,
	onSave
}: ContactEditorProps) {
	const { t } = useTranslation()
	const [abId, setAbId] = React.useState<number | undefined>(defaultAddressBookId)
	const [n, setN] = React.useState<ContactName>(emptyName())
	const [fn, setFn] = React.useState('')
	const [emails, setEmails] = React.useState<DraftTypedValue[]>([])
	const [phones, setPhones] = React.useState<DraftTypedValue[]>([])
	const [org, setOrg] = React.useState('')
	const [title, setTitle] = React.useState('')
	const [note, setNote] = React.useState('')
	const [photo, setPhoto] = React.useState('')
	const [profileIdTag, setProfileIdTag] = React.useState('')
	const [submitting, setSubmitting] = React.useState(false)
	const [error, setError] = React.useState<string | undefined>()
	const uiKeyCounter = React.useRef(0)
	const nextUiKey = React.useCallback(() => `k${++uiKeyCounter.current}`, [])
	const toDraft = React.useCallback(
		(values?: TypedValue[]): DraftTypedValue[] =>
			(values ?? []).map((v) => ({ ...v, type: v.type ?? [], uiKey: nextUiKey() })),
		[nextUiKey]
	)

	// Reset only on open→true transition; read fresh props via ref so a parent
	// re-render (e.g. addressBooks array identity change) doesn't wipe in-progress edits.
	const openResetRef = React.useRef({ contact, defaultAddressBookId, addressBooks, toDraft })
	openResetRef.current = { contact, defaultAddressBookId, addressBooks, toDraft }
	React.useEffect(() => {
		if (!open) return
		const {
			contact: c,
			defaultAddressBookId: defId,
			addressBooks: books,
			toDraft: mkDraft
		} = openResetRef.current
		setAbId(c?.abId ?? defId ?? books[0]?.abId)
		setN(c?.n ?? emptyName())
		setFn(c?.fn ?? '')
		setEmails(mkDraft(c?.emails))
		setPhones(mkDraft(c?.phones))
		setOrg(c?.org ?? '')
		setTitle(c?.title ?? '')
		setNote(c?.note ?? '')
		setPhoto(c?.photo ?? '')
		setProfileIdTag(c?.profileIdTag ?? '')
		setError(undefined)
	}, [open])

	function autoFn(): string {
		if (fn.trim()) return fn.trim()
		const parts = [n.prefix, n.given, n.additional, n.family, n.suffix].filter(
			(p): p is string => !!p && p.trim() !== ''
		)
		return parts.join(' ').trim()
	}

	async function handleSave(e?: React.FormEvent) {
		e?.preventDefault()
		if (!abId) {
			setError(t('Select an address book'))
			return
		}
		const computedFn = autoFn()
		if (!computedFn) {
			setError(t('Provide at least a name'))
			return
		}
		setSubmitting(true)
		setError(undefined)
		try {
			const cleanN: ContactName = {
				given: n.given?.trim() || undefined,
				family: n.family?.trim() || undefined,
				additional: n.additional?.trim() || undefined,
				prefix: n.prefix?.trim() || undefined,
				suffix: n.suffix?.trim() || undefined
			}
			const hasN = Object.values(cleanN).some((v) => v != null)
			const data: ContactInput = {
				fn: computedFn,
				n: hasN ? cleanN : undefined,
				emails: fromDraft(emails),
				phones: fromDraft(phones),
				org: org.trim() || undefined,
				title: title.trim() || undefined,
				note: note.trim() || undefined,
				photo: photo.trim() || undefined,
				profileIdTag: profileIdTag.trim() || undefined
			}
			await onSave(abId, data)
			onClose()
		} catch (err) {
			setError(err instanceof Error ? err.message : t('Failed to save contact'))
		} finally {
			setSubmitting(false)
		}
	}

	const isEdit = !!contact

	return (
		<Modal open={open} onClose={onClose}>
			<form
				className="c-dialog c-panel emph p-4"
				style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
				onSubmit={handleSave}
			>
				<div className="d-flex align-items-center justify-content-between mb-3">
					<h3 className="m-0">{isEdit ? t('Edit contact') : t('New contact')}</h3>
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

				{!isEdit && (
					<div className="mb-3">
						<label className="c-contact-field-label">{t('Address book')}</label>
						<select
							className="c-input"
							value={abId ?? ''}
							onChange={(e) => setAbId(Number(e.target.value))}
						>
							{addressBooks.map((book) => (
								<option key={book.abId} value={book.abId}>
									{book.name}
								</option>
							))}
						</select>
					</div>
				)}

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Name')}</label>
					<div className="d-flex g-2">
						<input
							className="c-input"
							placeholder={t('Given')}
							value={n.given ?? ''}
							onChange={(e) => setN({ ...n, given: e.target.value })}
						/>
						<input
							className="c-input"
							placeholder={t('Family')}
							value={n.family ?? ''}
							onChange={(e) => setN({ ...n, family: e.target.value })}
						/>
					</div>
					<input
						className="c-input mt-2"
						placeholder={t('Display name (auto-derived if empty)')}
						value={fn}
						onChange={(e) => setFn(e.target.value)}
					/>
				</div>

				<TypedValueRows
					fieldLabel={t('Email')}
					values={emails}
					setValues={setEmails}
					typeOptions={EMAIL_TYPES}
					defaultType="HOME"
					inputType="email"
					inputPlaceholder="user@example.com"
					nextUiKey={nextUiKey}
					labels={{
						add: t('Add email'),
						typeSelect: t('Email type'),
						remove: t('Remove email')
					}}
				/>

				<TypedValueRows
					fieldLabel={t('Phone')}
					values={phones}
					setValues={setPhones}
					typeOptions={PHONE_TYPES}
					defaultType="CELL"
					inputType="tel"
					inputPlaceholder="+1 555 123 4567"
					nextUiKey={nextUiKey}
					labels={{
						add: t('Add phone'),
						typeSelect: t('Phone type'),
						remove: t('Remove phone')
					}}
				/>

				<div className="d-flex g-2 mb-3">
					<div className="flex-fill">
						<label className="c-contact-field-label">{t('Organization')}</label>
						<input
							className="c-input"
							value={org}
							onChange={(e) => setOrg(e.target.value)}
						/>
					</div>
					<div className="flex-fill">
						<label className="c-contact-field-label">{t('Title')}</label>
						<input
							className="c-input"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>
				</div>

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Photo URL')}</label>
					<input
						className="c-input"
						type="url"
						placeholder="https://..."
						value={photo}
						onChange={(e) => setPhoto(e.target.value)}
					/>
				</div>

				<div className="mb-3">
					<label className="c-contact-field-label d-flex align-items-center g-1">
						<IcLinked />
						{t('Linked Cloudillo profile (idTag)')}
					</label>
					<input
						className="c-input"
						placeholder="alice.example.com"
						value={profileIdTag}
						onChange={(e) => setProfileIdTag(e.target.value)}
					/>
					<div className="c-contact-field-hint">
						{t(
							'Links this contact to a Cloudillo profile so name and photo stay live.'
						)}
					</div>
				</div>

				<div className="mb-3">
					<label className="c-contact-field-label">{t('Notes')}</label>
					<textarea
						className="c-input"
						rows={3}
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</div>

				<div className="d-flex justify-content-end g-2">
					<Button type="button" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button type="submit" variant="primary" disabled={submitting}>
						{submitting ? t('Saving...') : isEdit ? t('Save') : t('Create')}
					</Button>
				</div>
			</form>
		</Modal>
	)
}

// vim: ts=4
