// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
	Button,
	EmptyState,
	FAB,
	Fcd,
	Menu,
	MenuDivider,
	MenuItem,
	PageHeader,
	useToast
} from '@cloudillo/react'
import { useAtom } from 'jotai'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
	LuPlus as IcAdd,
	LuUsers as IcAddNetwork,
	LuFileUp as IcImport,
	LuEllipsisVertical as IcMore,
	LuBookOpen as IcNewBook
} from 'react-icons/lu'
import '@cloudillo/react/components.css'
import type { ContactInput, ContactOutput } from '@cloudillo/core'

import { useContextAwareApi } from '../../context/index.js'
import { DrawerToggle } from '../../ui/DrawerToggle.js'
import { isPermissionError } from '../../utils.js'
import { searchQueryAtom, selectedAddressBookAtom, selectedContactRefAtom } from './atoms.js'
import {
	AddFromNetworkModal,
	AddressBookEditor,
	AddressBookSidebar,
	ContactDetails,
	ContactEditor,
	ContactList,
	ImportVcfModal
} from './components/index.js'
import { useAddressBooks, useContactList } from './hooks/index.js'
import type { AddressBookOutput, SelectedContactRef } from './types.js'

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
		error: booksError,
		create: createBook,
		update: updateBook,
		remove: removeBook
	} = useAddressBooks()

	const list = useContactList({
		selection,
		addressBooks,
		searchQuery
	})

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

	// Address book rail (drawer below md)
	const [showFilter, setShowFilter] = React.useState(false)

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
		// The sidebar fires this with `void`, so a rejection here would be a
		// silent unhandled rejection — report it instead.
		try {
			await removeBook(book.abId)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('Failed to delete address book'))
			return
		}
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

	// A failed list is not an empty list — without this the 403 a non-leader
	// gets in a community context renders as the "create your first address
	// book" prompt, whose button then fails again with no explanation.
	const booksDenied = isPermissionError(booksError)
	const noBooks = !booksLoading && !booksError && addressBooks.length === 0
	// No "New contact" at all until there is a book to put it in.
	const canCreateContact = !booksLoading && !booksError && addressBooks.length > 0
	const selectedBookName =
		selection === 'all'
			? t('All contacts')
			: addressBooks.find((b) => b.abId === selection)?.name

	return (
		<>
			<Fcd.Container>
				<Fcd.Filter isVisible={showFilter} hide={() => setShowFilter(false)}>
					<AddressBookSidebar
						addressBooks={addressBooks}
						selection={selection}
						onSelect={(s) => {
							setSelection(s)
							setSelectedRef(null)
							setShowFilter(false)
						}}
						onRename={openRenameBook}
						onDelete={handleDeleteBook}
						initialQuery={searchQuery}
						onSearchChange={setSearchQuery}
					/>
				</Fcd.Filter>

				<Fcd.Content
					width="fluid"
					header={
						<PageHeader
							title={t('Contacts')}
							subtitle={selectedBookName}
							actions={
								<>
									<DrawerToggle
										nav
										label={t('Address books')}
										onClick={() => setShowFilter(true)}
									/>
									{canCreateContact && (
										<Button
											className="sm-hide"
											color="primary"
											onClick={openCreateContact}
											icon={<IcAdd />}
										>
											{t('New contact')}
										</Button>
									)}
									<Button
										variant="ghost"
										immediate
										onClick={openToolbarMenu}
										aria-label={t('More actions')}
										aria-haspopup="menu"
										aria-expanded={!!toolbarMenu}
										icon={<IcMore />}
									/>
								</>
							}
						/>
					}
				>
					{booksError ? (
						<EmptyState
							fill
							color={booksDenied ? 'warning' : 'error'}
							title={
								booksDenied
									? t('Contacts are not available here')
									: t('Failed to load address books')
							}
							description={
								booksDenied
									? t('You do not have permission to use contacts here.')
									: booksError.message
							}
						/>
					) : noBooks ? (
						<EmptyState
							fill
							title={t('No address books yet')}
							description={t('Create an address book to start adding contacts.')}
							actions={
								<Button
									color="primary"
									onClick={openCreateBook}
									icon={<IcNewBook />}
								>
									{t('New address book')}
								</Button>
							}
						/>
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

			{canCreateContact && (
				<FAB
					className="md-hide lg-hide"
					icon={<IcAdd />}
					aria-label={t('New contact')}
					onClick={openCreateContact}
				/>
			)}

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
						disabled={noBooks || !!booksError}
						onClick={() => {
							setToolbarMenu(null)
							setAddFromNetworkOpen(true)
						}}
					/>
					<MenuItem
						icon={<IcImport />}
						label={t('Import VCF…')}
						disabled={noBooks || !!booksError}
						onClick={() => {
							setToolbarMenu(null)
							setImportOpen(true)
						}}
					/>
					<MenuDivider />
					<MenuItem
						icon={<IcNewBook />}
						label={t('New address book')}
						disabled={!!booksError}
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
