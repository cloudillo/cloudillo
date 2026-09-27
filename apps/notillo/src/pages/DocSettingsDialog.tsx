// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * The document's own settings, as opposed to a page's.
 *
 * There is exactly one thing here that matters: whether this document is a website.
 * Everything the site builder adds to Notillo — a home page, addresses, drafts, page
 * types, the publish action — hangs off that one toggle, so a document nobody
 * intends to publish looks and behaves exactly as it always did.
 *
 * Mounting is *not* offered. The mounts endpoint is leader-only and the shell's site
 * handler only reads, so Notillo cannot put a document on the site itself; a button
 * here would be a button that fails. The status line points at the place that can.
 */

import { Button, Modal, Toggle } from '@cloudillo/react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { LuX as IcClose, LuHouse as IcHome } from 'react-icons/lu'

export interface DocSettingsDialogProps {
	open: boolean
	/** The resolved flag: the stored one, or whether the document is mounted. */
	siteMode: boolean
	onSiteModeChange: (siteMode: boolean) => void
	/**
	 * Whether the site serves this document at all. `undefined` while the lookup is
	 * in flight or after it failed, in which case the status line says nothing rather
	 * than guessing — a failed read must not tell the author their document is not
	 * on the site.
	 */
	siteMounted?: boolean
	/** Where the site serves it, when it does. */
	mountPath?: string
	/** Title of the home page, or nothing when the document names none. */
	homeTitle?: string
	/** Close this dialog and open the sidebar's home picker. */
	onChooseHome: () => void
	readOnly: boolean
	onClose: () => void
}

export function DocSettingsDialog({
	open,
	siteMode,
	onSiteModeChange,
	siteMounted,
	mountPath,
	homeTitle,
	onChooseHome,
	readOnly,
	onClose
}: DocSettingsDialogProps) {
	const { t } = useTranslation()

	if (!open) return null

	return (
		<Modal open onClose={onClose} className="p-0">
			<div
				className="c-dialog c-panel h-max-100 emph p-4 c-vbox g-3"
				style={{ maxWidth: '30rem', width: '90vw' }}
			>
				<div className="c-hbox align-items-center g-2">
					<h2 className="fill m-0">{t('Document settings')}</h2>
					<Button
						variant="link"
						size="sm"
						title={t('Close')}
						onClick={onClose}
						icon={<IcClose />}
						aria-label={t('Close')}
					/>
				</div>

				<div className="c-vbox g-4 overflow-y-auto">
					<section className="c-vbox g-2">
						<Toggle
							checked={siteMode}
							disabled={readOnly}
							label={t('Publish as a website')}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								onSiteModeChange(e.target.checked)
							}
						/>
						<div className="c-hint">
							{t('Adds a home page, addresses, drafts and page types.')}
						</div>
					</section>

					{siteMode && (
						<section className="c-vbox g-2">
							<div className="c-hint">
								{siteMounted === true
									? t('Served at {{path}}', { path: mountPath ?? '/' })
									: siteMounted === false
										? t(
												'Not yet part of your site. Add it in Settings › Site to publish.'
											)
										: t('Checking where the site serves this document…')}
							</div>
							<div className="c-hbox align-items-center g-2">
								<IcHome />
								<span className="fill">{homeTitle ?? t('No home page yet.')}</span>
								{!readOnly && (
									<Button size="sm" onClick={onChooseHome}>
										{homeTitle ? t('Change') : t('Choose a home page')}
									</Button>
								)}
							</div>
						</section>
					)}
				</div>

				<div className="c-hbox justify-content-end g-2">
					<Button onClick={onClose}>{t('Close')}</Button>
				</div>
			</div>
		</Modal>
	)
}

// vim: ts=4
