
const timeOrNow = (time = undefined) => {
    if (time === undefined) {
        return (new Date()).toISOString();
    } else {
        return time;
    }
};

const hasOwn = (object, property) => {
    return Object.prototype.hasOwnProperty.call(object, property);
};

// Waiting prototype
const Waiting = {
    create: (now = undefined) => {
        return Waiting.from({ waitTime: 1, weightMin: 1, weightMsec: 0, lastOnlineTime: timeOrNow(now) });
    },
    from(jsonObject) {
        const defaults = { weightMin: jsonObject.waitTime, weightMsec: 0 };
        return Object.assign(Object.create(Waiting), { ...defaults, ...jsonObject });
    },
    fromV1(waitTime, now = undefined) {
        return Waiting.from({ waitTime, weightMin: waitTime, weightMsec: 0, lastOnlineTime: timeOrNow(now) });
    },
    addOneMinute(multiplier, now = undefined) {
        const addMin = Math.floor(multiplier);
        const addMsec = Math.round((multiplier % 1) * 60000);
        this.weightMsec += addMsec;
        // minute overflow
        while (this.weightMsec >= 60000) {
            this.weightMsec -= 60000;
            this.weightMin += 1;
        }
        this.weightMin += addMin;
        this.waitTime += 1;
        this.lastOnlineTime = timeOrNow(now);
    },
    weight() {
        // round to nearest minute
        return this.weightMin + (this.weightMsec >= 30000 ? 1 : 0);
    },
};

module.exports = {
    Waiting,
};
