var path = require('path');
var fs = require('fs');
var http = require('http');
var pkg = require('../package.json');
var Tomcat = require('./Tomcat.js');

module.exports = {
	start: function(ctx) {
		var options = ctx.preference;
		
		Tomcat.clearContexts();
		
		Tomcat.env(options.env || {});
		Tomcat.config(options.config || {});
		if( options.port ) Tomcat.port = options.port;
				
		var contexts = options.contexts;
		for(var k in contexts) {
			Tomcat.createContext(k, contexts[k]);
		}
		
		var httpService = ctx.require('plexi.http');
		httpService.filter('tomcat', {
			pattern: ['**/*.jsp', '/servlets/**', '**/*.jspx', '/WEB-INF/**', '**/*.servlet', '**/*.do'],
			filter: function(req, res, next) {
				if( !req.docbase ) return next(new Error('[tomcat] req.docbase required'));				
				if( req.path.toLowerCase().indexOf('/web-inf/') === 0 ) return res.sendStatus(404);
				
				var context = Tomcat.getContext(req.docbase) || Tomcat.createContext(req.docbase);
				
				var exec = function() {
					var request = http.request({
						hostname: 'localhost',
						port: Tomcat.port,
						path: context.path + req.url,
						method: req.method,
						headers: req.headers
					}, function(response) {
						//console.log('URL', context.path + req.url);
						//console.log('STATUS: ' + response.statusCode);
						//console.log('HEADERS: ' + JSON.stringify(response.headers));
						
						res.statusCode = response.statusCode;
						response.setEncoding('utf8');
						res.headers = response.headers;
						for(var k in response.headers) {
							res.setHeader(k, response.headers[k]);
						}
						
						// cookie proxy
						var cookies = response.headers['set-cookie'];
						if( typeof cookies === 'string' ) cookies = [cookies];
						if( cookies ) {
							var cookiearg = [];
							cookies.forEach(function(cookie) {
								cookiearg.push(cookie.split('Path=' + context.path).join('Path='));
							});
							res.setHeader('Set-Cookie', cookiearg);
						}
						
						var poweredby = (response.headers['x-powered-by'] || '').split(',');
						poweredby.push(res.getHeader('X-Powered-By') || 'plexi');
						poweredby.push(pkg.name + '@' + pkg.version);
						res.setHeader('X-Powered-By', poweredby.join(', '));
						
						var payload = '';
						response.on('data', function (chunk) {
							payload += chunk;
						});

						response.on('end', function () {
							res.send(payload);
						});
					});

					request.on('error', function(err) {
						next(err);
					});
					request.end();
				};
				
				exec();
			}
		});

		Tomcat.startup();
		return Tomcat;
	},
	stop: function(ctx) {
		Tomcat.shutdown();
	}
};