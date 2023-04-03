console.log('renderer');

// TODO: move to proper l10n
const labels = {
  shortcutsPane: {
    paneTitle: 'Keyboard Shortcuts',
    globalKeyCmd: 'Global activation shortcut',
    peekKeyPrefix: 'Peek shortcut prefix',
  },
  peeksPane: {
    paneTitle: 'Peeks',
    testBtn: 'Try',
    newFolder: 'New peek',
    addBtn: 'Add',
    delBtn: 'Delete',
  },
  scriptsPane: {
    paneTitle: 'Scripts',
    testBtn: 'Try',
    newFolder: 'New script',
    addBtn: 'Add',
    delBtn: 'Delete',
  }
};

// TODO: capture and internally navigate out of panes
window.addEventListener('keyup', e => {
  //console.log('renderer', 'onkeyup', e);
  if (e.key == 'Escape') {
    //ipcRenderer.send('esc', '');
  }
});

// send changes back to main process
// it will notify us when saved
// and we'll reload entirely 😐
const updateToMain = data => {
  console.log('renderer: updating to main', data);
  window.app.setConfig(data);
};

const containerEl = document.querySelector('.houseofpane');
let panes = [];

const init = cfg => {
  console.log('renderer: init');
  console.log('renderer: cfg', cfg);

  // blow away panes if this is an update
  if (panes.length > 0) {
    panes.forEach(p => {
      p.dispose();
    });
    panes = [];
  }

  containerEl.replaceChildren();

  // build panes and wire up change handlers
	let { data, schemas } = cfg;

  panes.push(initShortcutsPane(containerEl, labels.shortcutsPane, schemas.prefs, data.prefs, newPrefs => {
    data.prefs = newPrefs;
    updateToMain(data);
  }));

  panes.push(initPeeksPane(containerEl, labels.peeksPane, schemas.peek, data.peeks, newPeeks => {
    data.peeks = newPeeks;
    updateToMain(data);
  }));

  panes.push(initScriptsPane(containerEl, labels.scriptsPane, schemas.script, data.scripts, newScripts => {
    data.scripts = newScripts;
    updateToMain(data);
  }));
};

// listen for data changes
window.app.onConfigChange(() => {
  console.log('onconfigchange');
  window.app.getConfig.then(init);
});

// initialization: get data and load ui
window.app.getConfig.then(init);

const fillPaneFromSchema = (pane, labels, schema, data, onChange) => {
	const props = schema.properties;
  Object.keys(props).forEach(k => {
    // schema for property
    const s = props[k];

    // value (or default)
		const v =
      (data && data.hasOwnProperty(k))
      ? data[k]
      : props[k].default;

		const params = {};
    const opts = {};

    if (s.type == 'integer') {
      opts.step = 1;
    }

		params[k] = v;
    const input = pane.addInput(params, k, opts);
    // TODO: consider inline state management
    input.on('change', ev => {
      // TODO: validate against schema
      console.log('change', k, ev.value)
      //data[k] = ev.value;
    });
  });
};

// TODO: fuckfuckfuck
// https://github.com/cocopon/tweakpane/issues/431
const exportPaneData = pane => {
  const children = pane.rackApi_.children.filter(p => p.children);
  const val = pane.rackApi_.children.filter(p => p.children).map(paneChild => {
    return paneChild.children.reduce((obj, field) => {
      const k = field.label;
      if (!k) {
        return obj;
      }

      let v = null;

      const input = field.element.querySelector('.tp-txtv_i')
      if (input) {
        v = input.value;
      }

      const checkbox = field.element.querySelector('.tp-ckbv_i');
      if (checkbox) {
        v = checkbox.checked;
      }

      // TODO: drop fields not supported for now
      if (v) {
        obj[k] = v;
      }

      return obj;
    }, {});
  });
  return val;
};

const initShortcutsPane = (container, labels, schema, prefs, onChange) => {
  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.paneTitle
  });

  fillPaneFromSchema(pane, labels, schema, prefs);

  const update = (ev) => {
    // TODO: this won't work forever
    // gotta fix when tweakpane state export exists
    // also, gotta add accelerator validation
    prefs[ev.presetKey] = ev.value;
    onChange(prefs);
  };

  // handle changes to existing entries
  pane.on('change', update);

  return pane;
};

const initPeeksPane = (container, labels, schema, peeks, onChange) => {
  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.paneTitle
  });

  const update = (all) => {
    const newData = exportPaneData(pane);
    // remove "new item" entry if not
    if (!all) {
      newData.pop();
    }
    console.log(newData)
    onChange(newData);
  };

  peeks.forEach(entry => {
    const folder = pane.addFolder({
      title: entry.title,
      expanded: false
    });

    const onChange = newEntry => {
    };

    fillPaneFromSchema(folder, labels, schema, entry, onChange);

    // TODO: implement
    folder.addButton({title: labels.testBtn});

    // TODO: implement
    const delBtn = folder.addButton({title: labels.delBtn});
    delBtn.on('click', () => {
      //folder.dispose();
      pane.remove(folder);
      // https://github.com/cocopon/tweakpane/issues/533
      update();
    });

    folder.on('change', update);
  });

  // add new item entry
  const folder = pane.addFolder({
    title: labels.newFolder
  });

  fillPaneFromSchema(folder, labels, schema);

  const btn = pane.addButton({title: labels.addBtn});

  // handle adds of new entries
	btn.on('click', () => {
    update(true);
  });

  // handle changes to existing entries
  //pane.on('change', update);

  return pane;
};

const initScriptsPane = (container, labels, schema, scripts, onChange) => {
  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.paneTitle
  });

  scripts.forEach(entry => {
    const folder = pane.addFolder({
      title: entry.title,
      expanded: false
    });
    fillPaneFromSchema(folder, labels, schema, entry);
    // TODO: implement
    folder.addButton({title: labels.testBtn});
    // TODO: implement
    folder.addButton({title: labels.delBtn});
  });

  const folder = pane.addFolder({
    title: labels.newFolder
  });

  fillPaneFromSchema(folder, labels, schema);

  const btn = pane.addButton({title: labels.addBtn});

  const update = () => {
    const newData = exportPaneData(pane);
    onChange(newData);
  };

  // handle adds of new entries
	btn.on('click', update);

  // handle changes to existing entries
  pane.on('change', update);

  return pane;
};

