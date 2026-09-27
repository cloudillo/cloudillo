// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import type {
	AddressBookOutput,
	ContactInput,
	ContactName,
	ContactOutput,
	TypedValue
} from '@cloudillo/core'
import {
	ActionBar,
	Alert,
	Button,
	Dialog,
	Field,
	Fieldset,
	HBox,
	Input,
	NativeSelect,
	TextArea,
	VBox
} from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus as IcAdd, LuTrash as IcDelete, LuLink as IcLinked } from 'react-icons/lu'

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
		<Fieldset legend={fieldLabel}>
			<VBox gap={1}>
				{values.map((v, idx) => (
					<HBox key={v.uiKey} gap={1} align="center">
						<NativeSelect
							className="w-sm"
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
						</NativeSelect>
						<Input
							className="flex-fill"
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
						<Button
							type="button"
							variant="ghost"
							size="sm"
							color="error"
							aria-label={labels.remove}
							onClick={() => setValues((prev) => prev.filter((_, i) => i !== idx))}
							icon={<IcDelete />}
						/>
					</HBox>
				))}
				<HBox>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleAdd}
						icon={<IcAdd />}
					>
						{labels.add}
					</Button>
				</HBox>
			</VBox>
		</Fieldset>
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
		<Dialog
			open={open}
			onClose={onClose}
			title={isEdit ? t('Edit contact') : t('New contact')}
			size="md"
			onSubmit={handleSave}
			footer={
				<ActionBar>
					<Button type="button" onClick={onClose}>
						{t('Cancel')}
					</Button>
					<Button type="submit" color="primary" loading={submitting}>
						{isEdit ? t('Save') : t('Create')}
					</Button>
				</ActionBar>
			}
		>
			<VBox gap={3}>
				{error && (
					<Alert color="error" compact>
						{error}
					</Alert>
				)}

				{!isEdit && (
					<Field label={t('Address book')}>
						<NativeSelect
							value={abId ?? ''}
							onChange={(e) => setAbId(Number(e.target.value))}
						>
							{addressBooks.map((book) => (
								<option key={book.abId} value={book.abId}>
									{book.name}
								</option>
							))}
						</NativeSelect>
					</Field>
				)}

				<Fieldset legend={t('Name')}>
					<VBox gap={2}>
						<HBox gap={2}>
							<Input
								className="flex-fill"
								placeholder={t('Given')}
								aria-label={t('Given')}
								value={n.given ?? ''}
								onChange={(e) => setN({ ...n, given: e.target.value })}
							/>
							<Input
								className="flex-fill"
								placeholder={t('Family')}
								aria-label={t('Family')}
								value={n.family ?? ''}
								onChange={(e) => setN({ ...n, family: e.target.value })}
							/>
						</HBox>
						<Input
							placeholder={t('Display name (auto-derived if empty)')}
							aria-label={t('Display name (auto-derived if empty)')}
							value={fn}
							onChange={(e) => setFn(e.target.value)}
						/>
					</VBox>
				</Fieldset>

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

				<HBox gap={2} wrap>
					<Field label={t('Organization')} className="flex-fill">
						<Input value={org} onChange={(e) => setOrg(e.target.value)} />
					</Field>
					<Field label={t('Title')} className="flex-fill">
						<Input value={title} onChange={(e) => setTitle(e.target.value)} />
					</Field>
				</HBox>

				<Field label={t('Photo URL')}>
					<Input
						type="url"
						placeholder="https://..."
						value={photo}
						onChange={(e) => setPhoto(e.target.value)}
					/>
				</Field>

				<Field
					label={t('Linked Cloudillo profile (idTag)')}
					hint={t(
						'Links this contact to a Cloudillo profile so name and photo stay live.'
					)}
				>
					<Input
						leading={<IcLinked />}
						placeholder="alice.example.com"
						value={profileIdTag}
						onChange={(e) => setProfileIdTag(e.target.value)}
					/>
				</Field>

				<Field label={t('Notes')}>
					<TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
				</Field>
			</VBox>
		</Dialog>
	)
}

// vim: ts=4
