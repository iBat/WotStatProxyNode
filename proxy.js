var http = require("http"),
    url = require("url"),
    async = require("async"),
    utils = require("./utils"),
    settings = require("./settings"),
    mongo = require("mongodb"),
    serverOptions = {
        auto_reconnect: true,
        poolSize: 10
    },
    db = new mongo.Db(settings.dbName, new mongo.Server("localhost", 27017, serverOptions)),
    collection;

utils.log("Starting server");

// Connect to database
db.open(function(error, client) {
    if(error) {
        utils.log("DB connection error!");
        return;
    }

    utils.log("MongoDB Connected");

    collection = new mongo.Collection(client, settings.collectionName);
});

// DB Functions

var updateDb = function(players) {
    players.forEach(function(player) {
        if(player.eff !== "X")
            collection.update({ id: player.id }, player, { upsert: true });
    });
};

// WG Server Statistics retrieve

var processRemotes = function(inCache, forUpdate, response, lastError) {
    var urls = { };

    forUpdate.forEach(function(id) {
        urls[id] = function(callback) {
            var now = new Date();

            if ((now - lastError) < settings.lastErrorTtl)
            {
                utils.debug("waiting " + Math.round((settings.lastErrorTtl - (now - lastError)) / 1000) + " s");
                callback(null, []);
                return;
            }

            var options = {
                host: settings.statHost,
                port: 80,
                path: "/uc/accounts/" + id + "/api/1.3/?source_token=Intellect_Soft-WoT_Mobile-unofficial_stats"
            };
            var reqTimeout = setTimeout(function() {
                utils.debug("Timeout");
                try {
                    collection.update({ lastError: 1 }, { lastError:1, date:new Date() }, { upsert: true });
                } catch (e) {
                    utils.debug("Error: " + e);
                }

                callback(true);
            }, 5000);

            request = http.get(options, function(res) {
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
                        utils.debug(e);
                        utils.debug("JSON.parse error: " + responseData);
                        callback(e);
                    }
                    callback(null, result);
                });
            });

            request.on("error", function(e) {
                utils.debug("Http error: " + e);
                clearTimeout(reqTimeout);
                collection.update({ lastError: 1 }, {lastError:1, date:new Date()}, { upsert: true });
                callback(true);
            });
            request.shouldKeepAlive = false;
        };
    });

    async.parallel(urls, function(err, results) {
        var result = {
            players: [ ],
            info: settings.info
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
            var skip = false;
            for (var i = 0; i < result.players.length; ++i) {
                if (result.players[i].id == player.id) {
                    if (result.players[i].eff == "X") {
                        result.players[i] = player;
                    }
                    skip = true;
                    break;
                }
            }
            if (!skip)
                result.players.push(player);
        });

        response.end(JSON.stringify(result));
    });
};

// Create http server
http.createServer(function(request, response) {
    // parse request
    var ids;
    try {
        var query = url.parse(request.url).query;

        if(!query || !query.match(/^((\d)|(\d(\d|,)*\d))$/))
            throw "query match error: " + query;
        ids = query.split(",").map(function(id) { return parseInt(id); });
    } catch(e) {
        response.statusCode = 500;
        response.end("wrong request: " + e);
        if(request.url.toLowerCase() != "/favicon.ico")
            response.end("wrong request: " + e + " url=" + request.url);
        return;
    }

    var inCache = [ ],
        forUpdate = [ ],
        now = new Date(),
        lastError = null;

    collection.find({ lastError: 1 }, { _id: 0 }).toArray(function(error, records) {
        if (error)
            utils.debug("mongo error:  " + error);
        else if (records.length > 0)
        {
            try {
                lastError = records[0].date;
            } catch (e) {
                utils.debug("mongo error 2:  " + e);
            }
        }
        utils.debug("last error date:  " + lastError);

        var cursor = collection.find({ id: { $in: ids }}, { _id : 0 });
        cursor.toArray(function(error, records) {
            try {
                if (error)
                    throw "MongoDB find error: " + error;

                inCache = records;

                ids.forEach(function(id) {
                    var found = false;
                    for (var i = 0; i < inCache.length; ++i) {
                        if (inCache[i].id == id && ((now - inCache[i].date) < settings.cacheTtl)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found)
                        forUpdate.push(id);
                });

                utils.debug("records from cache:  " + inCache.length);
                utils.debug("records to retrieve: " + forUpdate.length);
                processRemotes(inCache, forUpdate, response, lastError);
            } catch(e) {
                response.statusCode = 500;
                response.end("Error: " + e);
                utils.debug("Error: " + e);
            }
        });
    });
}).listen(settings.port, "127.0.0.1");

utils.log("Server running at http://127.0.0.1:" + settings.port + "/");
