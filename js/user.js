import c from 'compact-encoding'
import DHT from 'hyperdht'
import RPC from '@hyperswarm/rpc'
import { userInfo, syncResponse } from './lib/encoding.js'

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
      return (await this.player.syncRequest(req))
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
    const encodedSyncResponse = await this.connections.get(key).request('sync-request', this.keyPair.publicKey)
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
