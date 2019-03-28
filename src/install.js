import View from './components/view'
import Link from './components/link'

export let _Vue

/*
  路由的安装方法：
    1.确保只安装一次
    2.把Vue赋值全局变量_Vue
    3.向所有组件注入beforeCreate，destroyed生命周期钩子函数，目的是进行路由的初始化
    4.在Vue构造函数原型上定义$router,$route属性，让开发者在组件中能够访问路由实例和路由对象
    5.注册全局组件router-view和router-link
    6.定义路由钩子函数的合并策略
 */
export function install (Vue) {
  // 确保只安装一次
  if (install.installed && _Vue === Vue) return
  install.installed = true
  
  // 把Vue赋值给全局变量_Vue,这样可以在其他地方使用，并且不用再import，减少项目体积
  _Vue = Vue

  const isDef = v => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode
    if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
      i(vm, callVal)
    }
  }

  // 在所有的组件中注入beforeCreate,和destroy钩子函数，beforeCreate钩子执行时，会进行路由初始化
  Vue.mixin({
    beforeCreate () {
      if (isDef(this.$options.router)) {
        this._routerRoot = this
        this._router = this.$options.router
        // 初始化路由
        this._router.init(this)
        // 设置响应式属性_route,实现组件渲染
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        // 用于router-view层级判断
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      // 注册路由实例
      registerInstance(this, this)
    },
    destroyed () {
      registerInstance(this)
    }
  })

  // 在Vue构造函数原型上设置属性$router,$route路由实例和路由对象，所以开发者可以在vue组件中通过
  // this.$router,this.$route来访问路由实例和路由对象
  Object.defineProperty(Vue.prototype, '$router', {
    get () { return this._routerRoot._router }
  })

  Object.defineProperty(Vue.prototype, '$route', {
    get () { return this._routerRoot._route }
  })

  // 注册全局组件router-view和router-link
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  // 定义路由钩子函数的合并策略
  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created
}
