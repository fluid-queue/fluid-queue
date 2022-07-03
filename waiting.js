
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
        this.waitTime += factor; // TODO
        this.lastOnlineTime = timeOrNow(now);
    },
    weight() {
        return this.waitTime;
    },
};

module.exports = {
    Waiting,
};
