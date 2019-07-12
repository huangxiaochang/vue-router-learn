/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './push-state'

// 用于保存每个路由对应的滚动位置
const positionStore = Object.create(null)

// 设置滚动，popstate时，保存滚动的位置
export function setupScroll () {
  // Fix for #1585 for Firefox
  // Fix for #2195 Add optional third attribute to workaround a bug in safari https://bugs.webkit.org/show_bug.cgi?id=182678
  window.history.replaceState({ key: getStateKey() }, '', window.location.href.replace(window.location.origin, ''))
  window.addEventListener('popstate', e => {
    // 按浏览器前进后退按钮时，要保存滚动的位置
    saveScrollPosition()
    if (e.state && e.state.key) {
      setStateKey(e.state.key)
    }
  })
}

// 处理滚动，决定滚动的位置，并滚动到相应的位置
export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  if (!router.app) {
    return
  }

  const behavior = router.options.scrollBehavior
  if (!behavior) {
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  router.app.$nextTick(() => {
    const position = getScrollPosition()
    // isPop在popstate事件时才为true，即使用浏览器行为引起的state改变，
    // 即只有使用浏览器前进后退按钮触发时，才会提供之前的滚动的位置，否者只能滚动指定的位置
    const shouldScroll = behavior.call(router, to, from, isPop ? position : null)

    if (!shouldScroll) {
      return
    }

    // 异步滚动，如果shouldScroll是一个thenable对象，则执行then
    if (typeof shouldScroll.then === 'function') {
      shouldScroll.then(shouldScroll => {
        scrollToPosition((shouldScroll: any), position)
      }).catch(err => {
        if (process.env.NODE_ENV !== 'production') {
          assert(false, err.toString())
        }
      })
    } else {
      // 滚动到指定的位置
      scrollToPosition(shouldScroll, position)
    }
  })
}

// 保存滚动的位置
export function saveScrollPosition () {
  const key = getStateKey()
  if (key) {
    positionStore[key] = {
      x: window.pageXOffset, // 文档横向滚动的距离
      y: window.pageYOffset  // 文档纵向滚动的距离
    }
  }
}

// 获取保存的滚动位置
function getScrollPosition (): ?Object {
  const key = getStateKey()
  if (key) {
    return positionStore[key]
  }
}

// 计算元素的位置，即元素相对于文档的位置
function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  const docRect = docEl.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

// 是否是有效的位置，即x或者y要是数字
function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

// 规范化位置：如果x,y是数字，则返回，否者返回文档滚动的距离
function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

// 规范化偏移的位置,如果x,y为数字，则返回，否者为0
function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v: any): boolean {
  return typeof v === 'number'
}

// 滚动到指定指定的位置： 滚动到瞄点或者指定的位置
function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object'
  // 如果指定滚动的元素，即滚动到瞄点，先计算瞄点的位置
  if (isObject && typeof shouldScroll.selector === 'string') {
    const el = document.querySelector(shouldScroll.selector)

    if (el) {
      let offset = shouldScroll.offset && typeof shouldScroll.offset === 'object' ? shouldScroll.offset : {}
      offset = normalizeOffset(offset)
      position = getElementPosition(el, offset)
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll)
    }
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)
  }

  if (position) {
    window.scrollTo(position.x, position.y)
  }
}
