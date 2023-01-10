import EventEmmiter from 'events'
import { Mp3ReadStream, Streamer, HttpAudioStreamer } from './streamer.js'

const bootstrap = [{ host: '127.0.0.1', port: 49737 }]

export class Player extends EventEmmiter {
  constructor (start) {
    super()
    this.start = start
    this.audio = start()
    this.streamer = new Streamer({ bootstrap })
    this.httpAudioStreamer = new HttpAudioStreamer()
    this.volume = 0.5
    this.playlist = []
    this.index = 0
    this.random = false
    this.intervalIsFinished = null
    this.intervalIsBuffering = null
    this.currentTrackDuration = null
  }

  async ready () {
    await this.streamer.ready()
    await this.httpAudioStreamer.ready()
    this.audio.src = 'http://localhost:' + this.httpAudioStreamer.port
    this.audio.volume = this.volume
  }

  async play (info) {
    if (!this.intervalIsBuffering) this.intervalIsBuffering = this.trackIsBuffering()
    if (!this.intervalIsFinished) this.intervalIsFinished = this.trackIsFinished()
    if (info) this.index = this.playlist.indexOf(info.path)

    const path = info ? info.path : this.playlist[this.index]
    const stream = await Mp3ReadStream.stream(path)
    const metadata = await Mp3ReadStream.readTrack(path)

    this.streamer.stream(metadata, stream)
    this.httpAudioStreamer.stream(stream)

    this.currentTrackDuration = metadata.seconds
    this.cleanBuffer()
    this.audio.play()

    return metadata
  }

  async playStream (stream) {
    await this.httpAudioStreamer.stream(stream)
    if (!this.intervalIsBuffering) this.intervalIsBuffering = this.trackIsBuffering()
    this.intervalIsFinished = null // only for local
    this.audio.play()
  }

  cleanBuffer () {
    this.audio.remove()
    this.audio = this.start()
    this.audio.src = 'http://localhost:' + this.httpAudioStreamer.port
    this.audio.volume = this.volume
  }

  stop () {
    this.audio.pause()
    this.cleanBuffer()
    this.streamer.stop()
  }

  async forward () {
    this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : ++this.index % this.playlist.length
    return this.play()
  }

  async backward () {
    this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : --this.index % this.playlist.length
    return this.play()
  }

  async addTrack (path) {
    this.playlist.push(path)
    return await Mp3ReadStream.readTrack(path)
  }

  trackIsBuffering () {
    return setInterval(() => {
      try {
        this.audio.buffered.end(0)
      } catch (err) {
        console.log('buffering...')
      }
    }, 100)
  }

  trackIsFinished () {
    return setInterval(async () => {
      if (this.audio && this.currentTrackDuration && !this.audio.paused && this.audio.currentTime + 2 >= this.currentTrackDuration) {
        this.audio.currentTime = 0 // This must happen right after track is finished
        this.audio.pause()
        await this.forward()
        this.emit('track-finished', this.index)
      }
    }, 100)
  }
}
