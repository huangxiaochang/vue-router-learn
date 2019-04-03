/* @flow */

import { createRoute, isSameRoute, isIncludedRoute } from '../util/route'
import { extend } from '../util/misc'

// work around weird flow bug
const toTypes: Array<Function> = [String, Object]
const eventTypes: Array<Function> = [String, Array]

/*
  router-link的实现原理：
    根据传来的相关配置，进行事件的相关处理， 需要生成的元素类型，为元素
    添加active class，然后创建相关的元素。
    当触发事件时，根据to匹配的路由，进行使用router.replace或者router.push进行路由的跳转
 */

export default {
  name: 'RouterLink',
  props: {
    to: {
      type: toTypes,
      required: true
    },
    tag: {
      type: String,
      default: 'a'
    },
    exact: Boolean, // 是否精准匹配
    append: Boolean, // 是否在当前路由路径添加基路径
    replace: Boolean, // 是否使用router.replace来替换router.push
    activeClass: String, // 激活的链接的类名
    exactActiveClass: String, // 精准匹配激活的链接的类名
    event: { // 可以用来触发导航的事件
      type: eventTypes,
      default: 'click'
    }
  },
  render (h: Function) {
    // 得到router实例和当前激活的route对象
    const router = this.$router
    const current = this.$route
    // 获取当前匹配到的route的信息
    const { location, route, href } = router.resolve(this.to, current, this.append)

    const classes = {}
    const globalActiveClass = router.options.linkActiveClass
    const globalExactActiveClass = router.options.linkExactActiveClass
    // Support global empty active class
    // 获取active class, 在当前router-link中没有配置active class时，使用全局配置的active class
    const activeClassFallback = globalActiveClass == null
      ? 'router-link-active'
      : globalActiveClass
    const exactActiveClassFallback = globalExactActiveClass == null
      ? 'router-link-exact-active'
      : globalExactActiveClass
    const activeClass = this.activeClass == null
      ? activeClassFallback
      : this.activeClass
    const exactActiveClass = this.exactActiveClass == null
      ? exactActiveClassFallback
      : this.exactActiveClass
    const compareTarget = location.path
      ? createRoute(null, location, null, router)
      : route

    // 完全匹配模式或者包含匹配模式
    classes[exactActiveClass] = isSameRoute(current, compareTarget)
    classes[activeClass] = this.exact
      ? classes[exactActiveClass]
      : isIncludedRoute(current, compareTarget)

    // 事件处理
    const handler = e => {
      if (guardEvent(e)) {
        if (this.replace) {
          router.replace(location)
        } else {
          router.push(location)
        }
      }
    }

    // 处理触发导航的事件类型
    const on = { click: guardEvent }
    if (Array.isArray(this.event)) {
      this.event.forEach(e => { on[e] = handler })
    } else {
      on[this.event] = handler
    }

    // 创建元素需要附加的数据
    const data: any = {
      class: classes
    }

    // 在目标元素中绑定事件
    if (this.tag === 'a') {
      data.on = on
      data.attrs = { href }
    } else {
      // find the first <a> child and apply listener and href
      // 找到第一个<a>标签绑定事件和href属性
      const a = findAnchor(this.$slots.default)
      if (a) {
        // in case the <a> is a static node
        a.isStatic = false
        // 用于属性拓展
        const aData = a.data = extend({}, a.data)
        aData.on = on
        const aAttrs = a.data.attrs = extend({}, a.data.attrs)
        aAttrs.href = href
      } else {
        // doesn't have <a> child, apply listener to self
        // 没有找到就给当前元素自身绑定事件
        data.on = on
      }
    }

    // 创建元素
    return h(this.tag, data, this.$slots.default)
  }
}

// router-link的事件特殊情况的绑定处理
function guardEvent (e) {
  // don't redirect with control keys
  // 按下功能键的时候
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  // 已阻止的事件
  if (e.defaultPrevented) return
  // don't redirect on right click
  // 右键点击时不重定向
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  // 如果在router-link上设置了target="_blank",则不会进行重定向
  if (e.currentTarget && e.currentTarget.getAttribute) {
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) {
    e.preventDefault()
  }
  return true
}

// 在子节点中找到第一个a元素节点返回
function findAnchor (children) {
  if (children) {
    let child
    for (let i = 0; i < children.length; i++) {
      child = children[i]
      if (child.tag === 'a') {
        return child
      }
      if (child.children && (child = findAnchor(child.children))) {
        return child
      }
    }
  }
}
