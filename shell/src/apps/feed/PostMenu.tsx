// This file is part of the Cloudillo Platform.
// Copyright (C) 2024  Szilárd Hajba
//
// Cloudillo is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { LuEllipsis as IcMore, LuTrash2 as IcDelete } from 'react-icons/lu'

import type { ActionView } from '@cloudillo/types'
import { useAuth, useApi, Button, Popper, useDialog } from '@cloudillo/react'

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
		<Popper menuClassName="c-btn link" icon={<IcMore />}>
			<ul className="c-nav vertical emph">
				<li>
					<Button navItem onClick={handleDelete}>
						<IcDelete style={{ color: 'var(--col-error)' }} />
						{t('Delete post')}
					</Button>
				</li>
			</ul>
		</Popper>
	)
}

// vim: ts=4
