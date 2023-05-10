
const animateWindow = (win, slide) => {
  return new Promise((res, rej) => {
    const { size, bounds } = screen.getPrimaryDisplay();

    // get x/y field
    const coord = slide.screenEdge == 'Left' || slide.screenEdge == 'Right' ? 'x' : 'y';

    const dim = coord == 'x' ? 'width' : 'height';

    const winBounds = win.getBounds();

    // created window at x/y taking animation into account
    let pos = winBounds[coord];

    const speedMs = 150;
    const timerInterval = 10;

    let tick = 0;
    const numTicks = parseInt(speedMs / timerInterval);

    const offset = slide[dim] / numTicks;

    //console.log('numTicks', numTicks, 'widthChunk', offset);

    const timer = setInterval(() => {
      tick++;

      if (tick >= numTicks) {
        clearInterval(timer);
        res();
      }

      const winBounds = win.getBounds();

      if (slide.screenEdge == 'Right' || slide.screenEdge == 'Down') {
        // new position is current position +/- offset
        pos = pos - offset;
      }

      const grownEnough = winBounds[dim] <= slide[dim];
      const newDim = grownEnough ?
        winBounds[dim] + offset
        : winBounds[dim];

      const newBounds = {};
      newBounds[coord] = parseInt(pos, 10);
      newBounds[dim] = parseInt(newDim, 10);

      // set new bounds
      win.setBounds(newBounds);

    }, timerInterval);
  });
};

