'use strict';

var inherits     = require('util').inherits,
	EventEmitter = require('events').EventEmitter;

var isString = function (val) {
	return typeof val === 'string' || ((!!val && typeof val === 'object') && Object.prototype.toString.call(val) === '[object String]');
};

function Platform() {
	if (!(this instanceof Platform)) return new Platform();

	var self = this;

	process.on('uncaughtException', function (error) {
		console.error(error);
		self.handleException(error);
		process.exit(1);
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

Platform.prototype.notifyReady = function (callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		process.send({
			type: 'ready'
		});

		callback();
	});
};

Platform.prototype.notifyConnection = function (clientAddress, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!clientAddress || !isString(clientAddress)) return callback(new Error('A valid client IP address is required.'));

		process.send({
			type: 'connection',
			data: clientAddress
		});

		callback();
	});
};

Platform.prototype.notifyDisconnection = function (clientAddress, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!clientAddress || !isString(clientAddress)) return callback(new Error('A valid client IP address is required.'));

		process.send({
			type: 'disconnect',
			data: clientAddress
		});

		callback();
	});
};

Platform.prototype.notifyClose = function (callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		process.send({
			type: 'close'
		});

		callback();
	});
};

Platform.prototype.processData = function (clientAddress, data, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!clientAddress || !isString(clientAddress)) return callback(new Error('A valid client IP address is required.'));
		if (!data || !isString(data)) return callback(new Error('A valid data is required.'));

		process.send({
			type: 'data',
			data: {
				client: clientAddress,
				data: data
			}
		});

		callback();
	});
};

Platform.prototype.sendMessageResponse = function (messageId, response, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!messageId || !isString(messageId)) return callback(new Error('A valid message id is required.'));
		if (!response || !isString(response)) return callback(new Error('A valid response is required.'));

		process.send({
			type: 'response',
			data: {
				messageId: messageId,
				response: response
			}
		});

		callback();
	});
};

Platform.prototype.sendMessageToDevice = function (device, message, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!device || !isString(device)) return callback(new Error('A valid device id is required.'));
		if (!message || !isString(message)) return callback(new Error('A valid message is required.'));

		process.send({
			type: 'message',
			data: {
				device: device,
				message: message
			}
		});

		callback();
	});
};

Platform.prototype.sendMessageToGroup = function (group, message, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!group || !isString(group)) return callback(new Error('A valid group id is required.'));
		if (!message || !isString(message)) return callback(new Error('A valid message is required.'));

		process.send({
			type: 'message',
			data: {
				group: group,
				message: message
			}
		});

		callback();
	});
};

Platform.prototype.log = function (title, description, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!title || !isString(title)) return callback(new Error('A valid log title is required.'));

		process.send({
			type: 'log',
			data: {
				title: title,
				description: description
			}
		});

		callback();
	});
};

Platform.prototype.handleException = function (error, callback) {
	setImmediate(function () {
		callback = callback || function () {
			};

		if (!error) return callback(new Error('Error is required.'));

		console.error(error);

		process.send({
			type: 'error',
			data: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
	});
};

module.exports = new Platform();
