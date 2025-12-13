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

/*
const MY_FORM: Form = {
	title: 'My form',
	descr: 'Description of my form',
	fields: [
		{
			name: 'title',
			type: 'text',
			label: 'Title'
		},
		{
			name: 'descr',
			type: 'multiline',
			label: 'Description'
		},
		{
			name: 'choice',
			type: 'singlechoice',
			label: 'Choices',
			options: [{ label: 'Choice A' }, { label: 'Choice B' }, { label: 'Choice C' }]
		},
		{
			name: 'choices',
			type: 'multichoice',
			label: 'Choices',
			options: [{ id: 'a', label: 'Choice A' }, { id: 'b', label: 'Choice B' }, { id: 'c', label: 'Choice C' }]
		}
	]
}
*/

//const CLOUDILLO_FORM: Form = {

const MY_FORM: Form = {
	title: 'Közösségi Media és tartalom megosztó platform használati kérdőív',
	descr: `
		<p>Ez a kérdőív azt próbálja körbejárni, hogy milyen aggodalmak merülnek fel a felhasználókban, amikor hagyományos (multinacionális cégek által üzemeltetett) közösségi média és tartalommegosztó szolgáltatásokat használnak. A véleményed fontos számunkra, hogy megértsük a platformokat körülvevő sokszor ellentmondásos érzéseket.
		</p><p>
		A részvétel önkéntes, a válaszaid bizalmasak maradnak. A megadott információkat kizárólag kutatási célokra használjuk fel. Célunk egy megfelelő alternatíva kidolgozása, mely széles körben kielégíti a felhasználók igényeit.
		</p><p>
		A kérdőív kitöltése körülbelül 10 percet vesz igénybe. Köszönjük, hogy időt szakítasz rá és megosztod velünk gondolataidat.
		</p>
	`,
	thankYou:
		'<p>Köszönjük, hogy kitöltötted a felmérést!</p><p>Szívesen olvasnál a projektünkről? Látogass el a <a href="https://szilu.github.io/cloudillo-architecture/" target="_blank">https://szilu.github.io/cloudillo-architecture/</a> oldalra!</p>',
	buttons: {
		start: 'Kezdjük!',
		previous: 'Előző',
		next: 'Következő',
		submit: 'Beküldés'
	},
	fields: [
		{
			name: 'data_security',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Mennyire bízol az adattároló felhőszolgáltatások (Google Drive/Docs, OneDrive, DropBox, stb.) oldalak biztonsági intézkedéseiben a személyes adataid, tartalmaid védelme terén?',
			options: [
				{ id: 1, label: 'Nagyon bízom' },
				{ id: 2, label: 'Valamennyire bízom' },
				{ id: 3, label: 'Nem bízom túlságosan' },
				{ id: 4, label: 'Egyáltalán nem bízom' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'data_ownership',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Mennyire fontos számodra teljes kontrollal rendelkezni a közösségi média platformokon megosztott személyes adataid, tartalmaid felett?',
			options: [
				{ id: 1, label: 'Nagyon fontos' },
				{ id: 2, label: 'Valamennyire fontos' },
				{ id: 3, label: 'Nem túl fontos' },
				{ id: 4, label: 'Egyáltalán nem fontos' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'usability_vs_privacy',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Milyen mértékben vagy hajlandó lemondani a kényelemről a közösségi média és egyéb tartalom megosztó szolgáltatások használatakor a fokozott adatvédelem és biztonság érdekében?',
			options: [
				{
					id: 1,
					label: 'Minden kényelmetlenséget elviselek, ha az adataim biztonságáról van szó'
				},
				{ id: 2, label: 'Valamennyi kényelmetlenséget elviselek' },
				{ id: 3, label: 'Nem nagyon viselek el kényelmetlenséget' },
				{ id: 4, label: 'Nekem csak a kényelem számít' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'algorithm_bias',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Mennyire aggasztanak a platformok által használt algoritmusok, amelyek azt határozzák meg, hogy milyen tartalmakat, információkat látsz a különböző felületeken?',
			options: [
				{ id: 1, label: 'Nagyon aggasztanak' },
				{ id: 2, label: 'Valamennyire aggasztanak' },
				{ id: 3, label: 'Nem nagyon aggasztanak' },
				{ id: 4, label: 'Egyáltalán nem aggasztanak' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'data_monetization',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Mennyire zavar téged, hogy a hagyományos közösségi média platformok a felhasználói adatokat marketing célokra hasznosítják?',
			options: [
				{ id: 1, label: 'Nagyon zavar' },
				{ id: 2, label: 'Valamennyire zavar' },
				{ id: 3, label: 'Nem túlságosan zavar' },
				{ id: 4, label: 'Egyáltalán nem zavar' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'user_profiling',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Mennyire aggaszt, hogy a közössgi oldalak részletes felhasználói profilt hoznak létre rólad az online tevékenységeid és interakcióid alapján?',
			options: [
				{ id: 1, label: 'Nagyon aggaszt' },
				{ id: 2, label: 'Valamennyire aggaszt' },
				{ id: 3, label: 'Nem túlságosan aggaszt' },
				{ id: 4, label: 'Egyáltalán nem aggaszt' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'censorship',
			type: 'singlechoice',
			category: 'Adatkezelés',
			label: 'Mennyire aggódsz a tartalom szűrés, cenzúra miatt a közösségi média és tartalommegosztó platformokon?',
			options: [
				{ id: 1, label: 'Nagyon aggaszt' },
				{ id: 2, label: 'Valamennyire aggaszt' },
				{ id: 3, label: 'Nem túlságosan aggaszt' },
				{ id: 4, label: 'Egyáltalán nem aggaszt' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'tech_literacy',
			type: 'singlechoice',
			category: 'Technikai aggályok',
			label: 'Mennyire érzed magad képesnek arra, hogy egy saját eszközt üzemeltess (például egy NAS-t) a közösségi média és tartalommegosztó igényeid kiszolgálására, ily módon teljes kontrollt szerezve az adataid felett?',
			options: [
				{ id: 1, label: 'Biztosan megbírkóznék vele' },
				{ id: 2, label: 'Valamennyire képesnek érzem magam' },
				{ id: 3, label: 'Nem túlságosan bízom benne, hogy sikerülne' },
				{ id: 4, label: 'Kizárt, hogy képes lennék rá' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'interoperability',
			type: 'singlechoice',
			category: 'Technikai aggályok',
			label: 'Mennyire fontos számodra, hogy a tartalmaidat (fényképalbumok, dokumentumok, táblázatok, jegyzetek, stb..) kezelő platform zökkenőmentesen együttműködjön különböző szolgáltatók alkalmazásaival és szolgáltatásaival?',
			options: [
				{ id: 1, label: 'Nagyon fontos' },
				{ id: 2, label: 'Valamennyire fontos' },
				{ id: 3, label: 'Nem túl fontos' },
				{ id: 4, label: 'Egyáltalán nem fontos' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},

		{
			name: 'share_friends_family',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi média használatodat, hogy saját tartalmakat osztasz meg barátokkal, családdal?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'share_group',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi média használatodat, hogy saját tartalmakat osztasz meg különböző csoportokkal (klubokkal, osztállyal, stb.)?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'share_public',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi média használatodat, hogy saját tartalmakat publikusan osztasz meg?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'consume_friends_family',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi média használatodat a barátaid és családod által megosztott tartalmak fogyasztása?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'consume_group',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi médis használatodat különböző csoportok (klubok, osztály, stb.) által megosztott tartalmak fogyasztása?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'consume_influencer',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi média használatodat influenszerek által megosztott tartalom fogyasztása?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'consume_public',
			type: 'singlechoice',
			category: 'Közösségi média használat',
			label: 'Mennyire jellemzi a közösségi média használatodat ismeretlen emberek által megosztott felkapott tartalom fogyasztása?',
			options: [
				{ id: 1, label: 'Nagyon jellemző' },
				{ id: 2, label: 'Valamennyire jellemző' },
				{ id: 3, label: 'Elég ritka' },
				{ id: 4, label: 'Egyáltalán nem jellemző' }
			]
		},
		{
			name: 'trust_in_tech',
			type: 'singlechoice',
			category: 'Bizalom',
			label: 'A saját eszközeidben, vagy a felhőszolgáltatásokban bízol jobban, amikor a személyes adataid, tartalmaid védelméről van szó?',
			options: [
				{ id: 1, label: 'A saját eszközeimben jelentősen jobban bízom' },
				{ id: 2, label: 'Inkább a saját eszközeimben bízom' },
				{ id: 3, label: 'Inkább a felhőszolgáltatásokban megbízom' },
				{ id: 4, label: 'A felhőszolgáltatásokban jelentősen jobban bízom' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'trust_friend',
			type: 'singlechoice',
			category: 'Bizalom',
			label: 'Egy barátod, vagy családtagod eszközében jobban megbíznál, mint a felhőszolgáltatásokban, ha a tartalmaidat az ő saját eszközén tárolhatnád?',
			options: [
				{ id: 1, label: 'A barátomban jelentősen jobban bízom' },
				{ id: 2, label: 'Inkább a barátomban bízom' },
				{ id: 3, label: 'Inkább a felhőszolgáltatásokban bízom' },
				{ id: 4, label: 'A felhőszolgáltatásokban jelentősen jobban bízom' },
				{ id: '-', label: 'Nem értem a kérdést' }
			]
		},
		{
			name: 'pay_friend',
			type: 'singlechoice',
			category: 'Költségek',
			label: 'Ha egy barátod vagy családtagod jelentős tárhelyet (100 GB) biztosítana neked, amit a felhőszolgáltatásokhoz hasonlóan használhatsz tartalomkezelésre, megosztásra, akkor hajlandó lennél pénzben hozzájárulni a költségeihez? Amennyiben igen, mennyit lennél hajlandó évente felajánlani?',
			options: [
				{ id: 1, label: 'Miért tenném, ha ingyen használhatom a Google-t?' },
				{ id: 2, label: 'Kevesebbet fizetnék, mint 10 USD' },
				{ id: 3, label: '10-20 USD között fizetnék' },
				{ id: 4, label: '20-30 USD között fizetnék' },
				{ id: 5, label: 'Akár évi 30 USD-nél többet is fizetnék neki' }
			]
		},
		{
			name: 'email',
			type: 'email',
			category: 'Kapcsolat',
			label: 'Érdekel a projektünk, melynek célja egy alternatív platform létrehozása? Amennyiben szívesen közreműködnél benne valamilyen formában, akkor megadhatod az email címedet.',
			descr: '<p>Nem kisebb célt tűztünk ki, mint egy olyan nyílt operációs rendszer fejlesztését, mely a központosított felhőszolgáltatásokkal összemérhető felhasználói élményt nyújt.</p><p>A címet kizárólag kapcsolatfelvételhez használjuk, nem küldünk reklámanyagokat, illetve hírlevelet.</p>',
			optional: true
		},
		{
			name: 'note',
			type: 'multiline',
			category: 'Kapcsolat',
			label: 'Ha úgy érzed, hozzá tudnál járulni a projekt sikeréhez, akkor röviden leírhatod, hogy miben tudnál segíteni nekünk. Illetve visszajelzést is adhatsz a projekttel, kérdőívvel kapcsolatos gondolataidról.',
			optional: true
		}
	]
}

/*
const MY_FORM: Form = {
	title: 'Cloud-based centralized social media and content sharing platforms',
	descr: `
		<p>This survey aims to gather valuable insights into the concerns users may have when engaging with centralized social media and content sharing services hosted on the cloud. Your opinions are essential in helping us comprehend the diverse perspectives surrounding these platforms.
		</p><p>
		Your participation is voluntary, and your responses will remain confidential. The information you provide will be used solely for research purposes to enhance our understanding of user sentiments regarding cloud-based centralized social media and content sharing platforms.
		</p><p>
		The survey will take approximately 10 minutes to complete. Thank you for taking the time to share your thoughts. Let's begin!
		</p>`,
	thankYou: '<p>Thank you for completing the survey!</p>',
	fields: [
		{
			name: 'data_security',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'How confident are you in the security measures of traditional, centralized social media platforms regarding your personal information?',
			options: [{ label: 'Very confident' }, { label: 'Somewhat confident' }, { label: 'Neutral' }, { label: 'Not confident too much' }, { label: 'Not confident at all' }]
		},
		{
			name: 'data_ownership',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'How important is it for you to have complete control and ownership over your personal data shared on social media platforms?',
			options: [{ label: 'Very important' }, { label: 'Somewhat important' }, { label: 'Neutral' }, { label: 'Not too important' }, { label: 'Not important at all' }]
		},
		{
			name: 'usability_vs_privacy',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'To what extent are you willing to sacrifice usability and convenience for enhanced privacy and security in social media and cloud applications?',
			// FIXME
			options: [{ label: 'Very important' }, { label: 'Somewhat important' }, { label: 'Neutral' }, { label: 'Not too important' }, { label: 'Not important at all' }]
		},
		{
			name: 'algorithm_bias',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'To what degree are you uneasy about the algorithms used by these platforms in controlling the content you see and the information presented to you?',
			options: [{ label: 'Very uneasy' }, { label: 'Somewhat uneasy' }, { label: 'Neutral' }, { label: 'Somewhat ununeasy' }, { label: 'Not uneasy at all' }]
		},
		{
			name: 'data_monetization',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'Are you bothered by the way centralized social media platforms monetize user data for advertising purposes?',
			options: [{ label: 'Very bothered' }, { label: 'Somewhat bothered' }, { label: 'Neutral' }, { label: 'Not bothered too much' }, { label: 'Not bothered at all' }]
		},
		{
			name: 'user_profiling',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'How concerned are you about the creation of detailed user profiles by centralized platforms based on your online activities and interactions?',
			options: [{ label: 'Very concerned' }, { label: 'Somewhat concerned' }, { label: 'Neutral' }, { label: 'Not concerned too much' }, { label: 'Not concerned at all' }]
		},
		{
			name: 'censorship',
			type: 'singlechoice',
			category: 'Data handling',
			label: 'How concerned are you about content moderation and censorship on social media and content sharing platforms?',
			options: [{ label: 'Very concerned' }, { label: 'Somewhat concerned' }, { label: 'Neutral' }, { label: 'Not concerned too much' }, { label: 'Not concerned at all' }]
		},

		{
			name: 'tech_literacy',
			type: 'singlechoice',
			category: 'Technical concerns',
			label: 'How comfortable do you feel with the technical aspects of managing your own personal cloud compared to relying on a platform to handle it for you?',
			options: [{ label: 'Very comfortable' }, { label: 'Somewhat comfortable' }, { label: 'Neutral' }, { label: 'Somewhat uncomfortable' }, { label: 'Not comfortable at all' }]
		},
		{
			name: 'interoperability',
			type: 'singlechoice',
			category: 'Technical concerns',
			label: 'How important is it for you that your personal cloud and social media accounts can seamlessly interact with applications and services from different providers?',
			options: [{ label: 'Very important' }, { label: 'Somewhat important' }, { label: 'Neutral' }, { label: 'Not too important' }, { label: 'Not important at all' }]
		},

		{
			name: 'share_friends_family',
			type: 'singlechoice',
			category: 'Social media usage',
			label: 'How common is the sharing of self-generated content with friends and family in your use of social media?',
			options: [{ label: 'Very common' }, { label: 'Somewhat common' }, { label: 'Neutral' }, { label: 'Somewhat uncommon' }, { label: 'Not common at all' }]
		},
		{
			name: 'share_group',
			type: 'singlechoice',
			category: 'Social media usage',
			label: 'How common is the sharing of self-generated content with groups of people (clubs) in your use of social media?',
			options: [{ label: 'Very common' }, { label: 'Somewhat common' }, { label: 'Neutral' }, { label: 'Somewhat uncommon' }, { label: 'Not common at all' }]
		},
		{
			name: 'share_public',
			type: 'singlechoice',
			category: 'Social media usage',
			label: 'How common is the sharing of self-generated content publicly in your use of social media?',
			options: [{ label: 'Very common' }, { label: 'Somewhat common' }, { label: 'Neutral' }, { label: 'Somewhat uncommon' }, { label: 'Not common at all' }]
		},
		{
			name: 'consume_friends_family',
			type: 'singlechoice',
			category: 'Social media usage',
			label: 'How important is the consumption of content generated by your friends and family for you?',
			options: [{ label: 'Very important' }, { label: 'Somewhat important' }, { label: 'Neutral' }, { label: 'Not too important' }, { label: 'Not important at all' }]
		},
		{
			name: 'consume_group',
			type: 'singlechoice',
			category: 'Social media usage',
			label: 'How important is the consumption of content generated by groups of people (clubs) for you?',
			options: [{ label: 'Very important' }, { label: 'Somewhat important' }, { label: 'Neutral' }, { label: 'Not too important' }, { label: 'Not important at all' }]
		},
		{
			name: 'consume_public',
			type: 'singlechoice',
			category: 'Social media usage',
			label: 'How important is the consumption of content generated by unknown people (celebrities, influencers, viral content) for you?',
			options: [{ label: 'Very important' }, { label: 'Somewhat important' }, { label: 'Neutral' }, { label: 'Not too important' }, { label: 'Not important at all' }]
		},

		{
			name: 'trust_in_tech',
			type: 'singlechoice',
			category: 'Trust',
			label: 'Do you trust your own devices more or less than cloud services when it comes to safeguarding your personal information?',
			options: [{ label: 'I trust my own devices significantly more' }, { label: 'I trust my own devices more' }, { label: 'Neutral' }, { label: 'I trust cloud services more' }, { label: 'I trust cloud services significantly more' }]
		},
		{
			name: 'trust_friend',
			type: 'singlechoice',
			category: 'Trust',
			label: 'Do you trust one of your friends or family members more or less than cloud services when it comes to host your personal data in their self-hosted device?',
			options: [{ label: 'I trust my friend significantly more' }, { label: 'I trust my friend more' }, { label: 'Neutral' }, { label: 'I trust cloud services more' }, { label: 'I trust cloud services significantly more' }]
		},
		{
			name: 'pay_friend',
			type: 'singlechoice',
			category: 'Costs',
			label: 'If a friend or family member were to provide you with a substantial storage space (100 GB) that you could use similarly to cloud services, would you be willing to contribute financially on an annual basis to assist with their expenses? If so, how much would you be willing to offer annually?',
			options: [{ label: 'Why would I if I can use Google for free?' }, { label: 'I would pay less then 10 USD' }, { label: 'I would pay between 10-20 USD' }, { label: 'I would pay 20-30 USD' }, { label: 'I would pay more than 30 USD' }]
		},

		{
			name: 'email',
			type: 'text',
			category: 'Contact',
			label: 'You can give us your email address if you would like. This is completely optional, but helps us to get in touch with you. It would be especially useful if you are interested in contributing to the project in any way.',
		},
		{
			name: 'note',
			type: 'multiline',
			category: 'Contact',
			label: 'You can tell us about how do you think you could help us, or you can provide us some feedback about your thoughts of the project.'
		}
	]
}
*/

const APP_NAME = 'Formillo'

import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'

import '@symbion/opalui'
import '@symbion/opalui/themes/glass.css'

import * as T from '@symbion/runtype'

import { apiFetchHelper, getAppBus } from '@cloudillo/base'
import { useCloudillo, useApi, useAuth, Button, mergeClasses } from '@cloudillo/react'
import './i18n.js'

function Progress({ className, value, max }: { className?: string; value: number; max: number }) {
	const r = 10,
		gap = 6
	return (
		<svg
			className={className}
			style={{ maxWidth: max * (r * 2 + gap) - gap }}
			viewBox={`0 0 ${max * (r * 2 + gap) - gap + 2} ${r * 2 + 2}`}
		>
			{Array.from({ length: max }).map((_, i) => (
				<circle
					key={i}
					cx={r + 1 + i * (r * 2 + gap)}
					cy={r + 1}
					r={r}
					fill={i < value - 1 ? 'currentColor' : 'none'}
					stroke="currentColor"
					strokeWidth={2}
				/>
			))}
			{Array.from({ length: max - 1 }).map((_, i) => (
				<path
					key={i}
					d={`M${r * 2 + 1 + i * (r * 2 + gap)} ${r + 1} l${gap} 0`}
					stroke="currentColor"
					strokeWidth={2}
				/>
			))}
			<circle
				cx={r + 1 + (value - 1) * (r * 2 + gap)}
				cy={r + 1}
				r={r - 4}
				fill="currentColor"
			/>
		</svg>
	)
}

interface Field {
	name: string
	type: string
	category?: string
	label: string
	descr?: string
	optional?: boolean
	depends?: string
}

interface TextField extends Field {
	type: 'text'
}

interface MultiLineTextField extends Field {
	type: 'multiline'
}

interface SingleChoiceField extends Field {
	type: 'singlechoice'
	options: { id?: string | number; label: string }[]
}

interface MultiChoiceField extends Field {
	type: 'multichoice'
	options: { id?: string | number; label: string }[]
}

interface EmailField extends Field {
	type: 'email'
}

type FormField = TextField | MultiLineTextField | SingleChoiceField | MultiChoiceField | EmailField

interface Form {
	title: string
	descr: string
	thankYou?: string
	buttons?: { start?: string; previous?: string; next?: string; submit?: string }
	fields: FormField[]
	data?: FormData[]
}

type FormValue = string | number | (string | number)[] | undefined
type FormData = Record<string, FormValue> & { _tm?: number; _ip?: string }

async function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function TextFieldPage({
	item,
	value,
	setValue,
	next
}: {
	item: TextField
	value: string | number
	setValue: (value: string | number) => void
	next?: () => void
}) {
	async function onKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
		if (next && evt.key === 'Enter') {
			next()
		}
	}

	return (
		<div>
			<input
				className="m-input"
				type="text"
				autoFocus
				defaultValue={value}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={onKeyDown}
			/>
		</div>
	)
}

function MultiLineTextFieldPage({
	item,
	value,
	setValue
}: {
	item: MultiLineTextField
	value: string | number
	setValue: (value: string | number) => void
}) {
	return (
		<div>
			<textarea
				className="m-input"
				autoFocus
				rows={8}
				defaultValue={value}
				onChange={(event) => setValue(event.target.value)}
			/>
		</div>
	)
}

function SingleChoiceFieldPage({
	item,
	value,
	setValue,
	next
}: {
	item: SingleChoiceField
	value: string | number
	setValue: (value: string | number) => void
	next?: () => void
}) {
	async function onChange(value: string | number) {
		setValue(value)
		next?.()
	}

	return (
		<div>
			<div>
				{item.options.map((option, idx) => (
					<label
						key={idx}
						className={
							'm-button secondary d-block m-1' +
							(value === option.id ||
							(option.id === undefined && value === option.label)
								? ' text-emph'
								: '')
						}
					>
						<input
							name="value"
							type="radio"
							checked={
								value === option.id ||
								(option.id === undefined && value === option.label)
							}
							onChange={() => onChange(option.id || option.label)}
						/>
						{option.label}
					</label>
				))}
			</div>
		</div>
	)
}

function MultiChoiceFieldPage({
	item,
	value,
	setValue
}: {
	item: MultiChoiceField
	value: (string | number)[]
	setValue: (value: (string | number)[]) => void
}) {
	function onChange(event: React.ChangeEvent<HTMLInputElement>) {
		const val = event.target.name
		if (event.target.checked) {
			setValue([...value, val])
		} else {
			setValue(value.filter((v) => v !== val))
		}
	}

	return (
		<div>
			<div>
				{item.options.map((option, idx) => (
					<label
						key={idx}
						className={
							'm-button secondary d-block m-1' +
							(value.includes(option.id || option.label) ? ' text-emph' : '')
						}
					>
						<input
							type="checkbox"
							checked={value.includes(option.id || option.label)}
							name={'' + option.id || option.label}
							onChange={onChange}
						/>
						{option.label}
					</label>
				))}
			</div>
		</div>
	)
}
function EmailFieldPage({
	item,
	value,
	setValue,
	next
}: {
	item: EmailField
	value: string | number
	setValue: (value: string | number) => void
	next?: () => void
}) {
	const { t } = useTranslation()

	async function onKeyDown(evt: React.KeyboardEvent<HTMLInputElement>) {
		if (next && evt.key === 'Enter') {
			next()
		}
	}

	return (
		<div>
			<input
				className="m-input"
				type="email"
				autoFocus
				placeholder={'email@address.com'}
				defaultValue={value}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={onKeyDown}
			/>
		</div>
	)
}

function FormPage({ ownerTag, fileId, form }: { ownerTag: string; fileId: string; form: Form }) {
	const { t } = useTranslation()
	const { api } = useApi()
	const [page, setPageSt] = React.useState(0)
	const [trans, setTrans] = React.useState<'' | 'fade-out'>('')
	const [data, setData] = React.useState<FormData>({})
	const [submitCls, setSubmitCls] = React.useState('')
	const lastPage = !!form && page === form.fields.length

	const item = form?.fields[page - 1]
	const val = item && data[item.name]
	const singleValue = typeof val === 'string' || typeof val === 'number' ? val : ''
	const multiValue = Array.isArray(val) ? val : []
	let formPage: React.ReactNode

	async function setPage(page: number) {
		setTrans('fade-out')
		await delay(300)
		setPageSt(page)
		setTrans('')
	}

	function setField(name: string, value: FormValue) {
		setData({
			...data,
			[name]: value
		})
	}

	async function next() {
		setSubmitCls('clicked')
		await delay(200)
		setSubmitCls('')
		await delay(100)
		setPage(page + 1)
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setSubmitCls('clicked')
		await delay(200)
		setSubmitCls('')
		if (lastPage) {
			console.log('Form', data)
			await apiFetchHelper(ownerTag, 'POST', `/db/${fileId}`, {
				data: { data },
				authToken: getAppBus().accessToken
			})
			localStorage.setItem(`form.${fileId}`, 'true')
			setPage(0)
		} else {
			setPage(page + 1)
		}
	}

	if (!form) {
		return <div>Loading...</div>
	}

	switch (item?.type) {
		case 'text':
			formPage = (
				<TextFieldPage
					item={item}
					value={singleValue}
					setValue={(value) => setField(item.name, value)}
					next={!lastPage ? next : undefined}
				/>
			)
			break
		case 'multiline':
			formPage = (
				<MultiLineTextFieldPage
					item={item}
					value={singleValue}
					setValue={(value) => setField(item.name, value)}
				/>
			)
			break
		case 'singlechoice':
			formPage = (
				<SingleChoiceFieldPage
					item={item}
					value={singleValue}
					setValue={(value) => setField(item.name, value)}
					next={!lastPage ? next : undefined}
				/>
			)
			break
		case 'multichoice':
			formPage = (
				<MultiChoiceFieldPage
					item={item}
					value={multiValue}
					setValue={(value) => setField(item.name, value)}
				/>
			)
			break
		case 'email':
			formPage = (
				<EmailFieldPage
					item={item}
					value={singleValue}
					setValue={(value) => setField(item.name, value)}
					next={!lastPage ? next : undefined}
				/>
			)
			break
	}

	return (
		<div className="m-container g-1 mt-2">
			<div className="row">
				<div className="col-0 col-md-2 col-lg-3" />
				<div className={'m-panel col col-md-8 col-lg-6 m-transition ' + trans}>
					{!page ? (
						<>
							<h2>{form.title}</h2>
							{localStorage.getItem(`form.${fileId}`) ? (
								<>
									<div
										style={{ minHeight: '18rem' }}
										dangerouslySetInnerHTML={{
											__html:
												form.thankYou ??
												t('Thank you for completing the survey!')
										}}
									/>
								</>
							) : (
								<>
									<div
										style={{ minHeight: '18rem' }}
										dangerouslySetInnerHTML={{ __html: form.descr }}
									/>
									<div className="m-hbox mt-2">
										<Button className="primary fill" onClick={() => setPage(1)}>
											{form.buttons?.start || t('Start')}
										</Button>
									</div>
								</>
							)}
						</>
					) : (
						<form className="d-flex flex-column" onSubmit={onSubmit}>
							<Progress
								className="align-self-center"
								value={page}
								max={form.fields.length}
							/>
							{!!item.category && <h2>{item.category}</h2>}
							<div style={{ minHeight: '18rem' }}>
								<h3>{item.label}</h3>
								{!!item.descr && (
									<div dangerouslySetInnerHTML={{ __html: item.descr }} />
								)}
								{formPage}
							</div>
							<div className="m-group w-100 mt-2">
								{!!page && (
									<Button
										className="secondary flex-fill"
										onClick={() => setPage(page - 1)}
									>
										{form.buttons?.previous || t('Previous')}
									</Button>
								)}
								<input
									className={mergeClasses(
										'm-button primary flex-fill',
										submitCls
									)}
									disabled={
										!item.optional &&
										(!val || (Array.isArray(val) && val.length === 0))
									}
									type="submit"
									value={
										lastPage
											? form.buttons?.submit || t('Submit')
											: form.buttons?.next || t('Next')
									}
								/>
							</div>
						</form>
					)}
				</div>
				<div className="col-0 col-md-2 col-lg-3" />
			</div>
		</div>
	)
}

function FormData({ form }: { form: Form }) {
	const { t } = useTranslation()

	return (
		<div className="m-container g-1">
			{form.data?.reverse()?.map((row, idx) => (
				<div className="m-panel" key={idx}>
					<h2>
						{dayjs(row._tm).format('YYYY-MM-DD HH:mm:ss')} ({row._ip})
					</h2>
					<ul className="m-panel">
						{form.fields.map((item) => (
							<li key={item.name}>
								<b>{item.name}:</b> {row[item.name]}
							</li>
						))}
					</ul>
				</div>
			))}
			{/*
		<div className='m-panel'>
			<table className="m-table">
				<thead><tr>
					{ form.fields.map(item => <th key={item.name}>{item.name}</th>) }
				</tr></thead>
				<tbody>
					{ form.data?.map((row, idx) => <tr key={idx}>
						{ form.fields.map(item => <td key={item.name}>{row[item.name]}</td>) }
					</tr>) }
				</tbody>
			</table>
		</div>
		*/}
		</div>
	)
}

export function App() {
	const { t } = useTranslation()
	const location = useLocation()
	const cloudillo = useCloudillo(APP_NAME)
	const { api } = useApi()
	const [auth] = useAuth()
	const [form, setForm] = React.useState<Form | undefined>(undefined)

	React.useEffect(
		function () {
			;(async function init() {
				if (!api || !cloudillo) return
				if (cloudillo?.roles?.includes('SADM')) {
					const json = (await api!.request(
						'GET',
						`/db/${cloudillo.fileId}`,
						T.struct({ data: T.array(T.unknown) })
					)) as { data: FormData[] }
					console.log('RES', json)
					setForm({
						...MY_FORM,
						data: json.data
					})
				} else {
					setForm(MY_FORM)
				}
			})()
		},
		[api, cloudillo]
	)

	if (!cloudillo || !cloudillo.fileId || !form) {
		return <div>Loading...</div>
	}

	if (cloudillo.roles?.includes('SADM')) {
		return <FormData form={form} />
	} else {
		return <FormPage ownerTag={cloudillo.ownerTag} fileId={cloudillo.fileId} form={form} />
	}
}

// vim: ts=4
