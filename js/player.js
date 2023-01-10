import EventEmmiter from 'events'
import { Mp3ReadStream, Streamer, HttpAudioStreamer } from './streamer.js'

const bootstrap = [{ host: '127.0.0.1', port: 49737 }]

export class Player extends EventEmmiter {
  constructor (audio, document) {
    super()
    this.audio = typeof audio === 'function' ? audio() : audio
    this.streamer = new Streamer({ bootstrap })
    this.httpAudioStreamer = new HttpAudioStreamer()
    this.volume = 0.5
    this.playlist = []
    this.index = 0
    this.random = false
    this.intervalIsFinished = null
    this.intervalIsBuffering = null
    this.currentTrackDuration = null

    this.document = document
  }

  async ready () {
    await this.streamer.ready()
    await this.httpAudioStreamer.ready()
    this.audio.src = 'http://localhost:' + this.httpAudioStreamer.port
  }

  async play (info) {
    if (!this.intervalIsBuffering) this.intervalIsBuffering = this.trackIsBuffering()
    if (!this.intervalIsFinished) this.intervalIsFinished = this.trackIsFinished()

    const path = info ? info.path : this.playlist[this.index]
    const stream = await Mp3ReadStream.stream(path)
    const metadata = await Mp3ReadStream.readTrack(path)

    this.streamer.stream(metadata, stream)
    this.httpAudioStreamer.stream(stream)

    this.currentTrackDuration = metadata.seconds
    this.cleanBuffer()
    this.audio.play()
  }

  async playStream (stream) {
    await this.httpAudioStreamer.stream(stream)
    if (!this.intervalIsBuffering) this.intervalIsBuffering = this.trackIsBuffering()
    this.intervalIsFinished = null // only for local

    this.cleanBuffer()
    this.audio.play()
  }

  cleanBuffer () {
    this.audio.remove()
    this.audio = this.document.createElement('audio')
    this.audio.src = 'http://localhost:' + this.httpAudioStreamer.port
    this.audio.setAttribute('type', 'audio/mpeg')
    this.document.body.appendChild(this.audio)
    this.audio.volume = 0.5 // TODO check with others
  }

  pause () {

  }

  async next () {
    this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : this.index++ % this.playlist.length
    await this.play()
  }

  forward () {
    // this.index++
    // this.index = this.random ? Math.floor(Math.random() * this.playlist.length) : this.index % this.playlist.length
  }

  backward () {

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
        await this.next()
        this.emit('track-finished', this.index)
      }
    }, 100)
  }
}
