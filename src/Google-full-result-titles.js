/* eslint-disable no-debugger */
/* global GM, GM_registerMenuCommand */ /* from GreaseMonkey */
/* global fetchGM, GM_xmlhttpRequest, CPPanel, CPControl */ /* from other files of this project */

/* jshint esversion: 9 */
/* jshint debug: true */


/* 
// @name           Google-full-result-titles
// @namespace      https://github.com/paponius/
// @author         papo
// @license        CC-BY-SA-4.0

   This script fills up short titles on Google result page.
   There will be some options later. e.g.:
   - method of applying.
     - just continue the line (does not look nice in my Dark Google UserStyle)
     - on a second line
     - hover over the result card

   This UserScript needs complete access to a cross-origin resource: select "Always allow All Domains".
   As it needs to access any site listed on Google results to get its title.

   Features
   - Uses Observer for changes on page. It does not run in loop forever.
   When new result "card" is added, by opening "People also search" or such, or with endless scroll,
   or going to Next page, only such card is scanned, not the whole document with a CSS query again.
   - Type of target page is determined before an attempt to get its Title. Non HTML targets are not downloaded in the background. 
   - Title is obtained from target web pages, but the page is streamed and usually only couple of hundred bytes are downloaded.
   Later, maybe a PDF,doc, ...


   DEBUG when new entries are missed by the Observer:
   - add word DEBUG to this UserScript title in TamperMonky or its cousin
   - refresh page
   - wait for the problem to be visible
   - run menu command 'check'
   - open in DevTools>Elements last 'new parent' from a group of console messages. (It's the top element from newly added structure of elements containing the Card.)
   - add selector to selCardsParents
   - refresh page to check. or if you want to continue searching for more, use the second menu item.

   TODO:
   When the beginning of shown title does not match the obtained, only offer it in hover? second line?
 */

"use strict";

// var DEBUG = DEBUG || ( GM && GM.info.script.name.indexOf('DEBUG') !== -1 );
var DEBUG, LOG; // DEBUG is defined in previously loaded file, but avoid undefined when script is used elsewhere

const selResults = '.g a h3, #rso a h3, #bes a h3, #kp-wp-tab-cont-overview a h3';
const selCardsParents = `
	#rso:not(:has(#kp-wp-tab-overview))
		> div[class]:has([role="heading"])  div[id][class][jsname][data-bs][data-sgrd="true"],
	#rso > div:not([class]):not(:has(#kp-wp-tab-overview))
		> div[class]:has([role="heading"])  div[id][class][jsname][data-bs][data-sgrd="true"],
	#bres
		> div[class]:has([role="heading"])  div[id][class][jsname][data-bs][data-sgrd="true"],
	#kp-wp-tab-overview
		> div[class]:has([role="heading"])  div[id][class][jsname][data-bs][data-sgrd="true"],
	#rso [id^="kp-wp-tab-g:"]
		> div[class]:has([role="heading"])  div[id][class][jsname][data-bs][data-sgrd="true"],
	#kp-wp-tab-Thesaurus
		> div[class]:has([role="heading"])  div[id][class][jsname][data-bs][data-sgrd="true"]
   `;
// selector to find Title inside a "Card" which was found by an Observer.
const selTitleInCard = 'a h3';

var debugFirstRun = true;


