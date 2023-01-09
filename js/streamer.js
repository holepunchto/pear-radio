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
  static async stream (track) {
    const bitRate = (await ffprobe.ffprobe(track)).format.bit_rate
    const throttle = new Throttle(bitRate / 8)
    const readStream = fs.createReadStream(track)
    return readStream.pipe(throttle)
  }

  static async readTrack (path) {
    const tags = NodeID3.read(path)
    const duration = Math.floor((await ffprobe.ffprobe(path)).format.duration)
    const secondsToMinutes = (seconds) => Math.floor(seconds / 60) + ':' + (seconds % 60 >= 10 ? seconds % 60 : '0' + seconds % 60)
    const file = basename(path)
    return { file, name: tags.title, artist: tags.artist, duration: secondsToMinutes(duration), seconds: duration, path }
  }
}

export class TagManager {
  constructor (opts = {}) {
    this.swarm = new Hyperswarm(opts)
    this.swarm.on('connection', (conn, info) => this._onConnection(conn, info))
  }

  _onConnection (conn, info) {
  }

  announceTag (tag) {
    const hash = Buffer.alloc(32)
    sodium.crypto_generichash(hash, Buffer.from(tag))
    this.swarm.join(hash)
    return this.swarm.flush()
  }

  searchByTag (tag) {
    const hash = Buffer.alloc(32)
    sodium.crypto_generichash(hash, Buffer.from(tag))
    this.swarm.join(hash)
    return this.swarm.flush()
    // TODO how do we return results?
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
    this.playlist = []
    this.random = false
    this.index = -1
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

  async next (action) {
    if (this.streaming) this.streaming.destroy()

    if (action === 1) {
      this.index++
    } else if (action === -1) {
      this.index--
    } else {
      this.index = this.playlist.indexOf(action)
    }

    this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : this.index % this.playlist.length
    const track = this.playlist[this.index]
    const stream = await Mp3ReadStream.stream(track)
    const trackInfo = await Mp3ReadStream.readTrack(track)
    this.metadata.append(trackInfo)
    stream.on('data', data => {
      this.core.append(data)
    })
    this.streaming = stream
    return { track, stream, index: this.index, info: trackInfo }
  }

  addTrack (track) {
    this.playlist.push(track)
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
