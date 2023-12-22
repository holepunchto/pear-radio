import Hyperbee from 'hyperbee'
import ReadyResource from 'ready-resource'
import Hypercore from 'hypercore'
import c from 'compact-encoding'

const darkModeOS = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

export class PearRadioConfiguration extends ReadyResource {
  constructor (storage) {
    super()
    this.core = new Hypercore(storage)
    this.bee = new Hyperbee(this.core, { keyEncoding: 'utf-8', valueEncoding: c.any })
  }

  async _open () {
    await this.core.ready()
    await this.bee.ready()
    const username = await this.get('username')
    const description = await this.get('description')
    const tags = await this.get('tags')
    const darkMode = await this.get('darkMode')
    const favourites = await this.get('favourites')

    if (!username) await this.set('username', '')
    if (!description) await this.set('description', '')
    if (!tags) await this.set('tags', '')
    if (!darkMode) await this.set('darkMode', darkModeOS)
    if (!favourites) await this.set('favourites', [])
  }

  async _close () {
    return this.bee.close()
  }

  async set (key, value) {
    return this.bee.put(key, value)
  }

  async get (key) {
    if (key === 'seed') return this.bee.key
    const entry = await this.bee.get(key)
    return entry ? entry.value : entry
  }
}
