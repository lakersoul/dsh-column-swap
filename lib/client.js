/**
 * dsh-column-swap — browser half (client bundle).
 * ---------------------------------------------------------------------------
 * 把 DSH **原生右侧栏**占用的那一列（AppFrame 三轨 grid 的第三个 grid item，
 * [data-rightbar-col]）与居中的智能体对话栏对调，使布局从
 * 「[左栏 | 对话栏 | 右列]」变成「[左栏 | 右列 | 对话栏]」，且两侧宽度各自保留。
 * 右上角提供一枚总开关按钮。
 *
 * 与占位者无关：本插件只换「那一列」，不关心列里是谁的内容。这份部署里占位的是
 * dsh-better-sidebar（0.19+ 起不再自绘右侧面板，它的全部 tab 都注册进 DSH 原生
 * 右列）；换成 DSH 自带内容（内置 Guide 页 / 文档预览）同样成立。它不 require
 * better-sidebar、不调用其服务、也不引用其任何 DOM 标记，更不检查它是否安装。
 *
 * 为什么需要这么一个插件：DSH 没有提供「右列换到左边」的开关，ctx.layout 的公开面
 * 也没有右列宽度的 setter，所以这是一层纯客户端「布局补丁」：靠语义锚点定位 +
 * 重写帧内联的轨道 + 少量 CSS 变量，不改任何上游文件。
 *
 * 六件事（每一件都对应一个踩过的坑，见各段注释）：
 *   (1) 锚点定位帧与三列        —— 向上找 display:grid 祖先 + slot 宿主上溯；
 *   (2) 重写 grid-template-columns —— 不重写的话宽度会跟着轨道跑；
 *   (3) 三列显式 grid-row:1     —— 否则稀疏自动放置会把右列顶到隐式第 2 行（高 0）；
 *   (4) 补回分割线              —— 原生那条来自面板自己的 border-left，交换后会错位；
 *   (5) 镜像指针事件            —— 原生手柄是右侧停靠语义，左停靠后方向会反；
 *   (6) 右上角总开关            —— 除按钮自身外，上面全部效果都受它管辖。
 *
 * 交付形式是 DSH 客户端模块（与第三方客户端插件同款）：
 *   window.__ModuleLoader__.load({ id, factory }) ，factory 里 require('react')，
 * 返回 { name, inject, apply }。样式由本包自注入（真实插件没有动态插件的
 * styles 座位），并挂在 ctx.effect 上，随 fiber 释放一起还原。
 */

