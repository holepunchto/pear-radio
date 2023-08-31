#!/usr/bin/env node

import { User } from '../js/user.js'
import { Listener, HttpAudioStreamer } from '../js/streamer.js'
import { keyPair, randomBytes } from 'hypercore-crypto'
import { Chat } from '../js/chat.js'
import { once } from 'events'

const args = process.argv
const bootstrap = process.env.TEST ? [{ host: '127.0.0.1', port: 49736 }] : undefined
const userKeyPair = keyPair(randomBytes(32))
const user = new User(null, { bootstrap, keyPair: userKeyPair })

const httpAudioStreamer = new HttpAudioStreamer({ cli: true })

const playRemote = async (key, opts = {}) => {
  const listener = new Listener(key, { bootstrap })
  await listener.ready()
  const { block, artist, name } = await user.syncRequest(key)
  const stream = await listener.listen(block, ({ artist, name }) => {
    console.log(artist + ' - ' + name)
  })
  await httpAudioStreamer.ready()
  httpAudioStreamer.stream(stream)
  console.log('Streaming to http://localhost:' + httpAudioStreamer.port)
  console.log(artist + ' - ' + name)

  const chat = new Chat(userKeyPair, { bootstrap: key, store: listener.store })
  await chat.ready()

  chat.on('message', (msg) => {
    console.log('message:', msg)
  })

  setInterval(async () => {
    // await chat.base.update()
    // if (!chat.base.writable) await once(chat.base, 'writable')
    // chat.addMessage(Date.now().toString())
  }, 1000)
}

const key = Buffer.from(args[2], 'hex')
await playRemote(key)
