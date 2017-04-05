'use strict'

const reekoh = require('reekoh')
const plugin = new reekoh.plugins.Gateway()

const async = require('async')
const isEmpty = require('lodash.isempty')

let clients = {}
let server = null

plugin.once('ready', () => {
  let net = require('net')
  let config = require('./config.json')
  let options = plugin.config
  let msgStr = ''

  let connack = options.connack || config.connack.default
  let dataTopic = options.dataTopic || config.dataTopic.default
  let commandTopic = options.commandTopic || config.commandTopic.default

  server = net.createServer()

  server.once('error', (error) => {
    console.error('TCP Gateway Error', error)
    plugin.logException(error)

    setTimeout(() => {
      server.close(() => {
        server.removeAllListeners()
        process.exit()
      })
    }, 5000)
  })

  server.once('listening', () => {
    plugin.log(`TCP Gateway initialized on port ${options.port}`)
    plugin.emit('init')
  })

  server.once('close', function () {
    plugin.log(`TCP Gateway closed on port ${options.port}`)
  })

  server.on('connection', (socket) => {
    socket.setEncoding('utf8')
    socket.setKeepAlive(true, 5000)
    socket.setTimeout(3600000)

    socket.on('error', (error) => {
      if (socket.device) plugin.notifyDisconnection(socket.device)

      console.error('Client Error.', error)
      plugin.logException(error)
      socket.destroy()
    })

    socket.on('timeout', () => {
      if (socket.device) plugin.notifyDisconnection(socket.device)

      plugin.log('TCP Gateway - Socket Timeout.')
      socket.destroy()
    })

    socket.on('close', () => {
      if (socket.device) {
        plugin.notifyDisconnection(socket.device)
        delete clients[socket.device]
      }

      setTimeout(() => {
        socket.removeAllListeners()
      }, 5000)
    })

    socket.on('data', (data) => {
      async.waterfall([
        async.constant(data || '{}'),
        async.asyncify(JSON.parse)
      ], (error, obj) => {
        if (error || isEmpty(obj.topic || isEmpty(obj.device))) {
          msgStr = 'Invalid data sent. Data must be a valid JSON String with a "topic" field and a "device" field which corresponds to a registered Device ID.'
          socket.write(new Buffer(`${msgStr}\n`))
          return plugin.logException(new Error(msgStr))
        }

        plugin.requestDeviceInfo(obj.device).then((deviceInfo) => {
          if (isEmpty(deviceInfo)) {
            socket.write(new Buffer(`Device not registered. Device ID: ${obj.device}\n`))
            socket.destroy()

            return plugin.log(JSON.stringify({
              title: 'TCP Gateway - Access Denied. Unauthorized Device',
              device: obj.device
            }))
          }

          async.waterfall([
            async.constant(deviceInfo || '{}'),
            async.asyncify(JSON.parse)
          ], (error, info) => {
            if (error) return console.log('Returned deviceInfo is not a valid JSON')

            if (isEmpty(clients[obj.device])) {
              socket.device = obj.device
              clients[obj.device] = socket
              plugin.notifyConnection(obj.device)
            }

            if (obj.topic === dataTopic) {
              return plugin.pipe(info).then(() => {
                socket.write(new Buffer(`Data Received. Device ID: ${obj.device}. Data: ${data}\n`))

                return plugin.log(JSON.stringify({
                  title: 'TCP Gateway - Data Received.',
                  device: obj.device,
                  data: obj
                }))
              })
            } else if (obj.topic === commandTopic) {
              if (isEmpty(obj.device) || isEmpty(obj.command)) {
                msgStr = 'Invalid message or command. Message must be a valid JSON String with "device" and "command" fields. "device" is a registered Device ID. "command" is the payload.'
                plugin.logException(new Error(msgStr))
                return socket.write(new Buffer(`${msgStr}\n`))
              }

              plugin.relayCommand(obj.command, obj.target, obj.deviceGroup, obj.device).then(() => {
                socket.write(new Buffer(`Command Received. Device ID: ${obj.device}. Message: ${data}\n`))
                return plugin.log(JSON.stringify({
                  title: 'TCP Gateway - Message Sent.',
                  source: obj.device,
                  target: obj.target,
                  command: obj.command
                }))
              }).catch((err) => {
                console.error(err)
                plugin.logException(err)
              })
            } else {
              msgStr = `Invalid topic specified. Topic: ${obj.topic}`
              plugin.logException(new Error(msgStr))
              socket.write(new Buffer(`${msgStr}\n`))
            }
          })
        }).catch((err) => {
          console.error(err)
          plugin.logException(err)
        })
      })
    })

    socket.write(new Buffer(`${connack}\n`))
  })

  server.listen(options.port)
})

plugin.on('command', (msg) => {
  if (!isEmpty(clients[msg.device])) {
    let writeMsg = msg.command || new Buffer([0x00])

    if (!Buffer.isBuffer(writeMsg)) {
      writeMsg = new Buffer(`${writeMsg}\n`)
    }

    clients[msg.device].write(writeMsg, () => {
      plugin.sendCommandResponse(msg.commandId, 'Command Sent')
      plugin.emit('response.ok', msg.device)

      plugin.log(JSON.stringify({
        title: 'msg Gateway - Command Sent',
        device: msg.device,
        commandId: msg.commandId,
        command: msg.command
      }))
    })
  }
})

module.exports = plugin
