import EventEmmiter from 'events'
import NodeID3 from 'node-id3'
import fs from 'fs'
import { basename } from 'path'
import ffprobe from '@dropb/ffprobe'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import ram from 'random-access-memory'
import http from 'http'
import sodium from 'sodium-native'
import { Chat } from './chat.js'
import { createManifest } from './manifest.js'

const PEAR_RADIO_STREAM = 'pear_radio_stream'
const PEAR_RADIO_METADATA = 'pear_radio_metadata'

export class HttpAudioStreamer {
  constructor (opts = {}) {
    this.listeners = []
    this.streaming = null
    this.cli = opts.cli
    this.buffer = []
    this.server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'audio/mp3',
        'Transfer-Encoding': 'chunked'
      })
      this.listeners.push(res)
      if (this.cli) this.buffer.forEach(e => res.write(e))
    })
  }

  ready () {
    return new Promise((resolve) => {
      this.server.listen(this.port || 0, '127.0.0.1', () => {
        this.port = this.port || this.server.address().port
        resolve(this.port)
      })
    })
  }

  async stream (readStream) {
    if (this.streaming) await this.streaming.destroy()
    this.streaming = readStream
    readStream.on('data', data => {
      if (this.cli) this.buffer.push(data)
      this.listeners.forEach(l => l.write(data))
    })
  }

  async stop () {
    if (this.streaming) await this.streaming.destroy()
    this.streaming = null
  }
}

export class Mp3ReadStream {
  static async stream (path) {
    const bitRate = (await ffprobe.ffprobe(path)).format.bit_rate // bits per seconds
    const localStream = fs.createReadStream(path)
    const remoteStream = fs.createReadStream(path, { highWaterMark: Math.floor(bitRate / 8) }) // chunks are ~1 second of audio, helps in sync calculation
    return { localStream, remoteStream }
  }

  static async readTrack (path) {
    const tags = NodeID3.read(path)
    const duration = Math.floor((await ffprobe.ffprobe(path)).format.duration)
    const secondsToMinutes = (seconds) => Math.floor(seconds / 60) + ':' + (seconds % 60 >= 10 ? seconds % 60 : '0' + seconds % 60)
    const file = basename(path)
    return { file, name: tags.title, artist: tags.artist, duration: secondsToMinutes(duration), seconds: duration, path }
  }
}

export class TagManager extends EventEmmiter {
  constructor (user, opts = {}) {
    super()
    this.user = user
    this.swarm = new Hyperswarm(opts)
    this.swarm.on('connection', (conn, info) => this._onConnection(conn, info))
    this.tags = new Map() // acts as cache memory
  }

  _onConnection (connection, info) {
    connection.write(this.user.encodeUserInfo())
    connection.on('data', (encodedUser) => {
      const decodedUser = this.user.decodeUserInfo(encodedUser)
      this.emit('stream-found', decodedUser)
      if (decodedUser.tags) {
        decodedUser.tags.split(',').forEach(tag => {
          if (!this.tags.has(tag)) this.tags.set(tag, [])
          this.tags.get(tag).push(decodedUser)
        })
      }
      this.tags.get('#all').push(decodedUser)
    })
  }

  async ready () {
    this.announce() // announce to the #all channel
    this.tags.set('#all', [])
    this.searchByTag('#all')
  }

  async announce () {
    const pearRadioTopic = 'pear-radio#all'
    const hash = Buffer.alloc(32)
    sodium.crypto_generichash(hash, Buffer.from(pearRadioTopic))
    await this.swarm.join(hash)
    return this.swarm.flush()
  }

  async announceTag (tag) {
    const hash = Buffer.alloc(32)
    sodium.crypto_generichash(hash, Buffer.from(tag))
    await this.swarm.join(hash)
    return this.swarm.flush()
  }

