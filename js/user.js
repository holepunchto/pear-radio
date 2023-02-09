import c from 'compact-encoding'
import { compile, opt } from 'compact-encoding-struct'
import DHT from '@hyperswarm/dht'
import RPC from '@hyperswarm/rpc'

const userInfo = compile({
  publicKey: c.buffer,
  name: c.string,
  description: opt(c.string),
  tags: opt(c.string)
})

const syncResponse = compile({
  block: (c.uint),
  artist: opt(c.string),
  name: opt(c.string)
})

export class User {
  constructor (player, opts = {}) {
    this.info = { publicKey: null, name: null, description: null, tags: null }
    this.keyPair = opts.keyPair || DHT.keyPair()
    this.rpc = new RPC({ keyPair: this.keyPair, ...opts })
    this.server = this.rpc.createServer()
    this.player = player
    this.connections = new Map()
  }

  async ready () {
    this.server.respond('user-info', (req) => {
      return c.encode(userInfo, this.info)
    })

    this.server.respond('sync-request', async (req) => {
      const block = this.player.currentAudioBlock()
      const { artist, name } = await this.player.streamer.getMetadata()
      return c.encode(syncResponse, { block, artist, name })
    })

    await this.server.listen(this.keyPair)
  }

  async getUserInfo (key) {
    if (!this.connections.has(key)) this.connections.set(key, this.rpc.connect(key))
    const encodedUserInfo = await this.connections.get(key).request('user-info', Buffer.alloc(0)) // empty request body
    return this.decodeUserInfo(encodedUserInfo)
  }

  async syncRequest (key) {
    if (!this.connections.has(key)) this.connections.set(key, this.rpc.connect(key))
    const encodedSyncResponse = await this.connections.get(key).request('sync-request', Buffer.alloc(0))
    return this.decodeSyncResponse(encodedSyncResponse)
  }

  encodeUserInfo () {
    return c.encode(userInfo, this.info)
  }

  decodeUserInfo (data) {
    try {
      return c.decode(userInfo, data)
    } catch (err) {
      return null
    }
  }

  decodeSyncResponse (data) {
    try {
      return c.decode(syncResponse, data)
    } catch (err) {
      return null
    }
  }
}
