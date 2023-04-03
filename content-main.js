console.log('content-main');

setTimeout(() => {
  const s = "selector: '.percent > span:nth-child(2)";
  const r = document.querySelector(s);
  const value = r ? r.textContent : null;
  console.log('cs val', value;
}, 1000);
