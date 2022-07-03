
const timeOrNow = (time = undefined) => {
    if (time === undefined) {
        return (new Date()).toISOString();
    } else {
        return time;
    }
};

// Waiting prototype
const Waiting = {
    create: (now = undefined) => {
        return Waiting.from({ waitTime: 1, waitTimeMs: 0, lastOnlineTime: timeOrNow(now) });
    },
    from(jsonObject) {
        return Object.assign(Object.create(Waiting), jsonObject);
    },
    fromV1(waitTime, now = undefined) {
        return Waiting.from({ waitTime, waitTimeMs: 0, lastOnlineTime: timeOrNow(now) });
    },
    update(factor, now = undefined) {
        const addMinutes = Math.floor(factor);
        const addMs = Math.round((factor % 1) * 60000);
        this.waitTimeMs += addMs;
        // minute overflow
        while (this.waitTimeMs >= 60000) {
            this.waitTimeMs -= 60000;
            this.waitTime += 1;
        }
        this.waitTime += addMinutes;
        this.lastOnlineTime = timeOrNow(now);
    },
    weight() {
        return this.waitTime;
    },
};

module.exports = {
    Waiting,
};
