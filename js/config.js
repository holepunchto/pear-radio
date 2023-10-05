import holepunch from 'holepunch://app'
import simpleConfig from '@rafapaezbas/simple-config'

const darkModeOS = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

const defaultConfig = {
  username: null,
  description: '',
  tags: '',
  darkMode: darkModeOS
}

export default () => {
  return simpleConfig(holepunch.config.storage, defaultConfig)
}
