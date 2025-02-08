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

import * as T from '@symbion/runtype'
import { Action, ActionView, ListActionsOptions, UpdateActionDataOptions, CreateOutboundActionOptions, Auth } from '@cloudillo/server/types/meta-adapter'

import { db, ql, cleanRes } from './db.js'
import { getIdentityTag } from './profile.js'

async function getAttachment(tnId: number, attachment: string) {
	const fileId = attachment.split(':')[1].split(',')[0] // FIXME
	const rows = await db.all<{ fileId: string, x: string, variant: 'tn' | 'sd' | 'hd', variantId?: string }>(`SELECT f.fileId, f.x, fv.variant, fv.variantId
		FROM files f
		LEFT JOIN file_variants fv ON f.tnId=fv.tnId AND f.fileId=fv.fileId AND variant IN ('tn', 'sd', 'hd')
		WHERE f.tnId=$tnId AND f.fileId=$fileId
	`, { $tnId: tnId, $fileId: fileId })
	const x: { dim?: [number, number] } | undefined = JSON.parse(rows?.[0]?.x || '{}')

	if (!rows?.length) return undefined

	const ret: { fileId: string, dim: [number, number], tn?: string, sd?: string, hd?: string } =
		{ fileId: rows?.[0]?.fileId, dim: x?.dim || [100, 100] }
	for (const row of rows) {
		if (row.variant) ret[row.variant] = row.variantId
	}
	//console.log('getAttachment', fileId, rows, ret)
	return ret
}

async function getAttachments(tnId: number, attachments: string[]): Promise<ActionView['attachments']> {
	return (await Promise.all(attachments.map(a => getAttachment(tnId, a)))).filter(a => a) as ActionView['attachments']
}

export async function listActions(tnId: number, auth: Auth | undefined, opts: ListActionsOptions): Promise<ActionView[]> {
	const q = `SELECT a.type, a.subType, a.actionId, a.parentId, a.rootId, a.idTag as issuerTag,
		pi.name as issuerName, pi.profilePic as issuerProfilePic,
		a.audience as audienceTag, pa.name as audienceName, pa.profilePic as audienceProfilePic,
		a.subject, a.content, a.createdAt, a.expiresAt,
		ownReact.content as ownReaction,
		a.attachments, a.comments, a.reactions
		FROM actions a
		LEFT JOIN profiles pi ON pi.tnId=a.tnId AND pi.idTag=a.idTag
		LEFT JOIN profiles pa ON pa.tnId=a.tnId AND pa.idTag=a.audience
		LEFT JOIN actions ownReact ON ownReact.tnId=a.tnId AND ownReact.parentId=a.actionId AND ownReact.type='REACT' AND coalesce(ownReact.status, 'A') NOT IN ('D')
		WHERE a.tnId = $tnId
		AND coalesce(a.status, 'A')
			${opts.statuses ? ' IN (' + opts.statuses.map(s => ql(s)).join(',') + ')' : " NOT IN ('D')"}`
		+ (opts.types ? ` AND a.type IN (${opts.types.map(tp => ql(tp)).join(',')})` : '')
		+ (opts.audience ? ` AND (a.audience = ${ql(opts.audience)} OR (a.audience IS NULL AND a.idTag = ${ql(opts.audience)}))` : '')
		+ (opts.involved ? ` AND (a.audience = ${ql(opts.involved)} OR (a.idTag = ${ql(opts.involved)}))` : '')
		+ (opts.actionId ? ` AND a.actionId=${ql(opts.actionId)}` : '')
		+ (!opts.parentId && !opts.rootId ? " AND a.parentId IS NULL" : '')
		+ (opts.parentId ? ` AND a.parentId=${ql(opts.parentId)}` : '')
		+ (opts.rootId ? ` AND a.rootId=${ql(opts.rootId)}` : '')
		//+ (tag !== undefined ? " AND ','||tags||',' LIKE $tagLike" : '')
		+ " ORDER BY a.createdAt DESC LIMIT 100"
	//console.log('listActions', q)
	const rows = await db.all<{
		type: string
		subType: string
		actionId: string
		parentId: string
		rootId: string
		issuerTag: string
		issuerName: string
		issuerProfilePic?: string
		audienceTag?: string
		audienceName?: string
		audienceProfilePic?: string
		subject?: string
		content: string
		createdAt: number
		expiresAt?: number
		attachments?: string
		comments?: number
		reactions?: number
		ownReaction?: string
	}>(q, {
			$tnId: tnId
	})
	cleanRes(rows)
	//console.log('ROWS', rows)
	return Promise.all(rows.map(async r => ({
		type: r.type,
		subType: r.subType,
		actionId: r.actionId,
		parentId: r.parentId,
		rootId: r.rootId,
		issuer: {
			idTag: r.issuerTag,
			name: r.issuerName || undefined,
			profilePic: r.issuerProfilePic || undefined
		},
		audience: !r.audienceTag ? undefined : {
			idTag: r.audienceTag,
			name: r.audienceName || undefined,
			profilePic: r.audienceProfilePic || undefined
		},
		subject: r.subject,
		createdAt: new Date(r.createdAt * 1000).toISOString(),
		expiresAt: r.expiresAt ? new Date(r.expiresAt * 1000).toISOString() : undefined,
		content: r.content ? JSON.parse(r.content) : undefined,
		attachments: r.attachments ? await getAttachments(tnId, JSON.parse(r.attachments)) : undefined,
		stat: {
			ownReaction: r.ownReaction ? JSON.parse(r.ownReaction) : r.ownReaction,
			comments: r.comments,
			reactions: r.reactions,
		}
	})))
}

