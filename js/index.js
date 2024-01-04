import { User, Player, TagManager, Listener, PearRadioConfiguration } from '@holepunchto/pear-radio-backend'
import copy from 'copy-text-to-clipboard'
import { keyPair } from 'hypercore-crypto'
import { fileURLToPath } from 'url'
import ram from 'random-access-memory'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import pear from 'pear'
import b4a from 'b4a'

const bootstrap = process.env.TEST ? [{ host: '127.0.0.1', port: 49736 }] : undefined

const store = new Corestore(ram)
await store.ready()

const swarm = new Hyperswarm({ bootstrap })
swarm.on('connection', (conn) => {
  store.replicate(conn)
})

const configuration = new PearRadioConfiguration(pear.config.storage)
await configuration.ready()

const userKeyPair = keyPair(await configuration.get('seed'))

const player = new Player(() => {
  const audio = document.createElement('audio')
  audio.setAttribute('type', 'audio/mpeg')
  document.body.appendChild(audio)
  return audio
}, swarm, store, userKeyPair)

const user = new User(player.syncRequest.bind(player), { bootstrap, keyPair: userKeyPair })
const tagManager = new TagManager(user, { bootstrap })

const addTrack = (metadata) => {
  const track = document.createElement('div')
  const trackname = document.createElement('p')
  const artist = document.createElement('p')
  const duration = document.createElement('p')

  const name = metadata.name || metadata.file
  trackname.innerHTML = name.length < 30 ? name : name.substr(0, 30) + '...'
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

const showStreamersPlaceholder = () => {
  document.querySelector('#streamers-placeholder').classList.remove('disabled')
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

const createStreamerResult = (info, opts = {}) => {
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

  if (opts.favourites) {
    fav.classList.add('hidden-visibility')
    play.classList.add('favs-list-icons-margin')
    pause.classList.add('favs-list-icons-margin')
  }

  name.innerHTML = info.name

  Array(fav, play, pause).forEach(e => name.append(e))
  description.innerHTML = info.description && info.description.length > 0 ? info.description : 'No description provided.'
  tags.innerHTML = info.tags && info.tags.length > 0 ? info.tags.replaceAll(',', ', ').replaceAll('  ', ' ') : 'No tags provided.' // add space after comma and remove double spaces
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

  return { streamer, name, description, listen, playing, lastPlayedTracks, play, pause, fav, tags }
}

const onResultClick = async (listener, result, info) => {
  if (listener) await listener.destroy() // destroy prev listener

  Array.from(document.getElementsByClassName('streamer-selected')).forEach((e) => { // Reset previous stream
    if (e.classList.contains('listen')) e.classList.add('disabled')
    if (e.classList.contains('fa-pause')) e.classList.add('disabled')
    if (e.classList.contains('fa-play-circle')) e.classList.remove('disabled')
  })

  Array.from(document.getElementsByClassName('streamer-selected')).forEach((e) => e.classList.remove('streamer-selected'))
  Array(result.streamer, result.name, result.description, result.listen, result.playing, result.lastPlayedTracks, result.fav, result.play, result.pause).forEach(e => e.classList.add('streamer-selected'))
  result.listen.classList.add('disabled')
  result.playing.classList.remove('disabled')
  result.play.classList.add('disabled')
  result.pause.classList.remove('disabled')

  result.playing.innerHTML = 'Buffering...' // reset

  listener = new Listener(info.publicKey, swarm, store, { bootstrap })
  await listener.ready()
  const { block, artist, name } = await user.syncRequest(info.publicKey)
  result.playing.innerHTML = `Now playing: ${artist || 'Unknown artist'} - ${name || 'Unknown track'}`

  const showLastPlayedTracks = (lastPlayedTracks) => {
    result.lastPlayedTracks.innerHTML = '' // reset
    result.lastPlayedTracks.classList.remove('disabled')
    if (lastPlayedTracks.length) {
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
  if (listener) listener.close()
  player.stop()

  Array.from(document.getElementsByClassName('streamer-selected')).forEach((e) => e.classList.remove('streamer-selected'))
  result.playing.classList.add('disabled')
  result.listen.classList.remove('disabled')
  result.pause.classList.add('disabled')
  result.play.classList.remove('disabled')
  event.preventDefault()
  event.stopPropagation()
}

const addResult = async (info, opts = {}) => {
  const listener = null
  const result = createStreamerResult(info, opts)
  if (opts.favourites) {
    document.querySelector('#favourites-list').append(result.streamer)
  } else {
    document.querySelector('#streamers-list').append(result.streamer)
    hideStreamersPlaceholder()
    hideSearchingSpinner()
  }

  result.streamer.onclick = async () => {
    try {
      await onResultClick(listener, result, info)
    } catch (err) {
      console.log(err)
    }
  }

  result.pause.onclick = async (event) => onResultPauseClick(event, listener, result)

  if (!opts.favourites) {
    const favourites = await configuration.get('favourites')
    if (favourites.find(e => b4a.equals(info.publicKey, e.publicKey))) {
      result.fav.classList.replace('far', 'fas')
    }
  }

  result.fav.onclick = async (e) => {
    e.preventDefault()
    e.stopPropagation()

    result.fav.classList.replace('far', 'fas')
    const favs = await configuration.get('favourites')
    const publicKey = info.publicKey
    const name = info.name
    const description = info.description
    const tags = info.tags
    if (!favs.find(e => b4a.equals(e.publicKey, publicKey))) {
      favs.push({ publicKey, name, description, tags })
      configuration.set('favourites', favs)
    }
  }
}

const listFavourites = (favourites) => {
  if (!favourites.length) return

  // remove duplicates
  const favouritesSet = favourites.reduce((acc, e) => {
    if (!acc.find(o => b4a.equals(o.publicKey, e.publicKey))) {
      acc.push(e)
    }
    return acc
  }, [])

  document.getElementById('favourites-placeholder').classList.add('disabled')
  document.getElementById('favourites-title').classList.remove('disabled')
  document.getElementById('favourites-list').innerHTML = ''

  favouritesSet.forEach(info => addResult(info, { favourites: true }))
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

if ((await configuration.get('darkMode')) === null) { // only happens once
  const darkModeOS = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  await configuration.set('darkMode', darkModeOS)
}

if (await configuration.get('darkMode')) {
  darkMode() // do this first so user doesnt notice
}

await user.ready()

const defaultName = 'User ' + user.server.publicKey.toString('hex').substr(0, 6)

if ((await configuration.get('username')) === null || !(await configuration.get('username')) || (await configuration.get('username')).length === 0) await configuration.set('username', defaultName)

user.info = {
  publicKey: user.keyPair.publicKey,
  name: (await configuration.get('username')),
  description: (await configuration.get('description')),
  tags: (await configuration.get('tags'))
}

document.querySelector('#stream-public-key-message').innerHTML = 'Click here to copy your stream public key: ' + user.keyPair.publicKey.toString('hex').substr(0, 6)

document.addEventListener('dragover', async (e) => {
  e.preventDefault()
})

document.addEventListener('drop', async (e) => {
  e.preventDefault()

  // This is a hack, drag-and-drop is very buggy in eletron, for some reason, sometimes it detects the files with wrong mime type 'plain/text'.
  // In that case, dataTransfer files is empty, and we have to get the file URI and translate it into a path :(
  // it stills bugs sometimes with the bug "0:-29:525:44"

  const path = e.dataTransfer.files && e.dataTransfer.files.length ? e.dataTransfer.files[0].path : undefined
  if (path) {
    const metadata = await player.addTrack(path)
    addTrack(metadata)
  } else {
    const uri = await new Promise((resolve) => e.dataTransfer.items[0].getAsString(async (p) => resolve(p)))
    const metadata = await player.addTrack(fileURLToPath(uri))
    addTrack(metadata)
  }

  document.querySelector('#tracklist-placeholder')?.remove()
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
  listFavourites(await configuration.get('favourites'))
}

document.querySelector('#settings-icon').onclick = async () => {
  selectIcon('#settings-icon')
  fade('#settings')
  disableScrolling()

  document.querySelector('#settings-username').value = user.info.name || ''
  document.querySelector('#settings-description').value = user.info.description || ''
  document.querySelector('#settings-tags').value = user.info.tags || ''

  if (await configuration.get('darkMode')) {
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
      await addResult(info)
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

const setDarkMode = async () => {
  document.querySelector('#dark-mode').classList.add('selected-settings-color')
  document.querySelector('#light-mode').classList.remove('selected-settings-color')
  await configuration.set('darkMode', true)
  darkMode()
}

const setLightMode = async () => {
  document.querySelector('#dark-mode').classList.remove('selected-settings-color')
  document.querySelector('#light-mode').classList.add('selected-settings-color')
  await configuration.set('darkMode', false)
  lightMode()
}

document.querySelector('#dark-mode').onclick = setDarkMode
document.querySelector('#light-mode').onclick = setLightMode

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  if (event.matches) {
    setDarkMode()
  } else {
    setLightMode()
  }
})

document.querySelector('#settings-save').onclick = async () => {
  const name = document.querySelector('#settings-username').value
  const description = document.querySelector('#settings-description').value
  const tags = document.querySelector('#settings-tags').value

  const oldTags = user.info.tags

  user.info.name = name
  user.info.description = description
  user.info.tags = tags

  await configuration.set('username', name)
  await configuration.set('description', description)
  await configuration.set('tags', tags)

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

setInterval(() => {
  if (player && player.audio && player.audio.currentTime && player.streamer.streaming) {
    const seconds = Math.floor(player.audio.currentTime)
    const elapsed = Math.floor(seconds / 60) + ':' + (seconds % 60 >= 10 ? seconds % 60 : '0' + seconds % 60)
    document.querySelector('#elapsed').innerHTML = elapsed
  }
}, 1000)

window.addEventListener('keydown', (e) => {
  if (e.keyCode === 9) {
    e.preventDefault()
    return false
  }
})

await player.ready()
await tagManager.ready()
