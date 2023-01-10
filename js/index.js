import { User } from './user.js'
import { Player } from './player.js'
import { Listener, TagManager } from './streamer.js'

const bootstrap = [{ host: '127.0.0.1', port: 49737 }]
const user = new User({ bootstrap })
const tagManager = new TagManager()

const player = new Player(() => {
  const audio = document.createElement('audio')
  audio.setAttribute('type', 'audio/mpeg')
  document.body.appendChild(audio)
  return audio
})

const addTrack = (info) => {
  const track = document.createElement('div')
  const trackname = document.createElement('p')
  const artist = document.createElement('p')
  const duration = document.createElement('p')

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
    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    track.classList.add('playing')
    play(info)
  }

  document.querySelector('#tracklist').append(track)
}

const resetSearchResults = () => {
  document.querySelector('#streamers').innerHTML = ''
}

const createSearchResult = (info) => {
  const streamer = document.createElement('div')
  const name = document.createElement('p')
  const description = document.createElement('p')
  const tags = document.createElement('p')
  const listen = document.createElement('p')
  const playing = document.createElement('p')

  const fav = document.createElement('i')
  const play = document.createElement('i')
  const pause = document.createElement('i')

  fav.classList.add('far', 'fa-heart', 'streamer-like')
  play.classList.add('far', 'fa-play-circle', 'streamer-play')
  pause.classList.add('fas', 'fa-pause', 'streamer-pause', 'disabled')

  name.innerHTML = info.name
  Array(fav, play, pause).forEach(e => name.append(e))
  description.innerHTML = info.description.length > 0 ? info.description : 'No description provided.'
  tags.innerHTML = info.tags && info.tags.length > 0 ? info.tags : 'No tags provided.'
  listen.innerHTML = ''
  playing.innerHTML = 'Buffering...'

  streamer.classList.add('streamer')
  name.classList.add('streamer-name')
  description.classList.add('streamer-description')
  tags.classList.add('streamer-tags')
  listen.classList.add('listen')
  playing.classList.add('listen', 'disabled')

  streamer.append(name)
  streamer.append(description)
  streamer.append(tags)
  streamer.append(listen)
  streamer.append(playing)

  document.querySelector('#streamers').append(streamer)
  return { streamer, name, description, listen, playing, play, pause, fav }
}

const addResult = (info) => {
  let listener = null
  const result = createSearchResult(info)

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
    await player.playStream(stream)

    metadata.on('data', (data) => { result.playing.innerHTML = `Playing: ${data.artist || 'Unknown artist'} - ${data.name || 'Unknown track'}` })
  }

  result.pause.onclick = async () => {
    listener.destroy()
    player.pause()

    Array(result.streamer, result.name, result.description, result.listen, result.playing, result.fav).forEach(e => e.classList.remove('streamer-selected'))
    result.playing.classList.add('disabled')
    result.listen.classList.remove('disabled')
    result.pause.classList.add('disabled')
    result.play.classList.remove('disabled')
  }
}

const play = async (info) => { // Remove previous buffered music
  document.querySelector('#thumbnail-track').innerHTML = info.name || info.file
  document.querySelector('#thumbnail-artist').innerHTML = info.artist || 'Unkown artist'
  return player.play(info)
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

const updateThumbnail = (metadata) => {
  document.querySelector('#thumbnail-track').innerHTML = metadata.name || metadata.file
  document.querySelector('#thumbnail-artist').innerHTML = metadata.artist || 'Unkown artist'
}

const updatePlaylist = (metadata) => {
  Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
  document.querySelector('#tracklist').children.item(player.index).classList.add('playing')
}

window.onload = async () => {
  await user.ready()
  await player.ready()

  // TODO remove
  const pk = user.server.publicKey.toString('hex')
  user.info = { stream: player.streamer.core.key, metadata: player.streamer.metadata.key, name: pk.substr(0, 6) + '...', description: '', tags: '' }
  console.log(pk)

  document.addEventListener('dragover', async (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  document.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.querySelector('#tracklist-placeholder')?.remove()
    for (const f of e.dataTransfer.files) {
      const metadata = await player.addTrack(f.path)
      addTrack(metadata)
    }
  })

  document.querySelector('#tracklist-icon').onclick = async () => {
    selectIcon('#tracklist-icon')
    fade(document.querySelector('#stream'), document.querySelector('#listen'))
  }

  document.querySelector('#search-icon').onclick = async () => {
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

  document.querySelector('#forward-controls').onclick = async () => {
    const metadata = await player.forward()
    updateThumbnail(metadata)
    updatePlaylist(metadata)
  }

  document.querySelector('#backward-controls').onclick = async () => {
    const metadata = await player.backward()
    updateThumbnail(metadata)
    updatePlaylist(metadata)
  }

  document.querySelector('#stop-controls').onclick = async () => {
    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    player.stop()
  }

  document.querySelector('#play-controls').onclick = async () => {
    const metadata = await player.play()
    updateThumbnail(metadata)
    updatePlaylist(metadata)
  }

  player.on('track-finished', async (index) => {
    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    document.querySelector('#tracklist').children.item(index).classList.add('playing')
  })

  player.on('buffering', async () => {
  })

  player.on('buffering-finished', async () => {
  })
}
