function Timer(callback, delay) {
  let timerId;
  var start, remaining = delay, original_delay = delay;

  this.pause = function() {
    clearTimeout(timerId);
    remaining -= new Date() - start;
  };

  this.resume = function() {
    start = new Date();
    clearTimeout(timerId);
    timerId = setTimeout(callback, remaining);
  };

  this.restart = function() {
    start = new Date();
    remaining = original_delay
    clearTimeout(timerId);
    timerId = setTimeout(callback, remaining);
  };

  return this;
}

module.exports = {
  timer: (callback, delay) => Timer(callback, delay)
};
