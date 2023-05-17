const DEBUG = 0;

const log = (...args) => {
  if (!DEBUG) {
    return;
  }
  //const str = args.map(JSON.stringify).join(', ');
  const str = args.join(', ');
  console.log(str);
  window.app.log(labels.featureType, str);
};

const init = () => {
  log('settings: init');

  const container = document.querySelector('.houseofpane');

  const type = labels.featureType;

  const paneContainer = document.createElement('div');
  container.appendChild(paneContainer);

  const allowNew = ui.allowNew || false;
  const disabled = ui.disabled || [];

  const onChange = newData => {
    log('onChange', JSON.stringify(newData));

    if (newData.prefs) {
      const key = 'prefs';
      localStorage.setItem(key, JSON.stringify(newData[key]));
      log('stored', key, JSON.parse(localStorage.getItem(key)));
    }
    
    if (newData.items) {
      const key = 'items';
      localStorage.setItem(key, JSON.stringify(newData[key]));
      log('stored', key, JSON.parse(localStorage.getItem(key)));
    }
  };

  const prefs = JSON.parse(localStorage.getItem('prefs'));
  const items = JSON.parse(localStorage.getItem('items'));

  log('prefs', prefs)
  log('items', items)

  const feature = {
    config: ui,
    labels,
    schemas,
    prefs,
    items
  };

  const pane = initFeaturePane(
    paneContainer,
    feature,
    onChange
  );

  log('created pane');
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
      log('inline field change', k, ev)
      data[k] = ev.value;
      onChange(data)
    });
  });
};

// TODO: fuckfuckfuck
// https://github.com/cocopon/tweakpane/issues/431
const exportPaneData = pane => {
  const children = pane.rackApi_.children.filter(p => p.children);
  const val = children.map(paneChild => {
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
      if (v != undefined) {
        obj[k] = v;
      }

      return obj;
    }, {});
  });
  return val;
};

const initFeaturePane = (container, feature, onChange) => {
  const { config, labels, schemas, prefs, items } = feature;

  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.featureDisplay
  });

  const update = (all) => {
    const paneData = exportPaneData(pane);

    log('folder level update for', labels.featureDisplay, paneData);

    let updated = {}; 

    // TODO: make this right, ugh
    if (prefs) {
      updated.prefs = paneData.shift(); 
    }

    // remove "new item" entry if not editable feature
    // TODO: make this right
    if (!all) {
      newData.pop();
    }

    if (paneData.length > 0) {
      updated.items = paneData;
    }

    onChange(updated);
  };

  // prefs pane
  if (prefs) {
    const prefsFolder = pane.addFolder({
      title: schemas.prefs.title,
      expanded: true
    });
    
    const onPrefChange = changed => {
      log('initFeaturePane::onPrefChange', changed)
      update(!config.allowNew);
    };

    fillPaneFromSchema(prefsFolder, labels, schemas.prefs, prefs, onPrefChange, []);
  }

  // add items
  if (items) {
    log('adding items panes');
    items.forEach(item => {
      const folder = pane.addFolder({
        title: item.title,
        expanded: false
      });

      fillPaneFromSchema(folder, labels, schemas.item, item, update, config.disabled);

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

      //folder.on('change', () => update(!config.allowNew));
    });
  }

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

window.addEventListener('load', init);
