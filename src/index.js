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
          1.router-view
            根据当前路由对象中matched中的组件，使用render函数进行组件的渲染
          2.router-link
            本质的原理是监听节点相应的事件，然后使用router的push/replace来进行路由的跳转相关操作。
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
          1.设置实例对象current为默认的开始路由实例对象
          2.定义实例对象一些属性和方法：
            readyCbs，readyErrorCbs，errorCbs：收集ready,error回调函数的数组
            transitionTo，confirmTransition，updateRoute，listen，onReady实例方法

    3.路由实例对象的初始化：
      (new Vue({router})时会传进第二步创建的路由实例对象，会在new Vue 的beforeCreate的钩子
       函数中调用路由实例对象的init方法进行路由的初始化)
      1.如果router.app已经有值(默认为空),则在router.apps中添加组件实例对象vm.
      2.否则设置router.app = vm, 然后调用history.transitionTo进行路由的跳转操作，
        再调用history.listen添加路由监听。
      3. 在当前路由记录对象的instance属性中该组件实例。
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
    this.app = null // 保存根vm实例(该路由实例对象第一次传进vm实例对象)
    this.apps = [] // 用于收集所有传进该路由实例的vm实例
    this.options = options // 开发者的路由配置信息
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
    // 返回匹配的路由对象
    return this.matcher.match(raw, current, redirectedFrom)
  }

  // 获取目前路由对象
  get currentRoute (): ?Route {
    return this.history && this.history.current
  }

  // 在根组件的beforeCreate钩子函数中会执行该init方法，传进来的参数为Vue实例对象
  init (app: any /* Vue component instance */) {
    process.env.NODE_ENV !== 'production' && assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
      `before creating root instance.`
    )

    // 使用apps收集所有把该路由实例router传进vm实例进行初始化的vm, 即创建vm时，有传进该router.
    // 一般spa,只会在根vm中传进router选项
    this.apps.push(app)
    // main app already initialized.
    // 只在根vm中进行下面的初始化
    if (this.app) {
      return
    }
    // 只有根Vue实例会保存到this.app上
    this.app = app

    const history = this.history

    // 根据不同的模式，进行路由的跳转
    if (history instanceof HTML5History) {
      history.transitionTo(history.getCurrentLocation()/* 历史模式下为去除base后的location,包含hash和search*/)
    } else if (history instanceof HashHistory) {
      // hash模式要在视图更新后再监听hashchange，而不是在初始化HashHistory的时候，
      // 为了解决#725
      const setupHashListener = () => {
        history.setupListeners()
      }
      history.transitionTo(
        history.getCurrentLocation(), // hash模式下为location的hash部分
        setupHashListener, // onComplete
        setupHashListener // onAbort
      )
    }

    // 添加监听，监听确认路由后在更新路由时(updateRoute)执行该监听回调，
    // 在回调中设置组件实例的_route为更新后的路由对象，触发视图更新
    history.listen(route => {
      this.apps.forEach((app) => {
        app._route = route
      })
    })
  }

  // 全局的路由守卫
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

  // 获取路由匹配到的所有组件，因为可能拥有具名router-view组件,所以存在多个组件的可能，
  // 所以返回值是一个数组
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

  // 该方法会在router-link中用到
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

  // 返回addRoutes方法，用于动态添加路由
  addRoutes (routes: Array<RouteConfig>) {
    this.matcher.addRoutes(routes)
    if (this.history.current !== START) {
      this.history.transitionTo(this.history.getCurrentLocation())
    }
  }
}

// 用于注册路由钩子
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)
  // 返回一个函数用于注销注册的钩子函数
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
