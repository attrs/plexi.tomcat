var path = require('path');
var fs = require('fs');
var http = require('http');
var pkg = require('../package.json');
var Tomcat = require('./Tomcat.js');
var util = require('./util.js');
var chalk = require('chalk');
var TomcatError = util.createErrorType('TomcatError');

var tomcatrouter = function(options) {
	return function tomcat(req, res, next) {
		if( !req.docbase || !fs.existsSync(req.docbase) || !fs.statSync(req.docbase).isDirectory() || !fs.existsSync(path.join(req.docbase, req.path)) ) return next();
		if( req.path.toLowerCase().indexOf('/web-inf/') === 0 ) return next();
		
		var context = Tomcat.getContext(req.docbase) || Tomcat.createContext(req.docbase);
		var debug = req.app.debug;
		
		var exec = function() {
			/*
				TODO: context 를 바꿔 접속할 때마다 JSESSIONID 가 갱신되는 이슈..
				서로 다른 컨텍스트에서 Path=/ctx-n 으로 발급한 JSESSIONID 를 / 로 합치다보니.. 벌어지는 현상.
				서로 다른 컨텍스트에 접속할때 그 컨텍스트에서 발급한 JSESSIONID 를 다시 넣어서 해결해야 한다.
			*/			
			util.forward({
				hostname: 'localhost',
				port: Tomcat.port,
				path: context.path + req.url,
				label: 'tomcat',
				poweredby: pkg.name + '@' + pkg.version
			}, req, res)
			.on('error', function(err, request) {
				if( debug ) util.debug(pkg.name, 'error', '://' + request.hostname + ':' + request.port + request.path);
				next(err);
			})
			.on('notfound', function(err, request, response) {
				next();
			})
			.on('errorstatus', function(err, request, response) {
				next(err);
			})
			.on('response', function(request, response) {
				if( debug ) {
					var status = response.statusCode;
					if( response.statusCode >= 400 ) status = chalk.red(status);
					else status = chalk.green(status);
					
					util.debug('tomcat', status, request.method, '://localhost:' + Tomcat.port + context.path + req.url);
					if( debug === 'detail' ) {
						util.debug(pkg.name, 'request', {
							hostname: request.hostname,
							path: request.path,
							method: req.method,
							port: request.port,
							headers: request.headers
						});
						util.debug('php', 'response', response.headers);
					}
				}
			})
			.on('success', function(request, response) {				
				// change cookie path
				var cookies = response.headers['set-cookie'];
				if( typeof cookies === 'string' ) cookies = [cookies];
				if( cookies ) {
					var cookiearg = [];
					cookies.forEach(function(cookie) {
						cookiearg.push(cookie.split('Path=' + context.path).join('Path='));
					});
					res.setHeader('Set-Cookie', cookiearg);
				}
			});
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