'use strict';

var domain            = require('domain'),
	platform          = require('./platform'),
	isEmpty           = require('lodash.isempty'),
	clients           = {},
	addresses         = {},
	authorizedDevices = {},
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

platform.on('adddevice', function (device) {
	if (!isEmpty(device) && !isEmpty(device._id)) {
		authorizedDevices[device._id] = device;
		platform.log(`TCP Gateway - Successfully added ${device._id} to the pool of authorized devices.`);
	}
	else
		platform.handleException(new Error(`Device data invalid. Device not added. ${device}`));
});

platform.on('removedevice', function (device) {
	if (!isEmpty(device) && !isEmpty(device._id)) {
		delete authorizedDevices[device._id];
		platform.log(`TCP Gateway - Successfully removed ${device._id} from the pool of authorized devices.`);
	}
	else
		platform.handleException(new Error(`Device data invalid. Device not removed. ${device}`));
});

platform.on('close', () => {
	let d = domain.create();

	d.on('error', (error) => {
		console.error(`Error closing TCP Gateway on port ${port}`, error);
		platform.handleException(error);
		platform.notifyClose();
	});

	d.run(() => {
		server.close(() => {
			console.log(`TCP Gateway closed on port ${port}`);
			platform.notifyClose();
		});
	});
});

platform.once('ready', function (options, registeredDevices) {
	let net    = require('net'),
		keyBy  = require('lodash.keyby'),
		config = require('./config.json');

	if (!isEmpty(registeredDevices))
		authorizedDevices = keyBy(registeredDevices, '_id');

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
			let d = domain.create();

			d.once('error', (error) => {
				socket.write(new Buffer('Invalid data sent. Data must be a valid JSON String with a "topic" field and a "device" field which corresponds to a registered Device ID.\r\n'));
				platform.handleException(error);

				d.exit();
			});

			d.run(() => {
				let obj = JSON.parse(data);

				if (isEmpty(obj.device)) {
					platform.handleException(new Error('Invalid data sent. Data must be a valid JSON String with a "topic" field and a "device" field which corresponds to a registered Device ID.'));
					socket.write(new Buffer('Invalid data sent. Data must be a valid JSON String with a "topic" field and a "device" field which corresponds to a registered Device ID.\r\n'));

					return d.exit();
				}

				if (isEmpty(authorizedDevices[obj.device])) {
					platform.log(JSON.stringify({
						title: 'TCP Gateway - Access Denied. Unauthorized Device',
						device: obj.device
					}));

					socket.write(new Buffer('Access Denied. Unauthorized Device\r\n'));
					socket.destroy();

					return d.exit();
				}

				if (isEmpty(obj.topic)) {
					platform.handleException(new Error('Invalid data sent. No "topic" specified in JSON.'));
					socket.write(new Buffer('Invalid data sent. No "topic" specified in JSON.\r\n'));

					return d.exit();
				}
				else if (obj.topic === dataTopic) {
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

					socket.write(new Buffer('Data Processed\r\n'));
				}
				else if (obj.topic === messageTopic) {
					if (isEmpty(obj.target) || isEmpty(obj.message)) {
						platform.handleException(new Error('Invalid message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the a registered Device ID. "message" is the payload.'));
						socket.write(new Buffer('Invalid message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the a registered Device ID. "message" is the payload.\r\n'));

						return d.exit();
					}

					platform.sendMessageToDevice(obj.target, obj.message);

					platform.log(JSON.stringify({
						title: 'TCP Gateway - Message Sent.',
						source: obj.device,
						target: obj.target,
						message: obj.message
					}));

					socket.write(new Buffer('Message Processed\r\n'));
				}
				else if (obj.topic === groupMessageTopic) {
					if (isEmpty(obj.target) || isEmpty(obj.message)) {
						platform.handleException(new Error('Invalid group message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the the group name. "message" is the payload.'));
						socket.write(new Buffer('Invalid group message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the the group name. "message" is the payload.\r\n'));

						return d.exit();
					}

					platform.sendMessageToGroup(obj.target, obj.message);

					platform.log(JSON.stringify({
						title: 'TCP Gateway - Group Message Sent.',
						source: obj.device,
						target: obj.target,
						message: obj.message
					}));

					socket.write(new Buffer('Group Message Processed\r\n'));
				}
				else {
					platform.handleException(new Error(`Invalid topic specified. Topic: ${obj.topic}`));
					socket.write(new Buffer(`Invalid topic specified. Topic: ${obj.topic}\r\n`));
				}

				d.exit();
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