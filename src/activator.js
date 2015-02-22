var path = require('path');
var fs = require('fs');
var http = require('http');
var pkg = require('../package.json');
var Tomcat = require('./Tomcat.js');
var util = require('attrs.util');
var chalk = require('chalk');
var TomcatError = util.createErrorType('TomcatError');

var tomcatrouter = function(options) {
	options = options || {};
	return function tomcat(req, res, next) {
		if( !req.docbase || !fs.existsSync(req.docbase) ) return next();
		if( req.path.toLowerCase().indexOf('/web-inf/') === 0 ) return next();
		if( options.physicalonly && (!fs.statSync(req.docbase).isDirectory() || !fs.existsSync(path.join(req.docbase, req.path))) ) return next();
		
		var context = Tomcat.getContext(req.docbase) || Tomcat.createContext(req.docbase);
		var debug = req.app.debug;
		
		var exec = function() {
			var requestedcookie = (req.headers['cookie'] || '').split('JSESSIONID-' + context.name + '=').join('JSESSIONID=');
			util.forward({
				hostname: 'localhost',
				port: Tomcat.port,
				path: context.path + req.url,
				label: 'tomcat',
				poweredby: pkg.name + '@' + pkg.version,
				headers: {
					cookie: requestedcookie
				}
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
					
					util.debug('tomcat', status, request.method, 'http://localhost:' + Tomcat.port + context.path + req.url);
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
				/*
					TODO: context 를 바꿔 접속할 때마다 JSESSIONID 가 갱신되는 이슈..
					서로 다른 컨텍스트에서 Path=/ctx-n 으로 발급한 JSESSIONID 를 / 로 합치다보니.. 벌어지는 현상.
					서로 다른 컨텍스트에 접속할때 그 컨텍스트에서 발급한 JSESSIONID 를 다시 넣어서 해결해야 한다.
					
					tomcat 으로 부터 받은 쿠키를
					set-cookie:JSESSIONID=12EB32EAD1CAEDB7CE7FF9A0D267F36C; Path=/ctx-0/; HttpOnly
					
					client 에게 보낼때 다음과 같이 보낸다.
					set-cookie:JSESSIONID-CTX-0=12EB32EAD1CAEDB7CE7FF9A0D267F36C; Path=/; HttpOnly
					
					다음요청에서 client 에서 넘어온 쿠키
					Cookie: JSESSIONID-CTX-0=BBABDF7CE6C3C7ADCEB586DEDFA56724; JSESSIONID-CTX-1=...
				
					다시 tomcat 으로 보낼때
					Cookie: JSESSIONID=BBABDF7CE6C3C7ADCEB586DEDFA56724; JSESSIONID-CTX-1=...
				*/
				var cookies = response.headers['set-cookie'];
				if( typeof cookies === 'string' ) cookies = [cookies];
				if( cookies ) {
					var cookiearg = [];
					cookies.forEach(function(cookie) {
						cookie = cookie.split('Path=' + context.path).join('Path=')
						.split('JSESSIONID=').join('JSESSIONID-' + context.name + '=');
						cookiearg.push(cookie);
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
		var pref = ctx.preference || {};
		
		if( !pref ) {
			pref = ctx.application.preferences.set('plexi.tomcat', {
				env: {
					"JAVA_HOME": "",
					"JAVA_OPTS": "-server -Djava.awt.headless=true -XX:+UseConcMarkSweepGC -XX:MaxPermSize=64m -Xmx256m"
				},
				port: 29090
			});
			ctx.application.preferences.save();
		}
		
		Tomcat.clearContexts();
		
		Tomcat.env(pref.env || {});
		Tomcat.config(pref.config || {});
		if( pref.port ) Tomcat.port = pref.port;
				
		var contexts = pref.contexts;
		for(var k in contexts) {
			Tomcat.createContext(k, contexts[k]);
		}
		
		var httpService = ctx.require('plexi.http');
		httpService.filter('tomcat', {
			pattern: ['**/*.jsp', '/servlets/**', '**/*.jspx', '/WEB-INF/**', '**/*.servlet', '**/*.do'],
			filter: tomcatrouter(pref.router)
		});

		Tomcat.startup();
		Tomcat.router = tomcatrouter;
		return Tomcat;
	},
	stop: function(ctx) {
		Tomcat.shutdown();
	}
};