import holepunch from 'holepunch://app'
import simpleConfig from '@rafapaezbas/simple-config'

const defaultConfig = {
  username: '',
  description: '',
  tags: '',
  darkMode: false
}

export default () => {
  return simpleConfig(holepunch.config.storage, defaultConfig)
}
