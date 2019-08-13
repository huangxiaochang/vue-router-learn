/* @flow */

import type VueRouter from '../index'
import { parsePath, resolvePath } from './path'
import { resolveQuery } from './query'
import { fillParams } from './params'
import { warn } from './warn'
import { extend } from './misc'

// 规范化路径
export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean, // 在create-matcher传进false
  router: ?VueRouter
): Location {
  let next: Location = typeof raw === 'string' ? { path: raw } : raw
  // named target
  // 命名路由，或者已经规范过的路由，直接返回
  if (next.name || next._normalized) {
    return next
  }

  // relative params
  // 如果不存在path属性并且有parmas并且有当前路由的话（即只改变当前路由的params）
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  // parsePath: 返回next.path中相应的hash,query,和path部分
  const parsedPath = parsePath(next.path || '')
  const basePath = (current && current.path) || '/'
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
