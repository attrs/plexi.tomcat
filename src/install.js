#!/usr/bin/env node

var path = require('path');
var fs = require('fs');
var http = require('http');
var chalk = require('chalk');
var ini = require('ini');
var osenv = require("osenv");
var inquirer = require("inquirer");

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
				if( fs.existsSync(value) ) return true;
			}
		}, {
			type: "list",
			name: "version",
			message: "Tomcat Version",
			choices: [ "6.0.43", "7.0.59", "8.0.18" ],
			filter: function(value) {
				return value[0];
			}
		}
	], function( answers ) {
		var url;
		var version = answers.version;

		if( version === '6' ) {
		} else if() {
		}

		console.dir(answers);

		return true;


		var url = geturl(version);
		var filename = url.substring(url.lastIndexOf('/') + 1);

		// check cache, if file exists in cache, use it
		var userhome = osenv.home();
		var cachedir = path.resolve(userhome, '.plexi.wordpress');
		var cachefile = path.resolve(cachedir, filename);
		var dest = path.resolve(__dirname, '..', 'wordpress');
		if( !fs.existsSync(cachedir) ) {
			try {
				fs.mkdirSync(cachedir);
			} catch(err) {
				cachedir = path.resolve(__dirname, '..', 'download');
				cachefile = path.resolve(cachedir, filename);
			}
		}

		if( !fs.existsSync(cachefile) ) {
			new Download({ extract: true, strip: 1, mode: '755' })
				.get(url)
				.dest(cachefile)
				.use(function(instance, url) {
					process.stdout.write(chalk.green('Download\n'));
				})
				.use(progress())
				.run(function (err, files, stream) {
					if (err) {
						process.stdout.write(chalk.red('Error\n'));
						console.log(chalk.red(err));
						return task_install();
					}
					install();
				}
			);
		}
	});
};

start();



function geturl(version) {
	/*
	http://apache.mirror.cdnetworks.com/tomcat/tomcat-6/v6.0.43/bin/apache-tomcat-6.0.43.tar.gz
	http://apache.mirror.cdnetworks.com/tomcat/tomcat-7/v7.0.59/bin/apache-tomcat-7.0.59.tar.gz
	http://apache.mirror.cdnetworks.com/tomcat/tomcat-8/v8.0.18/bin/apache-tomcat-8.0.18.tar.gz
	*/
	return (!version || version === 'latest') ? 'http://wordpress.org/latest.tar.gz' : 'http://wordpress.org/wordpress-' + version + '.tar.gz';
}

var task_install = function () {
	process.stdin.resume();
	process.stdout.write(chalk.yellow('tomcat version: ') + '' + chalk.gray('(8) '));
	
	process.stdin.once('data', function(inputVersion) {
		process.stdin.pause();	
		inputVersion = inputVersion.replace(/[\n\r]/g, ' ').trim() || 'latest';
		var version = inputVersion;

		var download = function() {
			var url = geturl(version);
			var filename = url.substring(url.lastIndexOf('/') + 1);
			process.stdout.write(chalk.green('checking version: ' + version + ' (' + url + ') ... '));
	
			// check cache, if file exists in cache, use it
			var userhome = osenv.home();
			var cachedir = path.resolve(userhome, '.plexi.wordpress');
			var cachefile = path.resolve(cachedir, filename);
			var dest = path.resolve(__dirname, '..', 'wordpress');
			if( !fs.existsSync(cachedir) ) {
				try {
					fs.mkdirSync(cachedir);
				} catch(err) {
					cachedir = path.resolve(__dirname, '..', 'download');
					cachefile = path.resolve(cachedir, filename);
				}
			}
	
			var install = function() {		
				if( fs.existsSync(dest) ) rmdirRecursive(dest);
		
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
			}
	
			if( !fs.existsSync(cachefile) ) {
				new Download({ extract: true, strip: 1, mode: '755' })
				    .get(url)
				    .dest(cachefile)
					.use(function(instance, url) {
						process.stdout.write(chalk.green('Download\n'));
					})
					.use(progress())
					.run(function (err, files, stream) {
					    if (err) {
							process.stdout.write(chalk.red('Error\n'));
							console.log(chalk.red(err));
					    	return task_install();
					    }
						install();
					}
				);
			} else {
				process.stdout.write(chalk.green('From Cache\n'));
				install();
			}
		};
		download();
	});
};

var task_javalocation = function () {
	process.stdin.resume();
	process.stdout.write(chalk.yellow('java home: ') + '' + chalk.gray('(default) '));
	
	process.stdin.once('data', function(location) {
		process.stdin.pause();	
		location = location.replace(/[\n\r]/g, ' ').trim();		
		
		if(	phplocation ) {
			var config = {JAVA_HOME: location};
			fs.writeFileSync(path.resolve(__dirname, '..', 'config.ini'), ini.stringify(config))
		}
	});
};

//process.stdin.setEncoding('utf-8');
//task_install();
//task_javalocation();