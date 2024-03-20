const test = require('brittle')
const RelayServer = require('blind-relay').Server
const { swarm } = require('./helpers')
const DHT = require('../')
const { spawn } = require('child_process')
const path = require('path')

// server.set keep-alive
// server.on(connection, () => wait 1..10 sec, then close connection)
// client.set keep-alive
// client - should reconnect when connection dies

test.solo('Client connects to Server and keeps reconnectings - with relay', { timeout: 0 }, async t => {
  t.plan(2000)

  const { bootstrap } = await swarm(t)

  const a = new DHT({ bootstrap, quickFirewall: false, ephemeral: true })
  const b = new DHT({ bootstrap, quickFirewall: false, ephemeral: true })
  const c = new DHT({ bootstrap, quickFirewall: false, ephemeral: true })

  t.teardown(async () => {
    await a.destroy()
    await c.destroy()
    await b.destroy()
    relay.close()
  })

  const relay = new RelayServer({
    createStream (opts) {
      return a.createRawStream({ ...opts, framed: true })
    }
  })

  const relayServer = a.createServer(socket => {
    const relaySession = relay.accept(socket, { id: socket.remotePublicKey })

    // relaySession.on('pair', (isInitiator) => {
    //   console.log(`[relayServer] on(pair) isInitiator=${isInitiator}`)
    // })
    relaySession.on('error', (err) => t.comment(err.message))
  })

  await relayServer.listen()

  const serverKeyPair = DHT.keyPair()
  const serverPublicKey = serverKeyPair.publicKey.toString('hex')
  const serverSecretKey = serverKeyPair.secretKey.toString('hex')
  const relayServerPublicKey = relayServer.publicKey.toString('hex')

  startServer()

  function startServer () {
    const serverProcess = spawn('node', [
      path.join(__dirname, 'fixtures/server-through-relay.js'),
      serverPublicKey,
      serverSecretKey,
      relayServerPublicKey,
      JSON.stringify(bootstrap)
    ])
    serverProcess.stderr.on('data', () => t.fail())
    serverProcess.stdout.on('data', data => {
      data = data.toString().trim()
      // console.log(`[serverProcess] ${data}`)
      const isStarted = data === 'started'
      const isSocketOpened = data === 'socket_onopen'
      const isSocketClosed = data === 'socket_onclose'
      const isSocketError = data.startsWith('socket_onerror')
      if (isStarted) {
        t.pass('[server] Started. Now starting client')
        startClient()
      }
      if (isSocketOpened) t.pass('[server] Socket connected')
      if (isSocketClosed) t.pass('[server] Socket closed')
      if (isSocketError) console.error(data)
    })
  }

  function startClient () {
    const client = c.connect(serverKeyPair.publicKey, { relayThrough: relayServer.publicKey })
    client.setKeepAlive(5000)
    client
      .on('open', () => {
        t.pass('[client] Socket opened')
      })
      .on('close', () => {
        t.pass('[client] Socket closed. reconnecting')
        startClient()
      })
      .on('error', err => console.error('[client] error', err))
  }
})