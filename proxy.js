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
    db = new mongo.Db(dbName, new mongo.Server("127.0.0.1", 27017, serverOptions)),
    collection;

utils.log("Starting server");

// Connect to database
db.open(function(error, client) {
    if(error) {
        utils.log("DB connection error!");
        return;
    }

    utils.log("MongoDB Connected");

    collection = new mongo.Collection(client, collectionName);
});

// Create http server
http.createServer(function(request, response) {
    // parse request
    var ids;
    try {
        var query = url.parse(request.url).query;
        if(!query || !query.match(/^((\d)|(\d(\d|,)*\d))$/))
            throw "query match error: " + query;
        ids = query.split(",").map(function(a) {
            return parseInt(a);
        });
    } catch(e) {
        response.statusCode = 500;
        if(request.url.toLowerCase() == "/favicon.ico")
            response.end("wrong request: " + e);
        else
            response.end("wrong request: " + e + " url=" + request.url);
        return;
    }

    var inCache = [ ],
        forUpdate = [ ],
        now = new Date();

    var cursor = collection.find({ id: { $in: ids }});
    cursor.toArray(function(error, records) {
        try {
            if(error)
                throw "MongoDB find error: " + error;

            inCache = records;

            ids.forEach(function(id) {
                var found = false;
                for(var i = 0; i < inCache.length; ++i) {
                    if(inCache[i].id == id && ((now - inCache[i].date) < cacheTtl)) {
                        found = true;
                        break;
                    }
                }
                if(!found)
                    forUpdate.push(id);
            });

            utils.debug("records from cache:  " + inCache.length);
            utils.debug("records to retrieve: " + forUpdate.length);

            processRemotes(inCache, forUpdate, response);
        } catch(e) {
            response.statusCode = 500;
            response.end("Error: " + e);
            utils.log("Error: " + e);
        }
    });
}).listen(1337, "127.0.0.1");

utils.log("Server running at http://127.0.0.1:1337/");

// DB Functions

var updateDb = function(players) {
    players.forEach(function(player) {
        if(player.eff !== "X")
            collection.update({ id: player.id }, player, { upsert: true });
    });
};

// WG Server Statistics retrieve

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

    async.parallel(urls, function(err, results) {
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