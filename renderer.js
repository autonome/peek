console.log('renderer');

// TODO: move to proper l10n
const labels = {
  prefs: {
    paneTitle: 'Preferences',
    globalKeyCmd: 'App activation shortcut',
  },
  /*
  peeks: {
    paneTitle: 'Peeks',
    type: 'Peek',
    testBtn: 'Try (❌)',
  },
  slides: {
    paneTitle: 'Slides',
    testBtn: 'Try (❌)',
  },
  scripts: {
    paneTitle: 'Scripts',
    testBtn: 'Try (❌)',
    newFolder: 'Add new script',
    addBtn: 'Add',
    delBtn: 'Delete',
  }
  */
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

	let { prefs, features } = cfg;

  const containerEl = document.querySelector('.houseofpane');

  // blow away panes if this is an update
  if (panes.length > 0) {
    panes.forEach(p => {
      p.pane.dispose();
    });
    panes = [];
  }

  // prefs pane
  const el = containerEl.querySelector('.prefs');
  const onChange = newData => {
    updateToMain({ prefs: newData });
  };

  const prefsPane = initValuesPane(
    el,
    labels.prefs,
    cfg.prefs.schema,
    cfg.prefs.data,
    onChange);
  panes.push({ el, pane: prefsPane });

  cfg.features.forEach(feature => {
    const type = feature.labels.featureType;
    const el = containerEl.querySelector('.' + type);

    const allowNew = feature.config.allowNew || false;
    const disabled = feature.config.disabled || [];

    /*
    const disabled = {
      scripts: ['previousValue'],
      slides: ['screenEdge'],
    };
    */

    const onChange = newData => {
      const p = {};
      p[type] = { items: newData };
      updateToMain(p);
    };

    const pane = initFeaturePane(
      el,
      feature,
      onChange
    );

    panes.push({
      el,
      pane
    });
  });
};

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

const initValuesPane = (container, labels, schema, values, onChange) => {
  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.paneTitle
  });

  fillPaneFromSchema(pane, labels, schema, values, onChange, []);

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

const initFeaturePane = (container, feature, onChange) => {
  const { config, labels, schemas, data } = feature;

  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.featureDisplay
  });

  const update = (all) => {
    const newData = exportPaneData(pane);
    // remove "new item" entry if not
    if (!all) {
      newData.pop();
    }
    onChange(newData);
  };

  // add prefs

  // add items
  data.items.forEach(item => {
    const folder = pane.addFolder({
      title: item.title,
      expanded: false
    });

    fillPaneFromSchema(folder, labels, schemas.item, item, onChange, config.disabled);

    // TODO: implement
    //folder.addButton({title: labels.testBtn});

    if (config.allowNew) {
      const delBtn = folder.addButton({title: labels.delBtn});
      delBtn.on('click', () => {
        pane.remove(folder);
        // TODO: https://github.com/cocopon/tweakpane/issues/533
        update();
      });
    }

    folder.on('change', () => update(!config.allowNew));
  });

  /*
  if (config.allowNew) {
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
  */

  return pane;
};

// listen for data changes
window.app.onConfigChange(() => {
  console.log('onconfigchange');
  window.app.getConfig.then(init);
});

// initialization: get data and load ui
window.app.getConfig.then(init);

