// Convert all links to open in new tab
var matches = window.document.querySelectorAll('a');
for (var i = 0; i < matches.length; i++)
  matches[i].setAttribute('target', '_blank');

window.addEventListener('click', function(event) {
  self.port.emit('click-link')
  /*
  var t = event.target
  if (t.nodeName == 'A')
    self.port.emit('click-link', t.toString())
  */
}, false)
