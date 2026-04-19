// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'

import {
	LuPlus as IcAdd,
	LuUsers as IcAddNetwork,
	LuFileUp as IcImport,
	LuBookOpen as IcNewBook,
	LuFilter as IcFilter,
	LuEllipsisVertical as IcMore
} from 'react-icons/lu'

import { Button, Fcd, Menu, MenuItem, MenuDivider, useToast } from '@cloudillo/react'
import '@cloudillo/react/components.css'
import type { ContactInput, ContactOutput } from '@cloudillo/core'

import { useContextAwareApi } from '../../context/index.js'

import {
	AddressBookSidebar,
	AddressBookEditor,
	ContactList,
	ContactDetails,
	ContactEditor,
	AddFromNetworkModal,
	ImportVcfModal
} from './components/index.js'
import { useAddressBooks, useContactList } from './hooks/index.js'
import { selectedAddressBookAtom, searchQueryAtom, selectedContactRefAtom } from './atoms.js'
import type { AddressBookOutput, SelectedContactRef } from './types.js'

import './contacts.css'

export function ContactsApp() {
	const { t } = useTranslation()
	const { api } = useContextAwareApi()
	const toast = useToast()

	const [selection, setSelection] = useAtom(selectedAddressBookAtom)
	// searchQuery is the committed (debounced) query — the sidebar owns the
	// live input value and pushes here only after its internal debounce fires.
	const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
	const [selectedRef, setSelectedRef] = useAtom(selectedContactRefAtom)

	const {
		addressBooks,
		isLoading: booksLoading,
		create: createBook,
		update: updateBook,
		remove: removeBook
	} = useAddressBooks()

	const list = useContactList({
		selection,
		addressBooks,
		searchQuery
	})

	// Mobile filter visibility
	const [showFilter, setShowFilter] = React.useState(false)

	// Address book editor
	const [bookEditorOpen, setBookEditorOpen] = React.useState(false)
	const [bookBeingEdited, setBookBeingEdited] = React.useState<AddressBookOutput | undefined>()

	// Contact editor
	const [contactEditorOpen, setContactEditorOpen] = React.useState(false)
	const [editingContact, setEditingContact] = React.useState<ContactOutput | undefined>()

	// Add-from-network modal
	const [addFromNetworkOpen, setAddFromNetworkOpen] = React.useState(false)

	// Import VCF modal
	const [importOpen, setImportOpen] = React.useState(false)

	// Toolbar overflow menu (anchor position)
	const [toolbarMenu, setToolbarMenu] = React.useState<{ x: number; y: number } | null>(null)

	function openToolbarMenu(e: React.MouseEvent<HTMLButtonElement>) {
		const rect = e.currentTarget.getBoundingClientRect()
		const MENU_WIDTH = 220
		// Anchor below the trigger; right-align to it, but keep within the viewport.
		const x = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
		setToolbarMenu({ x, y: rect.bottom + 4 })
	}

	// Selected contact (full details)
	const [detailContact, setDetailContact] = React.useState<ContactOutput | undefined>()
	const [detailLoading, setDetailLoading] = React.useState(false)

	React.useEffect(
		function loadSelectedContact() {
			if (!api || !selectedRef) {
				setDetailContact(undefined)
				return
			}
			let cancelled = false
			setDetailLoading(true)
			api.contacts
				.getContact(selectedRef.abId, selectedRef.uid)
				.then((c) => {
					if (!cancelled) setDetailContact(c)
				})
				.catch((err) => {
					if (cancelled) return
					console.error('[ContactsApp] Failed to load contact:', err)
					setDetailContact(undefined)
				})
				.finally(() => {
					if (!cancelled) setDetailLoading(false)
				})
			return () => {
				cancelled = true
			}
		},
		[api, selectedRef]
	)

	function handleSelectContact(ref: SelectedContactRef) {
		setSelectedRef(ref)
	}

	function openCreateBook() {
		setBookBeingEdited(undefined)
		setBookEditorOpen(true)
	}

	function openRenameBook(book: AddressBookOutput) {
		setBookBeingEdited(book)
		setBookEditorOpen(true)
	}

	async function handleSaveBook(data: { name: string; description?: string }) {
		if (bookBeingEdited) {
			await updateBook(bookBeingEdited.abId, {
				name: data.name,
				description: data.description ?? null
			})
		} else {
			const created = await createBook(data)
			if (created) setSelection(created.abId)
		}
	}

	async function handleDeleteBook(book: AddressBookOutput) {
		await removeBook(book.abId)
		if (selection === book.abId) setSelection('all')
		if (selectedRef?.abId === book.abId) setSelectedRef(null)
	}

	function openCreateContact() {
		setEditingContact(undefined)
		setContactEditorOpen(true)
	}

	function openEditContact() {
		if (!detailContact) return
		setEditingContact(detailContact)
		setContactEditorOpen(true)
	}

	async function handleSaveContact(abId: number, data: ContactInput) {
		if (!api) throw new Error(t('Not connected'))
		if (editingContact) {
			const updated = await api.contacts.replaceContact(
				editingContact.abId,
				editingContact.uid,
				data
			)
			setDetailContact(updated)
			toast.success(t('Contact updated'))
		} else {
			const created = await api.contacts.createContact(abId, data)
			setSelectedRef({ abId: created.abId, uid: created.uid })
			toast.success(t('Contact created'))
		}
		list.refresh()
	}

	async function handleAddFromNetwork(abId: number, data: ContactInput) {
		if (!api) throw new Error(t('Not connected'))
		const created = await api.contacts.createContact(abId, data)
		setSelectedRef({ abId: created.abId, uid: created.uid })
		list.refresh()
		toast.success(t('Contact added from your network'))
	}

	async function handleDeleteContact() {
		if (!detailContact) return
		if (!api) {
			toast.error(t('Not connected'))
			return
		}
		try {
			await api.contacts.deleteContact(detailContact.abId, detailContact.uid)
			setSelectedRef(null)
			setDetailContact(undefined)
			list.refresh()
			toast.success(t('Contact deleted'))
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('Failed to delete contact'))
		}
	}

	const defaultBookId = typeof selection === 'number' ? selection : addressBooks[0]?.abId

	const noBooks = !booksLoading && addressBooks.length === 0

	return (
		<>
			<Fcd.Container className="g-1">
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<AddressBookSidebar
						addressBooks={addressBooks}
						selection={selection}
						onSelect={(s) => {
							setSelection(s)
							setSelectedRef(null)
						}}
						onRename={openRenameBook}
						onDelete={handleDeleteBook}
						initialQuery={searchQuery}
						onSearchChange={setSearchQuery}
					/>
				</Fcd.Filter>

				<Fcd.Content
					header={
						<div className="c-nav d-flex align-items-center g-2 p-2">
							<button
								type="button"
								className="c-link md-hide lg-hide"
								onClick={() => setShowFilter(true)}
								aria-label={t('Show address books')}
							>
								<IcFilter />
							</button>
							<Button
								primary
								className="small"
								disabled={noBooks}
								onClick={openCreateContact}
							>
								<IcAdd className="me-1" />
								{t('New contact')}
							</Button>
							<button
								type="button"
								className="c-link"
								onClick={openToolbarMenu}
								aria-label={t('More actions')}
								aria-haspopup="menu"
								aria-expanded={!!toolbarMenu}
								title={t('More actions')}
							>
								<IcMore />
							</button>
						</div>
					}
				>
					{noBooks ? (
						<div className="c-vbox align-items-center justify-content-center p-4 g-3 text-center">
							<h3 className="m-0">{t('No address books yet')}</h3>
							<p className="c-hint">
								{t('Create an address book to start adding contacts.')}
							</p>
							<Button primary onClick={openCreateBook}>
								<IcAdd className="me-1" />
								{t('New address book')}
							</Button>
						</div>
					) : (
						<ContactList
							contacts={list.contacts}
							isLoading={list.isLoading}
							isLoadingMore={list.isLoadingMore}
							hasMore={list.hasMore}
							error={list.error}
							loadMore={list.loadMore}
							sentinelRef={list.sentinelRef}
							selected={selectedRef}
							onSelect={handleSelectContact}
							showBookName={selection === 'all'}
							truncated={list.truncated}
							truncationLimit={list.truncationLimit}
						/>
					)}
				</Fcd.Content>

				<Fcd.Details isVisible={!!selectedRef} hide={() => setSelectedRef(null)}>
					<ContactDetails
						contact={detailContact}
						loading={detailLoading}
						onEdit={openEditContact}
						onDelete={handleDeleteContact}
					/>
				</Fcd.Details>
			</Fcd.Container>

			<AddressBookEditor
				open={bookEditorOpen}
				book={bookBeingEdited}
				onClose={() => setBookEditorOpen(false)}
				onSave={handleSaveBook}
			/>

			<ContactEditor
				open={contactEditorOpen}
				onClose={() => setContactEditorOpen(false)}
				addressBooks={addressBooks}
				defaultAddressBookId={defaultBookId}
				contact={editingContact}
				onSave={handleSaveContact}
			/>

			<AddFromNetworkModal
				open={addFromNetworkOpen}
				onClose={() => setAddFromNetworkOpen(false)}
				addressBooks={addressBooks}
				defaultAddressBookId={defaultBookId}
				onAdd={handleAddFromNetwork}
			/>

			{toolbarMenu && (
				<Menu position={toolbarMenu} onClose={() => setToolbarMenu(null)}>
					<MenuItem
						icon={<IcAddNetwork />}
						label={t('Add from Cloudillo network')}
						disabled={noBooks}
						onClick={() => {
							setToolbarMenu(null)
							setAddFromNetworkOpen(true)
						}}
					/>
					<MenuItem
						icon={<IcImport />}
						label={t('Import VCF…')}
						disabled={noBooks}
						onClick={() => {
							setToolbarMenu(null)
							setImportOpen(true)
						}}
					/>
					<MenuDivider />
					<MenuItem
						icon={<IcNewBook />}
						label={t('New address book')}
						onClick={() => {
							setToolbarMenu(null)
							openCreateBook()
						}}
					/>
				</Menu>
			)}

			<ImportVcfModal
				open={importOpen}
				onClose={() => setImportOpen(false)}
				addressBooks={addressBooks}
				defaultAddressBookId={defaultBookId}
				onImported={(res) => {
					list.refresh()
					if (res.imported + res.updated > 0) {
						const summary = t(
							'{{imported}} added, {{updated}} updated, {{skipped}} skipped',
							{
								imported: res.imported,
								updated: res.updated,
								skipped: res.skipped
							}
						)
						toast.success(summary)
					}
				}}
			/>
		</>
	)
}

// vim: ts=4
