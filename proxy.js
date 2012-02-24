var http = require("http"),
	url = require("url"),
	async = require("async"),
	dbName = "test",
	collectionName = "test_collection",
    cacheTtl = 7 * 24 * 60 * 60 * 1000, // 7 days
    mongo = require("mongodb"),
    serverOptions = {
        auto_reconnect: true,
        poolSize: 10
    },
    db = new mongo.Db(dbName, new mongo.Server("localhost", 27017, serverOptions));

http.createServer(function(request, response) {
	var query = url.parse(request.url).query,
		ids = [ ],
		result = { },
        inCache = [ ],
		forUpdate = [ ];
	
	var processRemotes = function() {
		var urls = { };
		
        forUpdate.forEach(function(id) {
            urls[id] = function(callback) {
                var options = {
                    host: "worldoftanks.ru",
                    port: 80,
                    path: "/uc/accounts/" + id + "/api/1.2/?source_token=Intellect_Soft-WoT_Mobile-unofficial_stats"
                };

                http.get(options, function(res) {
                    var responseData = "";
                    res.setEncoding("utf8");
                    res.on("data", function(chunk) {
                        responseData += chunk;
                    });
                    res.on("end", function() {
                        callback(null, JSON.parse(responseData));
                    });
                }).on("error", function(e) {
                    callback(e);
                }).setTimeout(5000, function() {
                    callback("Timeout");
                });
            };
		});
		
		async.series(urls, function(err, results) {
			if(err) {
				response.statusCode = 500;
				response.end("Error while processing stats from WG servers.");
				return;
			}
			
			result = { 
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
                    var data = curResult.data,
                        summary = data.summary,
                        battlesCount = summary.battles_count,
                        tankLvl = { };

                    resultItem.name = data.name;
                    resultItem.battles = battlesCount;
                    resultItem.wins = summary.wins;

                    tankLvl.battle_count = 0;

                    var i;

                    for(i = 1; i <= 10; i++) {
                        tankLvl[i] = { battle_count: 0 };
                    }
                    data.vehicles.forEach(function(item) {
                        tankLvl[item.level].battle_count += item.battle_count;
                        tankLvl.battle_count += item.battle_count;
                    });

                    var mid = 0;

                    for(i = 1; i <= 10; i++) {
                        mid +=  i * tankLvl[i].battle_count / tankLvl.battle_count;
                    }
                    var effect = { };
                    if(battlesCount !== 0) {
                        var battles = data.battles;
                        effect.dmg = battles.damage_dealt / battlesCount;
                        effect.des = battles.frags / battlesCount;
                        effect.det = battles.spotted / battlesCount;
                        effect.cap = battles.capture_points / battlesCount;
                        effect.def = battles.dropped_capture_points / battlesCount;
                        resultItem.eff = Math.round((effect.dmg * (10 / mid) * (0.15 + mid / 50) + effect.des * (0.35 - mid / 50)
                                                    * 1000 + effect.det * 200 + effect.cap * 150 + effect.def * 150) / 10, 0) * 10;
                    } else {
                        resultItem.eff = 0;
                    }
                } else {
                    resultItem.eff = "X";
                    resultItem.win = "X";
                }
                resultItem.date = now;
                result.players.push(resultItem);
		    });
			
			db.open((function(updates) {
				return function(error, client) {
					if(error) {
                        response.statusCode = 500;
                        response.end("wrong request");
                        return;
                    }
					
					var collection = new mongo.Collection(client, collectionName);
					
					updates.forEach(function(player) {
                        if(player.eff !== "X")
						    collection.update({ id: player.id }, player, { upsert: true });
					});
				};
			})(result.players));
			
            inCache.forEach(function(player) {
				result.players.push(player);
			});
			
			response.end(JSON.stringify(result));
		});
	};
	
	if(query && query.match(/^\d(\d|,)+\d$/)) {
		var parts = query.split(",");
		parts.forEach(function(part) {
			ids.push(parseInt(part));
		});
	} else {
		response.statusCode = 500;
		response.end("wrong request");
        console.log("wrong request");
		return;
	}
	
	db.open(function(error, client) {
		if(error) {
			response.statusCode = 500;
			response.end("DB connection error");
            console.log("DB connection error 2");
			return;
		}
			
		var collection = new mongo.Collection(client, collectionName),
			checks = [ ],
            now = new Date();

        ids.forEach(function(id) {
			checks.push(function(callback) {
                collection.find({ id: id }, { limit: 1 }).toArray(function(error, docs) {
                    if(error) {
                        callback(error);
                        return;
                    }
                    // TODO check if exception possible
                    if(docs.length && (now - docs[0].date) < cacheTtl)
                        inCache.push(docs[0]);
                    else
                        forUpdate.push(id);

                    callback(null);
                });
            });
		});
		
		async.series(checks, function(error, results) {
            if(error) {
                response.statusCode = 500;
                response.end("DB connection error");
                console.log("DB connection error 3");
                return;
            }
			processRemotes();
		});
	});
	
}).listen(1337, "127.0.0.1");

console.log('Server running at http://127.0.0.1:1337/');