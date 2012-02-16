var http = require('http'),
	querystring = require('querystring'),
	url = require('url');
	async = require('async');

http.createServer(function(request, response) {
	//res.writeHead(200, {'Content-Type': 'text/plain'});
	var query = url.parse(request.url).query,
		ids = [ ],
		urls = { }
		result = { };
	
	if(query)
		ids = query.split(",");
		
	var idsCache = [ ];
	var idsUpdate = ids;
		
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
			
		result = { };
			
		idsUpdate.forEach(function(id) {
			var curResult = results[id];
			
			if(!curResult)
				return;
			//console.log(curResult.data.summary.wins)
			result[id] = { };
			
			if(curResult.status === "ok" && curResult.status_code === "NO_ERROR") {
                var data = curResult.data,
					summary = data.summary,
					battlesCount = summary.battles_count,
					tankLvl = { };
                
                result[id].name = data.name;
                if(battlesCount !== 0) {
                    result[id].win = Math.round(summary.wins * 100 / battlesCount, 0);
                } else {
                    result[id].win = 0;
                }
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
                    result[id].eff = Math.round((effect.dmg * (10 / mid) * (0.15 + mid / 50) + effect.des * (0.35 - mid / 50)
                                                * 1000 + effect.det * 200 + effect.cap * 150 + effect.def * 150) / 10, 0) * 10;
                } else {
                    result[id].eff = 0;
                }
            } else {
                result[id].eff = "X";
                result[id].win = "X";
            }
		});
		
		//console.log(result);
		response.end(JSON.stringify(result));
	});
	
	//response.end(ids.join(","));
	//res.end(querystring.stringify(urls));
}).listen(1337, "127.0.0.1");

console.log('Server running at http://127.0.0.1:1337/');