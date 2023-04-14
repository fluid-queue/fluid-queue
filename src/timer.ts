type Timer = {
  pause: () => void;
  resume: () => void;
  restart: () => void;
};

function timer(callback: (args: void) => void, delay: number) {
  let timerId: NodeJS.Timeout;
  let start: Date,
    remaining = delay;
  const original_delay = delay;

  const pause = function () {
    clearTimeout(timerId);
    remaining -= new Date().valueOf() - start.valueOf();
  };

  const resume = function () {
    start = new Date();
    clearTimeout(timerId);
    timerId = setTimeout(callback, remaining);
  };

  const restart = function () {
    start = new Date();
    remaining = original_delay;
    clearTimeout(timerId);
    timerId = setTimeout(callback, remaining);
  };

  const timer: Timer = { pause, resume, restart };

  return timer;
}

export { timer, Timer };
