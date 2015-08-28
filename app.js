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
		safeParse     = require('safe-json-parse/callback');

	serverAddress = host + '' + options.port;

	server = require('./server')(options.port, host, {
		_keepaliveTimeout: 3600000
	});

	server.on('ready', function () {
		console.log('TCP Server now listening on '.concat(host).concat(':').concat(options.port));
		platform.notifyListen();
	});

	server.on('client_on', function (clientAddress) {
		server.send(clientAddress, 'CONNACK');
		platform.notifyConnection(clientAddress);
	});

	server.on('client_off', function (clientAddress) {
		platform.notifyDisconnection(clientAddress);
	});

	server.on('data', function (clientAddress, rawData, size) {
		var data = decoder.write(rawData);

		safeParse(data, function (error, result) {
			if (error)
				platform.handleException(error);
			else {
				// Send the JSON String data not the parsed data.
				platform.processData(serverAddress, clientAddress, data, DATA_TYPE, size);
			}
		});

		platform.log('Raw Data Received', data);
	});

	server.on('error', function (error) {
		console.error('Server Error', error);
		platform.handleException(error);
	});

	server.on('close', function () {
		platform.notifyClose();
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
				platform.handleException(error);
			}
			else
				platform.log('Message Sent', message.message);
		});
	}
	else if (message.client === '*') {
		server.getClients().forEach(function (client) {
			server.send(client, message.message, false, function (error) {
				if (error) {
					console.log('Message Sending Error', error);
					platform.handleException(error);
				}
				else
					platform.log('Message Sent', message.message);
			});
		});
	}
});
