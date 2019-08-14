/* @flow */

import { _Vue } from '../install'
import { warn, isError } from './warn'

// 返回解析异步组件钩子函数的函数，该钩子函数会在queue队列中被调用
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      // 如果它是一个函数并且没有cid属性的话，我们假定它是一个异步组件解析函数，
      // 那么我们就不使用Vue默认的异步解析机制，因为我们希望暂停导航直到所有包含的组件解析完成
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true
        pending++

        // 异步组件加载成功
        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            // 如果是es6模块，加载的结果在default中
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          // 存储异步组件的解析结果
          def.resolved = typeof resolvedDef === 'function'
            ? resolvedDef
            : _Vue.extend(resolvedDef)
          match.components[key] = resolvedDef
          pending--
          // 路由匹配到的所有异步组件加载完成才进行下一步
          if (pending <= 0) {
            next()
          }
        })

        // 异步组件加载失败
        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason)
              ? reason
              : new Error(msg)
            // 终止路由的跳转
            next(error)
          }
        })

        let res
        try {
          // 普通的加载异步组件
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        if (res) {
          // Promise加载异步组件
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            // 高级组件，异步组件工厂函数的格式
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    // 如果不是异步组件的话，直接执行next()方法
    if (!hasAsync) next()
  }
}

// 扁平化路由所匹配的组件: 返回一个数组，数组的每一项为fn函数执行的结果.
// 传入fn函数的参数：1.具名组件，2.具名router-view实例，3.路由记录，4.router-view Name
export function flatMapComponents (
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  //
  return flatten(matched.map(m => {
    // 返回一个数组,数组的每一项为fn函数执行的返回值
    // 传入fn函数的参数：1.具名组件，2.具名router-view实例，3.路由记录，4.router-view Name
    return Object.keys(m.components).map(key => fn(
      m.components[key],
      m.instances[key],
      m, key
    ))
  }))
}

export function flatten (arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}

const hasSymbol =
  typeof Symbol === 'function' &&
  typeof Symbol.toStringTag === 'symbol'

function isESModule (obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
function once (fn) {
  let called = false
  return function (...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}
