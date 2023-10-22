# Pear Radio

Pear radio is a Holepunch music audio player/streamer.

```
npm install -g https://github.com/holepunchto/pear-radio
pear-radio [streamer-pk]
```

## Streaming and file formats

Pear radio feeds the audio stream to a single Hypercore, listeners replicate the core.
In order to get a behaviour similar to real-time streaming, the streamer throttles the Hypercore feed stream to match the bitrate of the file, that way listeners listen to the audio and receive the next chunks at the same speed. This can lead to problems due to incorrect calculation of the bit rate or buffering, resulting in audio skips. So far, tests with 320kbs files has been sucessful.

The higher the stream rate, the less synchronization between streamer and listeners. This affects song changes because listeners will listen to all the buffered audio before changing to the new song.

## Users

Users are defined by a DHT key pair and the encoded information:

```
const userInfo = compile({
  publicKey: c.buffer,
  name: c.string,
  description: c.string,
  tags: opt(c.string)
})
```

From the user public key, pear-radio derives two more keys: the stream key stream (core containing the music binary data) and the metadata key (json encoded core containing music metadata)

## Tags

Users can tag their own streams as a way to categorize it. Each tag is a Hyperswarm topic where streamer and listeners exchange the core keys.

```
  searchByTag (tag) {
    if (!this.tags.has(tag)) this.tags.set(tag, [])
    const hash = Buffer.alloc(32)
    sodium.crypto_generichash(hash, Buffer.from('pear-radio' + tag))
    this.swarm.join(hash)
    return this.swarm.flush()
  }

  // ...

  this.swarm.on('connection', (conn, info) => onConnection(conn, info))

  onConnection (connection, info) {
    connection.write(this.user.encodeUserInfo())
    connection.on('data', (encodedUser) => {
      const decodedUser = this.user.decodeUserInfo(encodedUser)
      this.emit('stream-found', decodedUser)
    })
  }
```

All streams use the tag #all by default. Streams that do not join #all are considered private.

## Audio capture

For now, Pear Radio only streams audio files, but should not be difficult to capture audio and stream it in the same way.

## UI

<img src="https://user-images.githubusercontent.com/15270736/211868865-b51cdfe4-6195-4c21-8323-d7f86dced1ee.png" width=35% height=35%>


## Pear-radio on the terminal

Streamer side:

```
pear-radio stream -library /path/to/your/music/library
# Streaming on: e4f2581e0b2a9edc280a7aadb960bdc8cc71f246083b15a8ddd5e3d42c3a2b85
```

Listener side:

```
pear-radio listen --key e4f2581e0b2a9edc280a7aadb960bdc8cc71f246083b15a8ddd5e3d42c3a2b85 
# Streaming to http://localhost:38059
```
