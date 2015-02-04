#!/usr/bin/env node

'use strict';

var pkg = require('../package.json');
var path = require('path');
var argv = require('attrs.argv');
var Tomcat = require('../src/Tomcat.js');
var Tail = require('tail').Tail;

process.title = pkg.name;

var appbase = argv.appbase ? path.resolve(process.cwd(), argv.appbase) : null;
var docbase = argv.docbase ? path.resolve(process.cwd(), argv.docbase) : null;
var logdir = argv.logdir ? path.resolve(process.cwd(), argv.logdir) : null;

if( 'stop' in argv || 'shutdown' in argv ) {
	Tomcat.shutdown();
} else {
	Tomcat.port = argv.port || 8080;
	Tomcat.config({
		"appBase": appbase,
		"log": {
			"directory": logdir
		}
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
	
	Tomcat.shutdown();
	Tomcat.startup();
	
	var tail = new Tail(path.resolve(__dirname, '..', 'apache-tomcat-8.0.15', 'logs', 'catalina.out'));
	tail.on("line", function(line) {
	  console.log(line);
	});
 
	tail.on("error", function(error) {
	  console.log('ERROR: ', error);
	});
}
