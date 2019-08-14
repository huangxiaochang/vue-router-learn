/* @flow */
/*
  History基类的构造函数：
    1.设置实例对象current为默认的开始路由实例对象
    2.定义实例对象一些属性和方法：
      readyCbs，readyErrorCbs，errorCbs：收集ready,error回调函数的数组
      transitionTo，confirmTransition，updateRoute，listen，onReady实例方法
    3.updateRoute方法的作用：
      1.更新当前路由current
      2.执行监听路由更新的回调
      3.执行全局afterEach路由钩子函数
    4.confirmTransition方法的作用：
      1.如果是相同的则不跳转
      2.根据当前路由和要跳转的路由，解析出可复用，需要渲染，失活的组件
      3.依次获取失活组件中的beforeRouteLeave，全局beforeEach，重用的组件中的beforeRouteUpdate
        激活的路由配置组件中的beforeEnter, 定义解析异步路由组件钩子组成一个队列queue
      4.使用runQueue函数依次执行队列中的钩子函数，执行的方法：
        1.在钩子函数中传入一个next回调函数，然后判断开发者传进该函数的参数来确定是否执行下一个钩子函数
        只有在开发执行了next回调，并且传进的参数不为false,Error实例对象,  '/str?', {path: '/str?'}
        时才会继续执行下一个钩子函数。
        2.只有执行完了queue中的钩子函数，才调用runQueue的回调
      5.等待异步组件加载完成，获取异步组件内的beforeRouteEnter和全局beforeResolve组成queue队列
      6.继续第4步操作
      7.调用runQueue的回调，在回调中执行transitionTo的onComplete或者onAbort，代表着路由跳转确认完成
    5.transitionTo方法的作用：
      1.调用路由实例对象router的match方法获取要跳转的路由对象
      2.调用confirmTransition来进行跳转的确认，即执行各个路由钩子函数，由开发者进行确认。
      3.如果开发不确认跳转，则会终止路由的跳转，只有开发者确认，全部执行钩子函数之后才进行跳转操作。
      4.如果确认跳转，则更新当前路由信息和更新url。
      5.对路由实例中apps里面收集的组件实例设置_route属性值为当前路由实例对象，（_route是存储器属性，会触发视图更新）
      6.执行afterEach钩子
 */
import { _Vue } from '../install'
import type Router from '../index'
import { inBrowser } from '../util/dom'
import { runQueue } from '../util/async'
import { warn, isError } from '../util/warn'
import { START, isSameRoute } from '../util/route'
import {
  flatten,
  flatMapComponents,
  resolveAsyncComponents
} from '../util/resolve-components'

// 路由模式的基类，由hash，history，abstract模式继承
export class History {
  router: Router;
  base: string;
  current: Route;
  pending: ?Route;
  cb: (r: Route) => void;
  ready: boolean;
  readyCbs: Array<Function>;
  readyErrorCbs: Array<Function>;
  errorCbs: Array<Function>;

  // implemented by sub-classes
  +go: (n: number) => void;
  +push: (loc: RawLocation) => void;
  +replace: (loc: RawLocation) => void;
  +ensureURL: (push?: boolean) => void;
  +getCurrentLocation: () => string;

  constructor (router: Router, base: ?string) {
    this.router = router
    this.base = normalizeBase(base)
    // start with a route object that stands for "nowhere"
    this.current = START
    this.pending = null // 目前正在需要跳转确认的路由对象
    // 是否已经进行了初始导航，因为只有在初始导航时，才会执行readyCbs或readyErrorCbs中的回调
    // 在进行初始导航之后会设置成true
    this.ready = false
    this.readyCbs = [] // 路由完成初始导航时调用的回调
    this.readyErrorCbs = [] // 2.4+, 初始化路由解析运行出错(如：解析异步组件出错)
    this.errorCbs = [] // 路由导航过程中出错的回调
  }

  // 在_init的时候，会调用该方法添加cb, cb中会设置依赖的vm的_route属性为当前路由
  listen (cb: Function) {
    this.cb = cb
  }

  // 收集监听完成初始化导航的回调，会在完成初始化导航时，调用收集的回调
  onReady (cb: Function, errorCb: ?Function) {
    if (this.ready) {
      cb()
    } else {
      this.readyCbs.push(cb)
      if (errorCb) {
        this.readyErrorCbs.push(errorCb)
      }
    }
  }

