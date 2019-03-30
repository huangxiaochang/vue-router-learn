/* @flow */
/*
  VueRouter是Vue的一种插件，所以首先需要使用Vue.use()来注册该插件。
  Vue.use()注册插件其实是把Vue作为第一个参数去调用插件的install方法
  进行安装。
  VueRouter实现的原理：
    1.实现install方法来安装该插件：
      安装：
        1.只安装一次
        2.把Vue赋值全局变量_Vue
        3.向所有组件注入beforeCreate，destroyed生命周期钩子函数，目的是进行路由的初始化。
          1.设置Vue组件实例_routerRoot属性指向该组件实例
          2.设置Vue组件实例_router属性为路由实例对象router
          3.调用路由实例对象router的init方法进行初始化
          4.使用defineReactive方法把组件实例对象的_route设置成访问器属性，值为当前路由对象
          5.调用registerInstance()函数注册实例
        4.在Vue构造函数原型上定义$router,$route属性，让开发者在组件中能够访问路由实例和路由对象
        5.注册全局组件router-view和router-link
        6.定义路由钩子函数的合并策略。
    所以路由实例会在组件beforeCreate的生命钩子函数中进行初始化。

    2.new VueRouter(options)创建路由实例对象的原理：
      1.定义实例对象的一些属性和方法：
        matcher,history,init,beforeEach,beforeResolve,
        afterEach, addRoutes, onReady, onError push, replace,go, back, forward, 
        getMatchedComponents, resolve。
      2.其中matcher属性对象有两个方法:match, addRoutes.
        match: 根据传进来的location,当前路由对象，重定向来源信息返回匹配的路由对象.
        addRoutes: 提供动态在路由列表，path/name路由映射表中添加路由记录对象.
      3.history属性为根据options.mode创建的History(历史记录管理类)的子类实例对象。
        History类的实现原理：
        构造函数：传进来的参数：路由实例对象，options.base, hash模式另外有一个fallback参数。
        创建实例对象：
          1.

    3.路由实例对象的初始化：
      (new Vue({router})时会传进第二步创建的路由实例对象，会在new Vue 的beforeCreate的钩子
       函数中调用路由实例对象的init方法进行路由的初始化)
      1.如果router.app已经有值(默认为空),则在router.apps中添加组件实例对象vm.
      2.否则设置router.app = vm, 然后调用history.transitionTo进行路由的跳转操作，
        再调用history.listen添加路由监听。

      从初始化过程可以看出，router.app保存的时候Vue的根实例对象，只有在创建Vue根实例对象的
      beforeCreate钩子中进行history.transitionTo和history.listen。其他的子组件实例对象中的
      beforeCreate钩子中只是把该子组件实例对象vm添加进router.apps中
 */

import { install } from './install'
import { START } from './util/route'
import { assert } from './util/warn'
import { inBrowser } from './util/dom'
import { cleanPath } from './util/path'
import { createMatcher } from './create-matcher'
import { normalizeLocation } from './util/location'
import { supportsPushState } from './util/push-state'

import { HashHistory } from './history/hash'
import { HTML5History } from './history/html5'
import { AbstractHistory } from './history/abstract'

import type { Matcher } from './create-matcher'

// 根据开发者传来的路由配置信息，创建路由实例对象
// 每个路由实例对象拥有matcher,history,init,beforeEach,beforeResolve,
// afterEach, addRoutes, onReady, onError push, replace,go, back, forward, 
// getMatchedComponents, resolve,等等属性和方法
// 其中因为在install的时候，混入beforeCreate钩子函数，并在其中调用路由实例对象的init
// 方法，进行路由实例对象的初始化工作
export default class VueRouter {
  static install: () => void;
  static version: string;

  app: any;
  apps: Array<any>;
  ready: boolean;
  readyCbs: Array<Function>;
  options: RouterOptions;
  mode: string;
  history: HashHistory | HTML5History | AbstractHistory;
  matcher: Matcher;
  fallback: boolean;
  beforeHooks: Array<?NavigationGuard>;
  resolveHooks: Array<?NavigationGuard>;
  afterHooks: Array<?AfterNavigationHook>;

