/* @flow */

export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  // 定义执行的步伐
  const step = index => {
    if (index >= queue.length) {
      // 执行完成队列之后，执行回调
      cb()
    } else {
      if (queue[index]) {
        // current hook，next hook
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        // 跳过队列中的空回调
        step(index + 1)
      }
    }
  }
  step(0)
}
