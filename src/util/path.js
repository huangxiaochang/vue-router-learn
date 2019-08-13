/* @flow */

// 解析base路径，和相对路径，返回正确的路径
export function resolvePath (
  relative: string,
  base: string,
  append?: boolean
): string {
  const firstChar = relative.charAt(0)
  // 如果是路径部分，直接返回
  if (firstChar === '/') {
    return relative
  }

  // 如果是hash或者query部分，则加上路径部分返回
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  // 解析相对路径
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  // 确保开始是'/'
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

// 解析路径中的hash,query,path部分并返回
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  const hashIndex = path.indexOf('#')
  if (hashIndex >= 0) {
    hash = path.slice(hashIndex)
    path = path.slice(0, hashIndex)
  }

  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    query = path.slice(queryIndex + 1)
    path = path.slice(0, queryIndex)
  }

  return {
    path,
    query,
    hash
  }
}

// 把path中的// -> /
export function cleanPath (path: string): string {
  return path.replace(/\/\//g, '/')
}
