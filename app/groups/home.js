/*

groups
* there's always a default group

managing storage
* scaling to lots of pages/groups
* collect all on startup
* manage cache
* what can change?
  * new page in group
  * page changes between groups
  * page closed
  * undo close page to a group that no longer exists (use current group)

relevant page events
  * new page
    * add to current group
  * activate (and switch active group)
  * close page

*/

(async () => {

// TODO: make extensible
const VIEW_GROUPS = 1;
const VIEW_TABS = 2;

// keys for extension-level data
const EXT_DATA_CONFIG_KEY = 'config';

// keys for per-tab data
const TAB_DATA_GROUP_KEY = 'groupId';

// default strings
// TODO: move to i18n
const DEFAULT_GROUP_TITLE = 'Default Group';
const DEFAULT_NEW_GROUP_TITLE = 'New Group';

// Handle ESC
document.onkeydown = function(evt) {
  evt = evt || window.event;
  var isEscape = evt.key == 'Escape';
  if (isEscape && currentView == VIEW_TABS) {
    showGroups();
  }
};

var currentView = null;

var config = null;

const init = () => {
  // Initialize storage - this loads groups, everything else
  initStorage();

  // Data loaded, start building UI
  //populateUI();

  // New group click handler
  document.querySelector('.newgroup').addEventListener('click', function() {
    newGroup();
  });

  // Listen for things that'll change state
  initEventListeners();

  // Populate groups with their pages
  showCards();
};

const initStorage = () => {
  let data = localStorage.getItem(EXT_DATA_CONFIG_KEY);

  console.log('initStorage', data);

  // Not first run!
  if (data && data.config) {
    config = data.config;
  }
  else {
    // First run!

    config = {};

    // Set up group storage
    config.groups = {};

    // Create default group
    const id = newGroup(DEFAULT_GROUP_TITLE);

    // Storage default group id as last active group
    config.lastGroupId = id;

    // save on first run
    updateStorage(EXT_DATA_CONFIG_KEY, config);
  }

  return config;
}

// Save changes to config to persistent storage
// TODO: Temporary hack. Replace with proper evented solution.
function updateStorage(key, data) {
  localStorage.setItem(key, data);
}

function initEventListeners() {
  /*
  // add new tabs in this window to current group
  browser.tabs.onCreated.addListener(tab => {
    addCardToGroup(tab.id, config.lastGroupId);
  });

  // remove detached tabs from their group
  browser.tabs.onDetached.addListener(tab => {
    removeCardFromGroup(tab.id, config.lastGroupId);
  });
  
  // remove removed tabs from their group
  browser.tabs.onRemoved.addListener(tab => {
    removeCardFromGroup(tab.id, config.lastGroupId);
  });
  */
}

function addCardToGroup(pageId, groupId) {
  const index = config.groups[groupId].pages.indexOf(pageId);
  if (index == -1) {
    config.groups[groupId].pages.push(pageId);
  }
}

function removeCardFromGroup(pageId, groupId) {
  var index = config.groups[groupId].tabs.indexOf(pageId);
  if (index > -1) {
    config.groups[groupId].tabs.splice(index, 1);
  }
}

function getGroupById(id) {
  return config.groups[id];
}

function activateGroup(groupId) {
  var group = getGroupById(groupId);
  var lastGroup = getGroupById(config.lastGroupId);
  if (group.tabs.length === 0) {
    // New group?
    browser.tabs.create({}).then(tab => {
      addCardToGroup(tab.id, groupId);
      browser.tabshideshow.show(group.tabs);
      browser.tabshideshow.hide(lastGroup.tabs);
      setLastActiveGroupId(groupId);
    });
  }
  else {
    browser.tabshideshow.show(group.tabs);
    browser.tabshideshow.hide(lastGroup.tabs);
    setLastActiveGroupId(groupId);
  }
}

function getLastActiveGroupId() {
  return config.lastGroupId;
}

function setLastActiveGroupId(id) {
  config.lastGroupId = id;
}

function initializeGroupData() {
  /*
  return new Promise(function(resolve, reject) {
    // Clear out old tab ids
    for (let id in config.groups) {
      config.groups[id].tabs = [];
    }
    
    browser.tabs.query({currentWindow: true}).then(tabs => {
      tabs.forEach(tab => {
        browser.sessions.getCardValue(tab.id, TAB_DATA_GROUP_KEY).then(groupId => {
          if (groupId && config.groups[groupId]) {
            config.groups[groupId].tabs.push(tab.id);
          }
          else {
            // This should only happen on first run.
            // Add all default tabs to default group.
            var groupId = getLastActiveGroupId();
            addCardToGroup(tab.id, groupId);
          }
        });
      });
      resolve();
    });
  });
  */
}

function newGroup(title) {
  var id = window.crypto.getRandomValues(new Uint32Array(1))[0];
  var group = {
    id: id,
    title: title || 'New Group',
    tabs: []
  };
  config.groups[id] = group;
  showGroups();
  updateStorage();
  return id;
}

function showGroups() {
  clearCards();
  for (let id in config.groups) {
    var group = config.groups[id];
    var card = addCard();
    card.querySelector('h1').innerText = group.title;
    card.dataset.id = group.id;
    card.addEventListener('click', e => {
      var groupId = parseInt(card.dataset.id);
      if (groupId != config.lastGroupId) {
        activateGroup(groupId);
      }
    });
    card.classList.add('group');
  }
  currentView = VIEW_GROUPS;
  document.querySelector('.controls').classList.add('groupsview');
  document.querySelector('.controls').classList.remove('tabsview');
}

function showCards() {
  var group = getGroupById(config.lastGroupId);
  clearCards();

  group.pages.forEach(page => {
    var card = addCard();
    card.querySelector('h1').innerText = page.title;
    card.dataset.id = page.id;
    card.addEventListener('click', e => {
      var pageId = parseInt(card.dataset.id);
      browser.pages.update(pageId, { active: true });
    });
  });

  currentView = VIEW_PAGES;
  document.querySelector('.controls').classList.add('pagesview');
  document.querySelector('.controls').classList.remove('groupsview');
}

function clearCards() {
  var container = document.querySelector('.cards');
  Array.prototype.slice.call(container.children).forEach(child => {
    child.parentNode.removeChild(child);
  });
}

function addCard() {
  var container = document.querySelector('.cards');

  var cardTpl = document.querySelector('.tpl-card')
  var cardClone = document.importNode(cardTpl.content, true);
  container.appendChild(cardClone);
  var card = container.lastElementChild;
  card.classList.add('card');

  return card;
}

// Kick out the jams
document.addEventListener('DOMContentLoaded', init);


})();
