// SPDX-FileCopyrightText: Szilárd Hajba
// SPDX-License-Identifier: LGPL-3.0-or-later

// Solid glyphs from the icon atlas, on a 48 box.
// Static markup only: AppIcon feeds these to an <svg> via dangerouslySetInnerHTML, never user input.

export type AppId =
	| 'quillo'
	| 'prezillo'
	| 'calcillo'
	| 'taskillo'
	| 'formillo'
	| 'notillo'
	| 'ideallo'
	| 'scanillo'
	| 'mapillo'
	| 'files'
	| 'feed'
	| 'messages'
	| 'gallery'
	| 'calendar'
	| 'contacts'

export type FileTypeId = 'image' | 'video' | 'pdf' | 'folder' | 'generic'

export type GlyphId = AppId | FileTypeId

export const APP_IDS: readonly AppId[] = [
	'quillo',
	'prezillo',
	'calcillo',
	'taskillo',
	'formillo',
	'notillo',
	'ideallo',
	'scanillo',
	'mapillo',
	'files',
	'feed',
	'messages',
	'gallery',
	'calendar',
	'contacts'
]

/** Palette key (`--p-<key>`) of each glyph's second colour */
export const GLYPH_COLOR2: Record<GlyphId, string> = {
	quillo: 'teal',
	prezillo: 'blue',
	calcillo: 'teal',
	taskillo: 'green',
	formillo: 'pink',
	notillo: 'teal',
	ideallo: 'pink',
	scanillo: 'navy',
	mapillo: 'teal',
	files: 'orange',
	feed: 'violet',
	messages: 'green',
	gallery: 'violet',
	calendar: 'navy',
	contacts: 'teal',
	image: 'navy',
	video: 'navy',
	pdf: 'navy',
	folder: 'navy',
	generic: 'navy'
}