// todo add standard fetch, to make it non-GM compatible
async function getTitle_stream(url) {
	// catch added 2512, why did I not add it before? Did I want it to throw error?
	const response = await fetchGM(url).catch(err => { console.error(err); return Promise.reject({m:'fetchGM error: ' + response._reason + ' | ' + response.status});});
	var contType = response.headers?.get('Content-Type');
	// console.log('[Google-full-result-titles.js] response',response);
	// todo maybe continue to try to get the page if content-type is not present in headers
	if (!contType) { debugger; console.error('[Google-full-result-titles.js] ... XHR no content type found:', url); }
	if (LOG) { console.debug('[Google-full-result-titles.js] Content-Type:', contType.split(';')[0].trim(), url); }
	// todo maybe use the second part of contType, to get encoding and use appropriate text decoder? or ignore UTF16
	if (contType !== null && contType.split(';')[0].trim() !== 'text/html') {return Promise.reject({m:'unsupported type'});}
	if (!response.ok) {
		if (LOG) { console.log('[Google-full-result-titles.js] ... XHR did not find the site (response: '+response.status+')', url, response); }
		return Promise.reject({m:'bad response: ' + response.status});
	}

	for await (const element of tagIterator(response)) {
		if (LOG) { console.debug('[Google-full-result-titles.js] Before HTML decoding: ' + element.content); console.debug(element); }
		if (element.tag === 'title') {
// todo it is probably expected that the string from streamer is still html encoded, but check with native streamer if it does not decode too
// maybe another decoder than TextDecoderStream exists
// if (element.content.includes('%')) { debugger; }
			response.abortGM();
			// - decode HTML string (&amp;, ...)
			let elHelper = document.createElement("textarea");
			elHelper.innerHTML = element.content;
			return Promise.resolve(elHelper.value);
			// del return Promise.resolve(element.content);
		}
		if (element.tag === 'body') { break; }
	}
	response.abortGM();
	Promise.reject({m:'title not present'});

	/* 
	  Simple XML stream reader. The purpose is to get needed data as soon as possible.
	  That creates a lot of limitations, mainly:
	  text nodes of a parent element are ignored.
	  e.g. <div>textA<div>textB</div>textC</div>
	  textC is ignored
	 */
	async function* tagIterator(response) {  // jshint ignore:line 
		const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

		let { value: chunk, done: readerDone } = await reader.read();
		chunk = chunk || "";

		const element = /<([^\/\s>]+)\s*([^>]*)>([^<]*)(?:<\/\1>)?/gm;
		let startIndex = 0;

		while (true) {
			const result = element.exec(chunk);
			if (!result) {
				if (readerDone) break;
				const remainder = chunk.substr(startIndex);
				({ value: chunk, done: readerDone } = await reader.read());
				chunk = remainder + (chunk || "");
				startIndex = element.lastIndex = 0;
				continue;
			}
			// yield chunk.substring(startIndex, result.index); // was example for "by line"
			// if (result[2].trim() !== '') { let param = result[2].trim(); }
			let param = result[2].trim();
			let content = '';
			if (result[3].trim() !== '') { content = result[3]; } // #text Node (untrimmed)
			yield {tag: result[1], param, content};
			startIndex = element.lastIndex;
		}

		if (startIndex < chunk.length) {
			// Last text didn't end with an element end
			yield {content: chunk.substring(startIndex)};
		}
	}
	// return new Promise((resolve, reject) => {
	// 	resolve(title);

	// });
}


// GM specific function to get Content-Type from HEAD, when streaming is not supported.
// e.g. text/html; charset=UTF-8
// e.g. content-type:application/pdf
// returns: {1: <CONTENT-TYPE>, 2: <CHARSET>|undefined}|null
async function getTypeFromHead_GM(uri) {
	return new Promise((resolve, reject) => {
		if (LOG) { console.log('[Google-full-result-titles.js] getting HEAD:', uri); }
		GM_xmlhttpRequest({
			method: 'HEAD',
			url: uri,
			onload: response => {
				if (LOG) { console.log('[Google-full-result-titles.js] XHR received HEAD:', response); }
				var contType = response.responseHeaders.match(/.*content-type\s*:\s*([^;\s\r\n]*)[\s;]*(?:charset\s*=\s*([^\r\n]*))?/i);
				// maybe allow to resolve null as no content-type defined
				// if (contType === null) { return reject('no content-type'); }
				resolve(contType);
			},
			onerror: response => {
				if (LOG) { console.log('[Google-full-result-titles.js] XHR error:', uri, response); }
				reject('XHR HEAD error: ', response);
			},
			onabort: response => {
				if (LOG) { console.log('[Google-full-result-titles.js] XHR aborted:', uri, response); }
				reject('XHR HEAD aborted: ', response);
			}
		});
	});
}

