import c from 'compact-encoding'
import { compile, opt } from 'compact-encoding-struct'
import DHT from '@hyperswarm/dht'

const userInfo = compile({
  stream: c.buffer,
  metadata: c.buffer,
  name: c.string,
  description: c.string,
  tags: opt(c.string)
})

export class User {
  constructor (opts = {}) {
    this.info = { stream: null, metadata: null, name: null, description: null, tags: null }
    this.node = new DHT(opts)
    this.server = this.node.createServer()
    this.keyPair = opts.keyPair || DHT.keyPair()
    this.server.on('connection', socket => {
      const info = c.encode(userInfo, this.info)
      socket.write(info)
    })
  }

  async ready () {
    await this.server.listen(this.keyPair)
  }

  getUserInfo (key) {
    return new Promise((resolve, reject) => {
      const socket = this.node.connect(key)
      socket.on('data', (data) => {
        const info = this._decodeUserInfo(data)
        resolve(info)
      })
    })
  }

  _decodeUserInfo (data) {
    try {
      return c.decode(userInfo, data)
    } catch (err) {
      return null
    }
  }
}