export const GLYPHS: Record<GlyphId, string> = {
	quillo: '<path class="gf" style="stroke:var(--fg);stroke-width:3;stroke-linejoin:round" d="M12 7h16l10 10v24H12z"/><path class="gd" d="M28 7v10h10z"/><path class="gtl" d="M18 24h13M18 30h13M18 36h6"/><circle class="go" cx="29" cy="36" r="3"/>',
	prezillo:
		'<rect class="gf" x="7" y="8" width="34" height="25" rx="3"/><path class="gs" d="M24 33v4M17 42l7-5 7 5"/><rect class="gt" x="14" y="22" width="5" height="6" rx="1"/><rect class="gt" x="21.5" y="17" width="5" height="11" rx="1"/><rect class="go" x="29" y="13" width="5" height="15" rx="1"/>',
	calcillo:
		'<rect class="gf" x="8" y="8" width="32" height="32" rx="5"/><path class="gtl" d="M8 19h32M8 29h32M19 8v32M29 8v32" style="stroke-width:2.5"/><rect class="go" x="31" y="31" width="7" height="7" rx="1.5"/>',
	taskillo:
		'<rect class="gf" x="8" y="7" width="10" height="10" rx="3"/><rect class="gf" x="8" y="19" width="10" height="10" rx="3"/><path class="gtl" d="M10.5 12l2 2 3.5-3.5M10.5 24l2 2 3.5-3.5" style="stroke-width:2.5"/><circle class="go" cx="13" cy="36" r="5"/><rect class="gf" x="23" y="10" width="17" height="4" rx="2"/><rect class="gf" x="23" y="22" width="17" height="4" rx="2"/><rect class="gh" x="23" y="34" width="17" height="4" rx="2"/>',
	formillo:
		'<rect class="gf" x="9" y="9" width="30" height="32" rx="4"/><rect class="gf" x="17" y="5" width="14" height="8" rx="3" style="stroke:var(--tile);stroke-width:2.5"/><circle class="go" cx="17" cy="23" r="3.5"/><circle class="gtl" style="stroke-width:2.5" cx="17" cy="33" r="3"/><path class="gtl" d="M24 23h9M24 33h9"/>',
	notillo:
		'<path class="gf" d="M22 13c-4-3-8-4-14-4v27c6 0 10 1 14 4z"/><path class="gf" d="M26 13c4-3 8-4 14-4v27c-6 0-10 1-14 4z"/><path class="go" d="M31 5h6v13l-3-2.5-3 2.5z"/>',
	ideallo:
		'<rect class="gh" x="7" y="7" width="20" height="20" rx="3"/><path class="gf" d="M21 20a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v12l-9 9h-8a3 3 0 0 1-3-3z"/><path class="gd" d="M32 41v-6a3 3 0 0 1 3-3h6z"/><circle class="go" cx="28" cy="24" r="3.5"/>',
	scanillo:
		'<path class="gs" d="M8 16v-4a4 4 0 0 1 4-4h4M32 8h4a4 4 0 0 1 4 4v4M40 32v4a4 4 0 0 1-4 4h-4M16 40h-4a4 4 0 0 1-4-4v-4"/><rect class="gf" x="16" y="13" width="16" height="22" rx="2"/><rect class="go" x="11" y="22" width="26" height="4" rx="2"/>',
	mapillo:
		'<path class="gf" d="M7 13l11-4v26l-11 4z"/><path class="gh" d="M18 9l12 4v26l-12-4z"/><path class="gf" d="M30 13l11-4v26l-11 4z"/><path class="go" style="stroke:var(--tile);stroke-width:2.5" d="M24 9a7 7 0 0 1 7 7c0 5-7 12-7 12s-7-7-7-12a7 7 0 0 1 7-7z"/><circle class="gf" cx="24" cy="16" r="2.5"/>',
	files: '<path class="gh" d="M7 13a3 3 0 0 1 3-3h9l4 4h15a3 3 0 0 1 3 3v5H7z"/><path class="gf" d="M7 20h34v17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"/><rect class="go" x="28" y="25" width="8" height="4" rx="2"/>',
	feed: '<rect class="gf" x="8" y="6" width="32" height="15" rx="4"/><circle class="go" cx="15.5" cy="13.5" r="3.5"/><rect class="gt" x="22" y="11.5" width="12" height="4" rx="2"/><rect class="gh" x="8" y="25" width="32" height="12" rx="4"/><rect class="gh" x="12" y="40" width="24" height="3" rx="1.5"/>',
	messages:
		'<path class="gh" d="M40 18v14a3 3 0 0 1-3 3v5l-6-5h-8a3 3 0 0 1-3-3V18a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3z"/><path class="gf" d="M8 11a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H17l-6 5v-5a3 3 0 0 1-3-3z"/><circle class="gt" cx="14" cy="16" r="2"/><circle class="gt" cx="20" cy="16" r="2"/><circle class="go" cx="26" cy="16" r="2.4"/>',
	gallery:
		'<rect class="gf" x="7" y="9" width="34" height="30" rx="4"/><path class="gt" d="M7 33l10-10 8 8 5-5 11 11v2a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z"/><circle class="go" cx="31" cy="18" r="4"/>',
	calendar:
		'<rect class="gf" x="8" y="11" width="32" height="29" rx="4"/><path class="gd" d="M8 15a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v5H8z"/><path class="gs" d="M16 6v7M32 6v7"/><rect class="gd" x="13" y="26" width="8" height="8" rx="2"/><rect class="go" x="27" y="26" width="8" height="8" rx="2"/>',
	contacts:
		'<rect class="gf" x="6" y="10" width="36" height="28" rx="4"/><circle class="go" cx="17" cy="20" r="4.5"/><path class="gt" d="M10 33c1-4 4-6 7-6s6 2 7 6z"/><rect class="gt" x="27" y="18" width="10" height="3.5" rx="1.75"/><rect class="gd" x="27" y="25" width="10" height="3.5" rx="1.75"/>',
	image: '<path class="gf" style="stroke:var(--fg);stroke-width:3;stroke-linejoin:round" d="M12 7h16l10 10v24H12z"/><path class="gd" d="M28 7v10h10z"/><path class="gt" style="stroke:var(--tile);stroke-width:2;stroke-linejoin:round" d="M16 37l6-8 5 5 3-3 5 6z"/><circle class="go" cx="20" cy="21" r="3.5"/>',
	video: '<path class="gf" style="stroke:var(--fg);stroke-width:3;stroke-linejoin:round" d="M12 7h16l10 10v24H12z"/><path class="gd" d="M28 7v10h10z"/><path class="go" style="stroke:var(--node);stroke-width:2.5;stroke-linejoin:round" d="M20 22v14l11-7z"/>',
	pdf: '<path class="gf" style="stroke:var(--fg);stroke-width:3;stroke-linejoin:round" d="M12 7h16l10 10v24H12z"/><path class="gd" d="M28 7v10h10z"/><path class="gtl" d="M18 17h6"/><rect class="go" x="7" y="24" width="24" height="11" rx="2.5"/><rect class="gt" x="11" y="28" width="11" height="3" rx="1.5"/>',
	folder: '<path class="gf" d="M7 13a3 3 0 0 1 3-3h9l4 4h15a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z"/><path class="gtl" d="M7 20h34"/><circle class="go" cx="34" cy="31" r="3.5"/>',
	generic:
		'<path class="gf" style="stroke:var(--fg);stroke-width:3;stroke-linejoin:round" d="M12 7h16l10 10v24H12z"/><path class="gd" d="M28 7v10h10z"/><path class="gtl" d="M18 25h10M18 31h6"/><circle class="go" cx="30" cy="34" r="3.5"/>'
}

// vim: ts=4