  // 收集监听路由导航过程中出错的回调，会在导航过程中出错时，调用回调
  onError (errorCb: Function) {
    this.errorCbs.push(errorCb)
  }

  // 路由跳转：
  // 1.调用路由实例对象router的match方法获取要跳转的路由对象
  // 2.调用confirmTransition来进行跳转的确认，即执行各个路由钩子函数，由开发者进行确认。
  // 3.如果开发不确认跳转，则会终止路由的跳转，只有开发者确认，全部执行钩子函数之后才进行跳转操作。
  // 4.如果确认跳转，则更新当前路由信息和更新url。
  // 5.对路由实例中apps里面收集的组件实例设置_route属性值为当前路由实例对象，（_route是存储器属性，会触发视图更新）
  // 6.执行afterEach钩子
  transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) {
    // 获取匹配的路由信息
    const route = this.router.match(location, this.current)
    // 确认切换路由
    this.confirmTransition(route, () => {
      // 切换路由成功的回调

      // 更新路由信息，对组件的_route属性进行赋值，触发组件渲染
      this.updateRoute(route)
      // 执行路由跳转成功的回调，如滚动滚动条等等
      // 在hash模式中，添加hashchange监听，因为要避免hashchange事件过早地触发，
      // 所以要在视图更新之后再添加监听器
      onComplete && onComplete(route)
      // 更新url：更新浏览器地址栏的location，并且进行浏览器的历史记录管理，添加或者替换历史记录，
      // 虽然会修改历史记录，但是并不会触发popstate/hashchange事件，所以不会导致重复transitionTo，因为
      // popstate/hashchange事件只有点击浏览器的前/后退按钮时，才会触发
      this.ensureURL()
      // fire ready cbs once
      // 监听ready的回调只执行一次
      if (!this.ready) {
        this.ready = true
        // 执行路由初始导航成功的回调
        this.readyCbs.forEach(cb => { cb(route) })
      }
    }, err => {
      // 切换路由失败的回调
      if (onAbort) {
        // 执行跳转失败的回调
        // hash模式的初始跳转会添加hashchange监听
        onAbort(err)
      }
      if (err && !this.ready) {
        this.ready = true
        // 执行初始化路由解析运行出错的回调
        this.readyErrorCbs.forEach(cb => { cb(err) })
      }
    })
  }

  // 路由确认
  // 1.如果是相同的则不跳转
  // 2.根据当前路由和要跳转的路由，解析出可复用，需要渲染，失活的组件
  // 3.依次获取失活组件中的beforeRouteLeave，全局beforeEach，重用的组件中的beforeRouteUpdate
  //    激活的路由配置组件中的beforeEnter, 定义解析异步路由组件钩子组成一个队列queue
  // 4.使用runQueue函数依次执行队列中的钩子函数，执行的方法：
  //    1.在钩子函数中传入一个next回调函数，然后判断开发者传进该函数的参数来确定是否执行下一个钩子函数
  //    只有在开发执行了next回调，并且传进的参数不为false,Error实例对象,  '/str?', {path: '/str?'}
  //    时才会继续执行下一个钩子函数。
  //    2.只有执行完了queue中的钩子函数，才调用runQueue的回调
  // 5.等待异步组件加载完成，获取异步组件内的beforeRouteEnter和全局beforeResolve组成queue队列
  // 6.继续第4步操作
  // 7.调用runQueue的回调，在回调中执行transitionTo的onComplete或者onAbort，代表着路由跳转确认完成
  confirmTransition (route: Route, onComplete: Function, onAbort?: Function) {
    const current = this.current
    // 定义终止跳转的函数：有错误发生时，执行监听错误的回调，然后执行onAbort终止跳转的回调
    const abort = err => {
      if (isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => { cb(err) })
        } else {
          warn(false, 'uncaught error during route navigation:')
          console.error(err)
        }
      }
      onAbort && onAbort(err)
    }

    // 如果是相同的路由，则终止跳转
    // 相同路由：path，hash，query相同或者name, hash, query, params相同
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      route.matched.length === current.matched.length
    ) {
      // 进行url的修改和历史记录管理
      this.ensureURL()
      return abort()
    }

    // 通过对比路由解析出可复用的组件，需要渲染的组件，失活的组件
    const {
      updated,
      deactivated,
      activated
    } = resolveQueue(this.current.matched, route.matched)
    // 获取路由钩子函数组成一个队列
    const queue: Array<?NavigationGuard> = [].concat(
      // in-component leave guards
      // 获取失活的组件里的离开守卫
      extractLeaveGuards(deactivated),
      // global before hooks
      // 获取全局beforeEach
      this.router.beforeHooks,
      // in-component update hooks
      // 获取在重用的组件中的beforeRouteUpdate
      extractUpdateHooks(updated),
      // in-config enter guards
      // 获取在激活的路由配置中的beforeEnter
      activated.map(m => m.beforeEnter),
      // 创建解析async components的函数
      resolveAsyncComponents(activated)
    )

    this.pending = route
    // 迭代器，用于执行 queue 中的导航守卫钩子
    const iterator = (hook: NavigationGuard, next) => {
      if (this.pending !== route) {
        return abort()
      }
      try {
        // 执行路由钩子函数，参数： to, from, next
        // next为一个函数，如果开发者不执行next,则不会执行下一个钩子函数
        // 如果执行next函数，则根据传来不同的值，进行处理。to: any为next函数中的参数
        hook(route, current, (to: any) => {
          if (to === false || isError(to)) {
            // next(false) -> abort navigation, ensure current URL
            // 如果传来的是false或者一个Error实例对象，则终止跳转
            this.ensureURL(true)
            abort(to)
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' && (
              typeof to.path === 'string' ||
              typeof to.name === 'string'
            ))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            // 重定向
            abort()
            if (typeof to === 'object' && to.replace) {
              this.replace(to)
            } else {
              this.push(to)
            }
          } else {
            // confirm transition and pass on the value
            // 这里执行 next 也就是执行下面函数 runQueue 中的 step(index + 1)
            next(to)
          }
        })
      } catch (e) {
        // 如果在执行路由钩子时，发生错误，这终止跳转
        abort(e)
      }
    }

    // 经典同步执行异步
    // 在queue中的钩子函数，只要在任何一个钩子函数中不调用next或者终止跳转(next(fanse))
    // 的时候，将会执行执行queue往下继续执行，即终止路由的跳转，因为只有执行完queue，
    // 才会调用执行完毕的回调，才会在回调中执行路由的更新和组件的渲染
    runQueue(queue, iterator, () => {
      const postEnterCbs = [] // 用于收集在beforeRouteEnter钩子中传递给next函数的回调
      const isValid = () => this.current === route
      // wait until async components are resolved before
      // extracting in-component enter guards
      // 等待异步组件加载完成，获取异步组件内的beforeRouteEnter和全局beforeResolve(2.5+)
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
      const queue = enterGuards.concat(this.router.resolveHooks)
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort()
        }
        // 路由被确认
        this.pending = null
        onComplete(route)
        if (this.router.app) {
          // 在根组件重渲染后，执行beforeRouteEnter中next方法中的回调函数
          this.router.app.$nextTick(() => {
            // 其实是执行poll
            postEnterCbs.forEach(cb => { cb() })
          })
        }
      })
    })
  }

  // 更新路由，会在确认路由跳转之后， 调用该方法来更新路由，更新：
  // 设置当前路由为确认跳转的路由
  // 执行监听路由更新的回调（即设置组件实例对象的_route属性为确认跳转的路由，触发视图更新）
  // 执行全局afterEach路由钩子函数，传入参数：确认跳转的路由对象，之前的路由对象
  updateRoute (route: Route) {
    const prev = this.current
    this.current = route
    // 执行回调，在回调中设置实例vm的_route属性为当前route,因为vm._route是响应式的，
    // 所以会触发视图的更新
    this.cb && this.cb(route)
    // 执行全局afterEach路由守卫
    this.router.afterHooks.forEach(hook => {
      hook && hook(route, prev)
    })
  }
}

