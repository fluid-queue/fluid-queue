const fs = require('fs');
const writeFileAtomic = require('write-file-atomic');
const writeFileAtomicSync = writeFileAtomic.sync;

const ALIASES_FILE = {directory: './settings', fileName: './settings/aliases.json'}

const defaultAliases = {
    add: ["!add"],
    back: ["!back"],
    brb: ["!brb", "!lurk"],
    clear: ["!clear"],
    close: ["!close"],
    current: ["!current"],
    customcode: ["!customcode", "!customcodes"],
    dismiss: ["!dismiss", "!skip", "!complete"],
    level: ["!level"],
    list: ["!list", "!queue"],
    modnext: ["!modnext"],
    modrandom: ["!modrandom"],
    next: ["!next"],
    open: ["!open"],
    order: ["!order"],
    pause: ["!pause"],
    persistence: ["!persistence"],
    position: ["!position", "!pos"],
    punt: ["!punt"],
    random: ["!random"],
    remove: ["!remove", "!leave"],
    replace: ["!replace", "!change", "!swap"],
    restart: ["!restart"],
    resume: ["!resume"],
    select: ["!select"],
    start: ["!start"],
    submitted: ["!submitted", "!entry", "!mylevel", "!mylvl"],
    subnext: ["!subnext"],
    subrandom: ["!subrandom"],
    weightedchance: ["!weightedchance", "!odds", "!chance", "!chances"],
    weightednext: ["!weightednext"],
    weightedrandom: ["!weightedrandom"],
    weightedsubnext: ["!weightedsubnext"],
    weightedsubrandom: ["!weightedsubrandom"]
}

let aliases;

const Aliases = {
    saveAliases : () => {
        if(!fs.existsSync(ALIASES_FILE.directory)){
            fs.mkdirSync(ALIASES_FILE.directory);
        }
        writeFileAtomicSync(ALIASES_FILE.fileName, JSON.stringify(aliases));
    },
    loadAliases : (create = false) => {
        if(create){
            const defaults = JSON.stringify(defaultAliases, null, 2);
            if(!fs.existsSync(ALIASES_FILE.directory)){
                fs.mkdirSync(ALIASES_FILE.directory, {recursive: true});
            }
            writeFileAtomicSync(ALIASES_FILE.fileName, defaults);
            aliases = defaultAliases;
        }
        if(!create && !fs.existsSync(ALIASES_FILE.fileName)){
            Aliases.loadAliases(true);
        }
        try {
            aliases = JSON.parse(fs.readFileSync(ALIASES_FILE.fileName, { encoding: "utf8" }));
        } catch (err) {
            console.warn('An error occurred when trying to load %s. %s', ALIASES_FILE.fileName, err.message);
        }
    },
    addAlias : (cmd, alias) => {
        if(Aliases.isDisabled(cmd) || !Aliases.isCommand(cmd)){
            return false;
        }
        if(JSON.stringify(aliases).includes(alias)){
            return false;
        }
        if(!alias.startsWith("!")){
            aliases[cmd].push("!" + alias);
        } else {
            aliases[cmd].push(alias);
        }
        Aliases.saveAliases();
        return true;
    },
    isDisabled : (cmd) => {
        return aliases[cmd].includes("disabled");
    },
    disableCommand: (cmd) => {
        if(Aliases.isDisabled(cmd) || !Aliases.isCommand(cmd)){
            return false;
        }
        aliases[cmd].push("disabled");
        Aliases.saveAliases();
        return true;
    },
    enableCommand: (cmd) => {
        if(Aliases.isDisabled(cmd) || !Aliases.isCommand(cmd)){
            aliases[cmd].pop();
            Aliases.saveAliases();
            return true;
        }
        return false;
    },
    isAlias : (cmd, message) => {
        if(Aliases.isDisabled(cmd)){
            return false;
        }
        return aliases[cmd].includes(message.split(' ')[0]);
    },
    resetCommand : (cmd) => {
        if(Aliases.isCommand(cmd)){
            aliases[cmd] = defaultAliases[cmd];
            return true;
        }
        return false;
    },
    getCommands: () => {
        return Object.keys(aliases);
    },
    isCommand: (cmd) => {
        return Object.keys(aliases).includes(cmd);
    }
}

module.exports = {
    aliases: () => {return Aliases}
}