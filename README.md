# Pear Radio

Pear radio is a Holepunch music audio player/streamer.

```
pear run pear://tnu5wefezcdj79st747ai45msrmdqaeyrhgcjpt4n1kkymwci51y
```

```
npm install -g pear-radio
```

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
