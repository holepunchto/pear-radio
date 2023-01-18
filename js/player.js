import EventEmmiter from 'events'
import { Mp3ReadStream, Streamer, HttpAudioStreamer } from './streamer.js'

const bootstrap = process.env.TEST ? [{ host: '127.0.0.1', port: 49737 }] : undefined

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
    this.isPlayingLocal = false
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

    this.cleanBuffer()

    const path = info ? info.path : this.playlist[this.index]
    const { localStream, remoteStream } = await Mp3ReadStream.stream(path)
    const metadata = await Mp3ReadStream.readTrack(path)

    await this.streamer.stream(metadata, remoteStream)
    await this.httpAudioStreamer.stream(localStream)

    await this.audio.play()
    this.isPlayingLocal = true

    return metadata
  }

  async playStream (stream) {
    await this.streamer.stop() // stop streaming if you are going to play another stream
    await this.httpAudioStreamer.stream(stream)
    if (!this.intervalIsBuffering) this.intervalIsBuffering = this.trackIsBuffering()
    this.intervalIsFinished = null // only for local
    this.cleanBuffer()
    await this.audio.play()
    this.isPlayingLocal = false
  }

  cleanBuffer () {
    this.audio.pause()
    this.audio.load()
  }

  stop () {
    this.audio.pause()
    this.cleanBuffer()
    this.streamer.stop()
    this.isPlayingLocal = false
  }

  async forward () {
    this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : (this.index + 1) % this.playlist.length
    return this.play()
  }

  async backward () {
    this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : (this.index - 1) % this.playlist.length
    return this.play()
  }

  async addTrack (path) {
    this.playlist.push(path)
    return await Mp3ReadStream.readTrack(path)
  }

  currentAudioBlock () {
    return this.streamer.checkpoint + Math.floor(this.audio.currentTime)
  }

  trackIsBuffering () {
    return setInterval(() => {
      try {
        this.audio.buffered.end(0)
        this.emit('buffering-finished')
      } catch (err) {
        this.emit('buffering')
      }
    }, 100)
  }

  trackIsFinished () {
    let last = -1
    return setInterval(async () => {
      if (this.isPlayingLocal && last && this.audio.currentTime === last && this.audio.currentTime !== 0.1) {
        const metadata = await this.forward()
        this.emit('track-finished', { index: this.index, metadata })
        last = -1
      }
      last = this.audio.currentTime
    }, 100)
  }
}
