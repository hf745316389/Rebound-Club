# 本地联机设计建议：电脑分屏、同房间两台手机、五个可选角色

- 提出：finaljoke（和 Claude Code 一起整理），2026-10-29
- 基于：`feat/duel-local`（`5ddf17c`）
- 原型分支：`proto/duel-split`（做了 L1 电脑分屏和「角色」一节）
- 状态：建议，等作者决定。单机版不动；对战规则只加了「每个玩家带自己的角色数值」，两人都选全能时和原来完全一样。

## Background and goal

对战版 P0 已经有「本机双人」：两人共用一个键盘、一个画面。读代码和截图检查后发现，这个模式对远端玩家明显不公平（见「现状」）。

目标：本地联机时，两人看到的画面、提示和操作方向完全一样，在单机里练出来的看框、出手时机能直接用上。

## 前提

1. 单机版规则不动：近端仍是整条底线，远端仍是门框加门将。这是 2026-10-29 和 finaljoke 讨论后定的。
2. 对战的进球判定不动。`duel-core.mjs` 的进球判定两端已经对称：同一记球分别由 A 打向 B、由 B 打向 A，测了 3000 球（2073 个进球、927 个打偏），结果全部一致。
3. 不碰 `core.mjs` 和 P1 的联网部分。同步层 `duel-net.mjs` 只多了一个参数：建局时传入双方的角色。

## 现状（`feat/duel-local` 的本机双人）

| # | 问题 | 代码位置 |
|---|---|---|
| 1 | 只有一个画面，镜头在 A 身后。B 站在画面最远端，要判断背对镜头飞走的球 | `duel.js` 的 `viewOf()` 只取 `viewFor(state,'a')`，每帧一次 `court.render` |
| 2 | 提示只给 A：击球亮框、落点圈、「现在挥击 / 重炮时机」、能量条、技能状态。B 等于盲打 | `hud()` 全读 `s.players.a`；场景里的提示来自 A 的视图 |
| 3 | B 按屏幕方向操作，和 B 自己的左右正好相反 | `axisB=(ArrowLeft?1:0)-(ArrowRight?1:0)` |
| 4 | 两人挤一个键盘，A 按住 D 和空格、B 按住 ← 和 ↑ 时，部分键盘会丢键（ghosting） | 键位见 D5 |
| 5 | 只有电脑能玩，手机没有本地模式 | `$('mode-local').hidden=coarse` |
| 6 | 每局都是 A 先接发球 | `createDuel()` 里 `serveTo:'a'` |

## Proposed design and trade-offs

### L1. 电脑、电视：左右分屏（原型已做）

- 屏幕左半给 1P（键盘左手区），右半给 2P（方向键区）。每人各有一台站在自己身后的镜头，看到的就是单机那套画面和提示。
- 半个横屏的宽高比在 0.73～0.89 之间（1024×700 到 1920×1080），会落进 `resize` 的竖屏分支（`aspect<1`），构图和手机竖屏一样，不用另调镜头。
- 渲染：同一个 `WebGLRenderer`，用 `setViewport` / `setScissor` 左右各画一个 `buildWorld` 场景，两个场景共用已经载入的角色资源（`buildWorld` 本来就会给每个场景各建一份角色）。第二个场景在第一次分屏时才建，对战 AI 和单机不受影响。
- 2P 改成按自己的左右：← 是 2P 自己的左边。
- 每人在自己半屏底部有一块提示面板：出手提示、能量条、旋转和爆发的状态。击球、挥空的提示字也显示在各自半屏。比分、对局状态、进球横幅放在中线上方，两人共用。
- 单机用的屏幕按钮只服务一个人，分屏时隐藏（这个模式本来就只在非触屏设备上出现）。
- 每开一局轮换先接发球的一方。

### L2. 手机：同一个房间、两台手机（建议并入 P1）

- 每人拿自己的手机，镜头、提示、按钮都和单机一样。这最公平，也贴合竖屏为主的玩法。
- 技术上就是 P1 的房间联机，只是两台手机连同一个 Wi-Fi，延迟很低，P0 报告里「延迟越高回合越短」的问题在这里基本不存在。
- 配对用二维码：开房的一方显示带房间码的链接二维码，另一方用系统相机扫码直接进房，不用手输房间码。
- 坑：同一个 Wi-Fi 下，浏览器的 WebRTC 靠 mDNS 地址直连；但不少公共 Wi-Fi、公司 Wi-Fi 开了「客户端隔离」，设备之间互相连不上。所以中转兜底必须有：设计里已有的 Durable Object 转发，或 Cloudflare 的 TURN 都可以。
- P1 验收建议加三种网络：家用 Wi-Fi、手机热点、开了客户端隔离的 Wi-Fi。

