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
				title: 'Message Sent',
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
		platform.log(`Successfully added ${device._id} to the pool of authorized devices.`);
	}
	else
		platform.handleException(new Error(`Device data invalid. Device not added. ${device}`));
});

platform.on('removedevice', function (device) {
	if (!isEmpty(device) && !isEmpty(device._id)) {
		delete authorizedDevices[device._id];
		platform.log(`Successfully removed ${device._id} from the pool of authorized devices.`);
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
			let socketDomain = domain.create();

			socketDomain.once('error', (error) => {
				socket.write(new Buffer('Invalid data sent. This TCP Gateway only accepts JSON data.\r\n'));
				platform.handleException(error);

				socketDomain.exit();
			});

			socketDomain.run(() => {
				let obj = JSON.parse(data);

				if (isEmpty(obj.device)) {
					platform.handleException(new Error('Invalid data sent. Data must be a valid JSON String with at least a "device" field which corresponds to a registered Device ID.'));
					socket.write(new Buffer('Invalid data sent. Data must be a valid JSON String with at least a "device" field which corresponds to a registered Device ID.\r\n'));

					return socketDomain.exit();
				}

				if (isEmpty(authorizedDevices[obj.device])) {
					platform.log(JSON.stringify({
						title: 'Unauthorized Device',
						device: obj.device
					}));
					socket.write(new Buffer('Unauthorized Device\r\n'));

					socket.destroy();

					return socketDomain.exit();
				}

				if (isEmpty(obj.type)) {
					platform.handleException(new Error('Invalid data sent. No "type" specified. "type" should be either data, message, or groupmessage.'));
					socket.write(new Buffer('Invalid data sent. No "type" specified. "type" should be either data, message, or groupmessage.\r\n'));

					return socketDomain.exit();
				}
				else if (obj.type === 'data') {
					platform.processData(obj.device, data);

					platform.log(JSON.stringify({
						title: 'Data Received.',
						device: obj.device,
						data: obj
					}));

					if (isEmpty(clients[obj.device])) {
						clients[obj.device] = socket;
						addresses[`${socket.remoteAddress}:${socket.remotePort}`] = obj.device;
					}

					socket.write(new Buffer('Data Processed\r\n'));
				}
				else if (obj.type === 'message') {
					if (isEmpty(obj.target) || isEmpty(obj.message)) {
						platform.handleException(new Error('Invalid message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the a registered Device ID. "message" is the payload.'));
						socket.write(new Buffer('Invalid message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the a registered Device ID. "message" is the payload.\r\n'));

						return socketDomain.exit();
					}

					platform.sendMessageToDevice(obj.target, obj.message);

					platform.log(JSON.stringify({
						title: 'Message Sent.',
						source: obj.device,
						target: obj.target,
						message: obj.message
					}));

					socket.write(new Buffer('Message Processed\r\n'));
				}
				else if (obj.type === 'groupmessage') {
					if (isEmpty(obj.target) || isEmpty(obj.message)) {
						platform.handleException(new Error('Invalid group message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the the group name. "message" is the payload.'));
						socket.write(new Buffer('Invalid group message or command. Message must be a valid JSON String with "target" and "message" fields. "target" is the the group name. "message" is the payload.\r\n'));

						return socketDomain.exit();
					}

					platform.sendMessageToGroup(obj.target, obj.message);

					platform.log(JSON.stringify({
						title: 'Group Message Sent.',
						source: obj.device,
						target: obj.target,
						message: obj.message
					}));

					socket.write(new Buffer('Group Message Processed\r\n'));
				}

				socketDomain.exit();
			});
		});

		socket.on('timeout', () => {
			platform.log('Socket Timeout.');
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