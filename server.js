'use strict';

var net          = require('net'),
	inherits     = require('util').inherits,
	EventEmitter = require('events').EventEmitter;

function Server(options) {
	if (!(this instanceof Server)) {
		return new Server(options);
	}

	EventEmitter.call(this);
	Server.init.call(this, options);
}

inherits(Server, EventEmitter);

Server.init = function (options) {
	options = options || {};
	var self = this;

	self._clients = {};
	self._timeout = options.timeout || 3600000;
	self._keepalive = options.keepalive || true;

	var handler = function (client) {
		var clientAddress = client.remoteAddress + ':' + client.remotePort;

		client.setKeepAlive(self._keepalive);
		client.setTimeout(self._timeout);

		if (options && options.readEncoding)
			client.setEncoding(options.readEncoding);

		var data = function (_data) {
			self.emit('data', clientAddress, _data);
		};

		var timeout = function () {
			client.destroy();
		};

		var error = function (err, client, _data) {
			self.emit('client_error', err, client, _data);
		};

		var close = function () {
			delete self._clients[clientAddress];
			self.emit('client_off', clientAddress);
		};

		process.nextTick(function register() {
			client.on('data', data);
			client.on('timeout', timeout);
			client.on('error', error);
			client.on('close', close);
		});
	};

	self._server = net.createServer(handler);

	var listening = function () {
		self.emit('ready');
	};

	var error = function (err) {
		self.emit('error', err);
	};

	var close = function () {
		self.emit('close');
	};

	var connection = function (socket) {
		self._clients[socket.remoteAddress + ':' + socket.remotePort] = socket;
		self.emit('client_on', socket.remoteAddress + ':' + socket.remotePort);
	};

	process.nextTick(function register() {
		self._server.on('listening', listening);
		self._server.on('connection', connection);
		self._server.on('close', close);
		self._server.on('error', error);
	}, this);
};

Server.prototype.listen = function (port, host) {
	if (!parseInt(port))
		throw new Error('Port is mandatory!');

	if (!host)
		throw new Error('Host is mandatory!');

	this._server.listen(port, host);
};

Server.prototype.close = function (callback) {
	callback = callback || function () {
		};

	this._server.close(callback);
};

Server.prototype.send = function (client, message, callback) {
	callback = callback || function () {
		};

	message = message || new Buffer([0x00]);

	if (!Buffer.isBuffer(message))
		message = new Buffer(message.toString() + '\r\n');

	if (this._clients[client])
		this._clients[client].write(message, callback);
	else
		callback(new Error('Client not found.'));
};

Server.prototype.getClients = function () {
	return this._clients;
};

module.exports = Server;