export async function getActionRootId(tnId: number, actionId: string) {
	const res = await db.get<{ rootId: string }>(
			"SELECT coalesce(rootId, actionId) as rootId FROM actions "
			+ "WHERE tnId = $tnId AND actionId = $actionId",
			{ $tnId: tnId, $actionId: actionId }
		)
	return res?.rootId
}

export async function getActionData(tnId: number, actionId: string) {
	const res = await db.get<{ subject?: string, reactions?: number, comments?: number }>(
			"SELECT subject, reactions, comments FROM actions WHERE tnId = $tnId AND actionId = $actionId",
			{ $tnId: tnId, $actionId: actionId }
		)
	return {
		subject: res?.subject || undefined,
		reactions: res?.reactions || undefined,
		comments: res?.comments || undefined,
	}
}

export async function getActionByKey(tnId: number, actionKey: string) {
	const res = await db.get<{ type: string, issuerTag: string, createdAt: number, subType?: string }>(
			"SELECT type, idTag as issuerTag, createdAt, subType FROM actions WHERE tnId = $tnId AND key=$actionKey AND coalesce(status, '')!='D'",
			{ $tnId: tnId, $actionKey: actionKey }
		)
	console.log('getActionByKey', tnId, actionKey, res)
	return !res ? undefined : {
		type: res.type,
		issuerTag: res?.issuerTag,
		createdAt: res?.createdAt,
		subType: res?.subType || undefined,
	}
}

export async function getActionToken(tnId: number, actionId: string) {
	const res = await db.get<{ token: string }>(
			"SELECT token FROM action_inbox WHERE tnId = $tnId AND actionId = $actionId",
			{ $tnId: tnId, $actionId: actionId }
		)
	console.log('getActionToken', tnId, actionId, res?.token)
	return res?.token
}

export async function createAction(tnId: number, actionId: string, action: Action, key?: string) {
	console.log('createAction', tnId, actionId, JSON.stringify(action), key)
	await db.run("INSERT OR IGNORE INTO actions (tnId, actionId, key, type, subType, parentId, rootId, idTag, audience, subject, content, createdAt, expiresAt, attachments) "
		+ "VALUES ($tnId, $actionId, $key, $type, $subType, $parentId, $rootId, $idTag, $audienceTag, $subject, $content, $createdAt, $expiresAt, $attachments)",
		{
			$tnId: tnId,
			$actionId: actionId,
			$key: key,
			$type: action.type,
			$subType: action.subType,
			$parentId: action.parentId,
			$rootId: action.rootId,
			$idTag: action.issuerTag,
			$audienceTag: action.audienceTag,
			$subject: action.subject,
			$content: action.content ? JSON.stringify(action.content) : undefined,
			$createdAt: action.createdAt,
			$expiresAt: action.expiresAt,
			$attachments: action.attachments ? JSON.stringify(action.attachments) : undefined
		}
	)

	let addReactions = action.content ? 1 : 0
	if (key !== undefined) {
		const res = await db.get<{ content?: string }>("UPDATE actions SET status='D' WHERE tnId = $tnId AND key = $key AND actionId != $actionId AND coalesce(status, '')!='D' RETURNING content", {
			$tnId: tnId,
			$key: key,
			$actionId: actionId
		})
		console.log('UPDATE', res)
		if (res?.content) addReactions -= 1
	}

	console.log('ACTION', tnId, action.type, addReactions, action.parentId, action.content)
	if (action.parentId) {
		if (action.type == 'CMNT') {
			await db.run('UPDATE actions SET comments=coalesce(comments, 0) + 1 WHERE tnId = $tnId '
			+ 'AND actionId IN ($parentId, $rootId)', {
				$tnId: tnId,
				$parentId: action.parentId,
				$rootId: action.rootId
			})
		} else if (action.type == 'REACT' && addReactions) {
			await db.run('UPDATE actions SET reactions=coalesce(reactions, 0) + $addReactions WHERE tnId = $tnId '
			+ 'AND actionId IN ($parentId, $rootId)', {
				$tnId: tnId,
				$parentId: action.parentId,
				$rootId: action.rootId,
				$addReactions: addReactions
			})
		}
	}
}

export async function updateActionData(tnId: number, actionId: string, opts: UpdateActionDataOptions) {
	const updList: string[] = []
	if (opts.reactions !== undefined) updList.push(`reactions=${ql(opts.reactions)}`)
	if (opts.comments !== undefined) updList.push(`comments=${ql(opts.comments)}`)
	if (opts.status !== undefined) updList.push(`status=${ql(opts.status)}`)

	if (updList.length > 0) {
		const res = await db.run(`UPDATE actions SET ${updList.join(', ')} WHERE tnId = $tnId AND actionId = $actionId
		`, {
			$tnId: tnId,
			$actionId: actionId
		})
		console.log('updateInboundAction', updList, res, tnId, actionId)
	}
}

