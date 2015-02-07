var path = require('path');
var fs = require('fs');
var http = require('http');
var pkg = require('../package.json');
var Tomcat = require('./Tomcat.js');
var TomcatError = require('./TomcatError.js');

var tomcatrouter = function(options) {
	return function tomcat(req, res, next) {
		if( !req.docbase || !fs.existsSync(req.docbase) || !fs.statSync(req.docbase).isDirectory() || !fs.existsSync(path.join(req.docbase, req.path)) ) return next();
		if( req.path.toLowerCase().indexOf('/web-inf/') === 0 ) return next();
		
		var context = Tomcat.getContext(req.docbase) || Tomcat.createContext(req.docbase);
	
		var exec = function() {
			/*
				TODO: context 를 바꿔 접속할 때마다 JSESSIONID 가 갱신되는 이슈..
				서로 다른 컨텍스트에서 Path=/ctx-n 으로 발급한 JSESSIONID 를 / 로 합치다보니.. 벌어지는 현상.
				서로 다른 컨텍스트에 접속할때 그 컨텍스트에서 발급한 JSESSIONID 를 다시 넣어서 해결해야 한다.
			*/
			var request = http.request({
				hostname: 'localhost',
				port: Tomcat.port,
				path: context.path + req.url,
				method: req.method,
				headers: req.headers
			}, function(response) {
				console.log('STATUS: ' + response.statusCode);
				//console.log('HEADERS: ' + JSON.stringify(response.headers));
				if( response.statusCode === 404 ) {
					return next();
				} else if( response.statusCode === 500 ) {
					var payload = '';
					response.on('data', function (chunk) {
						payload += chunk;
					});

					response.on('end', function () {
						next(new TomcatError(payload || 'unknown'));
					});
					return;
				}
				
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
			
				response.on('data', function (chunk) {
					res.write(chunk);
				});

				response.on('end', function () {
					res.end();
				});
			});

			request.on('error', function(err) {
				next(err);
			});
		
			req.pipe(request, {end:true});
		};
	
		exec();
	};
};

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
			filter: tomcatrouter()
		});

		Tomcat.startup();
		Tomcat.router = tomcatrouter;
		return Tomcat;
	},
	stop: function(ctx) {
		Tomcat.shutdown();
	}
};