/* @flow */

import type Router from '../index'
import { History } from './base'
import { cleanPath } from '../util/path'
import { START } from '../util/route'
import { setupScroll, handleScroll } from '../util/scroll'
import { pushState, replaceState, supportsPushState } from '../util/push-state'
/*
  history模式利用了window.history.pushState api来完成url的跳转而无需重新加载页面，但是当用户直接
  访问某一个url(或者刷新时)，浏览器就会去请求和加载url对应的页面(后端对于的页面)，但是由于该url是前端定义的，所以并不能
  正确地加载到该url对应的页面，所以会出现404的情况，所以该模式需要后端进行配合，即如果url匹配不到
  任何资源时，则应该返回index.html。由于代码中的push，go等方法，最后都是使用window.history.pushState
  api来改变地址栏的url，所以并不会引起页面的重新加载，所有不会出现404的情况。
 */
export class HTML5History extends History {
  constructor (router: Router, base: ?string) {
    super(router, base)

    const expectScroll = router.options.scrollBehavior
    const supportsScroll = supportsPushState && expectScroll

    // 如果支持滚动，设置滚动：保存滚动的距离等
    if (supportsScroll) {
      setupScroll()
    }

    const initLocation = getLocation(this.base)
    // 使用window.history.push/replaceState时，不会触发popstate,只有浏览器动作时(前进或后退按钮),
    // 或者在js中调用window.history.go/back/forward方法时，才会触发，但是不同浏览器处理不同.触发popstate时，
    // 浏览器的地址栏同时会变成历史记录中设置的url,然后便可以通过该url来进行路由的跳转，从而实现了单页前进后退进行视图更新的功能。
    window.addEventListener('popstate', e => {
      const current = this.current

      // Avoiding first `popstate` event dispatched in some browsers but first
      // history route not updated since async guard at the same time.
      // 避免第一个popstate事件重复触发，因为第一个history路由还没有更新直到异步钩子执行完成
      const location = getLocation(this.base)
      if (this.current === START && location === initLocation) {
        return
      }

      this.transitionTo(location, route => {
        if (supportsScroll) {
          // 如果支持滚动，则处理滚动，到上一次位置或者指定的位置
          handleScroll(router, route, current, true)
        }
      })
    })
  }

  go (n: number) {
    // 调用window.history.go会触发popstate事件，从而进行transitionTo
    window.history.go(n)
  }

  // 提供使用router的push接口进行路由跳转的接口,同时添加一条历史记录
  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      // 在使用push进行路由跳转之后，我们把路径添加进历史记录中(使用pushstate或者改变location.hash的方式)，
      // 然后按浏览器的前进或者后退时，浏览器的地址栏会变成我们在历史记录中设置的url，
      // 同时会触发popstate（或者hashchange）事件，然后我们可以监听该事件，根据地址栏的url来进行路由确认
      // 跳转，确认跳转之后，设置响应式_route的属性值，触发视图的重新渲染。
      // 这就是vue-router实现浏览器前进和后退的原理。
      pushState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  // 提供使用router的replace接口进行路由跳转的接口，同时替换一条历史记录
  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    const { current: fromRoute } = this
    this.transitionTo(location, route => {
      replaceState(cleanPath(this.base + route.fullPath))
      handleScroll(this.router, route, fromRoute, false)
      onComplete && onComplete(route)
    }, onAbort)
  }

  // 修改浏览器的地址栏的url,并且往浏览器的历史记录中添加或者替换记录，虽然会修改历史记录，
  // 但是并不会触发popstate事件，所以不会导致视图的重新transitionTo
  ensureURL (push?: boolean) {
    if (getLocation(this.base) !== this.current.fullPath) {
      const current = cleanPath(this.base + this.current.fullPath)
      push ? pushState(current) : replaceState(current)
    }
  }

  // 获取目前的location,不包含base部分，包含hash和search部分
  getCurrentLocation (): string {
    return getLocation(this.base)
  }
}

// 返回去除base后的location值，包扣hash和search部分
export function getLocation (base: string): string {
  // pathname: 当前url的路径部分，不包括search和hash,host等
  let path = decodeURI(window.location.pathname)
  if (base && path.indexOf(base) === 0) {
    path = path.slice(base.length)
  }
  // search：?开始的url(查询部分),hash #开始的url(瞄)
  return (path || '/') + window.location.search + window.location.hash
}
