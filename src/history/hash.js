/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { getLocation } from './html5'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'

// hash模式实例化：
// 1.继承History类
// 2.针对不支持history api进行降级处理，以及确保默认进入时对应的hash值是以/开头
export class HashHistory extends History {
  constructor (router: Router, base: ?string, fallback: boolean) {
    super(router, base)
    // check history fallback deeplinking
    // 如果是降级并且已经做了降级处理，则什么都不做
    if (fallback && checkFallback(this.base)) {
      return
    }
    // 确保hash是以'/'开头
    ensureSlash()
  }

  // this is delayed until the app mounts
  // to avoid the hashchange listener being fired too early
  setupListeners () {
    const router = this.router
    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    if (supportsScroll) {
      setupScroll()
    }

    window.addEventListener(supportsPushState ? 'popstate' : 'hashchange', () => {
      const current = this.current
      // 如果不是以/开头，直接返回
      if (!ensureSlash()) {
        return
      }
      // 调用transitionTo进行路由跳转
      this.transitionTo(getHash(), route => {
        if (supportsScroll) {
          handleScroll(this.router, route, current, true)
        }
        if (!supportsPushState) {
          // 替换hash值
          replaceHash(route.fullPath)
        }
      })
    })
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      pushHash(route.fullPath)
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      replaceHash(route.fullPath)
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  go (n: number) {
    window.history.go(n)
  }

  // push：Boolean,代表是添加还是替换
  // this.current为当前的路由对象
  ensureURL (push?: boolean) {
    const current = this.current.fullPath
    if (getHash() !== current) {
      // 修改地址栏的url
      push ? pushHash(current) : replaceHash(current)
    }
  }

  // 获取当前url的hash
  getCurrentLocation () {
    return getHash()
  }
}

// 处理降级
function checkFallback (base) {
  // 得到去除base后的location
  const location = getLocation(base)
  if (!/^\/#/.test(location)) {
    // 如果此时的地址不是以'/#'开发，需要做降级为hash模式下应有的/#开头
    window.location.replace(
      cleanPath(base + '/#' + location)
    )
    return true
  }
}

// 确保hash是以'/'开头
function ensureSlash (): boolean {
  const path = getHash()
  if (path.charAt(0) === '/') {
    return true
  }
  replaceHash('/' + path)
  return false
}

// 获取url的hash，即#到后面的decodeURI编码
export function getHash (): string {
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  // 我们不直接使用window.location.hash开获取hash值，是因为浏览器兼容性的问题，
  // 因为在Firefox浏览器上，会对hash值进行预编码
  const href = window.location.href
  const index = href.indexOf('#')
  return index === -1 ? '' : decodeURI(href.slice(index + 1))
}

// 通过路径，获取完整的url
function getUrl (path) {
  const href = window.location.href
  const i = href.indexOf('#')
  const base = i >= 0 ? href.slice(0, i) : href
  return `${base}#${path}`
}

// 如果环境支持window.hsitory的pushState,使用pushState增加历史记录
// 否则直接修改window.location.hash来添加历史记录
function pushHash (path) {
  if (supportsPushState) {
    pushState(getUrl(path))
  } else {
    window.location.hash = path
  }
}

// 如果环境支持window.replaceState,使用replaceState替换历史记录
// 否则直接window.location替换历史记录
function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path))
  } else {
    window.location.replace(getUrl(path))
  }
}
