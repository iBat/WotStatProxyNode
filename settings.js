module.exports = (function()
{
    // exports
    return {
        host: "127.0.0.1",
//        host: "213.239.197.151",
        port: 1333,
        maxSockets: 1000, // per client
        cacheTtl: 3 * 24 * 60 * 60 * 1000, // in msec
        lastErrorTtl: 2 * 1000, // in msec
        dbName: "xvm",
        collectionName: "players",
        missedCollectionName: "missed",
        statHosts: [
            "worldoftanks.ru",      // RU:            0 ..  499999999
            "worldoftanks.eu",      // EU:    500000000 ..  999999999
            "worldoftanks.com",     // NA:   1000000000 .. 1499999999
            "worldoftanks-sea.com", // ???: 15000000000 .. 1999999999
            "worldoftanks-sea.com", // SEA: 20000000000 .. 2499999999
            "wot.go.vn"             // VTC: 25000000000 .. 2999999999
        ],
        statHostsTimeouts: [
            5000,      // RU
            5000,      // EU
            5000,      // NA
            6000,      // ???
            6000,      // SEA
            19000      // VTC
        ],
        wotApiVersion: "1.5",
        info: {
            xvm: {
                ver: "2.4.1",
                message: ""
            },
            RU: {
                ver: "2.4.1",
                message: [
                    "  * мод адаптирован для WoT 0.7.4",
                    "  * новый прокси сервер",
                    "  * добавлена статистика по танку",
                    "  * исправлены ошибки"
                ].join("\n")
            },
            EU: {
                ver: "2.4.1",
                message: [
                    "  * adaptation to WoT 0.7.4",
                    "  * new proxy server",
                    "  * added per-vehicle statistics"
                ].join("\n")
            },
            NA: {
                ver: "2.4.1",
                message: [
                    "  * adaptation to WoT 0.7.4",
                    "  * new proxy server",
                    "  * added per-vehicle statistics"
                ].join("\n")
            },
            SEA: {
                ver: "2.3",
                message: [
//                    "  * adaptation to WoT 0.7.4",
//                    "  * new proxy server",
//                    "  * added per-vehicle statistics"
                ].join("\n")
            },
            VTC: {
                ver: "2.3",
                message: [
//                    "  * adaptation to WoT 0.7.4",
//                    "  * new proxy server",
//                    "  * added per-vehicle statistics"
                ].join("\n")
            },
            CT: {
                ver: "2.4.1",
                message: ""
            }
        }
    }
})();
