const udx = require('udx-native')

module.exports = class SocketPool {
  constructor (dht) {
    this._dht = dht

    this._sockets = new Set()
    this._free = new Set()
    this._pairers = new Map()

    // Indexes
    this._byPort = new Map()
  }

  _onmessage (holder, data, address) {
    this._dht.onmessage(holder.socket, data, address)
  }

  _onpreconnect (holder, id, address) {
    const pairer = this._pairers.get(id)
    if (!pairer) return

    const { once } = pairer.options

    pairer.handler(holder, id, address)

    if (once) this.unpair(id)
  }

  _add (holder) {
    this._sockets.add(holder)
    this._byPort.set(holder.address().port, holder)
  }

  _remove (holder) {
    this._sockets.delete(holder)
    this._free.delete(holder)
    this._byPort.delete(holder.address().port)
  }

  get (options = {}) {
    const {
      port
    } = options

    let socket = null

    if (port) socket = this._getByPort(port)

    // If we don't have a socket yet, try to get a free one
    if (!socket) {
      [socket] = this._free

      // If we still don't have a socket, create a new one
      if (!socket) {
        socket = new SocketHolder(this, options)
      }
    }

    return socket
  }

  _getByPort (port) {
    const socket = this._byPort.get(port)

    if (!socket || !socket.free) return null

    return socket
  }

  pair (id, options, handler) {
    if (typeof options === 'function') {
      handler = options
      options = {}
    }

    this._pairers.set(id, { handler, options })
  }

  unpair (id) {
    this._pairers.delete(id)
  }

  destroy () {
    for (const socket of this._sockets) socket.close()
  }
}

class SocketHolder {
  constructor (pool, options = {}) {
    const {
      port
    } = options

    this._pool = pool

    this._streams = new Set()

    this.socket = udx.createSocket()
    this.socket
      .on('close', this._onclose.bind(this))
      .on('message', this._onmessage.bind(this))
      .on('preconnect', this._onpreconnect.bind(this))

    try {
      this.socket.bind(port)
    } catch {
      this.socket.bind()
    }

    this._pool._add(this)
  }

  _onclose () {
    this._pool._remove(this)
  }

  _onmessage (message, address) {
    this._pool._onmessage(this, message, address)
  }

  _onpreconnect (id, address) {
    this._pool._onpreconnect(this, id, address)
  }

  get free () {
    return this._pool._free.has(this)
  }

  address () {
    return this.socket.address()
  }

  connect (localId, remoteId, port, host) {
    const stream = udx.createStream(localId)
    this._streams.add(stream)

    stream
      .on('close', onclose.bind(this))
      .connect(this.socket, remoteId, port, host)

    return stream

    function onclose () {
      this._streams.delete(stream)
    }
  }

  release () {
    this._pool._free.add(this)
  }

  close () {
    this._pool._free.delete(this)
    this.socket.close()
  }
}