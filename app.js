'use strict';

var async     = require('async'),
	platform  = require('./platform'),
	isEmpty   = require('lodash.isempty'),
	clients   = {},
	addresses = {},
	server, port;

platform.on('message', function (message) {
	if (clients[message.device]) {
		let msg = message.message || new Buffer([0x00]);

		if (!Buffer.isBuffer(msg))
			msg = new Buffer(`${msg}\r\n`);

		clients[message.device].write(msg, () => {
			platform.sendMessageResponse(message.messageId, 'Message Sent');

			platform.log(JSON.stringify({
				title: 'TCP Gateway - Message Sent',
				device: message.device,
				messageId: message.messageId,
				message: message.message
			}));
		});
	}
});

platform.on('close', () => {
	let d = require('domain').create();

	d.on('error', function (error) {
		console.error(`Error closing TCP Gateway on port ${port}`, error);
		platform.handleException(error);
		platform.notifyClose();
	});

	d.run(function () {
		server.close(() => {
			console.log(`TCP Gateway closed on port ${port}`);
			platform.notifyClose();
		});
	});
});

platform.once('ready', function (options) {
	let net    = require('net'),
		config = require('./config.json');

	let connack = options.connack || config.connack.default;
	let dataTopic = options.data_topic || config.data_topic.default;
	let messageTopic = options.message_topic || config.message_topic.default;
	let groupMessageTopic = options.groupmessage_topic || config.groupmessage_topic.default;

	server = net.createServer();
	port = options.port;

	server.on('listening', () => {
		platform.log(`TCP Gateway initialized on port ${options.port}`);
		platform.notifyReady();
	});

	server.on('connection', (socket) => {
		socket.setEncoding('utf8');
		socket.setKeepAlive(true, 5000);
		socket.setTimeout(3600000);

		socket.on('data', (data) => {
			async.waterfall([
				async.constant(data || '{}'),
				async.asyncify(JSON.parse)
			], (error, obj) => {
				if (error || isEmpty(obj.topic || isEmpty(obj.device))) {
					socket.write(new Buffer('Invalid data sent. Data must be a valid JSON String with a "topic" field and a "device" field which corresponds to a registered Device ID.\r\n'));
					return platform.handleException(new Error('Invalid data sent. Data must be a valid JSON String with a "topic" field and a "device" field which corresponds to a registered Device ID.'));
				}

				platform.requestDeviceInfo(obj.device, (error, requestId) => {
					setTimeout(() => {
						platform.removeAllListeners(requestId);
					}, 5000);

					platform.once(requestId, (deviceInfo) => {
						if (isEmpty(deviceInfo)) {
							platform.log(JSON.stringify({
								title: 'TCP Gateway - Access Denied. Unauthorized Device',
								device: obj.device
							}));

							socket.write(new Buffer('Access Denied. Unauthorized Device\r\n'));
							return socket.destroy();
						}

						if (obj.topic === dataTopic) {
							platform.processData(obj.device, data);

							platform.log(JSON.stringify({
								title: 'TCP Gateway - Data Received.',
								device: obj.device,
								data: obj
							}));

							if (isEmpty(clients[obj.device])) {
								clients[obj.device] = socket;
								addresses[`${socket.remoteAddress}:${socket.remotePort}`] = obj.device;
							}

							socket.write(new Buffer('Data Received\r\n'));
						}
						else if (obj.topic === messageTopic) {
							if (isEmpty(obj.target) || isEmpty(obj.message)) {
								platform.handleException(new Error('Invalid message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is a registered Device ID. "message" is the payload.'));
								return socket.write(new Buffer('Invalid message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is a registered Device ID. "message" is the payload.\r\n'));
							}

							platform.sendMessageToDevice(obj.target, obj.message);

							platform.log(JSON.stringify({
								title: 'TCP Gateway - Message Sent.',
								source: obj.device,
								target: obj.target,
								message: obj.message
							}));

							socket.write(new Buffer('Message Received\r\n'));
						}
						else if (obj.topic === groupMessageTopic) {
							if (isEmpty(obj.target) || isEmpty(obj.message)) {
								platform.handleException(new Error('Invalid group message or command. Group messages must be a valid JSON String with "target" and "message" fields. "target" is a device group id or name. "message" is the payload.'));
								return socket.write(new Buffer('Invalid group message or command. Group messages must be a valid JSON String with "target" and "message" fields. "target" is a device group id or name. "message" is the payload.\r\n'));
							}

							platform.sendMessageToGroup(obj.target, obj.message);

							platform.log(JSON.stringify({
								title: 'TCP Gateway - Group Message Sent.',
								source: obj.device,
								target: obj.target,
								message: obj.message
							}));

							socket.write(new Buffer('Group Message Received\r\n'));
						}
						else {
							platform.handleException(new Error(`Invalid topic specified. Topic: ${obj.topic}`));
							socket.write(new Buffer(`Invalid topic specified. Topic: ${obj.topic}.\r\n`));
						}
					});
				});
			});
		});

		socket.on('timeout', () => {
			platform.log('TCP Gateway - Socket Timeout.');
			socket.destroy();
		});

		socket.on('error', (error) => {
			console.error('Client Error.', error);
			platform.handleException(error);
		});

		socket.on('close', () => {
			let device = addresses[`${socket.remoteAddress}:${socket.remotePort}`];

			if (device)
				platform.notifyDisconnection(device);
		});

		socket.write(new Buffer(`${connack}\r\n`));
	});

	server.on('error', (error) => {
		console.error('Server Error', error);
		platform.handleException(error);

		if (error.code === 'EADDRINUSE')
			process.exit(1);
	});

	server.listen({
		port: options.port,
		exclusive: false
	});
});