// 规范化开发者配置的base：
// 前面以'/'开头，不以'/'结尾,或者获取html中配置的base，否者默认'/'
function normalizeBase (base: ?string): string {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base')
      base = (baseEl && baseEl.getAttribute('href')) || '/'
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '')
    } else {
      base = '/'
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

// 通过目前路由的记录片段列表(即父到子路径中所有的路由记录)
// 和要跳转路由的记录片段列表，解析出要更新的路由片段列表、
// 激活的路由记录和变成不激活的路由记录列表。
// 如由a/b/c/d --> a/b/c,则updated: [a,b]、activated: [c]、deativated: [d]
function resolveQueue (
  current: Array<RouteRecord>,
  next: Array<RouteRecord>
): {
  updated: Array<RouteRecord>,
  activated: Array<RouteRecord>,
  deactivated: Array<RouteRecord>
} {
  let i
  const max = Math.max(current.length, next.length)
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

// 从records数组中提取各个阶段的所有守卫。
// 这些钩子函数都绑定了相应的执行上下文环境
function extractGuards (
  records: Array<RouteRecord>,
  name: string, // 路由钩子名字
  bind: Function,
  reverse?: boolean
): Array<?Function> {
  // def: component, instance: router-view:vm, match：routeRecord, key: routerViewName
  const guards = flatMapComponents(records, (def, instance, match, key) => {
    // 获取组件中对应的路由钩子
    const guard = extractGuard(def, name)
    // 绑定钩子的执行上下文为相应的router-view实例对象
    if (guard) {
      return Array.isArray(guard)
        ? guard.map(guard => bind(guard, instance, match, key))
        : bind(guard, instance, match, key)
    }
  })
  // beforeRouteLeave钩子数组需要反转，因为离开的过程是从内层组件到外层组件离开，
  // 而我们获取离开的组件时，是从外层到内层的，然后再使用flatten函数扁平化数组
  return flatten(reverse ? guards.reverse() : guards)
}

// 获取指定组件对应名字的路由钩子
function extractGuard (
  def: Object | Function,
  key: string
): NavigationGuard | Array<NavigationGuard> {
  if (typeof def !== 'function') {
    // extend now so that global mixins are applied.
    def = _Vue.extend(def)
  }
  return def.options[key]
}

// 获取所有失活组件中定义的beforeRouteLeave钩子函数, 并绑定它的执行上下文环境为相应的router-view实例
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true /* reverse*/)
}

