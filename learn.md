# 知识点
一.vue-router其实就是一个vue的插件，所以它实现了install方法，所以在实例Vue实例之前，
需要先安装vue-router: Vue.use(vue-router).

1.安装的原理: 使用Vue.mixin混入beforeCreate和destroyed的生命周期。所以在Vue实例的创建过程中，会
在beforeCreate，destroyed生命周期中进行相应的操作：
	beforeCreate生命周期：
	1.对于传进vue-router进行初始化的vm实例，会在beforeCreate生命周期中进行调用vue-router的init方法进行
	vue-router的初始化工作、注册路由记录对应的vm实例和在vm实例上定义响应式属性_route：目前的路由对象。
	2.其他的子组件中，在实例vm上定义_routerRoot属性，指向根vm实例对象。
	destroyed生命周期：
	1.取消注册路由记录对应的vm实例。

	同时安装的时候，会在Vue的原型上Vue.prototype定义了$router,$route属性，分别指向了vue-router实例对象
	和当前的route对象，所以我们能在所有的组件中访问这两个属性。

	同时使用Vue.component注册了router-link,router-view两个全局组件，所以我们也能够在所有的组件中使用这两个
	组件

二。要使用vue-router,实例要安装，还需要在实例化Vue根实例之前进行vue-router的实例化。
并把vue-router实例作为Vue根实例的配置项进行Vue根实例的创建。

# vue-router类实例化：
	1.定义match方法，建立由path获取对应的路由对象的接口。
	2.根据路由模式，定义不同的路由管理实例
	3.定义路由跳转的接口: push/replace/go等
	4.定义其他的一些属性和回调
	5.定义全局的路由钩子

#vue-router的初始化：会在vm组件的beforeCreate生命周期中进行初始化工作：
	1. 根据不同的路由模式，进行路由的确认跳转
	2. 监听路由切换成功的回调，在回调中会设置根实例vm的_route属性为当前的路由对象。
		 因为根实例的_route是响应式的，所以会触发_route的依赖，进行视图的更新。

# vue-router路由跳转进行视图更新的流程：
	1.在安装vue-router的时候，会在根vm上定义响应式属性_route。
	2.在router-view组件中会访问根vm上的_route属性，这样便收集了render watcher.
	3.在根实例的beforeCreate生命周期中会监听路由切换成功的回调，在回调中设置根vm的_route属性为当前路由。
	由于_route是响应式的属性，所以会通知依赖，即render watcher，进行重新执行，更新视图。

# 路由跳转确认：
	1.根据当前路由和要跳转的路由，解析出失活的组件，需要更新的组件，激活的组件
	2.解析出失活的组件，需要更新的组件，激活的组件中相应的路由钩子，然后和全局的路由钩子按照
		相应的顺序组成一个队列(组件内的钩子会绑定执行上下文为该组件vm)。
		钩子队列的顺序：
			1.失活的组件里的离开守卫
			2.全局beforeEach钩子函数
			3.重用的组件中的beforeRouteUpdate
			4.激活的路由配置中的beforeEnter
			5.解析异步组件的函数(如果解析异步组件失败，这会终止路由的跳转)
			6.激活的组件中beforeRouteEnter钩子(改钩子的执行环境经过特殊的处理，因为此时还拿不到组件vm)
			7.全局beforeResolve钩子(2.5+)

		即只有正常顺序执行完上面的异步函数，才会进行路由的跳转确认。具体的异步函数顺序化执行的算法可
		见具体的代码，后者搜索经典的异步函数队列化执行。

	3.根据经典的异步函数队列化执行路由钩子队列。只有正常执行完钩子函数队列才会进行路由的跳转确认。
		在异步函数队列化执行执行的过程中会暴露next方法给开发者决定是否执行下一个钩子函数

	4.路由跳转成功确认之后，会执行监听路由跳转成功的回调，这样便可以触发视图的更新。

# vue-router实例方法(push/replace/go等)进行路由跳转的原理：
	1.调用这些方法的时候，会调用路由管理实例的transitionTo方法，进行路由的跳转确认。即会进行上面提到的
	路由跳转确认流程。
	2.同时根据浏览器是否支持html5的历史管理api来进行添加或者替换历史记录。
	3.通过vue-router实例方法(push/replace/go)改变历史记录时，并不会触发popstate/hashchange事件，所以并不会
		造成重复路由确认流程。

# 路由历史记录：
	1.支持html5 api的浏览器使用window.history.pushState/replaceState来进行历史记录的管理
	2.不知window.history.pushState/replaceState的浏览器，通过window.location.hash来进行历史记录的管理。
	3.监听popstate/hashchange事件，事件发生时，根据历史记录中记录的相应url,来进行路由跳转确认。
		（注意：只有点击浏览器的前进/后退按钮才会触发popstate/hashchange事件）


