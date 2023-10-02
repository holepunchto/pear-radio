#!/usr/bin/env node

import { User } from '../js/user.js'
import { Listener, HttpAudioStreamer } from '../js/streamer.js'
import { keyPair, randomBytes } from 'hypercore-crypto'
import { Chat } from '../js/chat.js'
import { once } from 'events'
import ram from 'random-access-memory'
import { tweak } from '../js/manifest.js'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'

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

const key = Buffer.from(args[2], 'hex')
await playRemote(key)
