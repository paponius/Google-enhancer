# Google-enhancer
 Make Google enhanced

So far only Google-full-result-titles is here.

## Google-full-result-titles

   This script fills up short titles on Google result page.
   There will be some options later. e.g.:
   - method of applying.
     - just continue the line (does not look nice in my Dark Google UserStyle)
     - on a second line
     - hover over the result card

   This UserScript needs complete access to a cross-origin resource: select "Always allow All".
   As it needs to access any site listed on Google results to get its title.

   Features
   - Uses Observer for changes on page. It does not run in loop forever.
   When new result "card" is added, by opening "People also search" or such, or with endless scroll,
   or going to Next page, only such card is scanned, not the whole document with a CSS query again.
   - Type of target page is determined before an attempt to get its Title. Non HTML targets are not downloaded in the background. 
   - Title is obtained from target web pages, but the page is streamed and usually only couple of hundred bytes are downloaded.
   Later, maybe a PDF,doc, ...