// GM specific function to DL a web page and get <title> from it, if it is html
// a copy of this function getTitle_GMnoPromises() using GM_xmlhttpRequest, not GM.xmlHttpRequest is in separate file
async function getTitle_GM(uri) {

	// - check type before full GET.
	var contType = await getTypeFromHead_GM(uri).catch(err => { console.error(err); });
	// maybe continue to try to get the page if content-type is not present in headers
	if (!contType) { debugger; console.error('[Google-full-result-titles.js] ... XHR no content type found:', uri); }
	if (LOG) { console.log('[Google-full-result-titles.js] ... XHR found Content-Type:', contType[1]); }
	// todo will see
	if (contType[1] !== 'text/html' && contType !== null ) { return Promise.reject({m:'unsupported type'}); }
	if (LOG) { console.log('[Google-full-result-titles.js] ... XHR getting full document'); }

	var response = await GM.xmlHttpRequest({
		method: 'GET',
		fetch: true,
		headers: {
			// dream on... (it's ignored by servers): https://stackoverflow.com/a/13329033/3273963
			'Accept': 'text/html'
		},
		url: uri
	}).catch(error => {
		console.error('[Google-full-result-titles.js] XHR error/aborted: '+error.error, uri, error);
		return Promise.reject('XHR error/aborted: '+error.error);
	});
	return new Promise((resolve, reject) => {
		if (LOG) { console.log('[Google-full-result-titles.js] --- XHR responded:', uri, response); }
		if (response.status < 200 || response.status > 399) {
			if (LOG) { console.log('[Google-full-result-titles.js] ... XHR did not find the site (response: '+response.status+')', uri, response); }
			return reject({m:'bad response: ' + response.status});
		}
		// head could be null for non html/xml files (PDF)
		if (!response.responseXML.head) {
			if (LOG) { console.log('[Google-full-result-titles.js] ... XHR did not find a head:', uri, response); }
			return reject({m:'no head'});
		}
		let titles = response.responseXML.head.getElementsByTagName('title');
		if (!titles.length) {
			if (LOG) { console.log('[Google-full-result-titles.js] ... XHR did not find a title:', uri, response); }
			return reject({m:'no title meta'});
		}
		var title = response.responseXML.head.getElementsByTagName('title')[0].textContent;
		if (!title) {
			if (DEBUG) { debugger; console.log('[Google-full-result-titles.js] ... XHR error:', uri, response); }
			return reject({m:'title found, but is empty'});
		}
		resolve(title);
	});
}


function getTitleFromURL(url, elTitle) {
	var title = elTitle.textContent;
	// trim: sometimes ellipses have a space before, sometimes not
	if (title.substring(title.length - 3) === '...') { title = title.substring(0, title.length - 3).trim(); }
	// if (DEBUG == 5 && title.includes('xxx')) { debugger; }
	// arTitleFlat: so it can be compared with title in uri path, which is in most cases "flat"
	// map: remove last character. e.g. "Explainer: Why is ...", the uri would have "explainer-why-is..."
	// includes: so that more characters to exclude can be used/added later.
	var arTitleFlat = title.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/ |\//)
		.map(itm => { if (':,'.includes(itm[itm.length - 1])) { return itm.substring(0, itm.length - 1); } else { return itm; }});
	// remove "..." if it's a last item; disabled. now it's done above
	// if (arTitleFlat[arTitleFlat.length - 1] === '...') { arTitleFlat.splice(arTitleFlat.length - 1, 1); }
	// filter: remove empty strings
	var arUrlDirs = new URL(url).pathname.split('/').filter(itm => itm);
	// if (DEBUG == 5) { debugger; }
	for (const dir of arUrlDirs) {
		// if (DEBUG == 5) { debugger; }
		// filter: remove empty strings, also path could start with '-'
		var arDir = dir.split('-').filter(itm => itm);
		// if more than '-' will proof suitable:
		// var arDir = dir.split(/:|-/).filter(itm => itm);
		// var arDir = dir.split(/:|%20|-|_/).filter(itm => itm);
		// first/last "word" use to be an ID of an article, remove it
		if (!isNaN(arDir[0])) { arDir.splice(0, 1); }
		if (!isNaN(arDir[arDir.length - 1])) { arDir.splice(arDir.length - 1, 1); }
		if (arDir.length <= 1) { continue; }
		// if every item of arTitleFlat is in arDir
		if (arTitleFlat.every((itm, idx) => itm === arDir[idx].toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""))) {
			let arTitle = title.split(' ');
			// slice: concat just part of the arDir which is not in title. Preserving parts of title with its case and diacritics.
			return arTitle.concat(arDir.slice(arTitle.length)).join(' ');
		}
	}
	return null;
}


