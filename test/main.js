'use strict';

var cp   = require('child_process'),
	path = require('path');

var endpoint = cp.fork(path.join(process.cwd(), 'app.js'));

endpoint.send({
	type: 'ready',
	data: {
		options: {
			port: 15000
		}
	}
});