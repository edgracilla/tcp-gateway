'use strict';

const HOST = '0.0.0.0',
	  PORT = 8080;

var cp     = require('child_process'),
	assert = require('assert'),
	gateway;

describe('Gateway', function () {
	this.slow(5000);

	after('terminate child process', function () {
		gateway.kill('SIGKILL');
	});

	describe('#spawn', function () {
		it('should spawn a child process', function () {
			assert.ok(gateway = cp.fork(process.cwd()), 'Child process not spawned.');
		});
	});

	describe('#handShake', function () {
		it('should notify the parent process when ready within 5 seconds', function (done) {
			this.timeout(5000);

			gateway.on('message', function (message) {
				if (message.type === 'ready')
					done();
			});

			gateway.send({
				type: 'ready',
				data: {
					options: {
						host: HOST,
						port: PORT
					}
				}
			}, function (error) {
				assert.ifError(error);
			});
		});
	});

	describe('#message', function () {
		it('should process the message', function (done) {
			gateway.send({
				type: 'message',
				data: {
					client: '571826372902789',
					messageId: '55fce1455167c470abeedae2',
					message: 'TURNOFF'
				}
			}, done);
		});
	});
});