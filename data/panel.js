// Convert all links to open in new tab
var matches = window.document.querySelectorAll('a');
for (var i = 0; i < matches.length; i++)
  matches[i].setAttribute('target', '_blank');
