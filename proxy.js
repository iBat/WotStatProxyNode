var http = require("http"),
	url = require("url"),
	async = require("async"),
    utils = require("./utils"),
    mongo = require("mongodb"),
    dbName = "test",
	collectionName = "test_collection",
    cacheTtl = 7 * 24 * 60 * 60 * 1000, // 7 days
    serverOptions = {
        auto_reconnect: true,
        poolSize: 10
    },
    db = new mongo.Db(dbName, new mongo.Server("localhost", 27017, serverOptions)),
    collection;

db.open(function(error, client) {
    if(error) {
        utils.log("DB connection error!");
        return;
    }

    collection = new mongo.Collection(client, collectionName);
});

http.createServer(function(request, response) {
    var query = getQuery(request, response);

    if(!query)
        return;

    var ids = [ ],
        parts = query.split(",");

    parts.forEach(function(part) {
        ids.push(parseInt(part));
    });

    processLocal(ids, response);
}).listen(1337, "127.0.0.1");

utils.log("Server running at http://127.0.0.1:1337/");

var getQuery = function(request, response) {
    var query;

    try {
        query = url.parse(request.url).query;
    } catch(e) {
        response.statusCode = 500;
        response.end("wrong request");
        utils.log("url.parse error: " + request.url);
        return false;
    }

    if(!(query && query.match(/^\d(\d|,)+\d$/))) {
        response.statusCode = 500;
        response.end("wrong request");
        utils.log("query match error: " + query);
        return false;
    }

    return query;
};

var processLocal = function(ids, response) {
    var inCache = [ ],
        forUpdate = [ ],
        checks = [ ],
        now = new Date();

    ids.forEach(function(id) {
        checks.push(function(callback) {
            collection.find({ id: id }, { limit: 1 }).toArray(function(error, records) {
                if(error) {
                    callback(error);
                    return;
                }

                var playerRecord = records.length && records[0];

                if(playerRecord && (now - playerRecord.date) < cacheTtl)
                    inCache.push(playerRecord);
                else
                    forUpdate.push(id);

                callback(null);
            });
        });
    });

    async.series(checks, function(error) {
        if(error) {
            response.statusCode = 500;
            response.end("DB connection error");
            utils.log("DB connection error 3");
            return;
        }
        processRemotes(inCache, forUpdate, response);
    });
};

var processRemotes = function(inCache, forUpdate, response) {
    var urls = { };

    forUpdate.forEach(function(id) {
        urls[id] = function(callback) {
            var options = {
                host: "worldoftanks.ru",
                port: 80,
                path: "/uc/accounts/" + id + "/api/1.3/?source_token=Intellect_Soft-WoT_Mobile-unofficial_stats"
            };

            var reqTimeout = setTimeout(function() {
                utils.log("Timeout");
                request.destroy();
                callback(true);
            }, 2500);

            var request = http.get(options, function(res) {
                var responseData = "";

                res.setEncoding("utf8");
                res.on("data", function(chunk) {
                    responseData += chunk;
                });
                res.on("end", function() {
                    var result;

                    clearTimeout(reqTimeout);
                    try {
                        result = JSON.parse(responseData);
                    } catch(e) {
                        utils.log(e);
                        utils.log("JSON.parse error: " + responseData);
                        callback(e);
                    }
                    callback(null, result);
                });
            });

            request.on("error", function(e) {
                utils.log("Http error: " + e);
                callback(true);
            });
            request.shouldKeepAlive = false;
        };
    });

    async.series(urls, function(err, results) {
        var result = {
            players: [ ],
            info: {
                xvm: {
                    ver: "0.4",
                    message: "\u00bd + \u00bc = \u00be"
                }
            }
        };
        
        var now = new Date();

        forUpdate.forEach(function(id) {
            var curResult = results[id],
                resultItem = { id: id };

            if(curResult && curResult.status === "ok" && curResult.status_code === "NO_ERROR") {
                resultItem.name = curResult.data.name;
                resultItem.battles = curResult.data.summary.battles_count;
                resultItem.wins = curResult.data.summary.wins;
                resultItem.eff = utils.calculateEfficiency(curResult.data);
            } else {
                resultItem.eff = "X";
                resultItem.win = "X";
            }
            resultItem.date = now;
            result.players.push(resultItem);
        });

        updateDb(result.players);

        inCache.forEach(function(player) {
            result.players.push(player);
        });

        response.end(JSON.stringify(result));
    });
};

var updateDb = function(players) {
    players.forEach(function(player) {
        if(player.eff !== "X")
            collection.update({ id: player.id }, player, { upsert: true });
    });
};