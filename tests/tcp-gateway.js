'use strict';

var cp     = require('child_process'),
	assert = require('assert'),
	gateway;

describe('Gateway', function () {
	describe('#spawn', function () {
		it('should spawn a child process', function () {
			assert.ok(gateway = cp.fork(process.cwd()), 'Child process not spawned.');
		});
	});

	describe('#handShake', function () {
		it('should notify the parent process when ready within 5 seconds', function () {
			var initTimeout;

			gateway.on('ready', function () {
				clearTimeout(initTimeout);
			});

			initTimeout = setTimeout(function () {
				assert.ok(false, 'Plugin init timeout.');
			}, 5000);

			gateway.send({
				type: 'ready',
				data: {
					options: {
						port: 8080
					}
				}
			}, function (error) {
				assert.ifError(error);
			});
		});
	});

	describe('#message', function () {
		it('should process the message', function () {
			gateway.send({
				type: 'message',
				data: {
					client: '571826372902789',
					messageId: '55fce1455167c470abeedae2',
					message: 'TURNOFF'
				}
			}, function (error) {
				assert.ifError(error);
			});
		});
	});
});