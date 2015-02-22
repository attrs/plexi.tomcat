var path = require('path');
var fs = require('fs');
var spawn = require('child_process').spawn;
var xml2js = require('xml2js');
var util = require('attrs.util');
var wrench = require('wrench');

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

var ENV = {}, PORT, tomcat_process;
var startup = function() {
	var cwd = path.resolve(__dirname, '../tomcat', 'bin');
	var command = path.resolve(cwd, 'catalina.sh');
	
	if( process.platform.indexOf('win') === 0 ) {
		command = path.resolve(cwd, 'catalina.bat');
	}
	
	if( tomcat_process ) {
		util.debug('tomcat', 'already started');
		return;
	}
	
	util.debug('tomcat', 'starting...', command);
	
	tomcat_process = spawn(command, ['run'], {
		encoding: 'utf8',
		cwd: cwd,
		env: ENV
	}).on('close', function (code, signal) {
		util.debug('tomcat', 'closed', code, signal);
		tomcat_process = null;
	}).on('error', function(err) {
		util.error('tomcat', 'tomcat_process error', err);
	});
	
	tomcat_process.stdout.setEncoding('utf8');
	tomcat_process.stderr.setEncoding('utf8');
	tomcat_process.stdout.on('data', function(data) {
		console.log(data);
	});
	tomcat_process.stderr.on('data', function (data) {
		console.error(data);
	});
};

var shutdown = function() {
	if( tomcat_process ) tomcat_process.kill();
};

var contexts = {}, seq=0;
var contextdir = path.resolve(__dirname, '..', 'tomcat', 'conf', 'Catalina', 'localhost');
var serverxml = path.resolve(__dirname, '..', 'tomcat', 'conf', 'server.xml');

if( !fs.existsSync(contextdir) ) {
	wrench.mkdirSyncRecursive(contextdir, 0777);
}

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
		
		host.$.appBase = config.appBase ? path.resolve(tomcat_process.cwd(), config.appBase) : 'webapps';
		host.$.autoDeploy = config.autoDeploy === false ? false : true;
		host.$.unpackWARs = config.unpackWARs === false ? false : true;
				
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