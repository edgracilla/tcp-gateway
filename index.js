'use strict';

var _             = require('lodash'),
	host          = require('ip').address(),
	StringDecoder = require('string_decoder').StringDecoder,
	decoder       = new StringDecoder('utf8');

exports.init = function (options, imports) {
	var taskQueue = imports.taskQueue;
	var messageQueue = imports.messageQueue;

	var serverAddress = host + '' + options.port;
	var server = require('./server')(options.port, host, {
		_keepaliveTimeout: 3600000
	});

	server.on('ready', function () {

		console.log('TCP Server now listening on '.concat(host).concat(':').concat(options.port));
		process.send({
			type: 'listening'
		});

	});

	server.on('client_on', function (client) {

		server.send(client, 'CONNACK');

		process.send({
			type: 'connection',
			client: client
		});

	});

	server.on('client_off', function (client) {

		process.send({
			type: 'disconnect',
			client: client
		});
	});

	server.on('data', function (client, rawData) {
		var data = decoder.write(rawData);
		var payload = {
			server: serverAddress,
			client: client,
			data: data
		};

		taskQueue.send(payload);

		process.send({
			type: 'log',
			data: data
		});
	});

	server.on('error', function (error) {

		process.send({
			type: 'error',
			error: error
		});
	});

	server.on('close', function () {

		process.send({
			type: 'close'
		});
	});

	server.on('SIGTERM', function() {

		process.send({
			type: 'SIGTERM'
		});
		process.exit();
	});

	server.on('uncaughtException', function() {

		process.send({
			type: 'uncaughtException'
		});

	});

	server.listen();

	messageQueue.subscribe(function (message) {
		if (message.server === serverAddress && _.contains(_.keys(server.getClients()), message.client)) {
			server.send(message.client, message.message);

			process.send({
				type: 'log',
				message: message.message
			});
		}
	});
};