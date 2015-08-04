'use strict';

var DATA_TYPE = 'application/json';

var server, serverAddress,
	platform = require('./platform');

/*
 * Listen for the ready event.
 */
platform.on('ready', function (options) {
	var host          = require('ip').address(),
		StringDecoder = require('string_decoder').StringDecoder,
		decoder       = new StringDecoder('utf8'),
		safeParse = require('safe-json-parse/callback');

	serverAddress = host + '' + options.port;

	server = require('./server')(options.port, host, {
		_keepaliveTimeout: 3600000
	});

	server.on('ready', function () {
		console.log('TCP Server now listening on '.concat(host).concat(':').concat(options.port));
		platform.sendListeningState();
	});

	server.on('client_on', function (clientAddress) {
		server.send(clientAddress, 'CONNACK');
		platform.sendConnection(clientAddress);
	});

	server.on('client_off', function (clientAddress) {
		platform.sendDisconnect(clientAddress);
	});

	server.on('data', function (clientAddress, rawData, size) {
		var data = decoder.write(rawData);

		safeParse(data, function (error, result) {
			if (error)
				platform.sendError(error);
			else
				platform.sendData(serverAddress, clientAddress, result, DATA_TYPE, size);
		});

		platform.sendLog('Raw Data Received', data);
	});

	server.on('error', function (error) {
		console.error('Server Error', error);
		platform.sendError(error);
	});

	server.on('close', function () {
		platform.sendClose();
	});

	server.listen();
});

/*
 * Listen for the message event. Send these messages/commands to devices from this server.
 */
platform.on('message', function (message) {
	var _ = require('lodash');

	if (message.server === serverAddress && _.contains(_.keys(server.getClients()), message.client)) {
		server.send(message.client, message.message, false, function (error) {
			if (error) {
				console.log('Message Sending Error', error);
				platform.sendError(error);
			}
			else
				platform.sendLog('Message Sent', message.message);
		});
	}
	else if (message.client === '*') {
		server.getClients().forEach(function (client) {
			server.send(client, message.message, false, function (error) {
				if (error) {
					console.log('Message Sending Error', error);
					platform.sendError(error);
				}
				else
					platform.sendLog('Message Sent', message.message);
			});
		});
	}
});