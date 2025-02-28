/* jshint esversion: 8 */
/* jshint debug: true */

/*
// @name           fetchGM
// @namespace      https://github.com/paponius/
// @author         papo
// @license        CC-BY-SA-4.0
// version 0.1

  This will be an interface to mimic standard fetch as much as possible.
  The reason is, 1. easier to understand, 2. the rest of the code can be universal, not GM specific.

  It is not finished, it does only stream now.
 */


// Can't always resolve Promise early, as the response is not be updated when loaded.
// With stream
// Can resolve when readyState = 1, the ReadableStream would work, but response.status is zero and there are no headers, what is expected.


// non-standard GM_xmlhttpRequest: cookie, cookiePartition, binary, revalidate, timeout, context, responseType, overrideMimeType, anonymous, fetch, user, password
// non-standard GM_xmlhttpRequest handled in fetchGM(): nocache
// overruled: on... (events)
async function fetchGM(resource, options = {}, responseType = 'stream') {
	const OPTIONS_DEFAULTS = {method: 'GET'};
	const NOT_SUPPORTED = ["attributionReporting", "browsingTopics", "cache", "credentials", "integrity", "keepalive", "mode", "priority", "referrer", "referrerPolicy"];

	// -- transform Request (is used as a resource) to fetchGM options
	if (resource instanceof Request) {
		let {method, url, headers, body:data, redirect, cache} = resource;
		options = {method, url, headers, data, redirect};
		if (cache === 'no-cache') { options.nocache = true; }
	} else {
		options.url = resource;
	}
	// transform headers to standard Object, can not be an instance of Headers
	if (options.headers instanceof Headers) {
		let tmpHead = {};
		for (let [k, v] of options.headers) {
			tmpHead[k] = v;
		}
		options.headers = tmpHead;
	}

	options.responseType = responseType;
	if (options.body) { options.data = options.body; }

	// -- apply defaults. seems not necessary 
	// for (let opt in OPTIONS_DEFAULTS) {
	// 	if (options[opt] === undefined) { options[opt] = OPTIONS_DEFAULTS[opt]; }
	// }

	for (let opt in options) {
		if (NOT_SUPPORTED.includes(opt)) {
			console.error('parameter ' + opt + 'used in fetchGM options is not supported.');
		}
	}

	return new Promise((resolve, reject) => {
		var isResolved = false;
		var abort;
		options.onabort = response => { if (DEBUG) { console.debug('[Fetch_GM] event: abort', options.url, response); } };
		options.onerror = response => {
			debugger;
			console.log('[Fetch_GM] event: error', options.url, response);
			response._reason = 'error';
			reject(response);
			// or reject(response.error);
		};
		options.onloadstart = response => { processResponse(response, 'loadstart', options.url); };
		options.onprogress = response => { if (DEBUG) { console.log(`[Fetch_GM] event: progress: ${response.loaded}`, options.url, response); } };
		options.onreadystatechange = response => { processResponse(response, 'readystatechange', options.url); };
		options.ontimeout = response => {
			debugger;
			console.log('[Fetch_GM] event: timeout', options.url, response);
			response._reason = 'timeout';
			reject(response);
		};

		const fetchPromise = new Promise((resolveFetchDone, rejectFetchDone) => {
			options.onload = response => { processResponse(response, 'load', options.url); processDone(response); };
			if (DEBUG) { console.log('[fetchGM.js] calling GM_xmlhttpRequest url:', options.url); }
			if (DEBUG) { console.debug('[fetchGM.js] ... options:', options); }
			try { // just testing. definition of GM_xmlhttpRequest does not mention errors
				const controller = GM_xmlhttpRequest(options);
				abort = controller.abort;

				// if (!abort) { debugger; debugger; console.error('GM_xmlhttpRequest. no abort',abort); }
			} catch (e) { debugger; debugger; console.error('GM_xmlhttpRequest',e); }
			function processDone(response) {
			}

		});

		function processResponse(response, event, url) {
			if (DEBUG) { console.debug(`[Fetch_GM] event: ${event}; url: ${url}; readyState: ${response.readyState}; status: ${response.status}; response:`, response); }
			if (response.status === 0 && event === 'load') { console.error('this is very concerning.', response); }
			if (response.status === 0) { return; }
			if (response.readyState === 0 || response.readyState === 1) { console.error('this is concerning.', response); }
			if (isResolved) { console.log('[fetchGM.js] ... already resolved'); return; }

			// not good, it is locked only after something starts reading it (tested)
			// if (response.response.locked) { console.log('[fetchGM.js] already resolved'); return; }

			if (DEBUG) { console.log('[fetchGM.js] resolving XHR url:', url); }
			if (!response.response) {
				debugger;
				console.error('with no stream. todo: something.');
				return;
			}
			// only matching are: status and statusText (those will be used by ...response),
			var responseReal = new Response(response.response, {...response});
			Object.defineProperty(responseReal, 'url', { value: response.finalUrl });
			// `ok` is resolved properly within the Response
			// `type` says 'default', which is not one of allowed value.
			// `headers` is textual, but in real response should be [Headers]. As they are usually not needed,
			// overload the headers property by getter, which will create them on-demand.
			// "For headers created with Headers() constructor, there are no modification restrictions."
			// but: " a TypeError if you try to pass in a reference to a name that isn't a valid HTTP Header name"
			Object.defineProperty(responseReal, 'headers', {
				//todo should be double quotes?: etag: "\"5bec8c-62c4bdaa8e0fb-gzip\""
				//todo add forEach
				//
				//or real Headers:
				//"it normalizes header names to lowercase, strips leading and trailing whitespace from header values, and prevents certain headers from being set."
				//maybe it bans some prohibited which we would want?
				/*get() {
					debugger;
					console.log('[fetchGM.js] get headers');
					class Headers_ {
						get(key) {
							return this[key.toLowerCase()];
						}
					}
					const headers = new Headers_();
					for (const line of response.responseHeaders.trim().split("\n")) {
						const [key, ...valueParts] = line.split(":"); // last-modified: Fri, 21 May 2021 14:46:56 GMT
						if (key) {
							headers[key.trim().toLowerCase()] = valueParts.join(":").trim();
						}
					}
					return headers;
				} */
				get() {
					if (DEBUG) { console.debug('[fetchGM.js] get headers', url); }
					const headers = new Headers();
					// should be .split(/\r?\n/), but sanitization/trim will remove \r
					for (const line of response.responseHeaders.split('\n')) {
						let [key, ...values] = line.split(':');
						key = key.trim(); // values are sanitized, key is not. can't have spaces and be empty
						values = values.join(':');
						if (key !== '') { headers.set(key, values); }
					}
					return headers;
				}
			});
			// `redirected` says false, maybe can compare url with finalUrl (test)
			// test: _test_redirected. the response can't know as it was just created. but will test.
			if (options.url !== response.finalUrl) {
				responseReal._test_redirected = responseReal.redirected;
				Object.defineProperty(responseReal, 'redirected', { value: true });
			}

			// -- non standard
			// cancel() for stopping the fetch. There is no way how to use `signal` from AbortController instance in GM_xmlhttpRequest. Instead it responds with the abort() directly. To use abort() outside of this fetchGM function, it must be returned.
			// add readyState to response? textual responseHeaders? responseType?
			responseReal.abortGM = abort;


			// or:
			// if (responseType === 'stream' && response.response) {
			isResolved = true;
			resolve(responseReal);
				//  } else {if (event === 'load') }
		}
	});

}