  constructor (options: RouterOptions = {}) {
    this.app = null
    this.apps = []
    this.options = options
    this.beforeHooks = []
    this.resolveHooks = []
    this.afterHooks = []
    // 创建路由匹配对象,createMatcher返回{match, addRoutes}
    // addRouters方法可以往路由列表，路由映射列表中添加路由记录对象
    // match方法根据URL，目前的路由对象和重定向信息匹配返回一个路由对象
    this.matcher = createMatcher(options.routes || [], this)

    let mode = options.mode || 'hash'
    // 表示在浏览器不支持 history.pushState 的情况下，根据传入的 fallback 配置参数，决定是否回退到hash模式
    this.fallback = mode === 'history' && !supportsPushState && options.fallback !== false
    if (this.fallback) {
      mode = 'hash'
    }
    if (!inBrowser) {
      mode = 'abstract'
    }
    this.mode = mode

    // 根据不同的路由模式，采取不同的方式
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base)
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback)
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base)
        break
      default:
        if (process.env.NODE_ENV !== 'production') {
          assert(false, `invalid mode: ${mode}`)
        }
    }
  }

  match (
    raw: RawLocation,
    current?: Route,
    redirectedFrom?: Location
  ): Route {
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 获取目前路由对象
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  // 在组件的beforeCreate钩子函数中会执行该init方法，传进来的参数为Vue实例对象
  init (app: any /* Vue component instance */) {
    process.env.NODE_ENV !== 'production' && assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )

    // 使用apps收集Vue实例对象
    this.apps.push(app)

    // main app already initialized.
    if (this.app) {
      return
    }
    // 只有根Vue实例会保存到this.app上
    this.app = app

    const history = this.history

    // 根据不同的模式，进行路由的跳转
    if (history instanceof HTML5History) {
      history.transitionTo(history.getCurrentLocation())
    } else if (history instanceof HashHistory) {
      const setupHashListener = () => {
        history.setupListeners()
      }
      history.transitionTo(
        history.getCurrentLocation(),
        setupHashListener,
        setupHashListener
      )
    }

    // 添加监听，监听确认路由后在更新路由时执行该监听回调，
    // 在回调中设置组件实例的_route为更新后的路由对象，触发视图更新
    history.listen(route => {
      this.apps.forEach((app) => {
        app._route = route
      })
    })
  }

  beforeEach (fn: Function): Function {
    return registerHook(this.beforeHooks, fn)
  }

  beforeResolve (fn: Function): Function {
    return registerHook(this.resolveHooks, fn)
  }

  afterEach (fn: Function): Function {
    return registerHook(this.afterHooks, fn)
  }

  onReady (cb: Function, errorCb?: Function) {
    this.history.onReady(cb, errorCb)
  }

  onError (errorCb: Function) {
    this.history.onError(errorCb)
  }

  push (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.history.push(location, onComplete, onAbort)
  }

  replace (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    this.history.replace(location, onComplete, onAbort)
  }

  go (n: number) {
    this.history.go(n)
  }

  back () {
    this.go(-1)
  }

  forward () {
    this.go(1)
  }

  getMatchedComponents (to?: RawLocation | Route): Array<any> {
    const route: any = to
      ? to.matched
        ? to
        : this.resolve(to).route
      : this.currentRoute
    if (!route) {
      return []
    }
    return [].concat.apply([], route.matched.map(m => {
      return Object.keys(m.components).map(key => {
        return m.components[key]
      })
    }))
  }

  resolve (
    to: RawLocation,
    current?: Route,
    append?: boolean
  ): {
    location: Location,
    route: Route,
    href: string,
    // for backwards compat
    normalizedTo: Location,
    resolved: Route
  } {
    const location = normalizeLocation(
      to,
      current || this.history.current,
      append,
      this
    )
    const route = this.match(location, current)
    const fullPath = route.redirectedFrom || route.fullPath
    const base = this.history.base
    const href = createHref(base, fullPath, this.mode)
    return {
      location,
      route,
      href,
      // for backwards compat
      normalizedTo: location,
      resolved: route
    }
  }

  addRoutes (routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}

function createHref (base: string, fullPath: string, mode) {
  var path = mode === 'hash' ? '#' + fullPath : fullPath
  return base ? cleanPath(base + '/' + path) : path
}

VueRouter.install = install
VueRouter.version = '__VERSION__'

if (inBrowser && window.Vue) {
  window.Vue.use(VueRouter)
}