// 获取所有更新的组件中beforeRouteUpdate钩子函数，并绑定该钩子函数的执行上下文为相应的router-view实例
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}

// 把路由钩子函数的执行上下文为相应的router-view实例
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
  if (instance) {
    return function boundRouteGuard () {
      return guard.apply(instance, arguments)
    }
  }
}

// 提取组件中beforeRouteEnter路由守卫
function extractEnterGuards (
  activated: Array<RouteRecord>,
  cbs: Array<Function>,
  isValid: () => boolean
): Array<?Function> {
  // 绑定该路由钩子的执行上下文与其他的不同。因为该守卫执行时，组件实例还没有被创建。
  // 但是可以通过传递一个回调给next来访问组件实例。在导航被确认时执行该回调，并传进组件
  // 实例作为回调的参数
  return extractGuards(activated, 'beforeRouteEnter', (guard, _, match, key) => {
    return bindEnterGuard(guard, match, key, cbs, isValid)
  })
}

// 绑定beforeRouteEnter钩子函数的执行上下文环境
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  // 在iterator中执行的hook,其中的hook就是该函数routeEnterGuard
  return function routeEnterGuard (to, from, next) {
    // 这里的guard才是开发者定义的beforeRouteEnter
    // 所以这里的cb是开发者在beforeRouteEnter中，调用next回调传来的参数，可以传进一个回调函数，
    // 该回调函数会在导航确认的时候被执行，并传入组件实例作为参数。
    return guard(to, from, cb => {
      // 执行next，继续下一步的异步队列的异步函数的执行
      next(cb)
      // 收集该回调，会在导航确认前被调用
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          // 一些了路由组件被套 transition 組件在一些缓动模式下不一定能拿到实例，所以需要使用轮询的方式
          poll(cb, match.instances, key, isValid)
        })
      }
    })
  }
}

// 使用一个轮询的方法，直到能拿到组件实例时，再去调用cb,并把组件实例作为参数传进
function poll (
  cb: any, // somehow flow cannot infer this is a function
  instances: Object,
  key: string,
  isValid: () => boolean
) {
  if (
    instances[key] &&
    !instances[key]._isBeingDestroyed // do not reuse being destroyed instance
  ) {
    cb(instances[key])
  } else if (isValid()) {
    setTimeout(() => {
      poll(cb, instances, key, isValid)
    }, 16)
  }
}
