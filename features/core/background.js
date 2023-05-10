const debug = 1;

const features = [
  //'features/cmd/background.html',
  //'features/groups/background.html',
  //'features/peeks/background.html',
  //'features/scripts/background.html',
  'features/settings/background.html',
  //'features/slides/background.html'
];

const initFeature = file => {
  const params = {
    debug,
    file,
    keepLive: true,
    show: debug
  };
  window.app.openWindow(params, () => console.log('win opened'));
};

features.forEach(initFeature);
