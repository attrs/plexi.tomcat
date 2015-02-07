var path = require('path');
var fs = require('fs');
var exec = require('child_process').exec;
var xml2js = require('xml2js');

var rmdirRecursive = function(path, includeself) {
    var files = [];
    if( fs.existsSync(path) ) {
        files = fs.readdirSync(path);
        files.forEach(function(file,index){
            var curPath = path + "/" + file;
            if(fs.lstatSync(curPath).isDirectory()) { // recurse
                rmdirRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        if( includeself !== false ) fs.rmdirSync(path);
    }
};

var ENV = {}, PORT;
var startup = function() {
	var cwd = path.resolve(__dirname, '../apache-tomcat-8.0.15', 'bin');
	var command = path.resolve(cwd, 'startup.sh');
		
	exec(command, {cwd:cwd, env:ENV}, function(err, stdout, stderr) {
		if( err ) return console.error('[tomcat] start error', command, err);
		
		console.log('[tomcat] started', PORT, command);
	});
};

var shutdown = function() {
	var cwd = path.resolve(__dirname, '../apache-tomcat-8.0.15', 'bin');
	var command = path.resolve(cwd, 'shutdown.sh');
	
	console.log('[tomcat] try shutdown', command);
	exec(command, {cwd:cwd, env:ENV}, function (err, stdout, stderr) {
		if( err ) return console.error('[tomcat] start error', command, err);
		
		console.log('[tomcat] stopped', command);
	});
};

var contexts = {}, seq=0;
var contextdir = path.resolve(__dirname, '..', 'apache-tomcat-8.0.15', 'conf', 'Catalina', 'localhost');
var serverxml = path.resolve(__dirname, '..', 'apache-tomcat-8.0.15', 'conf', 'server.xml');

var createContext = function(docbase, options) {
	if( !docbase || typeof docbase !== 'string' ) return console.error('[tomcat] invalid docbase', docbase);
	if( contexts[docbase] ) return console.error('[tomcat] already exists docbase', docbase);
	
	options = options || {};
	options.docbase = docbase;
	options.name = options.name || 'ctx-' + (seq++);
	options.path = 'path' in options ? options.path : '/' + options.name;
	
	contexts[docbase] = options;
	
	var text = '<?xml version="1.0" encoding="utf-8"?>\n<Context path="' + options.path + '" docBase="' + docbase + '"></Context>';
	fs.writeFileSync(path.resolve(contextdir, options.name + '.xml'), text, {encoding:'utf8'});
	
	console.log('[tomcat] context created. [' + docbase + '"]');
	return options;
};

var getContext = function(docbase) {
	return contexts[docbase];
};

var removeContext = function(docbase) {
	var ctx = contexts[docbase];
	delete contexts[docbase];
	
	if( ctx ) fs.unlinkSync(contextdir, ctx.name + '.xml');
	console.log('[tomcat] context removed. [' + docbase + '"]');
	
	return ctx;
};

var clearContexts = function() {
	rmdirRecursive(contextdir, false);
	contexts = {};
};

/*
	config: {
		"appBase": "webapps",
		"autoDeploy": true,
		"unpackWARs": true,
		"log": {
			"directory": "logs",
			"prefix": "localhost_access_log",
			"suffix": ".txt",
			"pattern": "%h %l %u %t &quot;%r&quot; %s %b"
		}
	}
*/
var config = function(config) {
	new xml2js.Parser().parseString(fs.readFileSync(serverxml), function (err, result) {
		var host = result.Server.Service[0].Engine[0].Host[0];
		
		host.$.appBase = config.appBase ? path.resolve(process.cwd(), config.appBase) : 'webapps';
		host.$.autoDeploy = config.autoDeploy === false ? false : true;
		host.$.unpackWARs = config.unpackWARs === false ? false : true;
		
		var log = config.log || {};
		var valve = host.Valve[0].$ = {};
		valve.className = 'org.apache.catalina.valves.AccessLogValve';
		valve.directory = log.directory ? path.resolve(process.cwd(), log.directory) : 'logs';
		valve.prefix = log.prefix || 'localhost_access_log';
		valve.suffix = log.suffix || '.txt';
		valve.pattern = log.pattern || '%h %l %u %t &quot;%r&quot; %s %b';
		
		var xml = new xml2js.Builder().buildObject(result);
		fs.writeFileSync(serverxml, xml, {encoding:'utf8'});
    });
};

var changePort = function(port) {
	port = parseInt(port);
	if( !port || isNaN(port) || typeof port !== 'number' || port <= 0 ) return console.error('illegal port', port);
	
	var data = fs.readFileSync(serverxml);
	new xml2js.Parser().parseString(data, function (err, result) {
		result.Server.Service[0].Connector[0].$.port = port;
		
		var xml = new xml2js.Builder().buildObject(result);
		fs.writeFileSync(serverxml, xml, {encoding:'utf8'});
		
		PORT = port;
    });
};

// get port
new xml2js.Parser().parseString(fs.readFileSync(serverxml), function (err, result) {
	PORT = result.Server.Service[0].Connector[0].$.port;
});


module.exports = {
	env: function(key, value) {
		if( !arguments.length ) return ENV;
		if( arguments.length === 1 ) {
			if( typeof key === 'string' ) {
				return ENV[key];
			} else if( typeof key === 'object' ) {
				ENV = key;
			}
			return this;
		}
		
		if( typeof key !== 'string' ) return console.error('illegal env key', key);
		ENV[key] = value;		
		return this;
	},
	config: config,
	get port() {
		return PORT;
	},
	set port(port) {
		changePort(port); 
	},
	clearContexts: clearContexts,
	startup: startup,
	shutdown: shutdown,
	createContext: createContext,
	getContext: getContext,
	removeContext: removeContext,
	contexts: contexts
};