import Corestore from 'corestore'
import ram from 'random-access-memory'
import Autobase from '@holepunchto/autobase'
import tweak from 'hypercore-crypto-tweak'
import EventEmmiter from 'events'

export class Chat extends EventEmmiter {
  constructor (userKeyPair, opts = {}) {
    super()
    this.bootstrap = opts.bootstrap ? tweak({ publicKey: opts.bootstrap }, 'CHAT-' + opts.bootstrap.toString('hex')).publicKey : undefined
    this.store = opts.store || new Corestore(ram)

    const tweakedKeyPair = tweak(userKeyPair, 'CHAT-' + userKeyPair.publicKey.toString('hex'))
    this._localKeyPair = tweakedKeyPair.keyPair
    this._auth = { sign: tweakedKeyPair.sign }
    this.base = new Autobase(this.store, this.bootstrap, { apply: this._apply.bind(this), open: this._open, keyPair: this._localKeyPair, auth: this._auth })
  }

  async ready () {
    await this.store.ready()
    await this.base.ready()
  }

  async destroy () {
    // TODO close autobase
  }

  addWriter (userPublicKey) {
    const keyPair = tweak({ publicKey: userPublicKey }, 'CHAT-' + userPublicKey.toString('hex'))
    return this.base.append('add ' + keyPair.publicKey.toString('hex'))
  }

  addMessage (message) {
    return this.base.append('msg ' + message)
  }

  getMessages () {
    const length = this.base.view.length
    return Promise.all([...Array(length).keys()].map(i => this.base.view.get(i)))
  }

  _open (store) {
    return store.get('chat')
  }

  async _apply (nodes, view, base) {
    for (const { value } of nodes) {
      const v = value.toString()
      const op = v.split(' ')[0]
      const val = v.split(' ')[1]
      if (op === 'add') {
        await base.addWriter(Buffer.from(val, 'hex'), { indexer: true })
        continue
      }
      if (op === 'msg') {
        view.append(val)
        this.emit('message', val)
      }
    }
  }
}