### L3. 不建议：一台手机，两人面对面

- 手机上常见的同屏双人游戏（乒乓、空气曲棍球）都是俯视 2D，两端天生对称。这个游戏是站在身后的 3D 视角，切成上下颠倒的两个画面后，每人只剩半个手机屏，两套按钮也放不下。
- 平板以后可以再评估。

### L4. 手柄（建议，原型没做）

- 用浏览器的 Gamepad API：第 1 个手柄是 1P，第 2 个是 2P；十字键或左摇杆移动，A 键挥击，X、Y 键放技能。
- 两人各拿一个手柄，就不会有键盘丢键的问题，在电视上玩也更自然。

### L5. 改键（建议，原型没做）

- 键盘丢键和键盘型号有关，没有一套键位能保证所有键盘都没问题。允许改键，让玩家自己避开冲突的组合，是老游戏的常见做法。

## 角色：五个可选角色（原型已做）

### 为什么要有

真人对战时，两人用同一套数值、同一个模型，没有选择余地。目标：
- 每个角色一项明确的强点，配一项明确的弱点（全能除外）；
- 玩起来手感不同；
- 整体大致平衡。

### 参考

- 马力欧网球把角色分成六类：全能、技巧、速度、力量、防守、诡变。全能没有短板；速度型跑得快但球最轻；力量型球快；防守型够得最远。
- 《Windjammers》只有一条轴：速度和力量此消彼长，越有力的越慢。
- Sirlin 论平衡：
  - 要有足够多可用的选择，不能有一招通吃；
  - 固定的角色比自由配点更容易平衡。
- 平衡的尺度：
  - 格斗游戏社区通常把 55:45 看作「略占优」；
  - 任天堂公布过《任天堂明星大乱斗 特别版》线上数据，各角色总胜率在 47.18%~51.43% 之间。

### 先测每项属性值多少

做法：只改一项属性，和全能对打，看得分率变化。用了两种 AI：
- **游戏自带的对手 AI**（`duel-bot.mjs`）：它读规则的出拳预判，每次都站在对的位置，只会略晚出拳。
- **人类式测试 AI**（`scripts/duel-humanbot.mjs`，只用于测试）：
  - 判断落点有误差，离得越远越不准；
  - 出拳有早有晚；
  - 分高手、一般、新手三档：反应 0.2~0.3 秒，出拳时机误差 25 / 45 / 70 毫秒。
  - 查不到可靠的人类出拳时机误差数据，所以三档都测，三档都过关才算平衡。

人类式 AI 的结果（三档的范围，每项 40 局）：

| 属性变化（全能原值） | 得分率 |
|---|---|
| 击球框纵深 0.9 / 1.1（1.0） | 34%~43% / 50%~57% |
| 球速 ×0.95 / ×1.05 | 43%~49% / 50%~52% |
| 跑速 ×0.85 / ×1.15，框半宽 0.8 / 1.0（0.9），判定时间 0.09 / 0.15 秒（0.12），收拳 0.08 / 0.22 秒（0.14），挥空惩罚 0.3 / 0.7 秒（0.5），能量 ×0.8 / ×1.3 | 都在 45%~54%，和噪声分不开 |

**结论：** 在现有规则下，决定得失分的是出拳时机。击球框越深，时机越宽松；球越快，对手的时机越紧。跑速和框宽几乎不影响结果，因为基础跑速已经足够横穿球场。

所以角色的强弱点主要放在框深和球速上，跑速只作手感差异。游戏自带 AI 测出来更极端：只有球速、重炮倍率、框深三项明显有用。

### 角色表

