#!/usr/bin/env node

'use strict';

var pkg = require('../package.json');
var path = require('path');
var fs = require('fs');
var argv = require('attrs.util').argv();
var Tomcat = require('../src/Tomcat.js');
var Tail = require('tail').Tail;

process.title = pkg.name;

console.log('argv', argv);

var appbase = argv.appbase ? path.resolve(process.cwd(), argv.appbase) : null;
var docbase = argv.docbase ? path.resolve(process.cwd(), argv.docbase) : null;
var logdir = argv.logdir ? path.resolve(process.cwd(), argv.logdir) : null;

/*function starttail() {
	var file = path.resolve(__dirname, '..', 'tomcat', 'logs', 'catalina.out');
	
	if( !fs.existsSync(file) ) {
		setTimeout(function() {
			starttail();
		}, 250);
		return;
	}
	
	var tail = new Tail(file);
	tail.on("line", function(line) {
	  console.log(line);
	});

	tail.on("error", function(error) {
	  console.log('ERROR: ', error);
	});
}*/

if( 'stop' in argv || 'shutdown' in argv ) {
	Tomcat.shutdown();
} else {
	Tomcat.port = argv.port || 8080;
	Tomcat.config({
		"appBase": appbase
	});
	
	if( docbase ) {
		Tomcat.createContext(docbase, {
			name: 'ROOT',
			path: '/'
		});
	} else {
		Tomcat.clearContexts();
	}
	
	console.log('port', Tomcat.port);
	console.log('appbase', appbase || '(default)');
	console.log('docbase', docbase || '(default)');
	console.log('logdir', logdir || '(default)');
	
	Tomcat.startup();
}
