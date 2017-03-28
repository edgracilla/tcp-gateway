/* global describe, it, after, before */
'use strict'

const net = require('net')
const async = require('async')
const should = require('should')

const CONNACK = 'CONNACK'

const PORT = 8182
const PLUGIN_ID = 'demo.gateway'
const BROKER = 'amqp://guest:guest@127.0.0.1/'
const OUTPUT_PIPES = 'demo.outpipe1,demo.outpipe2'
const COMMAND_RELAYS = 'demo.relay1,demo.relay2'

let _app = null
let _client = null

let conf = {
  port: PORT,
  connack: CONNACK,
  dataTopic: 'data',
  commandTopic: 'command'
}

describe('TCP Gateway', () => {
  before('init', () => {
    process.env.BROKER = BROKER
    process.env.PLUGIN_ID = PLUGIN_ID
    process.env.OUTPUT_PIPES = OUTPUT_PIPES
    process.env.COMMAND_RELAYS = COMMAND_RELAYS
    process.env.CONFIG = JSON.stringify(conf)
  })

  after('terminate', function () {

  })

  describe('#start', function () {
    it('should start the app', function (done) {
      this.timeout(10000)

      _app = require('../app')

      _app.once('init', () => {
        _client = new net.Socket()

        _client.connect(PORT, '127.0.0.1', function () {
          done()
        })

        _client.once('data', function (data) {
          // trap CONNACK
        })
      })
    })
  })

  describe('#data', function () {
    it('should process the data', function (done) {
      this.timeout(10000)

      _client.once('data', function (data) {
        should.ok(data.toString().startsWith('Data Received.'))
        done()
      })

      _client.write(JSON.stringify({
        topic: 'data',
        device: '567827489028375'
      }))
    })
  })

  describe('#command', function () {

    it('should be able to send command (sent to offline device)', function (done) {
      this.timeout(10000)

      _client.once('data', function (data) {
        should.ok(data.toString().startsWith('Command Received.'))
        done()
      })

      _client.write(JSON.stringify({
        topic: 'command',
        device: '567827489028375',
        target: '567827489028376', // <-- offline device
        deviceGroup: '',
        command: 'TEST_OFFLINE_COMMAND'
      }))
    })

    it('should be able to recieve command response', function (done) {
      this.timeout(5000)
      let client3 = new net.Socket()

      client3.connect(PORT, '127.0.0.1', function () {
        client3.write(JSON.stringify({
          topic: 'command',
          device: '567827489028377',
          target: '567827489028375',
          deviceGroup: '',
          command: 'TURNOFF'
        }))

        _app.on('response.ok', (device) => {
          if (device === '567827489028375') done()
        })
      })
    })

    // NOTE!!! below test requires device '567827489028376' to offline in mongo
    it('should be able to recieve offline commands (on boot)', function (done) {
      this.timeout(5000)
      let client2 = new net.Socket()
      let called = false

      client2.connect(PORT, '127.0.0.1', function () {
        _client.write(JSON.stringify({
          topic: 'data',
          device: '567827489028376'
        }))

        _app.on('response.ok', (device) => {
          if (!called && device === '567827489028376') {
            called = true
            done()
          }
        })
      })
    })

  })
})
