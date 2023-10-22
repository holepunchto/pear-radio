#!/usr/bin/env node

import { User } from '../js/user.js'
import { Listener, HttpAudioStreamer, Mp3ReadStream, Streamer } from '../js/streamer.js'
import { keyPair, randomBytes } from 'hypercore-crypto'
import { Chat } from '../js/chat.js'
import ram from 'random-access-memory'
import { tweak } from '../js/manifest.js'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import c from 'compact-encoding'
import { syncResponse } from '../js/lib/encoding.js'
import subcommand from 'subcommand'
import { readdir } from 'fs/promises'
import { join } from 'path'

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
    return c.encode(syncResponse, { block, artist, name })
  }

  async play (opts = {}) {
    const path = this.playlist[this.index++ % this.playlist.length]
    const { _, remoteStream } = await Mp3ReadStream.stream(path) // will only use remote stream even for local
    const metadata = await Mp3ReadStream.readTrack(path)
    await this.streamer.stream(metadata, remoteStream, opts)
    setTimeout(() => {
      this.index++
      this.play()
    }, metadata.seconds * 1000)
  }
}

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

const listen = async (key, opts = {}) => {
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

const stream = async (opts = {}) => {
  user.info = { // TODO
    publicKey: user.keyPair.publicKey,
    name: opts.username || 'default name'
  }
  const playlist = (await readdir(opts.library)).filter(e => e.includes('.mp3')).map(e => join(opts.library, e))
  const player = new CliPlayer(user, userKeyPair, swarm, store, playlist)
  await player.ready()
  await player.play()
  console.log('Streaming on:', user.server.publicKey.toString('hex'))
}

const commands = [
  {
    name: 'stream',
    help: 'Stream local library to remote listeners.',
    options: [
      {
        name: 'username',
        abbr: 'u',
        help: 'Set streamer username.'
      },
      {
        name: 'random',
        abbr: 'r',
        boolean: true,
        default: false,
        help: 'Random playlist order.'
      },
      {
        name: 'library',
        abbr: 'l',
        help: 'Set library path.'
      }
    ],
    command: async (args) => await stream({ library: args.l }),
    usage: function (args, help, usage) {
      console.log(help)
      console.log(usage)
      process.exit(0)
    }
  },
  {
    name: 'listen',
    help: 'Listen to remote stream.',
    options: [
      {
        name: 'key',
        abbr: 'k',
        help: 'Streamer key.'
      }
    ],
    command: async (args) => await listen(Buffer.from(args.k, 'hex')),
    usage: function (args, help, usage) {
      console.log(help)
      console.log(usage)
      process.exit(0)
    }
  }
]

const args = process.argv.slice(2)

if (args[0] !== 'stream' && args[0] !== 'listen') {
  console.log('Pear radio terminal streamer/listener.')
  console.log('     stream [--help]      Stream your local library.')
  console.log('     listen [--help]      Listen to a remote streamer.')
  process.exit(0)
}

const match = subcommand({ usage: true, commands })
const matched = match(args)
if (!matched) {
  process.exit(0)
}
