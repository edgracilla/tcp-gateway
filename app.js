'use strict';

var net               = require('net'),
	platform          = require('./platform'),
	clients           = {},
	addresses         = {},
	authorizedDevices = {},
	server;

/*
 * Listen for the message event. Send these messages/commands to devices from this server.
 */
platform.on('message', function (message) {
	if (clients[message.device]) {
		var msg = message.message || new Buffer([0x00]);

		if (!Buffer.isBuffer(msg))
			message = new Buffer(msg + '\r\n');

		clients[message.device].write(message, function () {
			platform.sendMessageResponse(message.messageId, 'Message Sent');
			platform.log(JSON.stringify({
				title: 'Message Sent',
				device: message.device,
				messageId: message.messageId,
				message: message.message
			}));
		});
	}
});

/*
 * When a new device is added, add it to the list of authorized devices.
 */
platform.on('adddevice', function (device) {
	var _ = require('lodash');

	if (!_.isEmpty(device) && !_.isEmpty(device._id)) {
		authorizedDevices[device._id] = device;
		platform.log('Successfully added ' + device._id + ' to the pool of authorized devices.');
	}
	else
		platform.handleException(new Error('Device data invalid. Device not added. ' + device));
});

/*
 * When a device is removed or deleted, remove it from the list of authorized devices.
 */
platform.on('removedevice', function (device) {
	var _ = require('lodash');

	if (!_.isEmpty(device) && !_.isEmpty(device._id)) {
		delete authorizedDevices[device._id];
		platform.log('Successfully removed ' + device._id + ' from the pool of authorized devices.');
	}
	else
		platform.handleException(new Error('Device data invalid. Device not removed. ' + device));
});

/*
 * Listen for the ready event.
 */
platform.once('ready', function (options, registeredDevices) {
	var _      = require('lodash'),
		isJSON = require('is-json'),
		config = require('./config.json');

	if (!_.isEmpty(registeredDevices)) {
		var tmpDevices = _.clone(registeredDevices, true);

		authorizedDevices = _.indexBy(tmpDevices, '_id');
	}

	var connack = options.connack || config.connack.default;

	server = net.createServer();

	server.maxConnections = 1024;

	server.on('listening', function () {
		platform.log('TCP Gateway initialized on port ' + options.port);
		platform.notifyReady();
	});

	server.on('connection', function (socket) {
		socket.setEncoding('utf8');
		socket.setKeepAlive(true, 5000);
		socket.setTimeout(3600000);

		socket.on('data', function (data) {
			if (isJSON(data)) {
				var obj = JSON.parse(data);

				if (_.isEmpty(obj.device)) return;

				if (_.isEmpty(authorizedDevices[obj.device])) {
					platform.log(JSON.stringify({
						title: 'Unauthorized Device',
						device: obj.device
					}));

					return socket.destroy();
				}

				if (obj.type === 'data') {
					platform.processData(obj.device, data);
					platform.log(JSON.stringify({
						title: 'Data Received.',
						device: obj.device,
						data: data
					}));

					if (_.isEmpty(clients[obj.device])) {
						clients[obj.device] = socket;
						addresses[socket.remoteAddress + ':' + socket.remotePort] = obj.device;
					}
				}
				else if (obj.type === 'message') {
					platform.sendMessageToDevice(obj.target, obj.message);

					platform.log(JSON.stringify({
						title: 'Message Sent.',
						source: obj.device,
						target: obj.target,
						message: obj.message
					}));
				}
				else if (obj.type === 'groupmessage') {
					platform.sendMessageToGroup(obj.target, obj.message);

					platform.log(JSON.stringify({
						title: 'Group Message Sent.',
						source: obj.device,
						target: obj.target,
						message: obj.message
					}));
				}
				else
					socket.write(new Buffer('Invalid data. One or more fields missing. [device, type] are required for data. [device, type, target, message] are required for messages.' + '\r\n'));
			}
			else
				socket.write(new Buffer('Invalid data sent. This TCP Gateway only accepts JSON data.' + '\r\n'));
		});

		socket.on('timeout', function () {
			platform.log('Socket Timeout.');
			socket.destroy();
		});

		socket.on('error', function (error) {
			console.error('Client Error.', error);
			platform.handleException(error);
		});

		socket.on('close', function () {
			var device = addresses[socket.remoteAddress + ':' + socket.remotePort];

			if (device)
				platform.notifyDisconnection(device);
		});

		socket.write(new Buffer(connack + '\r\n'));
	});

	server.on('close', function () {
		platform.notifyClose();
	});

	server.on('error', function (error) {
		console.error('Server Error', error);
		platform.handleException(error);
	});

	server.listen(options.port, '0.0.0.0');
});