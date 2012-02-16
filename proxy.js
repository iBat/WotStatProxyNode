var http = require("http"),
	url = require("url"),
	async = require("async"),
	mongo = require("mongodb"),
	dbName = "test",
	collectionName = "test_collection";

http.createServer(function(request, response) {
	var query = url.parse(request.url).query,
		db = new mongo.Db(dbName, new mongo.Server("127.0.0.1", 27017, {})),
		ids = [ ],
		urls = { },
		result = { };
	// TODO correct quit if no queries
	if(query)
		ids = query.split(",");
		
	var idsCache = [ ],
		idsUpdate = ids;
	
	var processRemotes = function() {
		idsUpdate.forEach(function(id) {
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
				});
			};
		});
		
		async.series(urls, function(err, results) {
			if(err)
				return;
				
			result = { players: [ ] };
				
			idsUpdate.forEach(function(id) {
				var curResult = results[id];
				
				if(!curResult)
					return;
				
				resultItem = { id: parseInt(id) };
				// TODO default response on all errors
				if(curResult.status === "ok" && curResult.status_code === "NO_ERROR") {
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
				result.players.push(resultItem);
			});
			
			db.open(function(error, client) {
				if(error)
					throw error;
				
				var collection = new mongo.Collection(client, collectionName);
				
				result.players.forEach(function(player) {
					collection.update({ id: player.id }, player, { upsert: true });
				});
			});
			
			response.end(JSON.stringify(result));
		});
	};
	
	db.open(function(error, client) {
		if(error)
			throw error;
			
		var collection = new mongo.Collection(client, collectionName),
			checks = [ ];
		ids.forEach(function(id) {
			checks.push(function() {
				collection.find({ id: parseInt(id) }, { limit: 1 }).toArray(function(err, docs) {
					if(docs.length) {
						idsCache.push(docs);
						idsUpdate.splice(id, 1);
					}
				});
			});
		});
		// TODO parallel?
		async.series(checks, function(err, results) {
			console.log(idsCache);
			console.log(idsUpdate);
			console.log("----------------------");
			processRemotes();
		});
	});
	
}).listen(1337, "127.0.0.1");

console.log('Server running at http://127.0.0.1:1337/');