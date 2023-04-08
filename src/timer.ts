type Timer = { pause: () => void; resume: () => void; restart: () => void };

function timer(callback: (args: void) => void, delay: number) {
  let timerId: NodeJS.Timeout;
  var start: Date,
    remaining = delay,
    original_delay = delay;

  let pause = function () {
    clearTimeout(timerId);
    remaining -= new Date().valueOf() - start.valueOf();
  };

  let resume = function () {
    start = new Date();
    clearTimeout(timerId);
    timerId = setTimeout(callback, remaining);
  };

  let restart = function () {
    start = new Date();
    remaining = original_delay;
    clearTimeout(timerId);
    timerId = setTimeout(callback, remaining);
  };

  let timer: Timer = { pause, resume, restart };

  return timer;
}

export { timer, Timer };
