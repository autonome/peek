function sendWindowSize() {
  self.port.emit('resize', {
    height: window.outerHeight,
    width: window.outerWidth
  });
}

window.addEventListener('resize', sendWindowSize, false);

sendWindowSize();