// step through parents of el until <a> is found, return: [String]URL | null if no A with non-empty href found
function getLinkFromParent(el) {
	for (el = el.parentNode; el !== null; el = el.parentNode ) {
		// console.log(el);
		if (el.nodeName === 'A' && el.href) { break; }
	}
	if (el === null) { return null; }
	return el.href;
}

async function processTitle(elTitle) {
	// if (elTitle.dataset.frtTitle !== undefined) { return; }
	if (elTitle.dataset.frtChecked !== undefined) { return; }
	elTitle.dataset.frtChecked = true;
	elTitle.dataset.frtOrigTitle = elTitle.textContent;
	if (LOG) { console.log('[Google-full-result-titles.js] *** new entry', elTitle); }

	/// CP Button
	// todo will show buttons or not based on Options
	// if (XXX) {
		// create parent element for the CPPanel; code for location and positioning is in this file as it's web page specific
		// var hookLoc = elTitle.parentNode.parentNode.parentNode.querySelector('[id^="atritem-"] > div');
		var elHookLoc = elTitle.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode;
		var elCPParent = document.createElement('DIV');
		if (DEBUG == 1) { debugger; }
		elCPParent.style = `
			top: 0;
			position: absolute;
			left: ` + getComputedStyle(elHookLoc).width + ';';

		var panel = CPPanel.create(elCPParent, 'infopanel', true);

		// CPControl.create(elTitle.textContent, 'paragraph', panel);
		new CPControl(elTitle.textContent, 'paragraph', panel);
		// panel.add(elTitle.textContent, 'paragraph');
		panel.addItem("Show buttons next to each Google result which will open this popup", 'button', true, evt => {
			if (DEBUG == 1) { debugger; }
		});

		elHookLoc.appendChild(elCPParent);
	// }

	/// getTitleFromURL
	// even when title does not contain ellipses
	// todo change below `getLinkFromParent(elTitle)` to url
	var url = getLinkFromParent(elTitle);
	var titleFromURL = getTitleFromURL(url, elTitle);
	// if (DEBUG == 6) { debugger; }
	// if (DEBUG == 6 && url.includes('stack')) { debugger; }
	if (titleFromURL) {
		panel.addItem('titleFromURL: ' + titleFromURL, 'paragraph');
		elTitle.dataset.frtFromUrl = titleFromURL;
		elTitle.textContent = titleFromURL;
	}

	// title is complete; getTitleFromURL would remove the ellipses, if there was more info in url, there might be more in title too;
	//  todo: maybe later this script will still proceed to process other info from target web site
	if (!elTitle.textContent.endsWith('...') && !titleFromURL) { // sometimes there is no space before '...'
		// but why was I clearing this. It was not assigned before in tis function and this function did run if it was
		// elTitle.dataset.frtTitle = ''; // didn't want to remove the dataset before, as it was used to detect if item was processed on top of this function
		// delete elTitle.dataset.frtTitle; // not Safari
		// elTitle.removeAttribute('data-frt-title');
		if (LOG) { console.log('[Google-full-result-titles.js] ... no ellipses'); }
		// if (DEBUG) { console.groupEnd(); }
		return null;
	}
	if (!GM_xmlhttpRequest) { throw 'no monkey'; } // later will add regular XHR for an extension

	// if GM supports stream
	var funXHR;
	if (GM_xmlhttpRequest.RESPONSE_TYPE_STREAM) { funXHR = getTitle_stream;
	} else { funXHR = getTitle_GM; }
	var title = await funXHR(getLinkFromParent(elTitle)).catch(msg => {
		if (DEBUG == 2) { debugger; }
		if (!msg.m) { debugger; console.error(msg); }  // jshint ignore:line
		elTitle.dataset.frtError = msg.m;
		panel.addItem('ERROR: ' + msg.m, 'paragraph');
		// can also return here, but not throw, as it's not an error.
	});
	if (DEBUG == 2) { debugger; }
	if (title === undefined) {
		elTitle.dataset.frtError = 'getLinkFromParent resolved OK, but title is undefined';
		panel.addItem('ERROR: getLinkFromParent resolved OK, but title is undefined', 'paragraph');
		return;
	}
	if (LOG) { console.log('[Google-full-result-titles.js] setting title from:', elTitle.textContent, ' to ', title, ' on ', elTitle); }
	// todo: check if the obtained title is sane
	elTitle.dataset.frtTitle = title;
	elTitle.textContent = title;
}

