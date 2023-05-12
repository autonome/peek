const log = (...args) => {
  //console.log.apply(null, [source].concat(args));
  window.app.log(source, args.join(', '));
};

log('core/background');

const features = [
  //'features/cmd/background.html',
  //'features/groups/background.html',
  'features/peeks/background.html',
  //'features/scripts/background.html',
  //'features/settings/background.html',
  //'features/slides/background.html'
];

const initFeature = file => {
  window.app.log(source, 'initializing feature ' + file);

  const params = {
    feature,
    debug,
    file,
    keepLive: true,
    show: true
  };

  window.app.openWindow(params);
  //window.app.openWindow(params, () => window.app.log(source, 'win opened'));
};

const pathPrefix = 'file:///Users/dietrich/misc/peek/';

const initIframeFeature = file => {
  log('initiframe');
  const i = document.createElement('iframe');
  const src = pathPrefix + file;
  log('iframe src', src);
  document.body.appendChild(i);
  i.src = src;
  log('iframe inited');
  i.addEventListener('load', () => {
    log('iframe loaded');
  });
};

features.forEach(initFeature);
//features.forEach(initIframeFeature);
