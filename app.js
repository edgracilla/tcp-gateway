'use strict';

var platform = require('./platform'),
	server;

/*
 * Listen for the message event. Send these messages/commands to devices from this server.
 */
platform.on('message', function (message) {
	if (server.getClients()[message.client]) {
		server.send(message.client, message.message, false, function (error) {
			if (error) {
				console.error('Message Sending Error', error);
				platform.sendMessageResponse(message.messageId, error.name);
				platform.handleException(error);
			}
			else {
				platform.sendMessageResponse(message.messageId, 'Message Sent');
				platform.log(JSON.stringify(message));
			}
		});
	}
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options) {
	var isJSON        = require('is-json'),
		TCPServer     = require('./server'),
		StringDecoder = require('string_decoder').StringDecoder,
		decoder       = new StringDecoder('utf8');

	server = new TCPServer({
		_keepaliveTimeout: 3600000
	});

	server.once('ready', function () {
		platform.notifyReady();
		platform.log('TCP Gateway initialized on port ' + options.port);
	});

	server.on('client_on', function (clientAddress) {
		server.send(clientAddress, 'CONNACK');
	});

	server.on('client_error', function (error) {
		platform.handleException(error);
	});

	server.on('data', function (client, rawData) {
		var data = decoder.write(rawData);

		if (isJSON(data)) {
			var obj = JSON.parse(data);

			if (obj.type === 'data')
				platform.processData(obj.device, data);
			else if (obj.type === 'message')
				platform.sendMessageToDevice(obj.target, obj.message);
			else if (obj.type === 'groupmessage')
				platform.sendMessageToGroup(obj.target, obj.message);
		}

		platform.log(data);
	});

	server.on('error', function (error) {
		console.error('Server Error', error);
		platform.handleException(error);
	});

	server.on('close', function () {
		platform.notifyClose();
	});

	server.listen(options.port, '0.0.0.0');
});