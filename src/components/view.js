import { warn } from '../util/warn'
import { extend } from '../util/misc'

/*
 router-view是一个函数式组件：
  函数式组件：(常用于高阶组件)
    1.组件自身没有状态
    2.组件自身没有实例，即this值
*/
export default {
  name: 'RouterView',
  functional: true,
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  // 参数：_ : createElement, 第二个参数： context
  // context:
  //  children: 函数式组件内的DOM
  //  data: {props: '', attrs:'', 'class': '', style: '',on: {},...}即父级传进来
  //    的数据集合，（一个包含模板相关属性的数据对象）
  //  parent： 父实例对象
  //  props: 父级组件传进来的数据
  // 
  
  render (_, { props, children, parent, data }) {
    // used by devtools to display a router-view badge
    data.routerView = true

    // directly use parent context's createElement() function
    // so that components rendered by router-view can resolve named slots
    const h = parent.$createElement
    const name = props.name
    // 由于我们把根 Vue 实例的 _route 属性定义成响应式的，访问 parent.$route，会触发getter
    // 收集了渲染函数订阅者，当执行完router.transitionTo 后，修改 app._route 的时候，
    // 又触发了setter, 所以渲染函数Watcher会执行更新，进行重新渲染
    const route = parent.$route
    const cache = parent._routerViewCache || (parent._routerViewCache = {})

    // determine current view depth, also check to see if the tree
    // has been toggled inactive but kept-alive.
    let depth = 0 // router-view的嵌套层级
    let inactive = false
    // parent_routerRoot是Vue根实例
    while (parent && parent._routerRoot !== parent) {
      // 如果父节点也有<router-view>，怎层级加1
      if (parent.$vnode && parent.$vnode.data.routerView) {
        depth++
      }
      if (parent._inactive) {
        inactive = true
      }
      parent = parent.$parent
    }
    data.routerViewDepth = depth

    // render previous view if the tree is inactive and kept-alive
    if (inactive) {
      return h(cache[name], data, children)
    }

    // 根据当前路径和层级关系，获取到要渲染的路由记录对象 
    const matched = route.matched[depth]
    // render empty node if no matched route
    if (!matched) {
      cache[name] = null
      return h()
    }

    // 获取匹配到的路由记录对应的组件并进行缓存
    const component = cache[name] = matched.components[name]

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    // 定义了一个注册路由实例的方法，该方法会在实例注入的beforeCreate钩子函数中被
    // 调用
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      const current = matched.instances[name]
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    ;(data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance
    }

    // resolve props
    // 解析路由配置中的props选项，注入到组件的props属性中
    let propsToPass = data.props = resolveProps(route, matched.props && matched.props[name])
    if (propsToPass) {
      // clone to prevent mutation
      propsToPass = data.props = extend({}, propsToPass)
      // pass non-declared props as attrs
      const attrs = data.attrs = data.attrs || {}
      for (const key in propsToPass) {
        if (!component.props || !(key in component.props)) {
          attrs[key] = propsToPass[key]
          delete propsToPass[key]
        }
      }
    }

    return h(component, data, children)
  }
}

// 解析路由中的props属性
function resolveProps (route, config) {
  switch (typeof config) {
    case 'undefined':
      return
    case 'object':
      return config
    case 'function':
      return config(route)
    case 'boolean':
      return config ? route.params : undefined
    default:
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
