import { User } from './user.js'
import { Streamer, Listener, HttpAudioStreamer, TagManager, Mp3ReadStream } from './streamer.js'

// TODO: only for testing
const bootstrap = [{ host: '127.0.0.1', port: 49737 }]

window.onload = async () => {
  const user = new User({ bootstrap })
  const streamer = new Streamer({ bootstrap })
  const httpAudioStreamer = new HttpAudioStreamer()
  const tagManager = new TagManager()

  let currentTrackDuration = null
  let player = document.querySelector('#player')

  let intervalIsFinished = null
  let intervalIsBuffering = null

  await streamer.ready()

  await user.ready()
  user.info = { stream: streamer.core.key, metadata: streamer.metadata.key, name: 'Rafa', description: 'Stream description', tags: 'tag1 tag2' }
  console.log(user.server.publicKey.toString('hex')) // TODO render

  await httpAudioStreamer.ready()
  document.querySelector('#player').src = 'http://localhost:' + httpAudioStreamer.port

  document.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  document.addEventListener('drop', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    document.querySelector('#tracklist-placeholder')?.remove()
    for (const f of event.dataTransfer.files) {
      addTrack(await Mp3ReadStream.readTrack(f.path))
      streamer.addTrack(f.path)
    }
  })

  document.querySelector('#tracklist-icon').onclick = () => {
    selectIcon('#tracklist-icon')
    fade(document.querySelector('#stream'), document.querySelector('#listen'))
  }

  document.querySelector('#search-icon').onclick = () => {
    selectIcon('#search-icon')
    document.querySelector('#search-input').focus({ preventScroll: true })
    fade(document.querySelector('#listen'), document.querySelector('#stream'))
  }

  document.querySelector('#search-input').addEventListener('input', async () => {
    const searchText = document.querySelector('#search-input').value
    if (searchText.length === 64) { // Search is a pk
      const info = await user.getUserInfo(Buffer.from(searchText, 'hex'))
      if (info) {
        resetSearchResults()
        addResult(info)
      }
    } else {
      // await streamer.searchTag(searchText)
    }
  })

  // TODO change to resume
  document.querySelector('#play-controls').onclick = async () => {
    const { index } = await streamer.next(1)
    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    document.querySelector('#tracklist').children.item(index).classList.add('playing')
    document.querySelector('#play-controls').classList.add('disabled')
    document.querySelector('#pause-controls').classList.remove('disabled')
  }

  document.querySelector('#forward-controls').onclick = async () => {
    const { stream, index, info } = await streamer.next(1)
    httpAudioStreamer.stream(stream)

    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    document.querySelector('#tracklist').children.item(index).classList.add('playing')

    play(info)
  }

  document.querySelector('#backward-controls').onclick = async () => {
    const { stream, index, info } = await streamer.next(-1)
    httpAudioStreamer.stream(stream)

    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    document.querySelector('#tracklist').children.item(index).classList.add('playing')

    play(info)
  }

  document.querySelector('#pause-controls').onclick = async () => {
    document.querySelector('#player').pause()
    document.querySelector('#play-controls').classList.remove('disabled')
    document.querySelector('#pause-controls').classList.add('disabled')
  }

  const resetSearchResults = () => {
    document.querySelector('#streamers').innerHTML = ''
  }

  const fade = (in_, out) => {
    in_.classList.remove('fade-in', 'fade-out')
    out.classList.remove('fade-in', 'fade-out')
    in_.classList.add('fade-in')
    out.classList.add('fade-out')
  }

  const selectIcon = (icon) => {
    const icons = ['#stream-icon', '#tracklist-icon', '#search-icon', '#favourites-icon']
    icons.forEach(i => document.querySelector(i).classList.remove('selected-header-icon'))
    document.querySelector(icon).classList.add('selected-header-icon')
  }

  const addTrack = (info) => {
    const track = document.createElement('div')
    const trackname = document.createElement('p')
    const artist = document.createElement('p')
    const duration = document.createElement('p')

    // TODO change default name
    trackname.innerHTML = info.name ? (info.name.length < 20 ? info.name : info.name.substr(0, 20) + '...') : info.file
    duration.innerHTML = info.duration
    artist.innerHTML = info.artist || 'Unknown artist'

    track.classList.add('tracklist-track')
    trackname.classList.add('tracklist-trackname')
    duration.classList.add('duration')
    artist.classList.add('tracklist-artist')

    track.append(trackname)
    track.append(duration)
    track.append(artist)

    track.onclick = async () => {
      const { stream } = await streamer.next(info.path)
      httpAudioStreamer.stream(stream)
      Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
      track.classList.add('playing')
      play(info)
    }

    document.querySelector('#tracklist').append(track)
  }

  const addResult = (info) => {
    let listener = null
    const result = createSearchResult()

    result.play.onclick = async () => {
      Array.from(document.getElementsByClassName('streamer-selected')).forEach((e) => e.classList.remove('streamer-selected'))
      Array(result.streamer, result.name, result.description, result.listen, result.playing, result.fav).forEach(e => e.classList.add('streamer-selected'))
      result.listen.classList.add('disabled')
      result.playing.classList.remove('disabled')
      result.play.classList.add('disabled')
      result.pause.classList.remove('disabled')

      listener = new Listener(info.stream, info.metadata, { bootstrap })
      await listener.ready()
      const { stream, metadata } = await listener.listen()
      metadata.on('data', (data) => { result.playing.innerHTML = `Playing: ${data.artist || 'Unknown artist'} - ${data.name || 'Unknown track'}` })
      await httpAudioStreamer.stream(stream)
      play()
    }

    result.pause.onclick = async () => {
      listener.destroy()
      document.querySelector('#player').pause()
      Array(result.streamer, result.name, result.description, result.listen, result.playing, result.fav).forEach(e => e.classList.remove('streamer-selected'))
      result.playing.classList.add('disabled')
      result.listen.classList.remove('disabled')
      result.pause.classList.add('disabled')
      result.play.classList.remove('disabled')
    }

    function createSearchResult () {
      const streamer = document.createElement('div')
      const name = document.createElement('p')
      const description = document.createElement('p')
      const listen = document.createElement('p')
      const playing = document.createElement('p')

      const fav = document.createElement('i')
      const play = document.createElement('i')
      const pause = document.createElement('i')

      fav.classList.add('far', 'fa-heart', 'streamer-like')
      play.classList.add('fas', 'fa-play', 'streamer-play')
      pause.classList.add('fas', 'fa-pause', 'streamer-pause', 'disabled')

      name.innerHTML = info.name
      Array(fav, play, pause).forEach(e => name.append(e))
      description.innerHTML = info.description
      listen.innerHTML = ''
      playing.innerHTML = 'Playing...'

      streamer.classList.add('streamer')
      name.classList.add('streamer-name')
      description.classList.add('streamer-description')
      listen.classList.add('listen')
      playing.classList.add('listen', 'disabled')

      streamer.append(name)
      streamer.append(description)
      streamer.append(listen)
      streamer.append(playing)

      document.querySelector('#streamers').append(streamer)
      return { streamer, name, description, listen, playing, play, pause, fav }
    }
  }

  function play (info) { // Remove previous buffered music
    currentTrackDuration = info.seconds
    player.remove()
    player = document.createElement('audio')
    player.src = 'http://localhost:' + httpAudioStreamer.port
    player.setAttribute('type', 'audio/mpeg')
    document.body.appendChild(player)
    player.volume = 0.5 // TODO check with others
    player.play()

    if (!intervalIsBuffering) intervalIsBuffering = trackIsBuffering()
    if (!intervalIsFinished) intervalIsFinished = trackIsFinished()

    document.querySelector('#thumbnail-track').innerHTML = info.name || info.file
    document.querySelector('#thumbnail-artist').innerHTML = info.artist || 'Unkown artist'
  }

  function trackIsBuffering () {
    return setInterval(() => {
      try {
        player.buffered.end(0)
        // Done
      } catch (err) {
        // Buffering...
        console.log('buffering...')
      }
    }, 100)
  }

  function trackIsFinished () {
    return setInterval(async () => {
      if (player && currentTrackDuration && !player.paused && player.currentTime + 2 >= currentTrackDuration) {
        player.currentTime = 0 // This must happen right after track is finished
        player.pause()

        const { stream, index, info } = await streamer.next(1)
        httpAudioStreamer.stream(stream)
        play(info)

        Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
        document.querySelector('#tracklist').children.item(index).classList.add('playing')
      }
    }, 100)
  }

  /*
    addTrack(await Mp3ReadStream.readTrack('/home/rpaezbas/Desktop/music/dakim - youstandit-leftrecord/03 - hounds.mp3'))
    streamer.addTrack('/home/rpaezbas/Desktop/music/dakim - youstandit-leftrecord/03 - hounds.mp3')
  */
}
