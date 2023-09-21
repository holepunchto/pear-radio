import Corestore from 'corestore'
import ram from 'random-access-memory'
import Autobase from '@holepunchto/autobase'
import tweak from 'hypercore-crypto-tweak'
import EventEmmiter from 'events'
import { createManifest } from './manifest.js'

export class Chat extends EventEmmiter {
  constructor (userKeyPair, opts = {}) {
    super()
    const namespace = ('PEAR_RADIO_CHAT').padEnd(32, '\0')
    this.bootstrap = opts.bootstrap ? tweak({ publicKey: opts.bootstrap }, namespace).publicKey : undefined
    this.store = opts.store || new Corestore(ram)
    const hypercoreOpts = { key: userKeyPair.publicKey, keyPair: userKeyPair, manifest: createManifest(userKeyPair.publicKey, namespace) }
    this.base = new Autobase(this.store, this.bootstrap, { ...hypercoreOpts, apply: this._apply.bind(this), open: this._open, ackInterval: 100, ackThreshold: 0 })
  }

  async ready () {
    await this.store.ready()
    await this.base.ready()
  }

  async destroy () {
    // TODO close autobase
  }

  addWriter (userPublicKey) {
    const namespace = ('PEAR_RADIO_CHAT').padEnd(32, '\0')
    const keyPair = tweak({ publicKey: userPublicKey }, namespace)
    return this.base.append('add ' + keyPair.publicKey.toString('hex'))
  }

  addMessage (message, username) {
    return this.base.append(`msg ${username}: ${message}`)
  }

  getMessages () {
    const length = this.base.view.length
    return Promise.all([...Array(length).keys()].map(i => this.base.view.get(i)))
  }

  parseMessage (message) {
    const user = message.split(':')[0]
    const msg = message.split(':').splice(1).join(':')
    return { user, msg }
  }

  _open (store) {
    return store.get('chat')
  }

  async _apply (nodes, view, base) {
    for (const { value } of nodes) {
      const v = value.toString()
      const op = v.split(' ')[0]
      const val = v.split(' ').splice(1).join(' ')
      if (op === 'add') {
        await base.addWriter(Buffer.from(val, 'hex'), { isIndexer: false }) // only indexer is sthe streamer
        continue
      }
      if (op === 'msg') {
        await view.append(val)
        this.emit('message', this.parseMessage(val)) // TODO change
      }
    }
  }
}
