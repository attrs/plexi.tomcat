var path = require('path');
var fs = require('fs');
var http = require('http');
var pkg = require('../package.json');

var startup = function() {
	console.log('[tomcat] started');
};

var shutdown = function() {
	console.log('[tomcat] stopped');
};

var contexts = {}, seq=0;
var createContext = function(docbase, options) {
	if( !docbase || typeof docbase !== 'string' ) return console.error('[tomcat] invalid docbase', docbase);
	if( contexts[docbase] ) return console.error('[tomcat] already exists docbase', docbase);
	console.log('[tomcat] context created. [' + docbase + '"]');
	
	var name = 'ctx-' + (seq++);
	options = options || {};
	options.docbase = docbase;
	options.name = name;
	options.path = '/' + name;
	
	contexts[docbase] = options;
	return options;
};

var getContext = function(docbase) {
	return contexts[docbase];
};

var removeContext = function(docbase) {
	console.log('[tomcat] context removed. [' + docbase + '"]');
	return contexts[docbase];
};

module.exports = {
	start: function(ctx) {
		var options = ctx.preference;
		
		var contexts = options.contexts;
		for(var k in contexts) {
			createContext(k, contexts[k]);
		}
		
		startup();
		
		var httpService = ctx.require('plexi.http');
		httpService.filter('tomcat', {
			pattern: ['**/*.jsp', '/servlets/**', '**/*.jspx', '/WEB-INF/**'],
			filter: function(req, res, next) {
				if( !req.docbase ) return next(new Error('[tomcat] req.docbase required'));				
				if( req.path.toLowerCase().indexOf('/web-inf/') === 0 ) return res.sendStatus(404);
				
				var context = getContext(req.docbase);
				if( !context ) context = createContext(req.docbase);
				
				var clientcookie = [];
				for(var k in req.cookies) {
					clientcookie.push(k + '=' + req.cookies[k]);
				}
				
				var exec = function() {
					var request = http.request({
						hostname: 'localhost',
						port: 28080,
						path: context.path + req.url,
						method: req.method,
						headers: {
							Cookie: clientcookie.join('; ')
						}
					}, function(response) {
						//console.log('URL', context.path + req.url);
						//console.log('STATUS: ' + response.statusCode);
						//console.log('HEADERS: ' + JSON.stringify(response.headers));
						
						res.statusCode = response.statusCode;
						response.setEncoding('utf8');
						if( response.headers['content-type'] ) res.setHeader('Content-Type', response.headers['content-type']);
						
						//res.cookie('name', 'tobi', { domain: '.example.com', path: '/admin', secure: true })
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
		
		return {
			startup: function() {
				return startup;
			},
			shutdown: function() {
				return shutdown();
			},
			contexts: function() {
				return contexts;
			},
			createContext: function(docbase, options) {
				return createContext(docbase, options);
			},
			getContext: function(docbase) {
				return getContext(docbase);
			},
			removeContext: function(docbase) 
				return removeContext(docbase);
			}
		};
	},
	stop: function(ctx) {
		shutdown();
	}
};