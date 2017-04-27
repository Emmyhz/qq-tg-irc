/*
 options: {
     disables: [],
     enables: [],
     disallowedClients: [],
     allowedClients: [],
 }

 callbacks: function
 or
 callbacks: {
    'prepare': func,
    'send': func,
    'sent': func,
 }
 */

'use strict';

let commands = new Map();
let commands_telegram = new Map();

const BridgeMsg = require('./BridgeMsg.js');

module.exports = (bridge, options) => {

    let clientFullNames = {};
    for (let [type, handler] of bridge.handlers) {
        clientFullNames[handler.id.toLowerCase()] = type;
        clientFullNames[type.toLowerCase()] = type;
    }

    const getNameForTelegram = (cmd) => cmd.replace(/[^A-Za-z0-9_]/g, '');

    bridge.addCommand = (command, callbacks, opts = {}) => {
        let cb;
        if (typeof callbacks === 'object') {
            cb = callbacks;
        } else {
            cb = { sent: callbacks };
        }

        let clients = [];
        if (opts.allowedClients) {
            clients = opts.allowedClients;
        } else {
            for (let [type, handler] of bridge.handlers) {
                if ((!opts.disallowedClients) || (opts.disallowedClients.indexOf(type) === -1)) {
                    clients.push(type);
                }
            }
        }

        if (!commands.has(command)) {
            for (let client of clients) {
                if (bridge.handlers.has(client)) {
                    bridge.handlers.get(client).addCommand(command);
                }
            }
        }

        let enables = null;
        let disables = [];

        if (opts.enables) {
            enables = [];
            for (let group of opts.enables) {
                let client = BridgeMsg.parseUID(group);
                if (client.uid) {
                    enables.push(client.uid);
                }
            }
        } else if (opts.disables) {
            for (let group of opts.disables) {
                let client = BridgeMsg.parseUID(group);
                if (client.uid) {
                    disables.push(client.uid);
                }
            }
        }

        let cmd = {
            options: {
                disables: disables,
                enables: enables,
            },
            callbacks: cb,
        };
        commands.set(command, cmd);
        commands_telegram.set(getNameForTelegram(command), cmd);
    };

    bridge.deleteCommand = (command) => {
        if (commands.has(command)) {
            for (let [type, handler] of bridge.handlers) {
                handler.deleteCommand(command);
            }
            commands.delete(command);
        }
    };

    bridge.getCommand = (command) => {
        return commands.get(command);
    };

    const getCmd = (msg) => {
        // Telegram需要特殊處理
        if (msg.handler.type === 'Telegram') {
            return commands_telegram.get(msg.command);
        } else {
            return commands.get(msg.command);
        }
    };

    const hook = (event) => (msg) => {
        if (msg.command) {
            let cmd = getCmd(msg);

            if (!cmd) {
                return Promise.resolve();
            }

            let { disables, enables } = cmd.options;
            let func = null;

            // 判斷當前群組是否在處理範圍內
            if (disables.indexOf(msg.to_uid) !== -1) {
                return Promise.resolve();
            }

            if (!enables || (enables && enables.indexOf(msg.to_uid) !== -1)) {
                func = cmd.callbacks[event];
            }

            if (func && (typeof func === 'function')) {
                return func(msg);
            } else {
                return Promise.resolve();
            }
        }
    };

    bridge.addHook('bridge.prepare', hook('prepare'));
    bridge.addHook('bridge.send', hook('send'));
    bridge.addHook('bridge.sent', hook('sent'));
};
