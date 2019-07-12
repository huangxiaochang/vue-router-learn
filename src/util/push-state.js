/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'

// 检查浏览器是否支持html5的pushState api 来管理历史记录
export const supportsPushState = inBrowser && (function () {
  const ua = window.navigator.userAgent

  if (
    (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
    ua.indexOf('Mobile Safari') !== -1 &&
    ua.indexOf('Chrome') === -1 &&
    ua.indexOf('Windows Phone') === -1
  ) {
    return false
  }

  return window.history && 'pushState' in window.history
})()

// use User Timing api (if present) for more accurate key precision
const Time = inBrowser && window.performance && window.performance.now
  ? window.performance
  : Date

let _key: string = genKey()

function genKey (): string {
  return Time.now().toFixed(3)
}

// 获取state的键
export function getStateKey () {
  return _key
}

// 设置state的键
export function setStateKey (key: string) {
  _key = key
}

export function pushState (url?: string, replace?: boolean) {
  saveScrollPosition()
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  const history = window.history
  try {
    // 使用html5的历史管理api进行历史记录管理
    if (replace) {
      // 第一个参数：对象，包含用于恢复当前文档状态所需的所有信息，第二个参数：一个可选的标题
      // 第三个参数：可选的url,表示当前状态的位置
      history.replaceState({ key: _key }, '', url)
    } else {
      _key = genKey()
      history.pushState({ key: _key }, '', url)
    }
  } catch (e) {
    window.location[replace ? 'replace' : 'assign'](url)
  }
}

export function replaceState (url?: string) {
  pushState(url, true)
}
