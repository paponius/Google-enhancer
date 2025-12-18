/* jshint esversion: 6 */
/* jshint debug: true */


/* 
   This script ...
 */


// should be outside of the isolation function, so DEBUG can be used in functions of script files included before this one.
var DEBUG = ( GM && GM.info.script.name.indexOf('DEBUG') !== -1 );
// optional line
var DEBUG = ( GM && GM.info.script.name.split('DEBUG:')[1]?.substring(0,1)) || DEBUG;
var LOG = DEBUG || (GM && GM_info.script.name.includes('LOG'));
if (DEBUG == 's') { debugger; } // stop at beginning


// IIFE can't be used if project consists of multiple modules-files with shared variables.
// 'use strict' could be outside of the IIFE in GM. As scripts are all wrapped in one function anyway.
(() => {
'use strict';


// TODO: Uncaught (in promise) ReferenceError: Cannot access 'window' before initialization
// Snippet v1.0. determine if running in an iframe
function isIFrame() {
	// if (LOG) { console.debug('Google-enhancer: host: ', window.location.host); }
	if (window.top !== window.self) {
		if (LOG) { console.log('Google-enhancer: isIFrame(): Running in an iFrame', window.location.host); }
		return true;
	}
	if (LOG) { console.log('Google-enhancer: isIFrame(): Not running in an iFrame', window.location.host); }
	return false;
}
// alternative is: switch (window.location.host) { case 'DOMAINNAME': // main page

// this shouldn't be needed when @noframes meta is used
// if (isIFrame()) {
// 	if (LOG) { console.log('Google-enhancer: Attempted to start in an iFrame'); }
// 	return;
// }


// SNIPPET whenPageReady v1.3
// state: [interactive | complete]
var whenPageReady = (handler, state = 'complete') => {
	var eventName;

	if (state === 'DOMContentLoaded') { state = 'interactive'; }
	if (state === 'load') { state = 'complete'; }
	if (state !== 'interactive' && state !== 'complete') {
		console.warn('Google-enhancer: whenPageReady(): wrong STATE argument: ' + state + '. Defaulting to: "complete".');
		state = 'complete';
	}
	if (state === 'interactive') { eventName = 'DOMContentLoaded'; }
	if (state === 'complete') { eventName = 'load'; }

	if (document.readyState !== 'complete' && (state === 'complete' || document.readyState !== 'interactive')) {
		window.addEventListener(eventName, () => whenPageReady(handler, state));
		if (LOG) { console.log("Google-enhancer: whenPageReady(): page not ready. (readyState = '" + document.readyState + ', desired: ' + state);
		}
		return;
	}

	if (LOG) { console.log("Google-enhancer: whenPageReady(): page ready (readyState = '" + state + "')"); }
	handler();
};
// tests if events are cached and then re-sent
window.addEventListener('DOMContentLoaded', () => { console.log('event: DOMContentLoaded received'); });
window.addEventListener('load', () => { console.log('event: load received'); });


whenPageReady(init_Google_full_result_titles);



})();

// ouside of the IIFE wrapper, if code in IIFE "return"-s, this will be still shown
if (LOG) { console.log('Google-enhancer.js: ENDED'); }
