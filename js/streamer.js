import EventEmmiter from 'events'
import NodeID3 from 'node-id3'
import fs from 'fs'
import { basename } from 'path'
import ffprobe from '@dropb/ffprobe'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import ram from 'random-access-memory'
import Throttle from 'throttle'
import http from 'http'
import sodium from 'sodium-native'

export class HttpAudioStreamer {
  constructor () {
    this.listeners = []
    this.streaming = null
    this.server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'audio/mp3',
        'Transfer-Encoding': 'chunked'
      })
      this.listeners.push(res)
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
    const bufferOffset = 7 // TODO tweak value between 0-8, the higher this value, the faster stream but less realtime
    const bitRate = (await ffprobe.ffprobe(path)).format.bit_rate // bits per seconds
    const throttle = new Throttle(bitRate / (8 - bufferOffset)) // bytes per seconds
    const localStream = fs.createReadStream(path)
    const remoteStream = fs.createReadStream(path).pipe(throttle)
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
    console.log(connection)
    console.log(info)
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
  constructor (opts = {}) {
    this.swarm = new Hyperswarm(opts)
    this.store = new Corestore(ram, opts)
    this.core = null
    this.metadata = null
    this.streaming = null

    this.swarm.on('connection', (conn, info) => {
      this.store.replicate(conn)
    })
  }

  async ready () {
    await this.store.ready()
    this.core = this.store.get({ name: 'stream', valueEncoding: 'binary' })
    this.metadata = this.store.get({ name: 'metadata', valueEncoding: 'json' })
    await this.core.ready()
    await this.metadata.ready()
    this.swarm.join(this.core.discoveryKey)
    this.swarm.join(this.metadata.discoveryKey)
    await this.swarm.flush()
  }

  async stream (metadata, stream) {
    if (this.streaming) await this.streaming.destroy()
    this.metadata.append(metadata)
    stream.on('data', data => {
      this.core.append(data)
    })
    this.streaming = stream
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
  constructor (key, metadataKey, opts = {}) {
    this.key = key
    this.metadataKey = metadataKey
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
    this.core = this.store.get({ key: this.key, valueEncoding: 'binary' })
    this.metadata = this.store.get({ key: this.metadataKey, valueEncoding: 'json' })
    await this.core.ready()
    await this.metadata.ready()
    this.swarm.join(this.core.discoveryKey)
    this.swarm.join(this.metadata.discoveryKey)
    await this.swarm.flush()
  }

  async listen () {
    await this.core.update()
    await this.metadata.update()
    const stream = this.core.createReadStream({ live: true, start: this.core.length })
    const metadata = this.metadata.createReadStream({ live: true, start: this.metadata.length - 1 })
    return { stream, metadata }
  }

  destroy () {
    this.swarm.destroy()
    this.store.close()
  }
}