function debugMarkParents(el) {
	for (el = el.parentNode; el !== null; el = el.parentNode ) {
		// #document does not have dataset
		if (el.dataset) { el.dataset.frtParentSeen = true; }
	}
}
function debugCheckParents (el) {
	// console.log('[Google-full-result-titles.js] START debugCheckParents(). first run: ', debugFirstRun);
	if (debugFirstRun) { return; }
	if (el.dataset.frtChecked) { return; } // an old one
	// if (el.dataset.frtTitle) { return; } // an old one
	for (el = el.parentNode; el !== null; el = el.parentNode ) {
		if (!el.dataset) { continue; } // #document
		if (el.dataset.frtParentSeen) {
			// console.log('[Google-full-result-titles.js] DEBUG parent already seen:', el);
		} else {
			console.log('[Google-full-result-titles.js] DEBUG new parent:', el);
		}
	}
}

function init_Google_full_result_titles(debug) {
	for (let elTitle of document.querySelectorAll(selResults)) {
		if (DEBUG && debug === 'check') { debugCheckParents(elTitle); }
		processTitle(elTitle);
		if (DEBUG && (debug === 'mark' || debugFirstRun)) { debugMarkParents(elTitle); }
	}

	// -- Observers
	for (let elCardsParent of document.querySelectorAll(selCardsParents)) {
		// debugger;
		console.log('[Google-full-result-titles.js] ', elCardsParent);

		const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
		new MutationObserver(mutations => {
			if (DEBUG) { console.count('%SCRIPTNAME%: regMutationObserver: fired'); }

			for (let m of mutations) {
				// if (m.addedNodes.length === 0) { continue; } // looking for added only now, not removed/changed

				for (let node of m.addedNodes) {
					debugger;
					// - skip obviously wrong Nodes, to avoid unnecessary querySelectorAll()
					if (!(node instanceof HTMLElement)) { continue; }
					// if (node instanceof HTMLStyleElement) { continue; } // not needed, if checking tagName below
					if (node.tagName !== 'DIV') { continue; }
					if (node.childElementCount === 0) { continue; }

					let tmpTitles = node.querySelectorAll(selTitleInCard);
					// must be just one
					if (tmpTitles.length === 0) { continue; }
					if (tmpTitles.length !== 1) {
						console.warn('[Google-full-result-titles.js] not just one');
						continue;
					}

					processTitle(tmpTitles[0]);
					if (DEBUG) { debugMarkParents(tmpTitles[0]); }

				}
			} // for (let m of mutations) {
		})
		.observe(elCardsParent, {
			subtree: false,
			childList: true
		});
	} // for


	if (DEBUG) {
		debugFirstRun = false;

		const menu_command_id_1 = GM_registerMenuCommand("debug check new entries", event => {
			init_Google_full_result_titles('check');
		}, {
		  // accessKey: "X",
		  // autoClose: true,
		  title: 'XXX'
		});
		const menu_command_id_2 = GM_registerMenuCommand("debug. mark all parents of Title elements currently present in DOM ", event => {
			init_Google_full_result_titles('mark');
		}, {
		  // accessKey: "X",
		  // autoClose: true,
		  title: 'This would mark those listed by check in console as fixed (until page refresh), next time check will show only those added from this moment.'
		});
	}
}
