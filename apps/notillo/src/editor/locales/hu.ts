// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: MPL-2.0

import type { Dictionary } from '@blocknote/core'

/** The `index` slash item is Notillo's own, so BlockNote's `Dictionary` has no entry for it. */
export const huIndexAliases = ['lista', 'aloldal']

/**
 * BlockNote ships no Hungarian. The slash menu matches a query against `title` and
 * `aliases` as typed, so aliases keep the English words and add Hungarian ones without
 * accents; the accented form is already in the title.
 */
export const hu: Dictionary = {
	slash_menu: {
		heading: {
			title: 'Címsor 1',
			subtext: 'Legfelső szintű címsor',
			aliases: ['h', 'heading1', 'h1', 'cimsor'],
			group: 'Címsorok'
		},
		heading_2: {
			title: 'Címsor 2',
			subtext: 'Fő szakaszcím',
			aliases: ['h2', 'heading2', 'subheading', 'cimsor', 'alcim'],
			group: 'Címsorok'
		},
		heading_3: {
			title: 'Címsor 3',
			subtext: 'Alszakasz- és csoportcím',
			aliases: ['h3', 'heading3', 'subheading', 'cimsor', 'alcim'],
			group: 'Címsorok'
		},
		heading_4: {
			title: 'Címsor 4',
			subtext: 'Kisebb alszakaszcím',
			aliases: ['h4', 'heading4', 'subheading4', 'cimsor', 'alcim'],
			group: 'Alcímek'
		},
		heading_5: {
			title: 'Címsor 5',
			subtext: 'Kis alszakaszcím',
			aliases: ['h5', 'heading5', 'subheading5', 'cimsor', 'alcim'],
			group: 'Alcímek'
		},
		heading_6: {
			title: 'Címsor 6',
			subtext: 'Legalsó szintű címsor',
			aliases: ['h6', 'heading6', 'subheading6', 'cimsor', 'alcim'],
			group: 'Alcímek'
		},
		toggle_heading: {
			title: 'Összecsukható címsor 1',
			subtext: 'Összecsukható, legfelső szintű címsor',
			aliases: ['h', 'heading1', 'h1', 'collapsable', 'cimsor', 'osszecsukhato'],
			group: 'Alcímek'
		},
		toggle_heading_2: {
			title: 'Összecsukható címsor 2',
			subtext: 'Összecsukható fő szakaszcím',
			aliases: ['h2', 'heading2', 'subheading', 'collapsable', 'cimsor', 'osszecsukhato'],
			group: 'Alcímek'
		},
		toggle_heading_3: {
			title: 'Összecsukható címsor 3',
			subtext: 'Összecsukható alszakasz- és csoportcím',
			aliases: ['h3', 'heading3', 'subheading', 'collapsable', 'cimsor', 'osszecsukhato'],
			group: 'Alcímek'
		},
		quote: {
			title: 'Idézet',
			subtext: 'Idézet vagy szövegrészlet',
			aliases: ['quotation', 'blockquote', 'bq', 'idezet'],
			group: 'Alapblokkok'
		},
		toggle_list: {
			title: 'Összecsukható lista',
			subtext: 'Lista elrejthető alelemekkel',
			aliases: [
				'li',
				'list',
				'toggleList',
				'toggle list',
				'collapsable list',
				'lista',
				'osszecsukhato'
			],
			group: 'Alapblokkok'
		},
		numbered_list: {
			title: 'Számozott lista',
			subtext: 'Lista sorszámozott elemekkel',
			aliases: ['ol', 'li', 'list', 'numberedlist', 'numbered list', 'lista', 'szamozott'],
			group: 'Alapblokkok'
		},
		bullet_list: {
			title: 'Felsorolás',
			subtext: 'Lista számozatlan elemekkel',
			aliases: ['ul', 'li', 'list', 'bulletlist', 'bullet list', 'lista', 'felsorolas'],
			group: 'Alapblokkok'
		},
		check_list: {
			title: 'Jelölőnégyzetes lista',
			subtext: 'Lista jelölőnégyzetekkel',
			aliases: [
				'ul',
				'li',
				'list',
				'checklist',
				'check list',
				'checked list',
				'checkbox',
				'lista',
				'jelolo',
				'teendo',
				'feladat'
			],
			group: 'Alapblokkok'
		},
		paragraph: {
			title: 'Bekezdés',
			subtext: 'A dokumentum törzsszövege',
			aliases: ['p', 'paragraph', 'bekezdes', 'szoveg'],
			group: 'Alapblokkok'
		},
		code_block: {
			title: 'Kódblokk',
			subtext: 'Kódblokk szintaxiskiemeléssel',
			aliases: ['code', 'pre', 'kod'],
			group: 'Alapblokkok'
		},
		page_break: {
			title: 'Oldaltörés',
			subtext: 'Oldalelválasztó',
			aliases: ['page', 'break', 'separator', 'oldal', 'tores'],
			group: 'Alapblokkok'
		},
		table: {
			title: 'Táblázat',
			subtext: 'Táblázat szerkeszthető cellákkal',
			aliases: ['table', 'tablazat'],
			group: 'Speciális'
		},
		image: {
			title: 'Kép',
			subtext: 'Átméretezhető kép felirattal',
			aliases: [
				'image',
				'imageUpload',
				'upload',
				'img',
				'picture',
				'media',
				'url',
				'kep',
				'foto'
			],
			group: 'Média'
		},
		video: {
			title: 'Videó',
			subtext: 'Átméretezhető videó felirattal',
			aliases: ['video', 'videoUpload', 'upload', 'mp4', 'film', 'media', 'url'],
			group: 'Média'
		},
		audio: {
			title: 'Hang',
			subtext: 'Beágyazott hang felirattal',
			aliases: ['audio', 'audioUpload', 'upload', 'mp3', 'sound', 'media', 'url', 'zene'],
			group: 'Média'
		},
		file: {
			title: 'Fájl',
			subtext: 'Beágyazott fájl',
			aliases: ['file', 'upload', 'embed', 'media', 'url', 'fajl', 'feltoltes'],
			group: 'Média'
		},
		emoji: {
			title: 'Emoji',
			subtext: 'Emoji keresése és beszúrása',
			aliases: ['emoji', 'emote', 'emotion', 'face', 'hangulatjel'],
			group: 'Egyéb'
		},
		divider: {
			title: 'Elválasztó',
			subtext: 'Blokkok vizuális elválasztása',
			aliases: ['divider', 'hr', 'line', 'horizontal rule', 'elvalaszto', 'vonal'],
			group: 'Alapblokkok'
		}
	},
	placeholders: {
		// Same wording as the `emptyDocument` text `NotilloEditor` passes, so the
		// placeholder does not change when an empty page takes focus.
		default: 'Írj szöveget, vagy gépelj „/” jelet a parancsokhoz',
		heading: 'Címsor',
		toggleListItem: 'Összecsukható',
		bulletListItem: 'Lista',
		numberedListItem: 'Lista',
		checkListItem: 'Lista',
		emptyDocument: undefined,
		new_comment: 'Írj hozzászólást…',
		edit_comment: 'Hozzászólás szerkesztése…',
		comment_reply: 'Hozzászólás írása…'
	},
	file_blocks: {
		add_button_text: {
			image: 'Kép hozzáadása',
			video: 'Videó hozzáadása',
			audio: 'Hang hozzáadása',
			file: 'Fájl hozzáadása'
		}
	},
	toggle_blocks: {
		add_block_button: 'Üres összecsukható blokk. Kattints egy blokk hozzáadásához.',
		toggle_button: 'Kibontás vagy összecsukás'
	},
	code_block: {
		add_source_button_text: 'Forráskód hozzáadása',
		ok_button_text: 'OK'
	},
	side_menu: {
		add_block_label: 'Blokk hozzáadása',
		drag_handle_label: 'Blokkmenü megnyitása'
	},
	drag_handle: {
		delete_menuitem: 'Törlés',
		colors_menuitem: 'Színek',
		header_row_menuitem: 'Fejlécsor',
		header_column_menuitem: 'Fejlécoszlop'
	},
	table_handle: {
		delete_column_menuitem: 'Oszlop törlése',
		delete_row_menuitem: 'Sor törlése',
		add_left_menuitem: 'Oszlop beszúrása balra',
		add_right_menuitem: 'Oszlop beszúrása jobbra',
		add_above_menuitem: 'Sor beszúrása fölé',
		add_below_menuitem: 'Sor beszúrása alá',
		split_cell_menuitem: 'Cella felosztása',
		merge_cells_menuitem: 'Cellák egyesítése',
		background_color_menuitem: 'Háttérszín'
	},
	suggestion_menu: {
		no_items_title: 'Nincs találat'
	},
	color_picker: {
		text_title: 'Szöveg',
		background_title: 'Háttér',
		colors: {
			default: 'Automatikus',
			gray: 'Szürke',
			brown: 'Barna',
			red: 'Piros',
			orange: 'Narancs',
			yellow: 'Sárga',
			green: 'Zöld',
			blue: 'Kék',
			purple: 'Lila',
			pink: 'Rózsaszín'
		}
	},
	formatting_toolbar: {
		bold: {
			tooltip: 'Félkövér',
			secondary_tooltip: 'Mod+B'
		},
		italic: {
			tooltip: 'Dőlt',
			secondary_tooltip: 'Mod+I'
		},
		underline: {
			tooltip: 'Aláhúzott',
			secondary_tooltip: 'Mod+U'
		},
		strike: {
			tooltip: 'Áthúzott',
			secondary_tooltip: 'Mod+Shift+S'
		},
		code: {
			tooltip: 'Kód',
			secondary_tooltip: ''
		},
		colors: {
			tooltip: 'Színek'
		},
		link: {
			tooltip: 'Hivatkozás létrehozása',
			secondary_tooltip: 'Mod+K'
		},
		file_caption: {
			tooltip: 'Felirat szerkesztése',
			input_placeholder: 'Felirat szerkesztése'
		},
		file_replace: {
			tooltip: {
				image: 'Kép cseréje',
				video: 'Videó cseréje',
				audio: 'Hang cseréje',
				file: 'Fájl cseréje'
			}
		},
		file_rename: {
			tooltip: {
				image: 'Kép átnevezése',
				video: 'Videó átnevezése',
				audio: 'Hang átnevezése',
				file: 'Fájl átnevezése'
			},
			input_placeholder: {
				image: 'Kép átnevezése',
				video: 'Videó átnevezése',
				audio: 'Hang átnevezése',
				file: 'Fájl átnevezése'
			}
		},
		file_download: {
			tooltip: {
				image: 'Kép letöltése',
				video: 'Videó letöltése',
				audio: 'Hang letöltése',
				file: 'Fájl letöltése'
			}
		},
		file_delete: {
			tooltip: {
				image: 'Kép törlése',
				video: 'Videó törlése',
				audio: 'Hang törlése',
				file: 'Fájl törlése'
			}
		},
		file_preview_toggle: {
			tooltip: 'Előnézet be- és kikapcsolása'
		},
		nest: {
			tooltip: 'Blokk behúzása',
			secondary_tooltip: 'Tab'
		},
		unnest: {
			tooltip: 'Behúzás csökkentése',
			secondary_tooltip: 'Shift+Tab'
		},
		align_left: {
			tooltip: 'Balra igazítás'
		},
		align_center: {
			tooltip: 'Középre igazítás'
		},
		align_right: {
			tooltip: 'Jobbra igazítás'
		},
		align_justify: {
			tooltip: 'Sorkizárás'
		},
		table_cell_merge: {
			tooltip: 'Cellák egyesítése'
		},
		comment: {
			tooltip: 'Hozzászólás hozzáadása'
		}
	},
	file_panel: {
		upload: {
			title: 'Feltöltés',
			file_placeholder: {
				image: 'Kép feltöltése',
				video: 'Videó feltöltése',
				audio: 'Hang feltöltése',
				file: 'Fájl feltöltése'
			},
			upload_error: 'Hiba: a feltöltés sikertelen'
		},
		embed: {
			title: 'Beágyazás',
			embed_button: {
				image: 'Kép beágyazása',
				video: 'Videó beágyazása',
				audio: 'Hang beágyazása',
				file: 'Fájl beágyazása'
			},
			url_placeholder: 'Add meg az URL-t'
		}
	},
	link_toolbar: {
		delete: {
			tooltip: 'Hivatkozás eltávolítása'
		},
		edit: {
			text: 'Hivatkozás szerkesztése',
			tooltip: 'Szerkesztés'
		},
		open: {
			tooltip: 'Megnyitás új lapon'
		},
		form: {
			title_placeholder: 'Cím szerkesztése',
			url_placeholder: 'URL szerkesztése'
		}
	},
	comments: {
		edited: 'szerkesztve',
		save_button_text: 'Mentés',
		cancel_button_text: 'Mégse',
		deleted_reference_text: 'Az eredeti tartalom törölve',
		discard_pending_comment: 'Biztosan elveted ezt a hozzászólást?',
		actions: {
			add_reaction: 'Reakció hozzáadása',
			resolve: 'Megoldva',
			reopen: 'Újranyitás',
			edit_comment: 'Hozzászólás szerkesztése',
			delete_comment: 'Hozzászólás törlése',
			more_actions: 'További műveletek'
		},
		reactions: {
			reacted_by: 'Reagáltak'
		},
		sidebar: {
			marked_as_resolved: 'Megoldottként jelölve',
			more_replies: (count: number) => `További ${count} válasz`
		}
	},
	suggestion_changes: {
		formatting_change: 'Formázási változás',
		deleted: 'Törölve',
		inserted: 'Beszúrva',
		inserted_by: (users: string) => `Beszúrta: ${users}`,
		deleted_by: (users: string) => `Törölte: ${users}`,
		changed: 'Módosítva',
		changed_by: (users: string) => `Módosította: ${users}`,
		formatting_change_by: (formats: string, users: string) =>
			`Formázási változás (${formats}), módosította: ${users}`
	},
	versioning: {
		start_of_document: 'A dokumentum eleje',
		compare_since_beginning_menuitem: 'Összehasonlítás a kezdettől',
		title: 'Előzmények',
		close: 'Bezárás',
		show_named_only: 'Csak az elnevezett verziók',
		show_all: 'Minden verzió',
		comparison_on: 'Összehasonlítás bekapcsolása',
		comparison_off: 'Összehasonlítás kikapcsolása',
		versions_list: 'Verziók',
		empty: 'Még nincs verzió',
		empty_named_only: 'Nincs elnevezett verzió',
		current_version: 'Jelenlegi verzió',
		before_restore: 'Visszaállítás előtt',
		comparing_to: 'Összehasonlítás ezzel:',
		restored_from: (date: string) => `Visszaállítva innen: ${date}`,
		more_actions: 'További műveletek',
		version_name_input: 'Verzió neve',
		name_version_menuitem: 'Verzió elnevezése',
		rename_menuitem: 'Átnevezés',
		compare_with_menuitem: 'Összehasonlítás ezzel a verzióval',
		restore_menuitem: 'Visszaállítás',
		delete_menuitem: 'Törlés',
		action_failed: 'Valami hiba történt. Próbáld újra.',
		history_load_failed: 'Nem sikerült betölteni a verzióelőzményeket'
	},
	exporter: {
		open_file: 'Fájl megnyitása',
		open_video_file: 'Videó megnyitása',
		open_audio_file: 'Hang megnyitása'
	},
	generic: {
		loading: 'Betöltés…',
		load_more: 'Továbbiak betöltése',
		ctrl_shortcut: 'Ctrl',
		form_submit: 'OK'
	}
}

// vim: ts=4
