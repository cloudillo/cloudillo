// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Button, Popper, useApi, useAuth, useDialog } from '@cloudillo/react'
import type { ActionView } from '@cloudillo/types'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuTrash2 as IcDelete, LuEllipsis as IcMore } from 'react-icons/lu'

export interface PostMenuProps {
	action: ActionView
	onDelete?: () => void
}

export function PostMenu({ action, onDelete }: PostMenuProps) {
	const { t } = useTranslation()
	const [auth] = useAuth()
	const { api } = useApi()
	const dialog = useDialog()

	const isOwn = action.issuer.idTag === auth?.idTag

	async function handleDelete() {
		if (!api) return

		const confirmed = await dialog.confirm(
			t('Delete post'),
			t('Delete this post? This cannot be undone.')
		)
		if (!confirmed) return

		try {
			await api.actions.delete(action.actionId)
			onDelete?.()
		} catch (e) {
			console.error('Failed to delete post', e)
		}
	}

	// Only show menu if there are items to display
	if (!isOwn) return null

	return (
		<Popper menuClassName="c-button link" icon={<IcMore />}>
			<ul className="c-nav vertical emph">
				<li>
					<Button kind="nav-item" onClick={handleDelete}>
						<IcDelete style={{ color: 'var(--col-error)' }} />
						{t('Delete post')}
					</Button>
				</li>
			</ul>
		</Popper>
	)
}

// vim: ts=4
