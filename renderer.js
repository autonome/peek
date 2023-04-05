console.log('renderer');

// TODO: move to proper l10n
const labels = {
  prefs: {
    paneTitle: 'Preferences',
    globalKeyCmd: 'App activation shortcut',
    peekKeyPrefix: 'Peek shortcut prefix',
    slideKeyPrefix: 'Slide shortcut prefix',
  },
  peeks: {
    paneTitle: 'Peeks',
    testBtn: 'Try (❌)',
    addBtn: 'Add',
    delBtn: 'Delete',
  },
  slides: {
    paneTitle: 'Slides',
    testBtn: 'Try (❌)',
    addBtn: 'Add',
    delBtn: 'Delete',
  },
  scripts: {
    paneTitle: 'Scripts',
    testBtn: 'Try',
    newFolder: 'Add new script',
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

let panes = [];

const init = cfg => {
  console.log('renderer: init');
  console.log('renderer: cfg', cfg);

	let { data, schemas } = cfg;
  const containerEl = document.querySelector('.houseofpane');

  // blow away panes if this is an update
  if (panes.length > 0) {
    panes.forEach(p => {
      p.pane.dispose();
    });
    panes = [];
  }

  // janky but hey it all is soooo
  const initPane = (type) => {
    const el = containerEl.querySelector('.' + type);
    const f = type == 'prefs' ? initValuesPane : initListPane;
    const allowNew = type == 'scripts' || false;
    const disabled = {
      prefs: [],
      scripts: ['previousValue'],
      peeks: ['keyNum'],
      slides: ['screenEdge'],
    };
    const pane = f(el, labels[type], schemas[type], data[type], newData => {
      data[type] = newData;
      updateToMain(data);
    }, allowNew, disabled[type]);
    panes.push({ el, pane });
  };

  ['prefs', 'peeks', 'slides', 'scripts'].forEach(initPane);
};

// listen for data changes
window.app.onConfigChange(() => {
  console.log('onconfigchange');
  window.app.getConfig.then(init);
});

// initialization: get data and load ui
window.app.getConfig.then(init);

const fillPaneFromSchema = (pane, labels, schema, data, onChange, disabled) => {
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

    // dedecimalize
    if (s.type == 'integer') {
      opts.step = 1;
    }

    // disabled fields
    if (disabled.includes(k)) {
      opts.disabled = true;
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

const initValuesPane = (container, labels, schema, values, onChange, allowNew, disabled) => {
  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.paneTitle
  });

  fillPaneFromSchema(pane, labels, schema, values, onChange, disabled);

  const update = (ev) => {
    // TODO: this won't work forever
    // gotta fix when tweakpane state export exists
    // also, gotta add accelerator validation
    values[ev.presetKey] = ev.value;
    onChange(values);
  };

  // handle changes to existing entries
  pane.on('change', update);

  return pane;
};

const initListPane = (container, labels, schema, items, onChange, allowNew, disabled) => {
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
    onChange(newData);
  };

  items.forEach(entry => {
    const folder = pane.addFolder({
      title: entry.title,
      expanded: false
    });

    fillPaneFromSchema(folder, labels, schema, entry, onChange, disabled);

    // TODO: implement
    folder.addButton({title: labels.testBtn});

    const delBtn = folder.addButton({title: labels.delBtn});
    delBtn.on('click', () => {
      pane.remove(folder);
      // https://github.com/cocopon/tweakpane/issues/533
      update();
    });

    folder.on('change', () => update());
  });

  if (allowNew) {
    // add new item entry
    const folder = pane.addFolder({
      title: labels.newFolder,
      expanded: false
    });

    //fillPaneFromSchema(folder, labels, schema);
    fillPaneFromSchema(folder, labels, schema, {}, onChange, disabled);

    const btn = pane.addButton({title: labels.addBtn});

    // handle adds of new entries
    btn.on('click', () => {
      update(true);
    });
  }

  return pane;
};
