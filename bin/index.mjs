#!/usr/bin/env node

import { User } from '../js/user.js'
import { Listener, HttpAudioStreamer } from '../js/streamer.js'
import { keyPair, randomBytes } from 'hypercore-crypto'
import { Chat } from '../js/chat.js'
import ram from 'random-access-memory'
import { tweak } from '../js/manifest.js'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import { Mp3ReadStream, Streamer } from '../js/streamer.js'
import c from 'compact-encoding'
import { syncResponse } from '../js/lib/encoding.js'

const args = process.argv
const bootstrap = process.env.TEST ? [{ host: '127.0.0.1', port: 49736 }] : undefined
const userKeyPair = keyPair(randomBytes(32))
const user = new User(null, { bootstrap, keyPair: userKeyPair })

const httpAudioStreamer = new HttpAudioStreamer({ cli: true })

const store = new Corestore(ram)
await store.ready()

const swarm = new Hyperswarm({ bootstrap })
swarm.on('connection', (conn) => {
  store.replicate(conn)
})

const playRemote = async (key, opts = {}) => {
  const listener = new Listener(key, swarm, store, { bootstrap })
  await listener.ready()
  const { block, artist, name } = await user.syncRequest(key)
  const stream = await listener.listen(block, ({ artist, name }) => {
    console.log(artist + ' - ' + name)
  })
  await httpAudioStreamer.ready()
  httpAudioStreamer.stream(stream)
  console.log('Streaming to http://localhost:' + httpAudioStreamer.port)
  console.log(artist + ' - ' + name)

  const namespace = 'pear_radio_chat'
  const streamerChatKey = await tweak(key, namespace)
  const chat = new Chat(userKeyPair, { bootstrap: streamerChatKey, store: listener.store })
  await chat.ready()

  chat.on('message', (msg) => {
    console.log('message:', msg)
  })
}

class CliPlayer {
  constructor (user, userKeyPair, swarm, store, playlist, opts = {}) {
    this.index = 0
    this.playlist = playlist // This is mandatory
    this.random = opts.random
    this.user = user
    this.user.player = this
    this.streamer = new Streamer(userKeyPair, swarm, store, { bootstrap })
  }

  async ready () {
    await this.user.ready()
    await this.streamer.ready()
    this.playlist.forEach(e => this.playlist.push(e))
  }

  async syncRequest (req) {
    const block = this.streamer.checkpoint // TODO this is always start of the song playing, improve
    const { artist, name } = await this.streamer.getMetadata()
    console.log(block, artist, name)
    return c.encode(syncResponse, { block, artist, name })
  }

  async play (opts = {}) {
    const path = this.playlist[this.index++ % this.playlist.length]
    const { _, remoteStream } = await Mp3ReadStream.stream(path) // will only use remote stream even for local
    const metadata = await Mp3ReadStream.readTrack(path)
    await this.streamer.stream(metadata, remoteStream, opts)
    setTimeout(() => {
      this.index++
      play()
    }, metadata.seconds * 1000)
  }
}

const playlist = null // TODO

// TODO add cli parameter for this
user.info = {
  publicKey: user.keyPair.publicKey,
  name: 'user-cli'
}

const player = new CliPlayer(user, userKeyPair, swarm, store, ['/home/rafapaezbas/Desktop/a.mp3'])
await player.ready()
await player.play()
console.log(user.server.publicKey.toString('hex'))

// Create command to play remote and emit
// const key = Buffer.from(args[2], 'hex')
// await playRemote(key)