window.__ModuleLoader__.load({
  id: 'dsh-column-swap',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')

    const ATTR_FRAME = 'data-dsh-swap-frame'
    const ATTR_ON = 'data-dsh-swap-on'
    const ATTR_CENTER = 'data-dsh-swap-center'
    const ATTR_RAIL = 'data-dsh-swap-rail'
    const ATTR_RIGHT = 'data-dsh-swap-right'
    const ATTR_NOTRACK = 'data-dsh-swap-notrack'
    const ATTR_TOGGLE = 'data-dsh-swap-toggle'
    /** 标记自己派发的镜像事件，避免再次被拦截（无限递归）。 */
    const MIRROR_FLAG = '__dshSwapMirrored'

    const CSS = [
      '/* dsh-column-swap: [左栏 | 插件侧栏 | 对话栏]，仅在开关打开时生效 */',
      '[data-dsh-swap-on]{grid-template-columns:var(--dsh-swap-cols) !important}',
      '/* grid-row:1 是必需的：只给确定列的话，稀疏自动放置游标会在「列号回退」时把',
      '   右栏顶到隐式第 2 行（grid-template-rows:100% 只定义第 1 行）⇒ 高度 0。 */',
      '[data-dsh-swap-on]>[data-dsh-swap-rail]{grid-column:1;grid-row:1}',
      '[data-dsh-swap-on]>[data-rightbar-col]{grid-column:2;grid-row:1;overflow:hidden}',
      '[data-dsh-swap-on]>[data-dsh-swap-center]{grid-column:3;grid-row:1;min-width:0}',
      '[data-dsh-swap-on]>[data-side="rightbar"]{left:var(--dsh-swap-handle-left) !important}',
      '/* 分割线：面板自带的 border-left 在交换后会落在左栏边界上（与左栏的',
      '   border-right 重叠），改画在侧栏列右缘；列宽为 0（收起 / 悬浮）时不画。 */',
      '[data-dsh-swap-on]:not([data-dsh-swap-notrack])>[data-rightbar-col]{border-right:.5px solid var(--dsw-alias-border-l4)}',
      '[data-dsh-swap-on] [data-sidebar-right-panel]{border-left:none}',
      '/* 有轨道时让面板宽度改由轨道决定。原生布局里面板内联宽度与轨道尺寸来自',
      '   同一次 React 提交，永远同步；交换后轨道来自本插件的变量，若面板仍用内联',
      '   宽度，拖动分割线的每一帧都会出现「面板已变、轨道未变」的错位（表现为内容',
      '   边缘被裁 / 像溢出，松手后才对齐）。width:100% 取的是列的 padding box，',
      '   与轨道恒等 ⇒ 错位在构造上不可能发生。无轨道（悬浮）时不适用。 */',
      '[data-dsh-swap-on]:not([data-dsh-swap-notrack]) [data-rightbar-col] [data-sidebar-right-panel]:not([data-sidebar-right-panel="fullscreen"]){width:100% !important}',
      '/* 无轨道（窄窗 / 悬浮模式）时把面板钉回视口右缘，保持原生表现。 */',
      '[data-dsh-swap-on][data-dsh-swap-notrack] [data-sidebar-right-panel]:not([data-sidebar-right-panel="fullscreen"]){position:fixed;top:0;bottom:0;right:0}',
      '/* 右上角总开关：只用产品侧已存在的 token，与原生右侧栏图标按钮同款。 */',
      '[data-dsh-swap-toggle]{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;padding:6px;border:none;border-radius:28px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:1}',
      '[data-dsh-swap-toggle]:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '[data-dsh-swap-toggle] svg{width:15px;height:15px}',
    ].join('\n')

    /** 按钮文案跟随浏览器语言（不引入 locale 服务字段形状的假设）。 */
    const zh = (() => {
      try {
        return String(navigator.language || '').toLowerCase().startsWith('zh')
      } catch (error) {
        return true
      }
    })()

    const TEXT = {
      swap: zh ? '交换插件侧栏与对话栏' : 'Swap the sidebar and conversation',
      restore: zh ? '恢复原生列序（对话栏回到中间）' : 'Restore the native column order',
      label: zh ? '两栏交换位置' : 'Swap panes',
    }

    /** 图标：两个栏位 + ⇄，表示「交换这两栏」。 */
    const icon = () => React.createElement('svg', {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    },
      React.createElement('rect', { key: 'l', x: 2.5, y: 3, width: 6.5, height: 18, rx: 1.5 }),
      React.createElement('rect', { key: 'r', x: 15, y: 3, width: 6.5, height: 18, rx: 1.5 }),
      React.createElement('path', { key: 'a', d: 'M10.4 9h3.8m-1.5-1.6L14.3 9l-1.6 1.6' }),
      React.createElement('path', { key: 'b', d: 'M13.6 15h-3.8m1.5 1.6L9.7 15l1.6-1.6' }),
    )

    /** 本包的样式表：自注入、随 fiber 还原。 */
    function injectStyles(css) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-column-swap'
      tag.textContent = css
      document.head.append(tag)
      return () => tag.remove()
    }

    function createClientPlugin() {
      return {
        name: 'dsh-column-swap',
        // ctx.interval 是兜底重定位用的（框架混入的定时器座位）。
        inject: ['timer'],
        apply(ctx) {
          ctx.effect(() => injectStyles(CSS), 'dsh-column-swap: stylesheet')

          let frame = null
          let rightCell = null
          let centerCell = null
          let railCell = null
          let lastCols = ''
          let lastLeft = ''
          let lastNotrack = null
          let mirrorAttached = false
          let frameWatcher = null
          let frameResize = null
          let raf = null
          let announced = false
          /** 总开关：true = [左栏 | 插件侧栏 | 对话栏]（本插件的交换态）。 */
          let swapped = true
          const listeners = new Set()

          const number = (text) => {
            const value = Number.parseFloat(text)
            return Number.isFinite(value) ? value : null
          }
          const tag = (node, attr) => {
            if (node !== null && node.getAttribute(attr) === null) node.setAttribute(attr, '')
          }
          const untag = (node, attr) => {
            if (node !== null && node.getAttribute(attr) !== null) node.removeAttribute(attr)
          }
          const notify = () => {
            for (const listener of Array.from(listeners)) listener(swapped)
          }
          const setSwapped = (next) => {
            swapped = next === true
            if (frame !== null) {
              if (swapped) tag(frame, ATTR_ON)
              else untag(frame, ATTR_ON)
            }
            notify()
          }
          const isGrid = (node) => {
            const display = getComputedStyle(node).display
            return display === 'grid' || display === 'inline-grid'
          }
          /** 从 node 向上走到 ancestor 的直接子元素（跨任意层包裹）。 */
          const directChildOf = (node, ancestor) => {
            let cur = node
            while (cur !== null && cur.parentElement !== null && cur.parentElement !== ancestor) cur = cur.parentElement
            if (cur === null || cur.parentElement !== ancestor) return null
            return cur
          }
          /** 帧的在流子元素（排除 absolute/fixed 的 overlay 层与拖拽手柄）。 */
          const inFlowChildren = (node) => Array.from(node.children).filter((child) => {
            const position = getComputedStyle(child).position
            return position !== 'absolute' && position !== 'fixed'
          })
          const outletCell = (slotKey, grid) => {
            const outlet = document.querySelector('[data-slot="' + slotKey + '"]')
            return outlet === null ? null : directChildOf(outlet, grid)
          }

          // ── (5) 拖动方向：仅在交换态镜像指针 X ──────────────────────────────
          // 原生手柄的 onDrag 是 setRightbar(base - dx)（右侧停靠语义：手柄在
          // 面板左缘，向左拖 = 面板变宽）。交换后侧栏改为「左缘钉在左栏」的左
          // 停靠，同一个公式就反了；ctx.layout 只公开 openRightbar/closeRightbar，
          // 没有宽度 setter，所以只能在事件层纠正：把 clientX 关于 0 镜像后重新
          // 派发。DragHandle 只用 clientX 的差值（origin/latest），绝对量从不参与，
          // 因此镜像等价于 dx → -dx。开关关闭时必须放行，否则会把原生布局本来
          // 正确的方向拖反。
          const isRightHandle = (node) => {
            if (node === null || node === undefined || typeof node.closest !== 'function') return false
            const handle = node.closest('[data-side="rightbar"]')
            return handle !== null && frame !== null && frame.contains(handle)
          }
          const mirrored = (event) => {
            const clone = new PointerEvent(event.type, {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              isPrimary: event.isPrimary,
              clientX: -event.clientX,
              clientY: event.clientY,
              screenX: -event.screenX,
              screenY: event.screenY,
              button: event.button,
              buttons: event.buttons,
              pressure: event.pressure,
              ctrlKey: event.ctrlKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              metaKey: event.metaKey,
            })
            clone[MIRROR_FLAG] = true
            return clone
          }
          const onHandlePointer = (event) => {
            if (event[MIRROR_FLAG] === true) return
            if (!swapped) return
            const target = event.target
            if (!isRightHandle(target)) return
            event.stopPropagation()
            target.dispatchEvent(mirrored(event))
          }
          const POINTER_TYPES = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']

          /** 摘掉本插件写过的全部标记与变量（停止 / 换帧时调用）。 */
          function detach() {
            untag(rightCell, ATTR_RIGHT)
            untag(centerCell, ATTR_CENTER)
            untag(railCell, ATTR_RAIL)
            if (frame !== null) {
              if (mirrorAttached) {
                for (const type of POINTER_TYPES) frame.removeEventListener(type, onHandlePointer, true)
                mirrorAttached = false
              }
              untag(frame, ATTR_ON)
              untag(frame, ATTR_FRAME)
              untag(frame, ATTR_NOTRACK)
              frame.style.removeProperty('--dsh-swap-cols')
              frame.style.removeProperty('--dsh-swap-handle-left')
            }
            frame = null
            rightCell = null
            centerCell = null
            railCell = null
            lastCols = ''
            lastLeft = ''
            lastNotrack = null
          }

          function attachFrameWatchers() {
            if (frameWatcher !== null) frameWatcher.disconnect()
            if (frameResize !== null) frameResize.disconnect()
            // 帧 style 这条路径必须**同步**（微任务内）执行，不能走 rAF 排帧：
            // 轨道尺寸来自本插件的 --dsh-swap-cols，而 React 在同一次提交里写内联
            // 模板与面板宽度；若这里排到下一帧，拖动分割线时每一帧都会出现错位
            // （内容边缘被裁 / 像溢出，松手后才追上）。MutationObserver 回调是微任务，
            // 必定在该帧绘制前跑完，故同步执行即可与 React 同帧。
            frameWatcher = new MutationObserver(() => {
              try {
                run()
              } catch (error) {
                console.error('[dsh-column-swap] sync failed:', error)
              }
            })
            frameWatcher.observe(frame, { attributes: true, attributeFilter: ['style'] })
            frameResize = new ResizeObserver(schedule)
            frameResize.observe(frame)
            if (!mirrorAttached) {
              for (const type of POINTER_TYPES) frame.addEventListener(type, onHandlePointer, true)
              mirrorAttached = true
            }
          }

          // ── (1) 锚点定位 ────────────────────────────────────────────────────
          // 右列 = [data-rightbar-col]（AppFrame 自己写的属性，稳定）；
          // 帧 = 它向上最近的 display:grid 祖先；三列 = 各自锚点向上走到帧的
          // 直接子元素。对话列有四级兜底，左栏找不到也不阻塞（此时只显式放置
          // 右栏与对话栏，左栏自动占第 1 轨）。任何一步对不上就整体不动作——
          // 宁可没效果，也不写坏布局。
          function resolve() {
            const rightbar = document.querySelector('[data-rightbar-col]')
            if (rightbar === null) return false
            let grid = null
            for (let node = rightbar.parentElement; node !== null; node = node.parentElement) {
              if (isGrid(node)) {
                grid = node
                break
              }
            }
            if (grid === null) return false
            const right = directChildOf(rightbar, grid)
            if (right === null) return false
            const rail = outletCell('sidebar', grid)
            let center = outletCell('main', grid)
            if (center === null) center = outletCell('main.conversation', grid)
            if (center === null) center = outletCell('conversation', grid)
            if (center === null) {
              const rest = inFlowChildren(grid).filter((child) => child !== right && child !== rail)
              if (rest.length !== 1) return false
              center = rest[0]
            }
            if (center === right) return false
            if (rail !== null && (rail === center || rail === right)) return false
            frame = grid
            rightCell = right
            centerCell = center
            railCell = rail
            return true
          }

          // ── (2) 轨道重写 ────────────────────────────────────────────────────
          // 只读帧的**内联**模板（React 的真相源；读计算值会读到自己的输出而
          // 自激）。纯字符串演算，不触发强制重排。
          function sync() {
            if (frame === null || centerCell === null) return
            const raw = (frame.style.gridTemplateColumns || '').trim()
            // 三段：首段 px、中间 minmax(...)、末段 px。
            const parts = /^(\S+)\s+([\s\S]+?)\s+(\S+)$/.exec(raw)
            if (parts === null) return
            const railWidth = number(parts[1])
            const rightbarWidth = number(parts[3])
            if (railWidth === null || rightbarWidth === null) return
            const columns = parts[1] + ' ' + parts[3] + ' minmax(0, 1fr)'
            const handleLeft = (railWidth + rightbarWidth) + 'px'
            const notrack = rightbarWidth === 0
            // 先写变量再挂帧标记：标记的规则读该变量，变量缺失会让
            // grid-template-columns 整条失效（退化成 none）。
            if (lastCols !== columns) {
              frame.style.setProperty('--dsh-swap-cols', columns)
              lastCols = columns
            }
            if (lastLeft !== handleLeft) {
              frame.style.setProperty('--dsh-swap-handle-left', handleLeft)
              lastLeft = handleLeft
            }
            if (lastNotrack !== notrack) {
              if (notrack) tag(frame, ATTR_NOTRACK)
              else untag(frame, ATTR_NOTRACK)
              lastNotrack = notrack
            }
            tag(rightCell, ATTR_RIGHT)
            tag(centerCell, ATTR_CENTER)
            tag(railCell, ATTR_RAIL)
            tag(frame, ATTR_FRAME)
            if (swapped) tag(frame, ATTR_ON)
            else untag(frame, ATTR_ON)
            if (!announced) {
              announced = true
              console.log('[dsh-column-swap] column swap active — rail/sidebar =', railWidth, '/', rightbarWidth)
            }
          }

          function needsResolve() {
            if (frame === null || rightCell === null || centerCell === null) return true
            if (!frame.isConnected || !rightCell.isConnected || !centerCell.isConnected) return true
            return false
          }

          function run() {
            if (needsResolve()) {
              detach()
              if (!resolve()) return
              attachFrameWatchers()
            }
            sync()
          }

          function schedule() {
            if (raf !== null) return
            raf = requestAnimationFrame(() => {
              raf = null
              run()
            })
          }

          // ── (6) 右上角总开关 ────────────────────────────────────────────────
          // 注册进 conversation.session.header.utilities（list 槽，纯追加、右对齐）：
          // 交换态下对话栏就是最右列，所以这一行正好是窗口右上角，紧贴 DSH 原生
          // 右侧栏展开按钮（单个 ...header.corner 归原生包所有，不能抢）。
          function SwapToggle() {
            const [on, setOn] = React.useState(swapped)
            React.useEffect(() => {
              listeners.add(setOn)
              setOn(swapped)
              return () => {
                listeners.delete(setOn)
              }
            }, [])
            return React.createElement('button', {
              type: 'button',
              [ATTR_TOGGLE]: '',
              'aria-pressed': on ? 'true' : 'false',
              'aria-label': TEXT.label,
              title: on ? TEXT.restore : TEXT.swap,
              onClick: () => {
                setSwapped(!swapped)
              },
            }, icon())
          }

          const slots = ctx.get('slots')
          if (slots !== undefined) {
            ctx.effect(() => slots.inject('conversation.session.header.utilities', () => slots.register({
              name: 'conversation.session.header.utilities',
              id: 'dsh-column-swap:toggle',
              order: 20,
              registrant: 'dsh-column-swap',
            }, SwapToggle)), 'dsh-column-swap: header toggle')
          }

          ctx.effect(() => {
            run()
            // 两条观察路径的时序要求不同：
            // - 帧的 style 变化 = React 重算了轨道（拖手柄 / 开合右侧栏 / 窗口缩放），
            //   必须**同帧**跟上，已在 attachFrameWatchers 里同步处理；
            // - #root 子树只做 childList：流式输出以 token 频率改它，走 rAF 防抖 +
            //   缓存快路径，只做一次字符串解析。
            // 1.5s 定时器是最后兜底（换帧 / HMR 时序漏网）。
            const rootWatcher = new MutationObserver(schedule)
            const rootElement = document.getElementById('root')
            if (rootElement !== null) rootWatcher.observe(rootElement, { childList: true, subtree: true })
            const stopTick = ctx.interval(run, 1500)
            return () => {
              if (raf !== null) {
                cancelAnimationFrame(raf)
                raf = null
              }
              rootWatcher.disconnect()
              if (frameWatcher !== null) {
                frameWatcher.disconnect()
                frameWatcher = null
              }
              if (frameResize !== null) {
                frameResize.disconnect()
                frameResize = null
              }
              if (typeof stopTick === 'function') stopTick()
              listeners.clear()
              detach()
            }
          }, 'dsh-column-swap: column order')
        },
      }
    }

    module.exports = createClientPlugin()
    return module.exports
  },
})