| 角色 | 模型 | 强点 | 弱点 |
|---|---|---|---|
| 全能 | 01 号前锋（Rogue，橙色） | 没有短板，就是单机的拳套 | — |
| 重炮 | 大胡子（Barbarian，深蓝） | 球速 ×1.06，甜点重炮倍率 1.45（原 1.35） | 框纵深 0.93，跑速 ×0.9 |
| 疾风 | 兜帽游侠（Rogue_Hooded，绿色改成青色） | 跑速 ×1.25，判定 0.15 秒，挥空惩罚 0.3 秒 | 球速 ×0.99 |
| 铁壁 | 骑士（Knight，银甲红边） | 框纵深 1.08、半宽 1.0 | 球速 ×0.92，跑速 ×0.92 |
| 巧手 | 法师（Mage，紫袍） | 攒能量 ×1.5，方向球瞄到门框半宽的 0.95（原 0.8） | 球速 ×0.98 |

- 技能（旋转、爆发）所有角色相同。
- 所有数值集中在 `duel-core.mjs` 的 `FIGHTERS`。名字和定位文字是占位，请作者改。

### 平衡结果

`node scripts/duel-roster.mjs 30 <种子>`：每对角色在两边各打 30 局，每对角色、每一边都用自己的一组随机种子。下表是两次不同随机种子（2 和 3）里，各角色对其余四个角色的总得分率：

| 角色 | 高手 | 一般 | 新手 | 游戏自带 AI |
|---|---|---|---|---|
| 全能 | 47.3% / 49.8% | 49.0% / 50.4% | 49.0% / 47.2% | 42.0% / 44.6% |
| 重炮 | 50.4% / 51.0% | 50.3% / 51.2% | 49.9% / 49.5% | 53.6% / 52.2% |
| 疾风 | 49.5% / 49.4% | 49.2% / 49.0% | 51.2% / 52.5% | 49.1% / 46.3% |
| 铁壁 | 52.4% / 51.4% | 51.9% / 51.5% | 50.1% / 49.5% | 52.8% / 52.9% |
| 巧手 | 50.4% / 48.4% | 49.6% / 48.0% | 49.7% / 51.3% | 52.4% / 54.1% |

怎么读：
- 人类式 AI 的三档下，五个角色都在 47.2%~52.5%。
- 同一格换个随机种子最多差 3 个百分点。还看得出的倾向都很小：全能六格里有五格低于 50%（平均约 48.8%），铁壁有五格高于 50%（平均约 51.1%），疾风对新手略有利、对高手略不利。
- 单场先进 5 球会放大小差距：各角色的胜场率在 41%~56% 之间浮动，两次种子之间互相交叉。
- 游戏自带 AI 这一列两次都一样：全能偏弱（42%~45%），重炮、铁壁、巧手略强。所以在「对战 AI」模式里，给 AI 选哪个角色会改变难度。
- 第一版平衡脚本有两个错：同一个角色的不同对手共用了同一组随机种子，自己对自己那一格存成了反数。修好后重跑，发现重炮六格都高于 50%（平均约 52.7%），于是把它的球速从 ×1.08 降到 ×1.06，上表是降低之后的结果。

### 画面

- 五个角色各用一个 KayKit 模型，都来自作者已在用的同一个素材包、同一个版本（CC0）。
  - 新增 `hooded.glb` 594 KB、`knight.glb` 620 KB、`mage.glb` 602 KB，都用 `pack-characters.mjs` 打包。它们也当单机关卡的门将，所以带着扑救动作，见 `2026-10-29-level-bosses.md`。
  - 原有两个模型重新打包后逐字节不变。
  - 骑士的头盔、法师的帽子是挂件，打包时和武器一起去掉，这是 `pack-characters.mjs` 原有的规则。
- 对战页只在有人选中某个角色时才下载它的模型；单机只在玩到对应关卡时才下载。
- 画面跟着各自的角色走：
  - 分屏时，左半屏近处是 1P 的角色、远处是 2P 的，右半屏反过来；
  - 对战 AI 时，近处是我的角色，远处是对手的。
- 设置页每人一排角色按钮，下面一行写着选中角色的强点和弱点；大厅画面会换成选中的角色。

## 原型（`proto/duel-split`）改了什么

- `dist/scene3d.mjs`：`create3DRenderer` 新增 `renderViews(views, reduceMotion)`，在同一块画布上从左到右画多个视角；`renderer.info` 统计整帧。原来的 `render()` 行为不变，单机走的还是它。
- `dist/duel.js`：
  - 本机双人改为分屏渲染；
  - 2P 按自己的左右；
  - 每人一块提示面板，只在数值变化时写 DOM；
  - 击球和技能提示字分到各自半屏；
  - 名称从「近端 / 远端」改成「1P / 2P」；
  - 每局轮换先接发球。
