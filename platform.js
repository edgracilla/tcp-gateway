'use strict';

var inherits     = require('util').inherits,
	EventEmitter = require('events').EventEmitter;

function Platform() {
	if (!(this instanceof Platform)) {
		return new Platform();
	}

	var self = this;
	var _notifyExit = function () {
		process.send({
			type: 'exit'
		});
	};

	process.on('uncaughtException', function (error) {
		console.error('Uncaught Exception', error);
		self.handleException(error);
	});

	process.on('exit', function () {
		_notifyExit();
	});

	process.on('SIGTERM', function () {
		_notifyExit();
	});

	EventEmitter.call(this);
	Platform.init.call(this);
}

inherits(Platform, EventEmitter);

Platform.init = function () {
	var self = this;

	process.on('message', function (m) {
		if (m.type === 'ready')
			self.emit('ready', m.data.options);
		else if (m.type === 'message')
			self.emit('message', m.data.message);
	});
};

Platform.prototype.notifyListen = function () {
	process.send({
		type: 'listening'
	});
};

Platform.prototype.notifyConnection = function (serverAddress, clientAddress) {
	process.send({
		type: 'connection',
		data: {
			server: serverAddress,
			client: clientAddress,
		}
	});
};

Platform.prototype.notifyDisconnection = function (serverAddress, clientAddress) {
	process.send({
		type: 'disconnect',
		data: {
			server: serverAddress,
			client: clientAddress
		}
	});
};

Platform.prototype.notifyClose = function () {
	process.send({
		type: 'close'
	});
};

Platform.prototype.processData = function (serverAddress, clientAddress, data) {
	process.send({
		type: 'data',
		data: {
			server: serverAddress,
			client: clientAddress,
			data: data
		}
	});
};

Platform.prototype.log = function (title, description) {
	process.send({
		type: 'log',
		data: {
			title: title,
			description: description
		}
	});
};

Platform.prototype.handleException = function (error) {
	console.error(error);

	process.send({
		type: 'error',
		data: {
			name: error.name,
			message: error.message,
			stack: error.stack
		}
	});
};

module.exports = new Platform();
