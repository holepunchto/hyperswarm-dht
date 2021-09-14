const DHT = require('dht-rpc')
const sodium = require('sodium-universal')
const { EventEmitter } = require('events')
const c = require('compact-encoding')
const HolepunchRouter = require('./lib/route')
const messages = require('./lib/messages')
const AddressSet = require('./lib/address-set')
const Holepuncher = require('./lib/holepuncher')

module.exports = class HyperDHT extends DHT {
  constructor (opts) {
    super(opts)

    this._router = new HolepunchRouter(this)
  }

  onrequest (req) {
    console.log('onrequest', req.command)

    switch (req.command) {
      case 'lookup': {
        this._onlookup(req)
        break
      }
      case 'announce': {
        this._onannounce(req)
        break
      }
      case 'find_peer': {
        this._onfindpeer(req)
        break
      }
      case 'connect': {
        this._router.onconnect(req)
        break
      }
      case 'holepunch': {
        this._router.onholepunch(req)
        break
      }
      default: {
        return false
      }
    }

    return true
  }

  _onfindpeer (req) {
    if (!req.target) return

    const r = this._router.get(req.target)

    if (r) {
      req.reply(Buffer.from('ok'))
      return
    }

    req.reply(null)
  }

  _onlookup (req) {
    if (!req.target) return

    const a = this._router.get(req.target)
    console.log('onlookup', !!a)

    req.reply(null)
  }

  _onannounce (req) {
    if (!req.target) return

    const existing = this._router.get(req.target)
    if (existing) {
      clearTimeout(existing.timeout)
    }

    const c = {
      relay: req.from,
      server: null,
      timeout: null
    }

    c.timeout = setTimeout(() => {
      if (this._router.get(req.target) === c) {
        this._router.delete(req.target)
      }
    }, 10 * 60 * 1000)

    this._router.set(req.target, c)

    req.reply(null)
  }

  static keyPair (seed) {
    return createKeyPair(seed)
  }
}

function diffAddress (a, b) {
  return a.host !== b.host || a.port !== b.port
}

function createKeyPair (seed) {
  const publicKey = Buffer.alloc(32)
  const secretKey = Buffer.alloc(64)
  if (seed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
  else sodium.crypto_sign_keypair(publicKey, secretKey)
  return { publicKey, secretKey }
}

function hash (data) {
  const out = Buffer.allocUnsafe(32)
  sodium.crypto_generichash(out, data)
  return out
}

function decode (enc, buf) {
  try {
    return c.decode(enc, buf)
  } catch {
    return null
  }
}

function noop () {}