- `dist/duel.html`、`dist/duel.css`：两块提示面板和分屏样式；「本机双人」改名为「本机双人 · 分屏」。
- `scripts/duel-qa.mjs`：本机双人一段的断言改了。原来断言「2P 按 ← 往屏幕左边走」，分屏后 2P 看的是自己的半屏，← 应该是 2P 自己的左边，所以改成反方向。
  - 另外新加了几项检查：分屏已开启、单人按钮已隐藏、开局 1.5 秒时绘制调用不超过 220、再开一局换人先接发球。
  - 220 是单画面预算 110 的两倍，统计时机和原有的单画面检查一样（开局 1.5 秒）。对局中的峰值只记录、不断言，做法同 Amendments A1。
  - 第 4 段检查选角：两份对局都带着选好的角色、只下载选中角色的模型、分屏标签显示各自的角色。

角色部分：

- `dist/duel-core.mjs`：
  - 新增 `FIGHTERS`、`FIGHTER_IDS`、`fighterKit`；
  - `createDuel({picks})`；
  - 击球框、出拳时机、跑速、出球速度、瞄准、能量都按各自的角色算。
- `dist/duel-view.mjs`：视图带上双方的角色，击球框提示改用对战规则算。
- `dist/duel-bot.mjs`：按自己和对手的角色算落点和击球框；两人都是全能时行为不变。
- `dist/duel-net.mjs`：`createClient` 多一个 `picks` 参数。
- `dist/characters.mjs`：新增 `EXTRA_CHARACTERS`（按需加载的三个新模型和金色门将）、`ALL_CHARACTERS`、`FIGHTER_LOOKS`（角色对应哪个模型）。
- `dist/scene3d.mjs`：
  - `buildWorld` 新增 `cast` 参数（近处、远处各用哪个模型）；
  - 渲染器新增 `prepare()` / `preload()`：按需下载模型，只把变了的人物原地换掉（`buildWorld` 的 `setFigure`），球场不重建；以最后一次调用为准，下载失败的模型下次会重试；
  - 出拳动画的时机按各自的角色；
  - 门将扑救的测量只在单机做，因为对战的远端模型可能没有扑救动作。
- `dist/models/hooded.glb`、`knight.glb`、`mage.glb`；`scripts/pack-characters.mjs` 改成打包全部模型，同一个文件只打一次。
- `dist/duel.js`、`duel.html`、`duel.css`：选角界面，开局前先载入模型。
- 新增 `scripts/duel-roster.mjs`（角色平衡探针）、`scripts/duel-humanbot.mjs`（人类式测试 AI）、`tests/duel-fighters.test.mjs`（5 条）。

## 实测（原型）

| 项目 | 结果 |
|---|---|
| 测试（含角色） | `npm test` 194/194 通过；`duel-qa` PASS（含选角一段）；两人都选全能时，`node scripts/duel-balance.mjs 100 1` 的输出和作者原来的代码逐字节相同；`ui-qa`（三种模式）、`control`、`lobby`、`skill`、`audio`、`perf`、`desktop`、`shell`、`crowd`、`arena`、`art`、`browser` 全部退出码 0；`build-release` 后发布包里 `duel*` 文件 0 个 |
| 绘制调用（`duel-qa`，1280×800） | 分屏开局 208，对局峰值 222。作为对照，同一轮里单画面对局的峰值是 82（竖屏）和 93（横屏）。分屏只在电脑上出现 |
| 单机 | `perf-qa` 的单机绘制调用：大厅 62、对局 65、横屏 72。单机走的仍是原来的 `render()` |
| 帧率（无头 Chrome） | 1280×800：单画面 53，分屏 46；1920×1080：单画面 27，分屏 25。无头浏览器的绝对数值不代表真机，只能看相对开销，真机还要实测 |
| 2P 操作 | 按住 ← 0.25 秒，2P 往自己的左边移动，按 A 的坐标 x 从 0 变成 2.01 |
| 切换 | 分屏 → 暂停 → 返回设置 → 对战 AI，画面恢复成单画面，绘制调用回到 79，单人按钮重新出现 |
| 发球轮换 | 第一局 A 先接，重新开始后 B 先接 |

截图在 `artifacts/duel/hotseat-1280x800.png`（运行 `node scripts/duel-qa.mjs` 生成）。

