browser.commands.onCommand.addListener(function(command) {
  if (command.indexOf('toggle-peek') != -1) {
    onCommand(command);
	}
});

async function getURLForCommand(number) {
  let bookmarks = await browser.bookmarks.search('peek#' + number);
  return bookmarks.length ? bookmarks[0].url : 'about:home';
}

async function onCommand(command) {
  const height = window.screen.height * 0.75;
  const width = window.screen.width * 0.75;
  const number = command.split('-')[2];
  const url = await getURLForCommand(number);
  let win = await browser.windows.create({
    url: url,
    type: 'popup',
    allowScriptsToClose: true,
    height: height,
    width: width,
    top: window.screen.height - height / 2,
    left: window.screen.width - width / 2
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (tabId == win.tabs[0].id &&
        changeInfo.status &&
        changeInfo.status == 'complete') {
      browser.tabs.executeScript(win.tabs[0].id, {
        file: '/content-script.js'
      });
    }
  });
}
