console.log('settings/content');

const init = () => {
  console.log('settings: init');

  const container = document.querySelector('.houseofpane');

  const type = labels.featureType;

  const paneContainer = document.createElement('div');
  container.appendChild(paneContainer);

  const allowNew = ui.allowNew || false;
  const disabled = ui.disabled || [];

  const onChange = newData => {
    console.log('onChange', newData.prefs);
    localStorage.setItem('prefs', JSON.stringify(newData.prefs));
    console.log('stored', JSON.parse(localStorage.getItem('prefs')));
  };

  const prefs = JSON.parse(localStorage.getItem('prefs'));
  console.log('prefs', prefs)

  const feature = {
    config: ui,
    labels,
    schemas,
    prefs
  };

  const pane = initFeaturePane(
    paneContainer,
    feature,
    onChange
  );
  console.log('created pane');
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
      console.log('inline field change', k, ev)
      data[k] = ev.value;
      onChange(data)
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

const initFeaturePane = (container, feature, onChange) => {
  const { config, labels, prefs, schemas, data } = feature;

  const pane = new Tweakpane.Pane({
    container: container,
    title: labels.featureDisplay
  });

  const update = (all) => {
    const paneData = exportPaneData(pane);

    console.log('folder level update for', labels.featureDisplay, paneData);

    let updated = {
    }; 

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
      console.log('initFeaturePane::onPrefChange', changed)
      update(!config.allowNew);
    };

    fillPaneFromSchema(prefsFolder, labels, schemas.prefs, prefs, onPrefChange, []);
  }

  // add items
  if (data && data.hasOwnProperty('items')) {
    data.items.forEach(item => {
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