  async searchByTag (tag) {
    if (tag === '#all') return // searched by default
    if (!this.tags.has(tag)) this.tags.set(tag, [])
    const hash = Buffer.alloc(32)
    sodium.crypto_generichash(hash, Buffer.from('pear-radio' + tag))
    await this.swarm.join(hash)
    return this.swarm.flush()
  }

  removeTag (tag) {
    return this.swarm.leave(tag)
  }

  destroy () {
    return this.swarm.destroy()
  }
}

export class Streamer {
  constructor (keyPair, opts = {}) {
    this.swarm = new Hyperswarm(opts)
    this.store = new Corestore(ram, opts)
    this.keyPair = keyPair
    this.core = null
    this.metadata = null
    this.streaming = null
    this.checkpoint = null // last song starting block
    this.chat = new Chat(this.keyPair, { store: this.store })

    this.swarm.on('connection', (conn, info) => {
      this.store.replicate(conn)
    })
  }

  async ready () {
    await this.store.ready()
    this.core = this.store.get({ key: this.keyPair.publicKey, keyPair: this.keyPair, manifest: createManifest(this.keyPair.publicKey, PEAR_RADIO_STREAM) })
    this.metadata = this.store.get({ key: this.keyPair.publicKey, keyPair: this.keyPair, manifest: createManifest(this.keyPair.publicKey, PEAR_RADIO_METADATA), valueEncoding: 'json' })
    await this.core.ready()
    await this.metadata.ready()
    await this.chat.ready()
    this.swarm.join(this.core.discoveryKey)
    this.swarm.join(this.metadata.discoveryKey)
    await this.swarm.flush()
  }

  async stream (metadata, stream, opts = {}) {
    this.checkpoint = this.core.length
    if (this.streaming) await this.streaming.destroy()
    if (opts.forceRemoteCleanBuffer) metadata.cleanBuffer = true
    await this.metadata.append({ artist: metadata.artist, name: metadata.name, cleanBuffer: metadata.cleanBuffer })
    stream.on('data', data => {
      this.core.append(data)
    })
    this.streaming = stream
  }

  getMetadata () { // Return current track metadata
    return this.metadata.get(this.metadata.length - 1)
  }

  async stop () {
    if (this.streaming) await this.streaming.destroy()
    this.streaming = null
  }

  destroy () {
    this.store.destroy()
    this.swarm.destroy()
  }
}

export class Listener {
  constructor (userPublicKey, opts = {}) {
    this.userPublicKey = userPublicKey
    this.swarm = new Hyperswarm(opts)
    this.store = new Corestore(ram, opts)
    this.core = null
    this.metadata = null

    this.swarm.on('connection', conn => {
      this.store.replicate(conn)
    })
  }

  async ready () {
    await this.store.ready()
    this.core = this.store.get({ keyPair: { publicKey: this.userPublicKey }, manifest: createManifest(this.userPublicKey, PEAR_RADIO_STREAM) })
    this.metadata = this.store.get({ keyPair: { publicKey: this.userPublicKey }, manifest: createManifest(this.userPublicKey, PEAR_RADIO_METADATA), valueEncoding: 'json' })
    await this.core.ready()
    await this.metadata.ready()
    this.swarm.join(this.core.discoveryKey)
    this.swarm.join(this.metadata.discoveryKey)
    await this.swarm.flush()
  }

  async listen (fromBlock, metadataCallback) {
    const stream = this.core.createReadStream({ live: true, start: fromBlock })
    this.metadata.createReadStream({ live: true, start: this.metadata.length - 1 })
    this.metadata.on('append', async () => {
      const data = await this.metadata.get(this.metadata.length - 1)
      metadataCallback(data)
    })
    return stream
  }

  async getLastPlayedTracks (n) { // max n of tracks
    const tracks = []
    await this.metadata.update()
    for (let i = 0; i < n; i++) {
      if (i + 1 > this.metadata.length) break
      tracks.push(await this.metadata.get(this.metadata.length - i - 1))
    }
    return tracks
  }

  destroy () {
    this.swarm.destroy()
    this.store.close()
  }
}
