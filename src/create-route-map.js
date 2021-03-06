/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path' // cleanPath把路径中的所有'//' -> '/'
import { assert, warn } from './util/warn'

// 主要进行路径的规范化
// 创建路由路径记录列表
// 创建路由path记录映射表
// 创建路由name记录映射表
export function createRouteMap (
  routes: Array<RouteConfig>,
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>;
  pathMap: Dictionary<RouteRecord>;
  nameMap: Dictionary<RouteRecord>;
} {
  // the path list is used to control path matching priority
  // 设置一个路径列表用于控制路径匹配的优先级
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  // 路由路径到路由记录的映射表
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  // 路由名字到路由记录的映射表
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  // 遍历路由配置，为每一个配置添加路由记录
  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // ensure wildcard routes are always at the end
  // 确保通配符在最后
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}

// 为每一个配置的route生成一条路由记录，
// 把路由记录加到path路由映射表
// 把路由记录加到name路由映射表
// 同时进行一些规范化
function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  const { path, name } = route
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(path || name)} cannot be a ` +
      `string id. Use an actual component instead.`
    )
  }

  // 获取开发者配置的路径到正则表达式的配置项。详情可查vue-router路由的高级匹配模式
  const pathToRegexpOptions: PathToRegexpOptions = route.pathToRegexpOptions || {}
  // 规范化path, 即子路径会加上路径,严格模式会去掉最后的'/',把路径中所有的'//' -> '/'
  const normalizedPath = normalizePath(
    path,
    parent,
    pathToRegexpOptions.strict
  )

  // 匹配规则是否是大小写敏感
  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  // 路由记录对象
  const record: RouteRecord = {
    path: normalizedPath,
    // compileRouteRegex： 路由匹配的正则表达式，(把路径装化成对应的匹配正则表达式)
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component }, // 命名视图组件：viewName: component
    instances: {}, // 用来注册路由匹配对应的router-view vm实例: viewName: router-view
    name,
    parent, // 用于子路由,指向父级record
    matchAs, // 用于路由别名，值为record.path或者/
    redirect: route.redirect, // 重定向的配置，可以是路径字符串，对象，函数
    beforeEnter: route.beforeEnter, // 路由配置中的beforeEnter守卫
    meta: route.meta || {}, // 路由配置中的路由元信息
    // props的值可能为true/false, {}, function, 最终规范化成{},或者viewName: props
    props: route.props == null
      ? {}
      : route.components // 如果是具名组件
        ? route.props
        : { default: route.props }
  }

  // 递归路由配置的children属性，添加路由记录
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    if (process.env.NODE_ENV !== 'production') {
      if (route.name && !route.redirect && route.children.some(child => /^\/?$/.test(child.path))) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
          `When navigating to this named route (:to="{name: '${route.name}'"), ` +
          `the default child route will not be rendered. Remove the name from ` +
          `this route and use the name of the default child route for named ` +
          `links instead.`
        )
      }
    }
    route.children.forEach(child => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 如果有别名，给别名也添加路由记录
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias)
      ? route.alias
      : [route.alias]

    aliases.forEach(alias => {
      const aliasRoute = {
        path: alias,
        children: route.children
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    })
  }

  // 添加路径映射路由记录
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }

  // 命名路由添加名字映射路由记录
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
        `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

// 使用path-to-regexp库把路径path编译成正则表达式
function compileRouteRegex (path: string, pathToRegexpOptions: PathToRegexpOptions): RouteRegExp {
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      warn(!keys[key.name], `Duplicate param keys in route with path: "${path}"`)
      keys[key.name] = true
    })
  }
  return regex
}

// 规范化路径path，如严格模式去掉路径最后的'/',如果子路径不是以/开头，则加上父路径
function normalizePath (path: string, parent?: RouteRecord, strict?: boolean): string {
  // 如果不是严格模式,会去掉路径最后面的'/'
  if (!strict) path = path.replace(/\/$/, '')
  if (path[0] === '/') return path
  if (parent == null) return path
  return cleanPath(`${parent.path}/${path}`)
}
