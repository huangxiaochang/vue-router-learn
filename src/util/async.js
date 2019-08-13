/* @flow */

// 定义执行队列的方法：
// 经典的异步函数队列化执行模式，即把异步函数放到一个队列中，然后队列中的异步函数便会
// 按照它在队列中的顺序来进行执行，同时可以在某一个异步函数中进行终止执行，这样队列中剩余
// 的异步函数便不会再执行
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
