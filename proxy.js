var http = require("http"),
	url = require("url"),
	async = require("async"),
	mongo = require("mongodb"),
	dbName = "test",
	collectionName = "test_collection",
    cacheTtl = 7 * 24 * 60 * 60 * 1000; // 7 days

http.createServer(function(request, response) {
	var query = url.parse(request.url).query,
		db = new mongo.Db(dbName, new mongo.Server("127.0.0.1", 27017, { })),
		ids = { },
		result = { };
	
	var idsCache = { },
		idsUpdate = ids;
	
	var processRemotes = function() {
		var urls = { };
		
		for(var id in idsUpdate) {
			if(idsUpdate[id]) {
				urls[idsUpdate[id]] = (function(id) {
					return function(callback) {
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
						});
					};
				})(id);
			}
		}
		
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
			
			for(var id in idsUpdate) {
				if(idsUpdate[id]) {
					var curResult = results[id],
						resultItem = { id: idsUpdate[id] };
					
					if(curResult && curResult.status === "ok" && curResult.status_code === "NO_ERROR") {
						var data = curResult.data,
							summary = data.summary,
							battlesCount = summary.battles_count,
							tankLvl = { };
						
						resultItem.name = data.name;
						resultItem.battles = battlesCount;
						resultItem.wins = summary.wins;
						
						tankLvl.battle_count = 0;
						for(var i = 1; i <= 10; i++) {
							tankLvl[i] = { battle_count: 0 };
						}
						data.vehicles.forEach(function(item) {
							tankLvl[item.level].battle_count += item.battle_count;
							tankLvl.battle_count += item.battle_count;
						});
						
						var mid = 0;
						
						for(var i = 1; i <= 10; i++) {
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
                    resultItem.date = new Date();
					result.players.push(resultItem);
				}
			}
			
			db.open((function(updates) {
				return function(error, client) {
					if(error)
						throw error;
					
					var collection = new mongo.Collection(client, collectionName);
					
					updates.forEach(function(player) {
                        if(player.eff !== "X")
						    collection.update({ id: player.id }, player, { upsert: true });
					});
				};
			})(result.players));
			
			for(var id in idsCache) {
				result.players.push(idsCache[id]);
			}
			
			response.end(JSON.stringify(result));
		});
	};
	
	if(query && query.match(/^\d(\d|,)+\d$/)) {
		var parts = query.split(",");
		parts.forEach(function(part) {
			ids[part]=parseInt(part);
		});
	} else {
		response.statusCode = 500;
		response.end("wrong request");
		return;
	}
	
	db.open(function(error, client) {
		if(error) {
			response.statusCode = 500;
			response.end("DB connection error");
			return;
		}
			
		var collection = new mongo.Collection(client, collectionName),
			checks = [ ];
			
		for(var id in ids) {
			checks.push((function(id) {
				return function(callback) {
                    var now = new Date();
					collection.find({ id: ids[id] }, { limit: 1 }).toArray(function(err, docs) {
                        // TODO try no hashs. Just 2 arrays: inCache[], forUpdate[].
						if(docs.length && (now - docs[0].date) < cacheTtl) {
							idsCache[id] = docs[0];
							idsUpdate[id] = undefined;
						}
						callback(null);
					});
				};
			})(id));
		}
		
		async.series(checks, function(err, results) {
			processRemotes();
		});
	});
	
}).listen(1337, "127.0.0.1");

console.log('Server running at http://127.0.0.1:1337/');