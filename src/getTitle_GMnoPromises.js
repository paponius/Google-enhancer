/*
   Copy of getTitle_GM function, where this returns just an an Object and the one in main file returns a Promise directly.
   using GM_xmlhttpRequest, not GM.xmlHttpRequest
   This copy is not maintained and might be without new modifications.
 */

async function getTitle_GMnoPromises(uri) {

	// Optional. check type before.
	var contType = await getTypeFromHead_GM(uri).catch(err => {	});
	// maybe continue to try to get the page if content-type is not present in headers
	if (!contType) { debugger; console.error('[Google-full-result-titles.js] XHR no content type found:', uri); }
	if (LOG) { console.log('[Google-full-result-titles.js] XHR found Content-Type:', contType[1]); }
	// todo will see
	if (contType[1] !== 'text/html' && contType !== null ) { return Promise.reject('not text/html'); }
	return new Promise((resolve, reject) => {
		// if (LOG) { console.log('[Google-full-result-titles.js] Making XHR: ', uri); }

		// GM.xmlHttpRequest({
		// `try` and `if` is just a test. probably does nothing and is useless. 
		try { if(!GM_xmlhttpRequest({
			method: 'GET',
			// fetch: true,
			headers: {
				// we can dream on (it's ignored by servers): https://stackoverflow.com/a/13329033/3273963
				'Accept': 'text/html'
			},
			// headers: 'Accept: text/html',
			url: uri,
			onload: response => {
				// debugger;
				if (LOG) { console.log('[Google-full-result-titles.js] --- XHR received:', uri, response); }
				if (response.status < 200 || response.status > 399) {
					return reject('bad response: ' + response.status);
				}
				// head could be null for non html/xml files (PDF)
				if (!response.responseXML.head) {
					if (LOG) { console.log('[Google-full-result-titles.js] XHR did not find a head:', uri, response); }
					return reject('no head');
				}
				let titles = response.responseXML.head.getElementsByTagName('title');
				if (!titles.length) {
					if (LOG) { console.log('[Google-full-result-titles.js] XHR did not find a title:', uri, response); }
					return reject('no title meta');
				}
				var title = response.responseXML.head.getElementsByTagName('title')[0].textContent;
				if (!title) {
					if (DEBUG) { debugger; console.log('[Google-full-result-titles.js] XHR error:', uri, response); }
					return reject('title found, but is empty');
				}
				resolve(title);
			},
			onerror: response => {
				if (DEBUG) { debugger; console.log('[Google-full-result-titles.js] XHR error:', uri, response); }
				reject('XHR error: '+response.error);
			},
			onabort: response => {
				if (DEBUG) { debugger; console.log('[Google-full-result-titles.js] XHR aborted:', uri, response); }
				reject('XHR aborted: '+response.error);
			}
		})) { 
			if (LOG) { console.log('[Google-full-result-titles.js] negative:', uri); }
		} } catch (e) {
			if (LOG) { console.log('[Google-full-result-titles.js] err:', uri, e); }
		}
	});
}