/* Inbound actions */
export async function createInboundAction(tnId: number, actionId: string, token: string, ackToken?: string) {
	console.log('inbound action', actionId)
	await db.run('INSERT OR IGNORE INTO action_inbox (actionId, tnId, token, ack, status) '
		+ 'VALUES ($actionId, $tnId, $token, $ack, $status)', {
		$actionId: actionId,
		$tnId: tnId,
		$token: token,
		$ack: ackToken,
		$status: ackToken ? 'P' : null
	})
}

export async function processPendingInboundActions(callback: (tnId: number, actionId: string, token: string) => Promise<boolean>) {
	let processed = 0

	const actions = await db.all<{ actionId: string, tnId: number, token: string }>(
		`SELECT a.actionId, a.tnId, a.token FROM action_inbox a
			WHERE a.status ISNULL LIMIT 100`,)
	for (const action of actions) {
		console.log('INBOUND ACTION', action.tnId, action.actionId, action.token)
		try {
			const val = await callback(action.tnId, action.actionId, action.token)
			if (val) {
				await db.run("UPDATE action_inbox SET status='A' WHERE actionId = $actionId", {
					$actionId: action.actionId
				})
				processed++
			}
		} catch (err) {
			console.log('ERROR', err)
			await db.run("UPDATE action_inbox SET status='D' WHERE actionId = $actionId AND status ISNULL",
				{ $actionId: action.actionId })
		}
	}
	return processed
}

export async function updateInboundAction(tnId: number, actionId: string, opts: { status?: string | null }) {
	const res = await db.run('UPDATE action_inbox SET status = $status WHERE tnId = $tnId AND actionId = $actionId', {
		$tnId: tnId,
		$actionId: actionId,
		$status: opts.status
	})
	console.log('updateInboundAction', res, tnId, actionId)
}

// Outbound actions
export async function createOutboundAction(tnId: number, actionId: string, token: string, opts: CreateOutboundActionOptions) {
	const issuerTag = await getIdentityTag(tnId)
	let count = 0

	if (opts.followTag) {
		const res = await db.run(`INSERT OR IGNORE INTO action_outbox_queue (actionId, tnId, idTag, next)
			SELECT $actionId, $tnId, idTag, unixepoch() FROM actions
			WHERE tnId = $tnId AND type='FLLW' AND idTag != $idTag AND coalesce(status, '') NOT IN ('D')`, {
			$actionId: actionId,
			$tnId: tnId,
			$idTag: issuerTag
		})
		console.log('createOutboundAction followTag', res)
		count += res.changes
	}
	if (opts.audienceTag) {
		const res = await db.run(`INSERT OR IGNORE INTO action_outbox_queue (actionId, tnId, idTag, next)
			SELECT $actionId, $tnId, $audienceTag, unixepoch()`, {
			$actionId: actionId,
			$tnId: tnId,
			$audienceTag: opts.audienceTag
		})
		console.log('createOutboundAction audienceTag', res)
		count += res.changes
	}
	if (count) {
		await db.run('INSERT OR IGNORE INTO action_outbox (actionId, tnId, token, next) '
			+ 'VALUES ($actionId, $tnId, $token, unixepoch())', {
			$actionId: actionId,
			$tnId: tnId,
			$token: token
		})
	}
}

export async function processPendingOutboundActions(callback: (tnId: number, actionId: string, type: string, token: string, recipientTag: string) => Promise<boolean>) {
	let processed = 0

	const actions = await db.all<{ actionId: string, tnId: number, type: string, token: string, next?: Date }>(`
		SELECT ao.actionId, ao.tnId, a.type, ao.token, ao.next FROM action_outbox ao
		JOIN actions a ON a.tnId = ao.tnId AND a.actionId = ao.actionId
		WHERE ao.next <= unixepoch()
		ORDER BY ao.next, ao.actionId LIMIT 100`)
	for (const action of actions) {
		const destinations = await db.all<{ idTag: string }>(
			'SELECT idTag FROM action_outbox_queue '
			+ 'WHERE tnId = $tnId AND actionId = $actionId',
			{ $tnId: action.tnId, $actionId: action.actionId }
		)
		for (const dst of destinations) {
			try {
				const val = await callback(action.tnId, action.actionId, action.type, action.token, dst.idTag)

				if (val) {
					await db.run('UPDATE action_outbox SET next = NULL WHERE actionId = $actionId', {
						$actionId: action.actionId
					})
					processed++
				} else {
					await db.run('UPDATE action_outbox SET next = next + 30 WHERE actionId = $actionId', { $actionId: action.actionId, })
				}
			} catch (err) {
				console.log('ERROR', err)
				await db.run('UPDATE action_outbox SET next = next + 30 WHERE actionId = $actionId', { $actionId: action.actionId, })
			}
		}
	}
	return processed
}

// vim: ts=4
