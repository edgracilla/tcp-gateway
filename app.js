'use strict';

var _             = require('lodash'),
	host          = require('ip').address(),
	StringDecoder = require('string_decoder').StringDecoder,
	decoder       = new StringDecoder('utf8'),
	core          = require('./core')();

core.on('ready', function (options) {
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
			data: client
		});
	});

	server.on('client_off', function (client) {
		process.send({
			type: 'disconnect',
			data: client
		});
	});

	server.on('data', function (client, rawData) {
		var data = decoder.write(rawData);

		process.send({
			type: 'data',
			data: {
				server: serverAddress,
				client: client,
				data: data
			}
		});

		process.send({
			type: 'log',
			data: {
				title: 'Raw Data Received',
				description: data
			}
		});
	});

	server.on('error', function (error) {
		console.error('Server Error', error);
		process.send({
			type: 'error',
			data: {
				name: error.name,
				message: error.message,
				stack: error.stack
			}
		});
	});

	server.on('close', function () {
		process.send({
			type: 'close'
		});
	});

	server.listen();

	process.on('message', function (m) {
		if (m.type === 'message' && m.data.message) {
			var message = m.data.message;

			if (message.server === serverAddress && _.contains(_.keys(server.getClients()), message.client)) {
				server.send(message.client, message.message, false, function (error) {
					if (error) {
						console.log('Message Error', error);
						process.send({
							type: 'error',
							data: {
								name: error.name,
								message: error.message,
								stack: error.stack
							}
						});
					}
					else {
						process.send({
							type: 'log',
							data: {
								title: 'Message Sent',
								description: message.message
							}
						});
					}
				});
			}
		}
	});
});