## 原型已知的不足

- 两人选同一个角色时，两边是同一个模型，只能靠 1P / 2P 标签区分。可以考虑给第二个人换队服颜色。
- 需要换色的模型（兜帽游侠、王牌）第一次出现时，要在 CPU 上给整张贴图换色：降速 4 倍时会卡 0.3~0.5 秒（最长一段 0.53 秒），之后同一模型再出现就不用再算。要彻底去掉，可以在准备素材时就把换好色的贴图做出来。
- 平衡只靠 AI 模拟。人类式 AI 的误差参数是估计值，真人试玩才算数。
- 巧手的「方向球更靠边」在测试里看不出好处，它实际的强点主要是能量。
- 分屏帧率只在无头浏览器上测过，没在真实显卡和低配笔记本上测。
- 没做手柄和改键（L4、L5）。

## 顺带发现（不是这次引入的）

- 底部状态栏的比分文字只在进球时更新，新开一局不会重置。原型里点「开始对战」时会清空这行字，但「再来一局」时仍会显示上一局的比分，直到下一个进球。

## 需要作者决定的事

1. 是否用分屏取代现在的共享画面？
2. 2P 的键位是否保持 ←、→、↑、`,`、`.`，还是换一套离 1P 更远的？
3. 角色的数量、名字和定位：五个够不够？想不想要马力欧网球的第六类「诡变」（球的弧线更大）？
4. 现有规则下跑速几乎不影响胜负。要不要把基础跑速调慢，让「跑得快」的角色真正有用？这会改变整个对战的手感。
5. 两人选同一个角色时怎么区分外形？
6. 对战 AI 模式里，AI 用不同角色时强弱差别明显：要固定 AI 的角色，还是把角色当作难度来选？
7. 同房间两台手机（扫码进房、中转兜底）是否并入 P1 的范围？
8. 每局轮换先接发球，是否也用在对战 AI 和以后的联机里？

## 参考资料

- 键盘丢键：[Rollover, blocking and ghosting（Deskthority）](https://deskthority.net/wiki/2KRO)、[Key rollover（Wikipedia）](https://en.wikipedia.org/wiki/Key_rollover)、[Does my keyboard support 2-Player input?（itch.io 开发日志）](https://indifferentpenguin.itch.io/gamedaymayhem/devlog/677666/does-my-keyboard-support-2-player-input)
- WebRTC 与局域网：[mDNS（bloggeek）](https://bloggeek.me/webrtcglossary/mdns)、[PairDrop 关于客户端隔离的讨论](https://github.com/schlagmichdoch/PairDrop/discussions/277)、[Cloudflare Realtime：What is TURN](https://developers.cloudflare.com/realtime/turn/what-is-turn/index.md)
- 分屏渲染：[three.js manual：Cameras](https://threejs.org/manual/en/cameras)
- 同屏双人手游：[2 Player Games : Offline Games（App Store）](https://apps.apple.com/us/app/-/id1465731199)、[2 Players 1 Device: Tabletop（App Store）](https://apps.apple.com/py/app/2-players-1-device-tabletop/id1504000687?l=en-GB)
- 角色分类：[Mario Tennis Aces Character Types（Prima Games）](https://primagames.com/tips/mario-tennis-aces-character-types)、[Nintendo Treehouse 介绍各类角色（Siliconera）](https://www.siliconera.com/nintendo-treehouse-gives-lowdown-mario-tennis-aces-various-character-types/)、[Windjammers（Hardcore Gaming 101）](https://www.hardcoregaming101.net/windjammers/)、[Lethal League 的角色差异（Team Reptile）](https://team-reptile.com/a-fresh-blaze-of-fire/)
- 平衡：[Balancing Multiplayer Games, Part 2: Viable Options（Sirlin）](https://sirlin.net/articles/balancing-multiplayer-games-part-2-viable-options)、[Winning a matchup 60-40, what does it even mean?（SSBWorld）](https://ssbworld.com/blog/233/winning-a-matchup-60-40-what-does-it-even-mean)、[Sakurai on Smash Ultimate win rates（Nintendo Life）](https://www.nintendolife.com/news/2024/05/sakurai-on-smash-ultimate-win-rates-any-fighter-has-a-shot-at-winning)
- 模型来源：[KayKit Character Pack: Adventurers 1.0（GitHub，CC0）](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
