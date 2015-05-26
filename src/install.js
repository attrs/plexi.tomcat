#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');
var ini = require('ini');
var osenv = require("osenv");
var Download = require('download');
var progress = require('download-status');
var wrench = require('wrench');
var ProgressBar = require('progress');
var inquirer = require("inquirer");
var targz = require('tar.gz');

function start() {
	var detected_javahome = [];
	var needjavahome = false;
		
	if( process.platform.indexOf('win') === 0 && !(process.env['JAVA_HOME'] || process.env['JRE_HOME'])) {
		needjavahome = true;		
		[path.resolve(osenv.home(), '/Program Files', 'Java'), path.resolve(osenv.home(), '/Program Files (x86)', 'Java')].forEach(function(javadir) {
			if( fs.existsSync(javadir) ) {
				var files = fs.readdirSync(javadir);

				for(var i=0; i < files.length; i++) {
					var dirname = files[i];
					if( dirname.toLowerCase().indexOf('jdk') === 0 || dirname.toLowerCase().indexOf('jre') === 0 ) {					
						var dir = path.resolve(javadir, dirname);
						detected_javahome.push(dir);
					}				
				}
			}
		});
	}
	
	inquirer.prompt([
		{
			type: "list",
			name: "javahome",
			message: "Java Home",
			choices: detected_javahome.concat(["Input path directly"]),
			filter: function(value) {
				return ( value === 'Input path directly' ) ? '' : value;
			},
			when: function() {
				return needjavahome;
			}
		}, {
			type: "input",
			name: "javahome",
			message: "Java Home",
			when: function(value) {
				if( !value.javahome && needjavahome ) return true;
			},
			validate: function(value) {
				if( !value || fs.existsSync(value) ) return true;
			}
		}, {
			type: "list",
			name: "version",
			message: "Tomcat Version",
			choices: [ "8.0.18",  "7.0.59", "6.0.43"],
			filter: function(value) {
				return value[0];
			}
		}
	], function( answers ) {
		install(answers.version, function(err, dir) {
			if( err ) return console.error(chalk.red('[tomcat] install error'), err);
			
			fs.writeFileSync(path.resolve(__dirname, '..', 'config.ini'), ini.stringify(answers));			
			console.log('[tomcat] installed successfully "' + dir + '"');
		});
	});
};

var urls = {
	'6': 'http://archive.apache.org/dist/tomcat/tomcat-6/v6.0.44/bin/apache-tomcat-6.0.44.tar.gz',
	'7': 'http://archive.apache.org/dist/tomcat/tomcat-7/v7.0.62/bin/apache-tomcat-7.0.62.tar.gz',
	'8': 'http://archive.apache.org/dist/tomcat/tomcat-8/v8.0.22/bin/apache-tomcat-8.0.22.tar.gz',
};

function install(version, callback) {
	var url = urls[version];
	
	callback = (typeof callback === 'function') ? callback : function() {};
	
	if( !url ) return callback(new Error('illegal version:' + version));
	
	try {
		// check cache, if file exists in cache, use it
		var filename = url.substring(url.lastIndexOf('/') + 1);
		var userhome = osenv.home();
		var cachedir = path.resolve(userhome, '.plexi', 'tomcat');
		var cachefile = path.resolve(cachedir, filename);
		var dest = path.resolve(__dirname, '..', 'tomcat');
		if( !fs.existsSync(cachedir) ) {
			try {
				wrench.mkdirSyncRecursive(cachedir, 0777);
			} catch(err) {
				cachedir = path.resolve(__dirname, '..', 'download');
				cachefile = path.resolve(cachedir, filename);
				wrench.mkdirSyncRecursive(cachedir);
			}
		}

		var copy = function() {		
			if( fs.existsSync(dest) ) wrench.rmdirSyncRecursive(dest);

			var files = wrench.readdirSyncRecursive(cachefile);
			var total = files.length;
			var current = 0;

			var bar = new ProgressBar(chalk.cyan('   install') + ' : [:bar] :current/:total', {
				width: 20,
				total: total,
				callback: function() {
					console.log();
				}
			});

			wrench.copyDirSyncRecursive(cachefile, dest, {
				forceDelete: false,
				preserveFiles: true,
				filter: function() {
					bar.tick();
				}
			});
		
			callback(null, dest);
		};

		if( !fs.existsSync(cachefile) ) {
			new Download({ mode: '755' })
			    .get(url)
			    .dest(cachedir)
				.use(function(instance, url) {
					process.stdout.write(chalk.green('Download\n'));
				})
				.use(progress())
				.run(function (err, files, stream) {
				    if (err) {
						if( fs.existsSync(cachefile) ) fs.unlinkSync(cachefile);
						return callback(err);
					}
				
					new targz().extract(cachefile, cachedir, function(err){
					    if(err) {
							if( fs.existsSync(cachefile) ) fs.unlinkSync(cachefile);
							return callback(err);
						}
					
						var extracted = cachefile.substring(0, cachefile.toLowerCase().lastIndexOf('.tar.gz'));
						fs.unlinkSync(cachefile);
						fs.renameSync(extracted, cachefile);
					    copy();
					});
				});
		} else {
			process.stdout.write(chalk.green('Copy Files...\n'));
			copy();
		}		
	} catch(err) {
		return callback(err);
	}
}

start();