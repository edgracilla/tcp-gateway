'use strict';

var server, serverAddress,
	platform = require('./platform');

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options) {
	var host          = require('ip').address(),
		StringDecoder = require('string_decoder').StringDecoder,
		decoder       = new StringDecoder('utf8'),
		isJSON        = require('is-json');

	serverAddress = host + '' + options.port;

	server = require('./server')(options.port, host, {
		_keepaliveTimeout: 3600000
	});

	server.on('ready', function () {
		console.log('TCP Server now listening on '.concat(host).concat(':').concat(options.port));
		platform.notifyReady();
	});

	server.on('client_on', function (clientAddress) {
		server.send(clientAddress, 'CONNACK');
		platform.notifyConnection(serverAddress, clientAddress);
	});

	server.on('client_off', function (clientAddress) {
		platform.notifyDisconnection(serverAddress, clientAddress);
	});

	server.on('data', function (clientAddress, rawData) {
		var data = decoder.write(rawData);

		// Verify that the incoming data is a valid JSON String. Reekoh only accepts JSON as input.
		if (isJSON(data))
			platform.processData(serverAddress, clientAddress, data);

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

	if (_.contains(_.keys(server.getClients()), message.client)) {
		server.send(message.client, message.message, false, function (error) {
			if (error) {
				console.error('Message Sending Error', error);
				platform.sendMessageResponse(message.messageId, error.name);
				platform.handleException(error);
			}
			else {
				platform.sendMessageResponse(message.messageId, 'Message Sent');
				platform.log('Message Sent', message.message);
			}
		});
	}
});
