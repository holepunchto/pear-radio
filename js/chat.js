import Corestore from 'corestore'
import ram from 'random-access-memory'
import Autobase from '@holepunchto/autobase'
import EventEmmiter from 'events'
import { createManifest, tweak } from './manifest.js'

export class Chat extends EventEmmiter {
  constructor (userKeyPair, opts = {}) {
    super()
    const namespace = 'pear_radio_chat'
    this.store = opts.store || new Corestore(ram)
    const hypercoreOpts = { key: userKeyPair.publicKey, keyPair: userKeyPair, manifest: createManifest(userKeyPair.publicKey, namespace) }
    this.base = new Autobase(this.store, opts.bootstrap, { ...hypercoreOpts, apply: this._apply.bind(this), open: this._open, ackInterval: 100, ackThreshold: 0 })
  }

  async ready () {
    await this.store.ready()
    await this.base.ready()
    console.log('base local', this.base.local.key.toString('hex'))
    console.log('base bootstrap', this.base.bootstrap.toString('hex'))
  }

  async destroy () {
    // TODO close autobase
  }

  async addWriter (userPublicKey) {
    const namespace = 'pear_radio_chat'
    const publicKey = await tweak(userPublicKey, namespace)
    return this.base.append('add ' + publicKey.toString('hex'))
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
