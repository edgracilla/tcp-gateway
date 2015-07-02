'use strict';

var inherits     = require('util').inherits,
	EventEmitter = require('events').EventEmitter;

function Core() {
	if (!(this instanceof Core)) {
		return new Core();
	}

	EventEmitter.call(this);
	Core.init.call(this);
}

inherits(Core, EventEmitter);

Core.init = function () {
	var self = this;

	process.on('message', function (event, data) {
		if (event === 'ready')
			self.emit('ready', data.options, data.imports);
	});
};

process.on('uncaughtException', function (error) {
	process.send({
		type: 'error',
		data: error
	});
});

process.on('exit', function () {
	process.send({
		type: 'exit'
	});
});

process.on('SIGTERM', function () {
	process.send({
		type: 'terminate'
	});
});

process.on('SIGKILL', function () {
	process.send({
		type: 'kill'
	});
});

module.exports = Core;