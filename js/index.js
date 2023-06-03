import { User } from './user.js'
import { Player } from './player.js'
import { Listener, TagManager } from './streamer.js'
import copy from 'copy-text-to-clipboard'
import configuration from './config.js'
import { keyPair, randomBytes } from 'hypercore-crypto'

const bootstrap = process.env.TEST ? [{ host: '127.0.0.1', port: 49736 }] : undefined

window.onload = async () => {
  const { getConfig, setConfig } = await configuration()

  if (!getConfig('seed')) {
    setConfig('seed', randomBytes(32).toString('hex'))
  }

  if (!getConfig('favourites')) {
    setConfig('favourites', JSON.stringify([]))
  }

  const userKeyPair = keyPair(Buffer.from(getConfig('seed'), 'hex'))

  const player = new Player(() => {
    const audio = document.createElement('audio')
    audio.setAttribute('type', 'audio/mpeg')
    document.body.appendChild(audio)
    return audio
  }, userKeyPair)

  const user = new User(player, { bootstrap, keyPair: userKeyPair })
  const tagManager = new TagManager(user, { bootstrap })

  const addTrack = (metadata) => {
    const track = document.createElement('div')
    const trackname = document.createElement('p')
    const artist = document.createElement('p')
    const duration = document.createElement('p')

    trackname.innerHTML = metadata.name ? (metadata.name.length < 20 ? metadata.name : metadata.name.substr(0, 20) + '...') : metadata.file
    duration.innerHTML = metadata.duration
    artist.innerHTML = metadata.artist || 'Unknown artist'

    track.classList.add('tracklist-track')
    trackname.classList.add('tracklist-trackname')
    duration.classList.add('duration')
    artist.classList.add('tracklist-artist')

    track.append(trackname)
    track.append(duration)
    track.append(artist)

    track.onclick = async () => {
      play(metadata, { forceRemoteCleanBuffer: true })
    }

    document.querySelector('#tracklist').append(track)
  }

  const showStreamersTitle = () => {
    document.querySelector('#streamers-title').classList.remove('disabled')
  }

  const hideStreamersTitle = () => {
    document.querySelector('#streamers-title').classList.add('disabled')
  }

  const showSearchingSpinner = () => {
    document.querySelector('#streamers-search-spinner').classList.remove('disabled')
  }

  const hideSearchingSpinner = () => {
    document.querySelector('#streamers-search-spinner').classList.add('disabled')
  }

  const hideStreamersPlaceholder = () => {
    document.querySelector('#streamers-placeholder').classList.add('disabled')
  }

  const resetSearchResults = () => {
    hideStreamersPlaceholder()
    document.querySelector('#streamers-list').innerHTML = ''
  }

  const disableScrolling = () => {
    document.querySelector('body').classList.add('stop-scrolling')
  }

  const enableScrolling = () => {
    document.querySelector('body').classList.remove('stop-scrolling')
  }

  const darkMode = () => {
    const r = document.querySelector(':root')
    r.style.setProperty('--main-bg-color', '#151623')
    r.style.setProperty('--main-fg-color', '#f0f3f5')
    r.style.setProperty('--secondary-fg-color', '#62649e')
    r.style.setProperty('--tertiary-fg-color', '#222338')
  }

  const lightMode = () => {
    const r = document.querySelector(':root')
    r.style.setProperty('--main-bg-color', '#f9f9f9')
    r.style.setProperty('--main-fg-color', '#05070a')
    r.style.setProperty('--secondary-fg-color', '#bbb')
    r.style.setProperty('--tertiary-fg-color', '#e5ebfb')
  }

  const createSearchResult = (info) => {
    const streamer = document.createElement('div')
    const name = document.createElement('p')
    const description = document.createElement('p')
    const tags = document.createElement('p')
    const listen = document.createElement('p')
    const lastPlayedTracks = document.createElement('div')
    const playing = document.createElement('p')

    const fav = document.createElement('i')
    const play = document.createElement('i')
    const pause = document.createElement('i')
    const user = document.createElement('i')

    user.classList.add('fas', 'fa-user', 'streamer-user')
    fav.classList.add('far', 'fa-heart', 'streamer-like')
    play.classList.add('far', 'fa-play-circle', 'streamer-play')
    pause.classList.add('fas', 'fa-pause', 'streamer-pause', 'disabled')

    name.innerHTML = info.name
    Array(fav, play, pause).forEach(e => name.append(e))
    description.innerHTML = info.description && info.description.length > 0 ? info.description : 'No description provided.'
    tags.innerHTML = info.tags && info.tags.length > 0 ? info.tags : 'No tags provided.'
    listen.innerHTML = ''
    playing.innerHTML = 'Buffering...'

    streamer.classList.add('streamer')
    name.classList.add('streamer-name')
    description.classList.add('streamer-description')
    tags.classList.add('streamer-tags')
    listen.classList.add('listen')
    lastPlayedTracks.classList.add('listen')
    playing.classList.add('listen', 'main-fg-color', 'disabled')

    streamer.append(user)
    streamer.append(name)
    streamer.append(description)
    streamer.append(tags)
    streamer.append(listen)
    streamer.append(lastPlayedTracks)
    streamer.append(playing)

    document.querySelector('#streamers-list').append(streamer)
    return { streamer, name, description, listen, playing, lastPlayedTracks, play, pause, fav }
  }

  const onResultClick = async (listener, result, publicKey) => {
    Array.from(document.getElementsByClassName('streamer-selected')).forEach((e) => e.classList.remove('streamer-selected'))
    Array(result.streamer, result.name, result.description, result.listen, result.playing, result.lastPlayedTracks, result.fav).forEach(e => e.classList.add('streamer-selected'))
    result.listen.classList.add('disabled')
    result.playing.classList.remove('disabled')
    result.play.classList.add('disabled')
    result.pause.classList.remove('disabled')

    listener = new Listener(publicKey, { bootstrap })
    await listener.ready()
    const { block, artist, name } = await user.syncRequest(publicKey)
    result.playing.innerHTML = `Now playing: ${artist || 'Unknown artist'} - ${name || 'Unknown track'}`

    const showLastPlayedTracks = (lastPlayedTracks) => {
      result.lastPlayedTracks.innerHTML = '' // reset
      if (!lastPlayedTracks.length) {
        const placeholder = document.createElement('p')
        placeholder.innerHTML = 'Not avalilable'
        result.lastPlayedTracks.append(placeholder)
      } else {
        const header = document.createElement('p')
        header.innerHTML = 'Last played tracks:'
        result.lastPlayedTracks.append(header)
        lastPlayedTracks.forEach(metadata => {
          const track = document.createElement('p')
          track.innerHTML = `${metadata.artist || 'Unknown artist'} - ${metadata.name || 'Unknown track'}`
          result.lastPlayedTracks.append(track)
        })
      }
    }

    const lastPlayedTracks = await listener.getLastPlayedTracks(5)
    showLastPlayedTracks(lastPlayedTracks.slice(1)) // remove first because its currently playing, its already displayed in Playing:...

    const stream = await listener.listen(block, (data) => {
      if (data.cleanBuffer) {
        player.cleanBuffer()
        player.audio.play()
      }
      result.playing.innerHTML = `Now playing: ${data.artist || 'Unknown artist'} - ${data.name || 'Unknown track'}`
      lastPlayedTracks.unshift(data)
      if (lastPlayedTracks.length > 5) lastPlayedTracks.pop()
      showLastPlayedTracks(lastPlayedTracks.slice(1))
    })
    await player.playStream(stream)
  }

  const onResultPauseClick = (event, listener, result) => {
    if (listener) listener.destroy()
    player.stop()

    Array(result.streamer, result.name, result.description, result.listen, result.playing, result.fav).forEach(e => e.classList.remove('streamer-selected'))
    result.playing.classList.add('disabled')
    result.listen.classList.remove('disabled')
    result.pause.classList.add('disabled')
    result.play.classList.remove('disabled')

    event.stopPropagation()
  }

  const addResult = (info) => {
    const listener = null
    const result = createSearchResult(info)

    hideStreamersPlaceholder()
    hideSearchingSpinner()

    result.streamer.onclick = async () => await onResultClick(listener, result, info.publicKey)
    result.pause.onclick = async (e) => onResultPauseClick(e, listener, result)

    result.fav.onclick = async (e) => {
      result.fav.classList.replace('far', 'fas')
      const favs = JSON.parse(getConfig('favourites'))
      const publicKey = info.publicKey.toString('hex')
      const name = info.name
      const description = info.description
      const tags = info.tags
      if (!favs.find(e => e.publicKey === publicKey)) {
        favs.push({ publicKey, name, description, tags })
        setConfig('favourites', JSON.stringify(favs))
      }
      e.stopPropagation()
    }
  }

  const listFavourites = (favourites) => {
    if (!favourites.length) return

    document.getElementById('favourites-placeholder').classList.add('disabled')
    document.getElementById('favourites-title').classList.remove('disabled')
    document.getElementById('favourites-list').innerHTML = ''

    favourites.forEach(e => {
      const listener = null
      const streamer = document.createElement('div')
      const name = document.createElement('p')
      const description = document.createElement('p')
      const tags = document.createElement('p')
      const listen = document.createElement('p')
      const playing = document.createElement('p')

      const fav = document.createElement('i')
      const play = document.createElement('i')
      const pause = document.createElement('i')
      const user = document.createElement('i')

      user.classList.add('fas', 'fa-user', 'streamer-user')
      fav.classList.add('fas', 'fa-heart', 'streamer-like')
      play.classList.add('far', 'fa-play-circle', 'streamer-play')
      pause.classList.add('fas', 'fa-pause', 'streamer-pause', 'disabled')

      name.innerHTML = e.name
      Array(fav, play, pause).forEach(e => name.append(e))
      description.innerHTML = e.description && e.description.length > 0 ? e.description : 'No description provided.'
      tags.innerHTML = e.tags && e.tags.length > 0 ? e.tags : 'No tags provided.'
      listen.innerHTML = ''
      playing.innerHTML = 'Buffering...'

      streamer.classList.add('streamer')
      name.classList.add('streamer-name')
      description.classList.add('streamer-description')
      tags.classList.add('streamer-tags')
      listen.classList.add('listen')
      playing.classList.add('listen', 'disabled')

      streamer.append(user)
      streamer.append(name)
      streamer.append(description)
      streamer.append(tags)
      streamer.append(listen)
      streamer.append(playing)

      const result = { streamer, name, description, tags, listen, playing, play, pause, fav }
      streamer.onclick = async () => onResultClick(listener, result, Buffer.from(e.publicKey, 'hex'))
      pause.onclick = async (e) => onResultPauseClick(e, listener, result)

      document.querySelector('#favourites-list').append(streamer)
    })
  }

  const updateThumbnail = (metadata) => {
    document.querySelector('#thumbnail-track').innerHTML = metadata.name || metadata.file
    document.querySelector('#thumbnail-artist').innerHTML = metadata.artist || 'Unkown artist'
    document.querySelector('#duration').innerHTML = metadata.duration
    document.querySelector('#elapsed').innerHTML = '0:00'
  }

  const updatePlaylist = (metadata) => {
    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    document.querySelector('#tracklist').children.item(player.index).classList.add('playing')
  }

  const play = async (metadata, opts) => { // Remove previous buffered music
    await player.play(metadata, opts)
    updateThumbnail(metadata)
    updatePlaylist(metadata)
  }

  const fade = (view) => {
    ['#stream', '#settings', '#listen', '#favourites'].filter(e => e !== view).forEach(e => {
      document.querySelector(e).classList.add('fade-out')
    })
    document.querySelector(view).classList.remove('fade-out')
    document.querySelector(view).classList.add('fade-in')
  }

  const selectIcon = (icon) => {
    const icons = ['#settings-icon', '#tracklist-icon', '#search-icon', '#favourites-icon']
    icons.forEach(i => document.querySelector(i).classList.remove('selected-header-icon'))
    document.querySelector(icon).classList.add('selected-header-icon')
  }

  let lastSearch = null
  if (getConfig('darkMode')) darkMode() // do this first so user doesnt notice

  await user.ready()

  const defaultName = 'User ' + user.server.publicKey.toString('hex').substr(0, 6)

  if ((getConfig('username')) === null || !getConfig('username') || getConfig('username').length === 0) await setConfig('username', defaultName)

  user.info = {
    publicKey: user.keyPair.publicKey,
    name: getConfig('username'),
    description: getConfig('description'),
    tags: getConfig('tags')
  }

  document.querySelector('#stream-public-key-message').innerHTML = 'Click here to copy your stream public key: ' + user.keyPair.publicKey.toString('hex').substr(0, 6)

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
    fade('#stream')
    enableScrolling()
  }

  document.querySelector('#search-icon').onclick = async () => {
    selectIcon('#search-icon')
    fade('#listen')
    document.querySelector('#search-input').focus({ preventScroll: true })
    if (lastSearch) {
      document.querySelector('#search-input').value = lastSearch
    }
    disableScrolling()
  }

  document.querySelector('#favourites-icon').onclick = async () => {
    selectIcon('#favourites-icon')
    fade('#favourites')
    listFavourites(JSON.parse(getConfig('favourites')))
  }

  document.querySelector('#settings-icon').onclick = async () => {
    selectIcon('#settings-icon')
    fade('#settings')
    disableScrolling()

    document.querySelector('#settings-username').value = user.info.name || ''
    document.querySelector('#settings-description').value = user.info.description || ''
    document.querySelector('#settings-tags').value = user.info.tags || ''

    if (getConfig('darkMode')) {
      document.querySelector('#dark-mode').classList.add('selected-settings-color')
      document.querySelector('#light-mode').classList.remove('selected-settings-color')
    } else {
      document.querySelector('#dark-mode').classList.remove('selected-settings-color')
      document.querySelector('#light-mode').classList.add('selected-settings-color')
    }
  }

  document.querySelector('#search-button').onclick = async () => {
    const searchText = document.querySelector('#search-input').value
    lastSearch = searchText
    if (searchText.length === 64) { // Search is a pk
      const info = await user.getUserInfo(Buffer.from(searchText, 'hex'))
      if (info) {
        resetSearchResults()
        showStreamersTitle()
        addResult(info)
      } else {
        // hideStreamersTitle()
        // showNoResultsPlaceholder()
      }
    } else {
      tagManager.searchByTag(searchText)
      resetSearchResults()
      hideStreamersTitle()
      showSearchingSpinner()
      if (tagManager.tags.get(searchText).length) {
        showStreamersTitle()
        tagManager.tags.get(searchText).map(addResult)
      }
    }
  }

  document.querySelector('#forward-controls').onclick = async () => {
    const metadata = await player.forward({ forceRemoteCleanBuffer: true })
    updateThumbnail(metadata)
    updatePlaylist(metadata)
  }

  document.querySelector('#backward-controls').onclick = async () => {
    const metadata = await player.backward({ forceRemoteCleanBuffer: true })
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

  document.querySelector('#stream-public-key').onclick = async () => {
    copy(user.server.publicKey.toString('hex'))
    document.querySelector('#stream-public-key').classList.add('stream-public-key-clicked')
    setTimeout(() => document.querySelector('#stream-public-key').classList.remove('stream-public-key-clicked'), 100)
  }

  document.querySelector('#dark-mode').onclick = async () => {
    document.querySelector('#dark-mode').classList.add('selected-settings-color')
    document.querySelector('#light-mode').classList.remove('selected-settings-color')
    await setConfig('darkMode', true)
    darkMode()
  }

  document.querySelector('#light-mode').onclick = async () => {
    document.querySelector('#dark-mode').classList.remove('selected-settings-color')
    document.querySelector('#light-mode').classList.add('selected-settings-color')
    await setConfig('darkMode', false)
    lightMode()
  }

  document.querySelector('#settings-save').onclick = async () => {
    const name = document.querySelector('#settings-username').value
    const description = document.querySelector('#settings-description').value
    const tags = document.querySelector('#settings-tags').value

    const oldTags = user.info.tags

    user.info.name = name
    user.info.description = description
    user.info.tags = tags

    await setConfig('username', name)
    await setConfig('description', description)
    await setConfig('tags', tags)

    if (oldTags && oldTags !== tags) {
      oldTags.split(',').map(async e => {
        await tagManager.removeTag(e)
      })
    }

    tags.split(',').map(async e => {
      await tagManager.announceTag(e)
    })

    document.querySelector('#settings-save').classList.add('settings-save-clicked')
    setTimeout(() => document.querySelector('#settings-save').classList.remove('settings-save-clicked'), 100)
  }

  player.on('track-finished', async (next) => {
    const { index, metadata } = next
    Array.from(document.querySelector('#tracklist').children).forEach(e => e.classList.remove('playing'))
    document.querySelector('#tracklist').children.item(index).classList.add('playing')
    updateThumbnail(metadata)
  })

  player.on('buffering', async () => {
    // document.querySelector('#state').innerHTML = '(Buffering)'
  })

  player.on('buffering-finished', async () => {
    document.querySelector('#state').innerHTML = ''
  })

  tagManager.on('stream-found', (info) => {
    const tags = info.tags ? info.tags.split(',') : null
    const currentSearch = document.querySelector('#search-input').value
    if (!info.tags && currentSearch !== '#all') return

    if (currentSearch === '#all' || tags.indexOf(currentSearch) !== -1) {
      hideStreamersPlaceholder()
      hideSearchingSpinner()
      showStreamersTitle()
      addResult(info)
    }
  })

  await player.ready()
  await tagManager.ready()

  setInterval(() => {
    if (player && player.audio && player.audio.currentTime && player.streamer.streaming) {
      const seconds = Math.floor(player.audio.currentTime)
      const elapsed = Math.floor(seconds / 60) + ':' + (seconds % 60 >= 10 ? seconds % 60 : '0' + seconds % 60)
      document.querySelector('#elapsed').innerHTML = elapsed
    }
  }, 1000)
}
