#!/usr/bin/env node

'use strict';

var pkg = require('../package.json');

process.title = pkg.name;

require('../src/Tomcat.js').startup();
