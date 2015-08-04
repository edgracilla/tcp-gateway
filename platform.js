'use strict';

var inherits     = require('util').inherits,
	EventEmitter = require('events').EventEmitter;

function Platform() {
	if (!(this instanceof Platform)) {
		return new Platform();
	}

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

Platform.prototype.sendListeningState = function() {
	process.send({
		type: 'listening'
	});
};

Platform.prototype.sendConnection = function(clientAddress) {
	process.send({
		type: 'connection',
		data: clientAddress
	});
};

Platform.prototype.sendDisconnect = function(clientAddress) {
	process.send({
		type: 'disconnect',
		data: clientAddress
	});
};

Platform.prototype.sendData = function(serverAddress, client, data, dataType, size) {
	process.send({
		type: 'data',
		size: size,
		dataType: dataType,
		data: {
			server: serverAddress,
			client: client,
			data: data
		}
	});
};

Platform.prototype.sendLog = function(title, description) {
	process.send({
		type: 'log',
		data: {
			title: title,
			description: description
		}
	});
};

Platform.prototype.sendError = function(error) {
	process.send({
		type: 'error',
		data: {
			name: error.name,
			message: error.message,
			stack: error.stack
		}
	});
};

Platform.prototype.sendClose = function() {
	process.send({
		type: 'close'
	});
};

process.on('uncaughtException', function (error) {
	console.error('Uncaught Exception', error);
	process.send({
		type: 'error',
		data: {
			name: error.name,
			message: error.message,
			stack: error.stack
		}
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

module.exports = new Platform();