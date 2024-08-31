# Pear Radio

Pear radio is a Holepunch music audio player/streamer.

```
pear run pear://qs55y895qbr5im4gi4pdgqzbbhf4ajrpkm8p43e7iwu19kfenf7o
```

<img src="https://user-images.githubusercontent.com/15270736/211868865-b51cdfe4-6195-4c21-8323-d7f86dced1ee.png" width=35% height=35%>

## Pear-radio on the terminal

```
npm install -g pear-radio
```

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
